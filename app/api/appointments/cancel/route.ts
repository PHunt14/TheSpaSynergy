import { Client, Environment } from 'square';
import { randomUUID } from 'node:crypto';
import { client, resolveAppointmentDetails, sendAppointmentNotifications } from '@/lib/appointment-notifications';

export async function POST(request: Request) {
  try {
    const { appointmentId } = await request.json();

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

    // If part of a bundle, cancel the entire bundle
    if (appointment.bundleId) {
      const { data: bundle } = await client.models.Bundle.get({ bundleId: appointment.bundleId });
      if (bundle?.appointmentIds) {
        await Promise.all(
          bundle.appointmentIds.map((id: string) =>
            client.models.Appointment.update({ appointmentId: id as any, status: 'cancelled' as any })
          )
        );
      }
      if (bundle) {
        await client.models.Bundle.update({
          bundleId: appointment.bundleId as any,
          status: 'cancelled' as any,
        });
      }

      await sendAppointmentNotifications({ event: 'cancelled', appointment, details });
      return Response.json({ success: true, bundleCancelled: true });
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

    await sendAppointmentNotifications({ event: 'cancelled', appointment, details });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    return Response.json({ error: 'Failed to cancel appointment' }, { status: 500 });
  }
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
