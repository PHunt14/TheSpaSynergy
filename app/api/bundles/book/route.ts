import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../../amplify/data/resource';
import config from '../../../../amplify_outputs.json' with { type: 'json' };
import { randomUUID } from 'node:crypto';
import { assignBundleStaff } from '../../../utils/bundleStaffAssigner.js';
import { calculateBundlePrice, validateBundleServices } from '../../../utils/bundleDiscount.js';
import { checkBookingBlackout } from '../../../utils/bookingBlackout';

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

/**
 * POST /api/bundles/book
 *
 * Creates a multi-vendor bundle booking:
 * 1. Validates services and constraints (2+ vendors, max 10 services, all active)
 * 2. Assigns staff per service (with same-staff preference)
 * 3. Creates one appointment per service with shared bundleId
 * 4. Creates/updates Bundle record with vendorConfirmations initialized
 * 5. Calculates bundle price and stores on Bundle record
 *
 * Body: { serviceIds, bundleId?, date, startTime, serviceOrder, customer, staffOverrides? }
 * Returns: { success, bundleId, appointmentIds, schedule }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { serviceIds, bundleId: existingBundleId, date, startTime, serviceOrder, customer, staffOverrides } = body;

    // --- Input validation ---
    if (!serviceIds || !Array.isArray(serviceIds) || serviceIds.length === 0) {
      return Response.json({ error: 'serviceIds is required and must be a non-empty array' }, { status: 400 });
    }
    if (!date || !startTime || !customer) {
      return Response.json({ error: 'Missing required fields: date, startTime, customer' }, { status: 400 });
    }

    // --- Fetch all services ---
    const servicePromises = serviceIds.map((serviceId: string) =>
      client.models.Service.get({ serviceId })
    );
    const serviceResults = await Promise.all(servicePromises);

    const services: any[] = [];
    for (let i = 0; i < serviceResults.length; i++) {
      const result = serviceResults[i];
      if (result.errors || !result.data) {
        return Response.json(
          { error: `Service not found: ${serviceIds[i]}` },
          { status: 404 }
        );
      }
      services.push(result.data);
    }

    // --- Validate bundle constraints (2+ vendors, max 10 services, all active) ---
    const validation = validateBundleServices(services);
    if (!validation.valid) {
      return Response.json({ error: validation.error }, { status: 400 });
    }

    // --- Check global and vendor-level booking blackouts ---
    const blackout = await checkBookingBlackout(client, services);
    if (blackout.blocked) {
      return Response.json({
        error: blackout.globalUntil
          ? 'Online booking is temporarily disabled'
          : `Booking is temporarily disabled for: ${blackout.disabledVendors!.join(', ')}`,
        bookingDisabled: true,
        ...(blackout.globalUntil ? { disabledUntil: blackout.globalUntil } : {}),
        ...(blackout.disabledVendors ? { disabledVendors: blackout.disabledVendors } : {}),
      }, { status: 403 });
    }

    // --- Determine service order ---
    const orderedServiceIds = serviceOrder && serviceOrder.length > 0 ? serviceOrder : serviceIds;
    const orderedServices = orderedServiceIds.map((id: string) =>
      services.find((s: any) => s.serviceId === id)
    ).filter(Boolean);

    if (orderedServices.length !== services.length) {
      return Response.json({ error: 'serviceOrder contains invalid service IDs' }, { status: 400 });
    }

    // --- Determine buffer minutes from the first service's vendor ---
    const firstVendorId = orderedServices[0].vendorId;
    const { data: firstVendor } = await client.models.Vendor.get({ vendorId: firstVendorId });
    const bufferMinutes = firstVendor?.bufferMinutes || 15;

    // --- Collect all unique staff IDs across all services ---
    const allStaffIds = new Set<string>();
    for (const service of orderedServices) {
      const allowedStaff = (service.allowedStaff as string[]) || [];
      for (const staffId of allowedStaff) {
        allStaffIds.add(staffId);
      }
    }

    if (allStaffIds.size === 0) {
      return Response.json({ error: 'No staff configured for the selected services' }, { status: 400 });
    }

    // --- Fetch staff schedules ---
    const staffPromises = Array.from(allStaffIds).map(staffId =>
      client.models.StaffSchedule.get({ visibleId: staffId } as any)
    );
    const staffResults = await Promise.all(staffPromises);

    const staffSchedules = staffResults
      .filter(result => !result.errors && result.data)
      .map(result => result.data);

    // Build staffSchedulesByService map
    const staffSchedulesByService: Record<string, any[]> = {};
    for (const service of orderedServices) {
      const allowedStaff = (service.allowedStaff as string[]) || [];
      staffSchedulesByService[service.serviceId] = staffSchedules.filter(
        (staff: any) => allowedStaff.includes(staff.visibleId)
      );
    }

    // --- Fetch existing appointments for relevant staff on the date ---
    const vendorIds = [...new Set(staffSchedules.map((s: any) => s.vendorId).filter(Boolean))] as string[];

    const appointmentPromises = vendorIds.map(vendorId =>
      client.models.Appointment.list({
        filter: {
          vendorId: { eq: vendorId },
          dateTime: { beginsWith: date }
        }
      })
    );
    const appointmentResults = await Promise.all(appointmentPromises);

    const existingAppointments = appointmentResults
      .flatMap(result => result.data || [])
      .filter((apt: any) => apt.status !== 'cancelled' && apt.staffId && allStaffIds.has(apt.staffId));

    // --- Assign staff per service ---
    let staffAssignments;
    try {
      staffAssignments = assignBundleStaff({
        orderedServices: orderedServices.map((s: any) => ({
          serviceId: s.serviceId,
          vendorId: s.vendorId,
          allowedStaff: (s.allowedStaff as string[]) || [],
          duration: s.duration,
          providersRequired: s.providersRequired || 1
        })),
        staffSchedulesByService,
        appointments: existingAppointments,
        date,
        startTime,
        bufferMinutes
      });
    } catch (error: any) {
      return Response.json(
        { error: error.message || 'Selected time is no longer available' },
        { status: 409 }
      );
    }

    // Apply staff overrides if provided
    if (staffOverrides && typeof staffOverrides === 'object') {
      for (const assignment of staffAssignments) {
        if (staffOverrides[assignment.serviceId]) {
          assignment.staffId = staffOverrides[assignment.serviceId];
        }
      }
    }

    // --- Generate bundleId ---
    const bundleId = existingBundleId || `bundle-${Date.now()}`;

    // --- Create one appointment per service ---
    const appointmentIds: string[] = [];
    const creationErrors: any[] = [];

    for (const assignment of staffAssignments) {
      const appointmentId = randomUUID();
      const serviceDateTime = `${date}T${assignment.startTime}`;

      const { errors } = await client.models.Appointment.create({
        appointmentId,
        vendorId: assignment.vendorId,
        serviceId: assignment.serviceId,
        staffId: assignment.staffId,
        bundleId,
        dateTime: serviceDateTime,
        customer: JSON.stringify(customer),
        status: 'pending-confirmation',
        createdAt: new Date().toISOString(),
      } as any);

      if (errors) {
        creationErrors.push({ appointmentId, errors });
      } else {
        appointmentIds.push(appointmentId);
      }
    }

    // If any appointment creation failed, roll back
    if (creationErrors.length > 0) {
      for (const id of appointmentIds) {
        try {
          await client.models.Appointment.update({ appointmentId: id, status: 'cancelled' } as any);
        } catch (e) {
          console.error('Rollback failed for appointment:', id, e);
        }
      }
      console.error('Error creating bundle appointments:', creationErrors);
      return Response.json({ error: 'Failed to create appointments' }, { status: 500 });
    }

    // --- Calculate bundle price ---
    // Check if this is a pre-defined bundle
    let predefinedBundle = null;
    if (existingBundleId) {
      const { data: existingBundle } = await client.models.Bundle.get({ bundleId: existingBundleId } as any);
      if (existingBundle?.discountPercent && existingBundle.discountPercent > 0) {
        predefinedBundle = existingBundle;
      }
    }

    // Fetch BundleSettings for tier-based discounts
    const { data: bundleSettings } = await client.models.BundleSettings.get({ settingsId: 'default' } as any);

    const priceResult = calculateBundlePrice({
      services: services.map((s: any) => ({ price: s.price })),
      predefinedBundle,
      bundleSettings: bundleSettings || {
        discount2Services: 0,
        discount3Services: 0,
        discount4PlusServices: 0
      }
    });

    // --- Build schedule for the Bundle record ---
    const schedule = staffAssignments.map((a: any) => ({
      serviceId: a.serviceId,
      staffId: a.staffId,
      staffName: a.staffName,
      vendorId: a.vendorId,
      startTime: a.startTime,
      endTime: a.endTime
    }));

    // --- Initialize vendor confirmations ---
    const uniqueVendorIds = [...new Set(services.map((s: any) => s.vendorId))] as string[];
    const vendorConfirmations: Record<string, string> = {};
    for (const vid of uniqueVendorIds) {
      vendorConfirmations[vid] = 'pending';
    }

    // --- Create/update Bundle record ---
    const bundleData: any = {
      bundleId,
      name: predefinedBundle?.name || 'Custom Bundle',
      serviceIds: orderedServiceIds,
      vendorIds: uniqueVendorIds,
      price: priceResult.total,
      discountPercent: priceResult.discountPercent,
      status: 'pending-confirmation',
      vendorConfirmations: JSON.stringify(vendorConfirmations),
      appointmentIds,
      customer: JSON.stringify(customer),
      dateTime: `${date}T${startTime}`,
      serviceOrder: orderedServiceIds,
      schedule: JSON.stringify(schedule),
      isActive: true,
    };

    if (existingBundleId) {
      // Update existing bundle record
      const { errors: bundleErrors } = await client.models.Bundle.update(bundleData);
      if (bundleErrors) {
        // Roll back appointments
        for (const id of appointmentIds) {
          try {
            await client.models.Appointment.update({ appointmentId: id, status: 'cancelled' } as any);
          } catch (e) {
            console.error('Rollback failed for appointment:', id, e);
          }
        }
        console.error('Error updating bundle record:', bundleErrors);
        return Response.json({ error: 'Failed to create bundle record' }, { status: 500 });
      }
    } else {
      // Create new bundle record
      const { errors: bundleErrors } = await client.models.Bundle.create(bundleData);
      if (bundleErrors) {
        // Roll back appointments
        for (const id of appointmentIds) {
          try {
            await client.models.Appointment.update({ appointmentId: id, status: 'cancelled' } as any);
          } catch (e) {
            console.error('Rollback failed for appointment:', id, e);
          }
        }
        console.error('Error creating bundle record:', bundleErrors);
        return Response.json({ error: 'Failed to create bundle record' }, { status: 500 });
      }
    }

    // --- Return success response ---
    return Response.json({
      success: true,
      bundleId,
      appointmentIds,
      schedule
    });
  } catch (error) {
    console.error('Error creating bundle booking:', error);
    return Response.json({ error: 'Failed to create bundle booking' }, { status: 500 });
  }
}
