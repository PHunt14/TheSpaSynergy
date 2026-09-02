import { Client, Environment } from 'square';
import { randomUUID } from 'node:crypto';
import { client, resolveAppointmentDetails, sendAppointmentNotifications } from '@/lib/appointment-notifications';
import { calculateBundlePrice } from '@/app/utils/bundleDiscount';
import { releaseByAppointmentId } from '@/app/utils/slotReservation';
import { withErrorLogging } from '@/lib/logger/middleware';

export const POST = withErrorLogging(async function POST(request: Request) {
  try {
    const body = await request.json();
    const { appointmentId, cancelType } = body;

    if (!appointmentId) {
      return Response.json({ error: 'appointmentId required' }, { status: 400 });
    }

    const { data: appointment, errors: getErrors } = await client.models.Appointment.get({ appointmentId });

    if (getErrors || !appointment) {
      return Response.json({ error: 'Appointment not found' }, { status: 404 });
    }

    const details = await resolveAppointmentDetails(appointment);

    // If part of a multi-provider group, cancel the entire group
    if (appointment.groupId) {
      return await handleGroupCancellation(appointment, details);
    }

    // If part of a bundle, handle partial or full cancellation
    if (appointment.bundleId) {
      const { data: bundle } = await client.models.Bundle.get({ bundleId: appointment.bundleId });

      if (!bundle) {
        return Response.json({ error: 'Bundle not found' }, { status: 404 });
      }

      // Idempotent: if bundle already cancelled, return success
      if (bundle.status === 'cancelled') {
        return Response.json({ success: true, bundleCancelled: true, alreadyCancelled: true });
      }

      const effectiveCancelType = cancelType || 'partial';

      if (effectiveCancelType === 'full') {
        return await handleFullBundleCancellation(appointment, bundle, details);
      } else {
        return await handlePartialBundleCancellation(appointment, bundle, details);
      }
    }

    // Update status to cancelled
    const { errors: updateErrors } = await client.models.Appointment.update({
      appointmentId,
      status: 'cancelled' as any
    });

    if (updateErrors) {
      console.error('Error cancelling appointment:', updateErrors);
      return Response.json({ error: 'Failed to cancel appointment' }, { status: 500 });
    }

    // Free the reserved slot cells so the time becomes bookable again.
    await releaseByAppointmentId(client, appointmentId);

    await sendAppointmentNotifications({ event: 'cancelled', appointment, details });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    return Response.json({ error: 'Failed to cancel appointment' }, { status: 500 });
  }
})

/**
 * Handles partial cancellation of a single service within a multi-vendor bundle.
 * Validates that remaining services still meet bundle constraints (2+ vendors, 2+ services).
 * Recalculates bundle price and updates the Bundle record.
 */
