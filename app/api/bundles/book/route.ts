import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../../amplify/data/resource';
import config from '../../../../amplify_outputs.json' with { type: 'json' };
import { randomUUID } from 'node:crypto';
import { assignBundleStaff } from '../../../utils/bundleStaffAssigner.js';
import { reserveSlotsForMany, releaseKeys } from '../../../utils/slotReservation';
import { calculateBundlePrice, validateBundleServices } from '../../../utils/bundleDiscount.js';
import { checkBookingBlackout, blackoutResponseFields } from '../../../utils/bookingBlackout';
import { getCurrentUser } from '@/lib/auth';
import { withErrorLogging } from '@/lib/logger/middleware';

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
export const POST = withErrorLogging(async function POST(request: Request) {
  try {
    const body = await request.json();
    const { serviceIds, bundleId: existingBundleId, date, startTime, serviceOrder, customer, staffOverrides, createdBy: rawCreatedBy, confirmOverlap: rawConfirmOverlap } = body;

    // Security: Only authenticated vendor/admin users can set createdBy or confirmOverlap.
    const user = await getCurrentUser();
    const createdBy = user ? rawCreatedBy : undefined;
    const confirmOverlap = user ? rawConfirmOverlap : false;

    // Vendor/provider bookings include createdBy — they can override conflicts
    const isVendorBooking = !!createdBy;

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
      return Response.json(blackoutResponseFields(blackout), { status: 403 });
    }

    // --- Enforce bundle allowedDays constraint (server-side) ---
    if (existingBundleId) {
      const { data: bundleRecord } = await client.models.Bundle.get({ bundleId: existingBundleId } as any);
      if (bundleRecord?.allowedDays && (bundleRecord.allowedDays as string[]).length > 0) {
        const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const requestedDay = DAY_NAMES[new Date(date + 'T00:00:00').getDay()];
        if (!(bundleRecord.allowedDays as string[]).includes(requestedDay)) {
          return Response.json(
            { error: `This package is only available on: ${(bundleRecord.allowedDays as string[]).join(', ')}` },
            { status: 400 }
          );
        }
      }
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
    const hasOpenStaff = orderedServices.some(
      (s: any) => !s.allowedStaff || (s.allowedStaff as string[]).length === 0
    );

    for (const service of orderedServices) {
      const allowedStaff = (service.allowedStaff as string[]) || [];
      for (const staffId of allowedStaff) {
        allStaffIds.add(staffId);
      }
    }

    // --- Fetch staff schedules ---
    // If any service has null/empty allowedStaff ("all staff eligible"), fetch all staff
    let staffSchedules: any[];
    if (hasOpenStaff) {
      const { data: allStaff } = await client.models.StaffSchedule.list();
      staffSchedules = (allStaff || []).filter((s: any) => s.isActive !== false);
      staffSchedules.forEach((s: any) => allStaffIds.add(s.visibleId));
    } else {
      if (allStaffIds.size === 0) {
        return Response.json({ error: 'No staff configured for the selected services' }, { status: 400 });
      }
      const staffPromises = Array.from(allStaffIds).map(staffId =>
        client.models.StaffSchedule.get({ visibleId: staffId } as any)
      );
      const staffResults = await Promise.all(staffPromises);
      staffSchedules = staffResults
        .filter(result => !result.errors && result.data)
        .map(result => result.data);
    }

    // Exclude staff with active booking blackout
    const now = new Date();
    staffSchedules = staffSchedules.filter((s: any) => {
      if (s.bookingDisabledUntil && new Date(s.bookingDisabledUntil) > now) return false;
      return true;
    });

    if (staffSchedules.length === 0) {
      return Response.json({ error: 'No staff available for the selected services' }, { status: 400 });
    }

    // Build staffSchedulesByService map
    const staffSchedulesByService: Record<string, any[]> = {};
    for (const service of orderedServices) {
      const allowedStaff = (service.allowedStaff as string[]) || [];
      if (allowedStaff.length > 0) {
        staffSchedulesByService[service.serviceId] = staffSchedules.filter(
          (staff: any) => allowedStaff.includes(staff.visibleId)
        );
      } else {
        // null/empty allowedStaff = all staff eligible (exclude resource calendars)
        staffSchedulesByService[service.serviceId] = staffSchedules.filter(
          (staff: any) => !staff.visibleId.startsWith('resource-')
        );
      }
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

    const rawExistingAppointments = appointmentResults
      .flatMap(result => result.data || [])
      .filter((apt: any) => apt.status !== 'cancelled' && apt.staffId && allStaffIds.has(apt.staffId));

    // Enrich existing appointments with the CURRENT DB Service.duration so
    // conflict detection uses live durations rather than whatever customer.duration
    // was frozen into the record at its original booking time. This matches the
    // availability (show) path (enrichAppointmentsWithDbDuration) so a bundle can
    // no longer be booked on top of an appointment whose service was later
    // lengthened. Blocked-time durations are authoritative and never overwritten.
    const existingAppointments = await enrichWithDbDuration(rawExistingAppointments);

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
        appointments: isVendorBooking && confirmOverlap ? [] : existingAppointments,
        date,
        startTime,
        bufferMinutes
      });
    } catch (error: any) {
      // Vendors get a warning they can override; customers get a hard block
      if (isVendorBooking && !confirmOverlap) {
        return Response.json({
          warning: 'Scheduling conflict detected',
          message: error.message || 'This bundle overlaps with existing appointments. Resubmit with confirmOverlap=true to save anyway.',
        }, { status: 409 });
      }
      return Response.json(
        { error: error.message || 'Selected time is no longer available' },
        { status: 409 }
      );
    }

    // Apply staff overrides if provided — re-validate conflicts for safety
    // Vendors with confirmOverlap can bypass; customers always get hard-blocked
    if (staffOverrides && typeof staffOverrides === 'object') {
      for (const assignment of staffAssignments) {
        if (staffOverrides[assignment.serviceId]) {
          const overrideStaffId = staffOverrides[assignment.serviceId];

          // Skip conflict check if vendor already confirmed the overlap
          if (isVendorBooking && confirmOverlap) {
            assignment.staffId = overrideStaffId;
            continue;
          }

          // Verify the overridden staff doesn't have a conflict at this time
          const serviceForOverride = orderedServices.find((s: any) => s.serviceId === assignment.serviceId);
          const overrideStart = assignment.startTime;
          const overrideDuration = serviceForOverride?.duration || 60;

          const overrideStartMin = timeToMin(overrideStart);
          const overrideEndMin = overrideStartMin + overrideDuration + bufferMinutes;

          const hasOverrideConflict = existingAppointments.some((apt: any) => {
            if (apt.status === 'cancelled') return false;
            if (apt.staffId !== overrideStaffId) return false;

            const aptTime = (apt.dateTime as string).includes('T')
              ? (apt.dateTime as string).split('T')[1].substring(0, 5)
              : '00:00';
            const aptStartMin = timeToMin(aptTime);
            const aptCustomer = typeof apt.customer === 'string'
              ? (() => { try { return JSON.parse(apt.customer); } catch { return {}; } })()
              : (apt.customer || {});
            const aptDuration = (aptCustomer?.isBlockedTime && aptCustomer?.duration)
              ? aptCustomer.duration
              : overrideDuration;
            const aptEndMin = aptStartMin + aptDuration + bufferMinutes;

            return overrideStartMin < aptEndMin && overrideEndMin > aptStartMin;
          });

          if (hasOverrideConflict) {
            // Vendors get a warning they can override; customers get hard-blocked
            if (isVendorBooking) {
              return Response.json({
                warning: 'Scheduling conflict detected',
                conflict: { staffId: overrideStaffId, serviceId: assignment.serviceId },
                message: 'Selected provider has a scheduling conflict. Resubmit with confirmOverlap=true to save anyway.',
              }, { status: 409 });
            }
            return Response.json(
              { error: 'Selected provider is not available at this time. Please choose a different provider or time.' },
              { status: 409 }
            );
          }

          assignment.staffId = overrideStaffId;
        }
      }
    }

    // --- Generate bundleId ---
    const bundleId = existingBundleId || `bundle-${Date.now()}`;

    // --- Final safety check: every assignment must have a valid staffId ---
    const unassigned = staffAssignments.filter((a: any) => !a.staffId);
    if (unassigned.length > 0) {
      const serviceNames = unassigned.map((a: any) => a.serviceId).join(', ');
      return Response.json(
        { error: `Unable to assign a provider for: ${serviceNames}. Please choose a different time.` },
        { status: 409 }
      );
    }

    // --- Create one appointment per service ---
    const appointmentIds: string[] = [];
    const creationErrors: any[] = [];

    // Pre-plan each service assignment with its dateTime, duration, and id.
    const plannedAssignments = staffAssignments.map((assignment: any) => {
      const serviceForAssignment = orderedServices.find((s: any) => s.serviceId === assignment.serviceId);
      return {
        assignment,
        appointmentId: randomUUID(),
        serviceDateTime: `${date}T${assignment.startTime}`,
        assignmentDuration: serviceForAssignment?.duration || 60,
      };
    });

    // --- Atomic slot reservation for EVERY service in the bundle ---
    // Each service's interval must be exclusively held for its assigned staff
    // before any appointment is written. All-or-nothing: if any cell is taken,
    // the whole bundle is rejected atomically. Vendors who confirmOverlap
    // intentionally double-book and skip the reservation.
    let bundleReservedKeys: string[] = [];
    if (!(isVendorBooking && confirmOverlap)) {
      const res = await reserveSlotsForMany(
        client,
        plannedAssignments.map(({ assignment, appointmentId, serviceDateTime, assignmentDuration }: any) => ({
          staffId: assignment.staffId,
          dateTime: serviceDateTime,
          durationMinutes: assignmentDuration,
          bufferMinutes,
          appointmentId,
          vendorId: assignment.vendorId,
          groupId: bundleId,
        }))
      );
      if (!res.ok) {
        return Response.json(
          { error: 'This time slot is no longer available. Please select a different time.' },
          { status: 409 }
        );
      }
      bundleReservedKeys = res.reservedKeys;
    }

    for (const { assignment, appointmentId, serviceDateTime, assignmentDuration } of plannedAssignments) {
      const { errors } = await client.models.Appointment.create({
        appointmentId,
        vendorId: assignment.vendorId,
        serviceId: assignment.serviceId,
        staffId: assignment.staffId,
        bundleId,
        dateTime: serviceDateTime,
        customer: JSON.stringify({ ...customer, duration: assignmentDuration }),
        status: 'pending-confirmation',
        createdBy: createdBy || undefined,
        createdAt: new Date().toISOString(),
      } as any);

      if (errors) {
        creationErrors.push({ appointmentId, errors });
      } else {
        appointmentIds.push(appointmentId);
      }
    }

    // If any appointment creation failed, roll back appointments + reservations
    if (creationErrors.length > 0) {
      for (const id of appointmentIds) {
        try {
          await client.models.Appointment.update({ appointmentId: id, status: 'cancelled' } as any);
        } catch (e) {
          console.error('Rollback failed for appointment:', id, e);
        }
      }
      await releaseKeys(client, bundleReservedKeys);
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
        // Roll back appointments + reservations
        for (const id of appointmentIds) {
          try {
            await client.models.Appointment.update({ appointmentId: id, status: 'cancelled' } as any);
          } catch (e) {
            console.error('Rollback failed for appointment:', id, e);
          }
        }
        await releaseKeys(client, bundleReservedKeys);
        console.error('Error updating bundle record:', bundleErrors);
        return Response.json({ error: 'Failed to create bundle record' }, { status: 500 });
      }
    } else {
      // Create new bundle record
      const { errors: bundleErrors } = await client.models.Bundle.create(bundleData);
      if (bundleErrors) {
        // Roll back appointments + reservations
        for (const id of appointmentIds) {
          try {
            await client.models.Appointment.update({ appointmentId: id, status: 'cancelled' } as any);
          } catch (e) {
            console.error('Rollback failed for appointment:', id, e);
          }
        }
        await releaseKeys(client, bundleReservedKeys);
        console.error('Error creating bundle record:', bundleErrors);
        return Response.json({ error: 'Failed to create bundle record' }, { status: 500 });
      }
    }

    // No post-write recheck needed for customer bundles: the atomic reservation
    // above already guarantees every service exclusively held its interval
    // before any appointment was written.

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
})

