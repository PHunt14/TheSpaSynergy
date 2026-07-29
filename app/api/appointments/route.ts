import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { randomUUID } from 'crypto';
import { resolveAppointmentDetails, sendAppointmentNotifications, sendStaffBookingNotification } from '@/lib/appointment-notifications';
import { assignStaff } from '@/app/utils/staffAssigner.js';
import { detectConflict, extractDateFromDateTime } from '@/app/utils/overlapDetection';
import { getCurrentUser } from '@/lib/auth';

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

export async function PATCH(request: Request) {
  try {
    const { appointmentId, paymentId, paymentStatus, paymentAmount, status, serviceId, staffId, vendorId, customer, createdBy, confirmOverlap, dateTime } = await request.json();

    if (!appointmentId) {
      return Response.json({ error: 'appointmentId required' }, { status: 400 });
    }

    const updateFields: any = { appointmentId };
    if (paymentId !== undefined) updateFields.paymentId = paymentId;
    if (paymentStatus !== undefined) updateFields.paymentStatus = paymentStatus;
    if (paymentAmount !== undefined) updateFields.paymentAmount = paymentAmount;
    if (status !== undefined) updateFields.status = status;
    if (serviceId !== undefined) updateFields.serviceId = serviceId;
    if (dateTime !== undefined) updateFields.dateTime = dateTime;
    if (customer !== undefined) updateFields.customer = customer;

    // Record who performed the edit for audit purposes (Req 4.5)
    if (createdBy !== undefined) updateFields.createdBy = createdBy;

    // If staffId is being changed, resolve vendorId from StaffSchedule (Req 9.7)
    if (staffId !== undefined) {
      updateFields.staffId = staffId;
      const { data: staffSchedule } = await client.models.StaffSchedule.get({ visibleId: staffId });
      if (staffSchedule?.vendorId) {
        updateFields.vendorId = staffSchedule.vendorId;
      }
    } else if (vendorId !== undefined) {
      updateFields.vendorId = vendorId;
    }

    // Overlap detection for edits that change dateTime or staffId (Req 4.6)
    const targetStaffId = updateFields.staffId;
    const dateTimeChanged = dateTime !== undefined;

    if ((targetStaffId || dateTimeChanged) && !confirmOverlap) {
      // Get existing appointment to resolve missing fields
      const { data: existingAppt } = await client.models.Appointment.get({ appointmentId });
      const effectiveStaffId = targetStaffId || existingAppt?.staffId;
      const effectiveDateTime = updateFields.dateTime || existingAppt?.dateTime;

      if (effectiveStaffId && effectiveDateTime) {
        // Fetch service duration for overlap calculation
        const targetServiceId = updateFields.serviceId || existingAppt?.serviceId;
        let duration = 60; // default fallback
        if (targetServiceId) {
          const { data: svc } = await client.models.Service.get({ serviceId: targetServiceId });
          if (svc?.duration) duration = svc.duration as number;
        }

        const overlap = await detectOverlap(client, effectiveStaffId, effectiveDateTime, duration, appointmentId, true);
        if (overlap) {
          return Response.json({
            warning: 'Scheduling conflict detected',
            conflict: overlap,
            message: 'This appointment overlaps with an existing appointment. Resubmit with confirmOverlap=true to save anyway.',
          }, { status: 409 });
        }
      }
    }

    const { errors } = await client.models.Appointment.update(updateFields);

    if (errors) {
      console.error('Error updating appointment:', errors);
      return Response.json({ error: 'Failed to update appointment' }, { status: 500 });
    }

    // Send notification if a confirmed appointment was changed (dateTime, serviceId, or staffId)
    const isSignificantChange = dateTime !== undefined || serviceId !== undefined || staffId !== undefined;
    if (isSignificantChange) {
      try {
        const { data: updatedAppt } = await client.models.Appointment.get({ appointmentId });
        if (updatedAppt && updatedAppt.status === 'confirmed') {
          const details = await resolveAppointmentDetails(updatedAppt);
          await sendAppointmentNotifications({
            event: 'rescheduled',
            appointment: updatedAppt,
            details,
            newDateTime: updatedAppt.dateTime || undefined,
          });
        }
      } catch (e) { console.error('Post-edit notification failed:', e); }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error updating appointment:', error);
    return Response.json({ error: 'Failed to update appointment' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { serviceId, bundleId, dateTime, customer, status, paymentId, paymentStatus, paymentAmount, staffId, createdBy: rawCreatedBy, confirmOverlap: rawConfirmOverlap } = body;

    if (!serviceId || !dateTime || !customer) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Security: Only authenticated vendor/admin users can set createdBy or confirmOverlap.
    // This prevents malicious clients from sending createdBy to bypass double-booking protection.
    const user = await getCurrentUser();
    const createdBy = user ? rawCreatedBy : undefined;
    const confirmOverlap = user ? rawConfirmOverlap : false;

    // Customer bookings NEVER allow overlap override — only vendor/admin via manual route can do so
    // The confirmOverlap flag is only respected for the PATCH endpoint (which is admin-only via calendar UI)
    const isCustomerBooking = !createdBy;

    // Check global booking blackout
    const { data: globalSetting } = await client.models.SiteSettings.get({ settingKey: 'globalBookingDisabledUntil' });
    if (globalSetting?.settingValue && new Date(globalSetting.settingValue) > new Date()) {
      return Response.json({ error: 'Online booking is temporarily disabled' }, { status: 403 });
    }

    // Multi-provider booking path
    if (body.multiProvider === true) {
      return await handleMultiProviderBooking(body, client);
    }

    // Multi-quantity booking path
    if (body.quantity && body.quantity > 1) {
      return await handleQuantityBooking(body, client);
    }

    // Check if service requires multiple providers (auto-detect)
    const { data: serviceCheck } = await client.models.Service.get({ serviceId });
    if (serviceCheck && (serviceCheck.providersRequired as number) > 1) {
      return await handleMultiProviderBooking({ ...body, multiProvider: true }, client);
    }

    const appointmentId = randomUUID();

    // --- Double-booking prevention for client bookings ---
    const { data: serviceCheck2 } = await client.models.Service.get({ serviceId });
    const resourceType = serviceCheck2?.resourceType || 'staff';
    const bookingDate = dateTime.split('T')[0];
    const bookingTime = dateTime.includes('T') ? dateTime.split('T')[1].substring(0, 5) : '00:00';
    const duration = serviceCheck2?.duration || 60;
    const bufferMins = serviceCheck2?.bufferMinutes != null ? serviceCheck2.bufferMinutes : 15;
    const [bh, bm] = bookingTime.split(':').map(Number);
    const slotStart = bh * 60 + bm;
    const slotEnd = slotStart + duration;

    // Helper: check if a new slot overlaps with an existing appointment
    const slotsOverlap = (aptDateTime: string, aptDuration: number, aptBuffer: number, newBuffer: number) => {
      const aptTime = aptDateTime.includes('T') ? aptDateTime.split('T')[1].substring(0, 5) : '00:00';
      const [ah, am] = aptTime.split(':').map(Number);
      const aptStart = ah * 60 + am;
      const aptEnd = aptStart + aptDuration + aptBuffer;
      const newEnd = slotEnd + newBuffer;
      return slotStart < aptEnd && newEnd > aptStart;
    };

    if (resourceType === 'room') {
      // Room resources are cross-vendor — check ALL vendors for conflicts
      const { data: allVendors } = await client.models.Vendor.list();
      const aptPromises = (allVendors || []).map(v =>
        client.models.Appointment.listAppointmentByVendorIdAndDateTime({
          vendorId: v.vendorId,
          dateTime: { beginsWith: bookingDate }
        } as any)
      );
      const aptResults = await Promise.all(aptPromises);
      const allApts = aptResults.flatMap(r => (r as any).data || []);

      for (const apt of allApts) {
        if (apt.status === 'cancelled') continue;
        const { data: aptSvc } = await client.models.Service.get({ serviceId: apt.serviceId });
        if ((aptSvc?.resourceType || 'staff') !== 'room') continue;
        if (slotsOverlap(apt.dateTime, aptSvc?.duration || 60, 0, 0)) {
          return Response.json({ error: 'Spa room is already booked at this time' }, { status: 409 });
        }
      }
    } else if (resourceType === 'sauna') {
      // Sauna resource — only one booking per time slot for sauna services
      // Find vendor from staff or fall back
      let saunaVendorId = body.vendorId;
      if (staffId) {
        const { data: staffSch } = await client.models.StaffSchedule.get({ visibleId: staffId });
        if (staffSch?.vendorId) saunaVendorId = staffSch.vendorId;
      }
      if (saunaVendorId) {
        const result = await client.models.Appointment.listAppointmentByVendorIdAndDateTime({
          vendorId: saunaVendorId,
          dateTime: { beginsWith: bookingDate }
        } as any);
        const existingApts = (result as any).data || [];

        for (const apt of existingApts) {
          if (apt.status === 'cancelled') continue;
          const { data: aptSvc } = await client.models.Service.get({ serviceId: apt.serviceId });
          if ((aptSvc?.resourceType || 'staff') !== 'sauna') continue;
          if (slotsOverlap(apt.dateTime, aptSvc?.duration || 60, 0, 0)) {
            return Response.json({ error: 'Sauna is already booked at this time' }, { status: 409 });
          }
        }
      }
    } else if (staffId) {
      // Staff-based: prevent double-booking the specified staff member (client path)
      const { data: staffSch } = await client.models.StaffSchedule.get({ visibleId: staffId });
      if (staffSch?.vendorId) {
        const result = await client.models.Appointment.listAppointmentByVendorIdAndDateTime({
          vendorId: staffSch.vendorId,
          dateTime: { beginsWith: bookingDate }
        } as any);
        const existingApts = (result as any).data || [];

        for (const apt of existingApts) {
          if (apt.status === 'cancelled') continue;
          if (apt.staffId !== staffId) continue;

          // Determine the existing appointment's actual duration
          let aptDuration: number;
          const aptCustomer = typeof apt.customer === 'string' ? (() => { try { return JSON.parse(apt.customer); } catch { return {}; } })() : (apt.customer || {});

          if (aptCustomer.isBlockedTime && aptCustomer.duration) {
            // Blocked time stores its duration in the customer JSON
            aptDuration = aptCustomer.duration;
          } else if (aptCustomer.duration) {
            // Manual/enriched appointments store duration in customer JSON
            aptDuration = aptCustomer.duration;
          } else {
            const { data: aptSvc } = await client.models.Service.get({ serviceId: apt.serviceId });
            aptDuration = (aptSvc?.duration as number) || 60;
          }

          if (slotsOverlap(apt.dateTime, aptDuration, bufferMins, bufferMins)) {
            return Response.json({ error: 'This time slot is no longer available' }, { status: 409 });
          }
        }
      }
    }

    // Auto-assign staff if none provided — uses staffAssigner with fewest-bookings algorithm (Req 5.5, 5.6)
    let assignedStaffId = staffId;
    if (!assignedStaffId) {
      const { data: svcData } = await client.models.Service.get({ serviceId });
      const allowedStaff = (svcData?.allowedStaff as string[]) || [];

      // Fetch staff schedules
      let staffSchedules: any[] = [];
      if (allowedStaff.length > 0) {
        const staffPromises = allowedStaff.map((sid: string) => client.models.StaffSchedule.get({ visibleId: sid }));
        const staffResults = await Promise.all(staffPromises);
        staffSchedules = staffResults.filter(r => r.data && r.data.isActive !== false).map(r => r.data);
      } else {
        // All active staff
        const { data: allStaff } = await client.models.StaffSchedule.list();
        staffSchedules = (allStaff || []).filter((s: any) => s.isActive !== false);
      }

      if (staffSchedules.length > 0) {
        // Parse date and time from dateTime
        const date = dateTime.includes('T') ? dateTime.split('T')[0] : dateTime.split(' ')[0];
        const time = dateTime.includes('T') ? dateTime.split('T')[1].substring(0, 5) : '00:00';

        // Fetch existing appointments on the date for booking count and conflict detection
        const vendorIds = [...new Set(staffSchedules.map((s: any) => s.vendorId).filter(Boolean))] as string[];
        const appointmentPromises = vendorIds.map((vid: string) =>
          client.models.Appointment.listAppointmentByVendorIdAndDateTime({
            vendorId: vid,
            dateTime: { beginsWith: date },
          } as any)
        );
        const appointmentResults = await Promise.all(appointmentPromises);
        const existingAppointments = appointmentResults
          .flatMap((result: any) => result.data || []);

        // Get buffer minutes from vendor
        const bufferMinutes = svcData?.bufferMinutes || 15;

        try {
          const assigned = assignStaff({
            service: { ...svcData, providersRequired: 1 },
            staffSchedules,
            appointments: existingAppointments,
            date,
            time,
            bufferMinutes,
          });
          if (assigned.length > 0) {
            assignedStaffId = assigned[0].staffId;
          }
        } catch {
          // If assignStaff throws (no eligible staff), fall back to first active staff
          assignedStaffId = staffSchedules[0]?.visibleId;
        }
      }
    }

    // Resolve vendorId from StaffSchedule (Req 9.7) rather than from request body
    let resolvedVendorId = body.vendorId; // fallback to body if staff not found
    if (assignedStaffId) {
      const { data: staffSchedule } = await client.models.StaffSchedule.get({ visibleId: assignedStaffId });
      if (staffSchedule?.vendorId) {
        resolvedVendorId = staffSchedule.vendorId;
      }

      // Overlap detection (Req 4.6): check before saving
      // Customer bookings ALWAYS enforce overlap — never allow confirmOverlap override
      if (isCustomerBooking || !confirmOverlap) {
        const svcDuration = serviceCheck?.duration || 60;
        const overlap = await detectOverlap(client, assignedStaffId, dateTime, svcDuration as number, undefined, !isCustomerBooking);
        if (overlap) {
          // For customer bookings: hard block with no override option
          if (isCustomerBooking) {
            return Response.json({
              error: 'This time slot is no longer available. Please select a different time.',
            }, { status: 409 });
          }
          return Response.json({
            warning: 'Scheduling conflict detected',
            conflict: overlap,
            message: 'This appointment overlaps with an existing appointment. Resubmit with confirmOverlap=true to save anyway.',
          }, { status: 409 });
        }
      }
    }

    // Check vendor-level booking blackout (using resolved vendorId)
    if (resolvedVendorId) {
      const { data: vendorCheck } = await client.models.Vendor.get({ vendorId: resolvedVendorId });
      const vendorUntil = vendorCheck?.bookingDisabledUntil as string | null;
      if (vendorUntil && new Date(vendorUntil) > new Date()) {
        return Response.json({ error: 'Booking is temporarily disabled for this provider' }, { status: 403 });
      }
    }

    if (!resolvedVendorId) {
      return Response.json({ error: 'Could not resolve vendor for this appointment' }, { status: 400 });
    }

    const { data, errors } = await client.models.Appointment.create({
      appointmentId,
      vendorId: resolvedVendorId,
      serviceId,
      staffId: assignedStaffId || undefined,
      bundleId: bundleId || undefined,
      dateTime,
      customer: JSON.stringify({ ...customer, duration }),
      status: status || 'pending-confirmation',
      paymentId,
      paymentStatus: paymentStatus || undefined,
      paymentAmount: paymentAmount || undefined,
      createdBy: createdBy || undefined,
      createdAt: new Date().toISOString(),
    } as any);

    if (errors) {
      console.error('Error creating appointment:', errors);
      return Response.json({ error: 'Failed to create appointment' }, { status: 500 });
    }

    // --- Post-write race condition guard (Req 4.6) ---
    // Re-check for conflicts after writing to catch concurrent bookings that slipped through
    if (assignedStaffId && isCustomerBooking) {
      try {
        const { data: staffSchedule } = await client.models.StaffSchedule.get({ visibleId: assignedStaffId });
        if (staffSchedule?.vendorId) {
          const postWriteResult = await client.models.Appointment.listAppointmentByVendorIdAndDateTime({
            vendorId: staffSchedule.vendorId,
            dateTime: { beginsWith: bookingDate },
          } as any);
          const postWriteApts = ((postWriteResult as any).data || []).filter(
            (a: any) => a.status !== 'cancelled' && a.staffId === assignedStaffId && a.appointmentId !== appointmentId
          );

          for (const apt of postWriteApts) {
            const aptCustomer = typeof apt.customer === 'string' ? (() => { try { return JSON.parse(apt.customer); } catch { return {}; } })() : (apt.customer || {});
            const aptDuration: number = aptCustomer?.duration || duration;
            if (slotsOverlap(apt.dateTime, aptDuration, bufferMins, bufferMins)) {
              // Conflict detected after write — roll back our appointment
              await client.models.Appointment.update({ appointmentId, status: 'cancelled' } as any);
              return Response.json({ error: 'This time slot is no longer available' }, { status: 409 });
            }
          }
        }
      } catch (e) {
        console.error('Post-write conflict check failed (non-fatal):', e);
      }
    }

    // Auto-populate client catalog
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const clientRes = await fetch(`${appUrl}/api/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: customer.name, phone: customer.phone, email: customer.email })
      });
      const clientData = await clientRes.json();
      if (clientData.client?.clientId) {
        await client.models.Appointment.update({ appointmentId, clientId: clientData.client.clientId } as any);
      }
    } catch (e) { console.error('Client auto-populate failed:', e); }

    // Notify staff only on booking — customer/vendor notified at confirmation
    await sendStaffBookingNotification({ appointmentId, vendorId: resolvedVendorId, serviceId, staffId: assignedStaffId, dateTime, customer }).catch(e => console.error('Staff notification failed:', e));

    return Response.json({ success: true, appointmentId, staffId: assignedStaffId, vendorId: resolvedVendorId });
  } catch (error) {
    console.error('Error creating appointment:', error);
    return Response.json({ error: 'Failed to create appointment' }, { status: 500 });
  }
}

/**
 * Overlap detection helper (Req 4.6)
 * Uses shared overlap detection that enforces buffer time on both sides.
 * Blocked time is treated as a real conflict — customers cannot book over it.
 * Returns the conflicting appointment info if overlap exists, null otherwise.
 */
async function detectOverlap(
  amplifyClient: any,
  staffId: string,
  dateTime: string,
  durationMinutes: number,
  excludeAppointmentId?: string,
  isVendorBooking: boolean = false
): Promise<{ appointmentId: string; dateTime: string; staffId: string } | null> {
  const date = extractDateFromDateTime(dateTime);

  // Fetch existing appointments for this staff on the same date
  const { data: staffSchedule } = await amplifyClient.models.StaffSchedule.get({ visibleId: staffId });
  if (!staffSchedule?.vendorId) return null;

  // Get buffer minutes from vendor config
  const { data: vendor } = await amplifyClient.models.Vendor.get({ vendorId: staffSchedule.vendorId });
  const vendorBuffer = vendor?.bufferMinutes ?? 15;

  const { data: appointments } = await amplifyClient.models.Appointment.listAppointmentByVendorIdAndDateTime({
    vendorId: staffSchedule.vendorId,
    dateTime: { beginsWith: date },
  } as any);

  if (!appointments || appointments.length === 0) return null;

  // Build service duration map for all unique serviceIds in the existing appointments
  const serviceIds = [...new Set(appointments.map((a: any) => a.serviceId).filter(Boolean))];
  const serviceDurationMap: Record<string, number> = {};
  await Promise.all(serviceIds.map(async (sid: string) => {
    if (sid === 'blocked' || sid === 'manual') return;
    const { data: svc } = await amplifyClient.models.Service.get({ serviceId: sid });
    if (svc?.duration) serviceDurationMap[sid] = svc.duration as number;
    // Use per-service buffer if defined, storing for later use
    if (svc?.bufferMinutes != null) serviceDurationMap[`__buffer__${sid}`] = svc.bufferMinutes as number;
  }));

  // Determine the buffer to use for the new appointment
  // Check if the new service has a per-service buffer
  const newServiceBuffer = serviceDurationMap[`__buffer__${appointments[0]?.serviceId}`];
  const bufferMinutes = newServiceBuffer ?? vendorBuffer;

  return detectConflict(
    staffId,
    dateTime,
    durationMinutes,
    bufferMinutes,
    appointments,
    serviceDurationMap,
    excludeAppointmentId,
    isVendorBooking
  );
}

async function handleMultiProviderBooking(body: any, amplifyClient: any) {
  const { serviceId, dateTime, customer, status } = body;

  // Fetch the service to get allowedStaff, providersRequired, duration
  const { data: service, errors: serviceErrors } = await amplifyClient.models.Service.get({ serviceId });
  if (serviceErrors || !service) {
    return Response.json({ error: 'Service not found' }, { status: 404 });
  }

  let allowedStaff = (service.allowedStaff as string[]) || [];

  // If allowedStaff is empty (null = all staff), fetch all active staff across all vendors
  if (allowedStaff.length === 0) {
    const { data: allStaff } = await amplifyClient.models.StaffSchedule.list();
    allowedStaff = (allStaff || []).filter((s: any) => s.isActive !== false).map((s: any) => s.visibleId);
  }

  if (allowedStaff.length === 0) {
    return Response.json({ error: 'No staff available for this service' }, { status: 400 });
  }

  // Extract date and time from dateTime (e.g., "2024-01-15T09:00")
  const [date, time] = dateTime.includes('T')
    ? [dateTime.split('T')[0], dateTime.split('T')[1].substring(0, 5)]
    : [dateTime.split(' ')[0], dateTime.split(' ')[1]];

  // Fetch staff schedules for all staff in allowedStaff
  const staffSchedulePromises = allowedStaff.map((staffId: string) =>
    amplifyClient.models.StaffSchedule.get({ visibleId: staffId })
  );
  const staffScheduleResults = await Promise.all(staffSchedulePromises);

  const staffSchedules = staffScheduleResults
    .filter((result: any) => !result.errors && result.data)
    .map((result: any) => result.data);

  if (staffSchedules.length === 0) {
    return Response.json({ error: 'No staff schedules found' }, { status: 400 });
  }

  // Fetch existing appointments for the date across all relevant vendors
  const vendorIds = [...new Set(staffSchedules.map((s: any) => s.vendorId).filter(Boolean))] as string[];

  const appointmentPromises = vendorIds.map((vid: string) =>
    amplifyClient.models.Appointment.list({
      filter: {
        vendorId: { eq: vid },
        dateTime: { beginsWith: date }
      }
    })
  );
  const appointmentResults = await Promise.all(appointmentPromises);

  const existingAppointments = appointmentResults
    .flatMap((result: any) => result.data || [])
    .filter((apt: any) => apt.status !== 'cancelled');

  // Determine buffer minutes from the first vendor (lead vendor)
  const leadVendorId = service.leadVendorId || vendorIds[0];
  const { data: leadVendor } = await amplifyClient.models.Vendor.get({ vendorId: leadVendorId });
  const bufferMinutes = leadVendor?.bufferMinutes || 15;

  // Run staff assignment
  let assignedStaffMembers;
  try {
    assignedStaffMembers = assignStaff({
      service,
      staffSchedules,
      appointments: existingAppointments,
      date,
      time,
      bufferMinutes
    });
  } catch (error: any) {
    return Response.json({ error: error.message || 'Selected time is no longer available' }, { status: 409 });
  }

  // Generate a shared groupId
  const groupId = randomUUID();

  // Create one appointment per assigned staff member
  const appointmentIds: string[] = [];
  const creationErrors: any[] = [];

  for (const staff of assignedStaffMembers) {
    const appointmentId = randomUUID();

    const { errors } = await amplifyClient.models.Appointment.create({
      appointmentId,
      vendorId: staff.vendorId,
      serviceId,
      staffId: staff.staffId,
      groupId,
      dateTime,
      customer: JSON.stringify({ ...customer, duration: service.duration || 60 }),
      status: status || 'pending-confirmation',
      createdAt: new Date().toISOString(),
    } as any);

    if (errors) {
      creationErrors.push({ appointmentId, errors });
    } else {
      appointmentIds.push(appointmentId);
    }
  }

  // If any creation failed, roll back the successfully created ones
  if (creationErrors.length > 0) {
    for (const id of appointmentIds) {
      try {
        await amplifyClient.models.Appointment.update({ appointmentId: id, status: 'cancelled' } as any);
      } catch (e) {
        console.error('Rollback failed for appointment:', id, e);
      }
    }
    console.error('Error creating multi-provider appointments:', creationErrors);
    return Response.json({ error: 'Failed to create appointments' }, { status: 500 });
  }

  // Auto-populate client catalog
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const clientRes = await fetch(`${appUrl}/api/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: customer.name, phone: customer.phone, email: customer.email })
    });
    const clientData = await clientRes.json();
    if (clientData.client?.clientId) {
      for (const id of appointmentIds) {
        await amplifyClient.models.Appointment.update({ appointmentId: id, clientId: clientData.client.clientId } as any);
      }
    }
  } catch (e) { console.error('Client auto-populate failed:', e); }

  // Notify staff only on booking — customer/vendor notified at confirmation
  for (const staff of assignedStaffMembers) {
    const aptId = appointmentIds[assignedStaffMembers.indexOf(staff)];
    sendStaffBookingNotification({ appointmentId: aptId, vendorId: staff.vendorId, serviceId, staffId: staff.staffId, dateTime, customer })
      .catch(e => console.error('Staff notification failed for appointment:', aptId, e));
  }

  // --- Post-write race condition guard for multi-provider bookings ---
  try {
    const bookingDate = dateTime.includes('T') ? dateTime.split('T')[0] : dateTime.split(' ')[0];
    const bookingTime = dateTime.includes('T') ? dateTime.split('T')[1].substring(0, 5) : '00:00';
    const [bh, bm] = bookingTime.split(':').map(Number);
    const slotStart = bh * 60 + bm;
    const slotEnd = slotStart + (service.duration || 60);
    const bufferMins = service.bufferMinutes ?? 15;

    for (const staff of assignedStaffMembers) {
      const { data: staffSch } = await amplifyClient.models.StaffSchedule.get({ visibleId: staff.staffId });
      if (!staffSch?.vendorId) continue;

      const postWriteResult = await amplifyClient.models.Appointment.listAppointmentByVendorIdAndDateTime({
        vendorId: staffSch.vendorId,
        dateTime: { beginsWith: bookingDate },
      } as any);
      const postWriteApts = ((postWriteResult as any).data || []).filter(
        (a: any) => a.status !== 'cancelled' && a.staffId === staff.staffId && !appointmentIds.includes(a.appointmentId)
      );

      for (const apt of postWriteApts) {
        const aptCustomer = typeof apt.customer === 'string' ? (() => { try { return JSON.parse(apt.customer); } catch { return {}; } })() : (apt.customer || {});
        const aptDuration: number = aptCustomer?.duration || (service.duration || 60);
        const aptTime = (apt.dateTime as string).includes('T') ? (apt.dateTime as string).split('T')[1].substring(0, 5) : '00:00';
        const [ah, am] = aptTime.split(':').map(Number);
        const aptStart = ah * 60 + am;
        const aptEnd = aptStart + aptDuration + bufferMins;
        const newEnd = slotEnd + bufferMins;

        if (slotStart < aptEnd && newEnd > aptStart) {
          // Conflict detected — roll back all appointments in this group
          for (const id of appointmentIds) {
            await amplifyClient.models.Appointment.update({ appointmentId: id, status: 'cancelled' } as any).catch(() => {});
          }
          return Response.json({ error: 'This time slot is no longer available' }, { status: 409 });
        }
      }
    }
  } catch (e) {
    console.error('Multi-provider post-write conflict check failed (non-fatal):', e);
  }

  return Response.json({ success: true, appointmentIds, groupId });
}