async function handlePartialBundleCancellation(appointment: any, bundle: any, details: any) {
  const currentAppointmentIds: string[] = bundle.appointmentIds || [];

  // Get remaining appointment IDs after removing the cancelled one
  const remainingAppointmentIds = currentAppointmentIds.filter(
    (id: string) => id !== appointment.appointmentId
  );

  // Check minimum service count
  if (remainingAppointmentIds.length < 2) {
    return Response.json(
      { error: 'Cannot remove service — bundle requires at least 2 services' },
      { status: 400 }
    );
  }

  // Fetch remaining appointments to check vendor constraint
  const remainingAppointmentPromises = remainingAppointmentIds.map((id: string) =>
    client.models.Appointment.get({ appointmentId: id })
  );
  const remainingAppointmentResults = await Promise.all(remainingAppointmentPromises);

  const remainingAppointments = remainingAppointmentResults
    .filter(r => !r.errors && r.data)
    .map(r => r.data!);

  // Check minimum vendor count
  const remainingVendorIds = new Set(remainingAppointments.map((a: any) => a.vendorId));
  if (remainingVendorIds.size < 2) {
    return Response.json(
      { error: 'Cannot remove service — bundle requires at least 2 vendors' },
      { status: 400 }
    );
  }

  // Cancel the appointment
  const { errors: cancelErrors } = await client.models.Appointment.update({
    appointmentId: appointment.appointmentId,
    status: 'cancelled' as any
  });

  if (cancelErrors) {
    console.error('Error cancelling appointment:', cancelErrors);
    return Response.json({ error: 'Failed to cancel appointment' }, { status: 500 });
  }

  // Free the cancelled service's reserved slot cells.
  await releaseByAppointmentId(client, appointment.appointmentId);

  // Fetch remaining services to recalculate price
  const remainingServiceIds = remainingAppointments.map((a: any) => a.serviceId);
  const servicePromises = remainingServiceIds.map((serviceId: string) =>
    client.models.Service.get({ serviceId })
  );
  const serviceResults = await Promise.all(servicePromises);
  const remainingServices = serviceResults
    .filter(r => !r.errors && r.data)
    .map(r => r.data!);

  // Fetch BundleSettings for tier-based discount recalculation
  const { data: bundleSettings } = await client.models.BundleSettings.get({ settingsId: 'default' } as any);

  // Determine if this was a pre-defined bundle (has a non-zero discountPercent set at creation)
  // For pre-defined bundles, we still use the original discount percent
  let predefinedBundle = null;
  if (bundle.discountPercent && bundle.discountPercent > 0) {
    // Check if this is a pre-defined bundle by looking at the name
    // Pre-defined bundles have a specific name, custom bundles are "Custom Bundle"
    // However, after partial cancellation of a custom bundle, we recalculate using tier discounts
    // For pre-defined bundles, we keep the original discount percent
    if (bundle.name && bundle.name !== 'Custom Bundle') {
      predefinedBundle = { discountPercent: bundle.discountPercent };
    }
  }

  const priceResult = calculateBundlePrice({
    services: remainingServices.map((s: any) => ({ price: s.price })),
    predefinedBundle,
    bundleSettings: bundleSettings || {
      discount2Services: 0,
      discount3Services: 0,
      discount4PlusServices: 0
    }
  });

  // Calculate refund amount for the cancelled service
  // Proportional amount: (cancelled service price / original undiscounted total) × actual paid amount
  const cancelledServiceResult = await client.models.Service.get({ serviceId: appointment.serviceId });
  const cancelledServicePrice = cancelledServiceResult.data?.price || 0;

  const allServiceIds = bundle.serviceIds || [];
  const allServicePromises = allServiceIds.map((serviceId: string) =>
    client.models.Service.get({ serviceId })
  );
  const allServiceResults = await Promise.all(allServicePromises);
  const allServices = allServiceResults
    .filter(r => !r.errors && r.data)
    .map(r => r.data!);
  const undiscountedTotal = allServices.reduce((sum: number, s: any) => sum + (s.price || 0), 0);

  const originalPaidAmount = bundle.price || 0;
  const refundAmount = undiscountedTotal > 0
    ? Math.round((cancelledServicePrice / undiscountedTotal) * originalPaidAmount * 100) / 100
    : 0;

  // Build refund record
  const existingRefundRecord = bundle.refundRecord
    ? (typeof bundle.refundRecord === 'string' ? JSON.parse(bundle.refundRecord) : bundle.refundRecord)
    : { cancellations: [] };

  existingRefundRecord.cancellations.push({
    appointmentId: appointment.appointmentId,
    serviceId: appointment.serviceId,
    vendorId: appointment.vendorId,
    cancelledAt: new Date().toISOString(),
    refundAmount,
    cancelledServicePrice,
  });

  // Update Bundle record
  const updatedVendorIds = [...remainingVendorIds];
  const { errors: bundleUpdateErrors } = await client.models.Bundle.update({
    bundleId: bundle.bundleId,
    appointmentIds: remainingAppointmentIds,
    serviceIds: remainingServiceIds,
    vendorIds: updatedVendorIds,
    price: priceResult.total,
    discountPercent: priceResult.discountPercent,
    refundRecord: JSON.stringify(existingRefundRecord),
  } as any);

  if (bundleUpdateErrors) {
    console.error('Error updating bundle record:', bundleUpdateErrors);
    // Appointment is already cancelled, so we log but don't fail the request
  }

  await sendAppointmentNotifications({ event: 'cancelled', appointment, details });

  return Response.json({
    success: true,
    partialCancellation: true,
    bundleId: bundle.bundleId,
    cancelledAppointmentId: appointment.appointmentId,
    refundAmount,
    newBundlePrice: priceResult.total,
    newDiscountPercent: priceResult.discountPercent,
    remainingAppointmentIds,
  });
}

/**
 * Handles full cancellation of all services in a multi-vendor bundle.
 * Cancels all appointments, updates bundle status, and records refund amounts.
 */
async function handleFullBundleCancellation(appointment: any, bundle: any, details: any) {
  const appointmentIds: string[] = bundle.appointmentIds || [];

  // Cancel all appointments in the bundle
  const cancelResults = await Promise.all(
    appointmentIds.map((id: string) =>
      client.models.Appointment.update({ appointmentId: id, status: 'cancelled' } as any)
    )
  );

  const cancelErrors = cancelResults.filter((r: any) => r.errors);
  if (cancelErrors.length > 0) {
    console.error('Error cancelling bundle appointments:', cancelErrors);
    return Response.json({ error: 'Failed to cancel all appointments in bundle' }, { status: 500 });
  }

  // Free every cancelled appointment's reserved slot cells.
  await Promise.all(appointmentIds.map((id: string) => releaseByAppointmentId(client, id)));

  // Calculate total refund amount (the full bundle price that was paid)
  const totalRefundAmount = bundle.price || 0;

  // Build refund record for full cancellation
  const refundRecord = {
    type: 'full',
    cancelledAt: new Date().toISOString(),
    totalRefundAmount,
    appointmentIds,
  };

  // Update bundle status to cancelled
  const { errors: bundleUpdateErrors } = await client.models.Bundle.update({
    bundleId: bundle.bundleId,
    status: 'cancelled' as any,
    refundRecord: JSON.stringify(refundRecord),
  } as any);

  if (bundleUpdateErrors) {
    console.error('Error updating bundle status:', bundleUpdateErrors);
  }

  await sendAppointmentNotifications({ event: 'cancelled', appointment, details });

  return Response.json({
    success: true,
    bundleCancelled: true,
    bundleId: bundle.bundleId,
    cancelledAppointmentIds: appointmentIds,
    totalRefundAmount,
  });
}