/** Converts "HH:MM" to minutes since midnight. */
function timeToMin(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Injects the CURRENT DB Service.duration into each appointment's customer JSON
 * (as customer.duration) so downstream conflict checks (hasAppointmentConflict,
 * which reads customer.duration) use the up-to-date duration rather than the
 * value frozen when the appointment was originally booked. Mirrors the
 * availability route's enrichAppointmentsWithDbDuration. Blocked-time durations
 * are authoritative and are never overwritten.
 */
async function enrichWithDbDuration(appointments: any[]): Promise<any[]> {
  const serviceIds = [...new Set(appointments.map(a => a.serviceId).filter(Boolean))] as string[];
  const durationMap: Record<string, number> = {};
  await Promise.all(serviceIds.map(async (sid) => {
    if (sid === 'blocked' || sid === 'manual') return;
    const { data: svc } = await client.models.Service.get({ serviceId: sid });
    if (svc?.duration) durationMap[sid] = svc.duration as number;
  }));

  return appointments.map(apt => {
    let customer = apt.customer;
    if (typeof customer === 'string') {
      try { customer = JSON.parse(customer); } catch { customer = {}; }
    }
    if (!customer) customer = {};
    // Never overwrite a blocked-time duration — it is authoritative.
    if (customer.isBlockedTime) return apt;
    const duration = durationMap[apt.serviceId];
    if (duration) {
      customer.duration = duration;
      return { ...apt, customer: JSON.stringify(customer) };
    }
    return apt;
  });
}