async function handleQuantityBooking(body: any, amplifyClient: any) {
  const { vendorId, serviceId, dateTime, customer, status, quantity, quantityMode, staffId, paymentId, paymentStatus, paymentAmount } = body;

  // Fetch the service
  const { data: service, errors: serviceErrors } = await amplifyClient.models.Service.get({ serviceId });
  if (serviceErrors || !service) {
    return Response.json({ error: 'Service not found' }, { status: 404 });
  }

  // Validate quantity against maxQuantityPerBooking
  const maxQty = service.maxQuantityPerBooking || 1;
  if (quantity > maxQty) {
    return Response.json({ error: `Maximum quantity for this service is ${maxQty}` }, { status: 400 });
  }

  const duration = service.duration;
  const mode = quantityMode || 'sequential';

  // Generate a shared groupId for all appointments in this quantity booking
  const groupId = randomUUID();
  const appointmentIds: string[] = [];
  const creationErrors: any[] = [];

  if (mode === 'parallel') {
    // Parallel: assign different staff to each unit, all at the same dateTime
    const allowedStaff = (service.allowedStaff as string[]) || [];
    if (allowedStaff.length < quantity) {
      return Response.json({ error: 'Not enough staff available for parallel booking' }, { status: 400 });
    }

    // Fetch staff schedules and existing appointments for assignment
    const [date, time] = dateTime.includes('T')
      ? [dateTime.split('T')[0], dateTime.split('T')[1].substring(0, 5)]
      : [dateTime.split(' ')[0], dateTime.split(' ')[1]];

    const staffSchedulePromises = allowedStaff.map((sid: string) =>
      amplifyClient.models.StaffSchedule.get({ visibleId: sid })
    );
    const staffScheduleResults = await Promise.all(staffSchedulePromises);
    const staffSchedules = staffScheduleResults
      .filter((r: any) => !r.errors && r.data)
      .map((r: any) => r.data);

    const vendorIds = [...new Set(staffSchedules.map((s: any) => s.vendorId).filter(Boolean))] as string[];
    const appointmentPromises = vendorIds.map((vid: string) =>
      amplifyClient.models.Appointment.list({ filter: { vendorId: { eq: vid }, dateTime: { beginsWith: date } } })
    );
    const appointmentResults = await Promise.all(appointmentPromises);
    const existingAppointments = appointmentResults
      .flatMap((r: any) => r.data || [])
      .filter((apt: any) => apt.status !== 'cancelled');

    const { data: leadVendor } = await amplifyClient.models.Vendor.get({ vendorId });
    const bufferMinutes = leadVendor?.bufferMinutes || 15;

    // Use assignStaff with providersRequired = quantity
    let assignedStaffMembers;
    try {
      assignedStaffMembers = assignStaff({
        service: { ...service, providersRequired: quantity },
        staffSchedules,
        appointments: existingAppointments,
        date,
        time,
        bufferMinutes
      });
    } catch (error: any) {
      return Response.json({ error: error.message || 'Selected time is no longer available' }, { status: 409 });
    }

    // Create one appointment per staff member
    for (const staff of assignedStaffMembers) {
      const appointmentId = randomUUID();
      const { errors } = await amplifyClient.models.Appointment.create({
        appointmentId,
        vendorId: staff.vendorId,
        serviceId,
        staffId: staff.staffId,
        groupId,
        dateTime,
        customer: JSON.stringify({ ...customer, duration: duration }),
        status: status || 'pending-confirmation',
        paymentId,
        paymentStatus: paymentStatus || undefined,
        paymentAmount: paymentAmount || undefined,
        createdAt: new Date().toISOString(),
      } as any);

      if (errors) {
        creationErrors.push({ appointmentId, errors });
      } else {
        appointmentIds.push(appointmentId);
      }
    }
  } else {
    // Sequential: same staff, back-to-back appointments
    const bufferMinutes = 15;
    const { data: vendorData } = await amplifyClient.models.Vendor.get({ vendorId });
    const actualBuffer = vendorData?.bufferMinutes || bufferMinutes;

    // Auto-assign staff if none provided
    let assignedStaffId = staffId;
    if (!assignedStaffId) {
      const allowedStaff = (service.allowedStaff as string[]) || [];
      if (allowedStaff.length > 0) {
        assignedStaffId = allowedStaff[0];
      } else {
        // allowedStaff is null = all staff for this vendor
        const { data: vendorStaff } = await amplifyClient.models.StaffSchedule.listStaffScheduleByVendorId({ vendorId } as any);
        const activeStaff = (vendorStaff || []).filter((s: any) => s.isActive !== false);
        if (activeStaff.length > 0) assignedStaffId = activeStaff[0].visibleId;
      }
    }

    // Parse the start dateTime
    const [date, timeStr] = dateTime.includes('T')
      ? [dateTime.split('T')[0], dateTime.split('T')[1].substring(0, 5)]
      : [dateTime.split(' ')[0], dateTime.split(' ')[1]];

    const [startHour, startMin] = timeStr.split(':').map(Number);
    let currentMinutes = startHour * 60 + startMin;

    for (let i = 0; i < quantity; i++) {
      const hour = Math.floor(currentMinutes / 60);
      const min = currentMinutes % 60;
      const slotDateTime = `${date}T${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:00`;

      const appointmentId = randomUUID();
      const { errors } = await amplifyClient.models.Appointment.create({
        appointmentId,
        vendorId,
        serviceId,
        staffId: assignedStaffId || undefined,
        groupId,
        dateTime: slotDateTime,
        customer: JSON.stringify({ ...customer, duration: duration }),
        status: status || 'pending-confirmation',
        paymentId,
        paymentStatus: paymentStatus || undefined,
        paymentAmount: paymentAmount || undefined,
        createdAt: new Date().toISOString(),
      } as any);

      if (errors) {
        creationErrors.push({ appointmentId, errors });
      } else {
        appointmentIds.push(appointmentId);
      }

      // Move to next slot: duration + buffer
      currentMinutes += duration + actualBuffer;
    }
  }

  // Rollback on failure
  if (creationErrors.length > 0) {
    for (const id of appointmentIds) {
      try {
        await amplifyClient.models.Appointment.update({ appointmentId: id, status: 'cancelled' } as any);
      } catch (e) {
        console.error('Rollback failed for appointment:', id, e);
      }
    }
    console.error('Error creating quantity appointments:', creationErrors);
    return Response.json({ error: 'Failed to create appointments' }, { status: 500 });
  }

  // Auto-populate client catalog
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const clientRes = await fetch(`${appUrl}/api/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: customer.name, phone: customer.phone, email: customer.email })
    });
    const clientData = await clientRes.json();
    if (clientData.client?.clientId) {
      for (const id of appointmentIds) {
        await amplifyClient.models.Appointment.update({ appointmentId: id, clientId: clientData.client.clientId } as any);
      }
    }
  } catch (e) { console.error('Client auto-populate failed:', e); }

  // Notify staff only on booking — customer/vendor notified at confirmation
  sendStaffBookingNotification({ appointmentId: appointmentIds[0], vendorId, serviceId, staffId, dateTime, customer })
    .catch(e => console.error('Staff notification failed:', e));

  return Response.json({ success: true, appointmentIds, groupId, quantity, mode: quantityMode });
}