async function handleGroupCancellation(appointment: any, details: any) {
  const groupId = appointment.groupId;

  // Query all appointments in the group using the secondary index
  const { data: groupAppointments, errors: listErrors } = await client.models.Appointment.listAppointmentByGroupId({
    groupId,
  });

  if (listErrors || !groupAppointments || groupAppointments.length === 0) {
    return Response.json({ error: 'Booking group not found' }, { status: 404 });
  }

  // Idempotent: if all appointments are already cancelled, return success
  const allCancelled = groupAppointments.every((appt: any) => appt.status === 'cancelled');
  if (allCancelled) {
    return Response.json({
      success: true,
      groupCancelled: true,
      groupId,
      cancelledAppointmentIds: groupAppointments.map((appt: any) => appt.appointmentId),
      alreadyCancelled: true,
    });
  }

  // Cancel all appointments in the group atomically
  const cancelResults = await Promise.all(
    groupAppointments.map((appt: any) =>
      client.models.Appointment.update({
        appointmentId: appt.appointmentId,
        status: 'cancelled' as any,
      })
    )
  );

  const cancelErrors = cancelResults.filter((r: any) => r.errors);
  if (cancelErrors.length > 0) {
    console.error('Error cancelling group appointments:', cancelErrors);
    return Response.json({ error: 'Failed to cancel all appointments in group' }, { status: 500 });
  }

  // Free every group appointment's reserved slot cells.
  await Promise.all(
    groupAppointments.map((appt: any) => releaseByAppointmentId(client, appt.appointmentId))
  );

  // Handle refund if any appointment in the group has a paymentId
  let refundResult = null;
  const paidAppointment = groupAppointments.find((appt: any) => appt.paymentId);

  if (paidAppointment) {
    refundResult = await initiateGroupRefund(paidAppointment, groupAppointments);
  }

  // Send cancellation notifications for the triggering appointment
  await sendAppointmentNotifications({ event: 'cancelled', appointment, details });

  return Response.json({
    success: true,
    groupCancelled: true,
    groupId,
    cancelledAppointmentIds: groupAppointments.map((appt: any) => appt.appointmentId),
    ...(refundResult ? { refund: refundResult } : {}),
  });
}

async function initiateGroupRefund(paidAppointment: any, groupAppointments: any[]) {
  try {
    // Calculate total refund amount from all appointments in the group
    const totalRefundAmount = groupAppointments.reduce((sum: number, appt: any) => {
      return sum + (appt.paymentAmount || 0);
    }, 0);

    if (totalRefundAmount <= 0) {
      return { status: 'skipped', reason: 'No payment amount to refund' };
    }

    // Resolve Square credentials from the vendor who processed the payment
    const { data: vendor } = await client.models.Vendor.get({ vendorId: paidAppointment.vendorId });

    if (!vendor?.squareAccessToken || !vendor?.squareLocationId) {
      // Flag for manual refund - credentials unavailable
      console.error('Square credentials unavailable for refund, vendor:', paidAppointment.vendorId);
      return { status: 'manual_required', reason: 'Square credentials unavailable' };
    }

    const squareClient = new Client({
      accessToken: vendor.squareAccessToken,
      environment: process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production'
        ? Environment.Production
        : Environment.Sandbox,
    });

    const { result } = await squareClient.refundsApi.refundPayment({
      idempotencyKey: randomUUID(),
      paymentId: paidAppointment.paymentId,
      amountMoney: {
        amount: BigInt(Math.round(totalRefundAmount * 100)),
        currency: 'USD',
      },
      reason: 'Group booking cancelled',
    });

    const refundId = result.refund?.id || null;
    const refundStatus = result.refund?.status || 'PENDING';

    // Update all appointments in the group with refund info
    await Promise.all(
      groupAppointments.map((appt: any) =>
        client.models.Appointment.update({
          appointmentId: appt.appointmentId,
          paymentStatus: 'refunded' as any,
        })
      )
    );

    return { status: 'initiated', refundId, refundStatus };
  } catch (error: any) {
    console.error('Error initiating group refund:', error);
    // Still return success for cancellation - flag refund for manual resolution
    return { status: 'failed', reason: error?.message || 'Refund processing failed' };
  }
}
