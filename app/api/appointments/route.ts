import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { randomUUID } from 'crypto';
import { resolveAppointmentDetails, sendAppointmentNotifications, sendStaffBookingNotification } from '@/lib/appointment-notifications';
import { assignStaff } from '@/app/utils/staffAssigner.js';
import { detectConflict, extractDateFromDateTime, intervalsOverlap, extractTimeFromDateTime, timeToMinutes } from '@/app/utils/overlapDetection';
import { getCurrentUser } from '@/lib/auth';
import { validateTimeFrame, validateExtras, validateIsNewClient } from '@/app/utils/bookingValidation.js';
import { determineBookingStatus } from '@/app/utils/bookingStatus.js';
import { calculateExtrasCost } from '@/app/utils/extrasCalculator.js';
import { verifyBookingEntities, verifyStaffEntity, verifyVendorEntity } from '@/app/utils/entityVerification';
import { validateCustomerBookingInput, validateAppointmentUpdateInput, buildValidationErrorResponse } from '@/app/utils/inputValidation';
import { sanitizeCustomerName, sanitizeNotes } from '@/app/utils/inputSanitization';
import { checkBundleConflicts, queryAppointmentsAcrossVendors, buildServiceDurationMap, type BundleServiceAssignment } from '@/app/utils/bundleConflictCheck';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/app/utils/rateLimiter';
import { auditReject, safeErrorResponse } from '@/app/utils/auditLogger';

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

export async function PATCH(request: Request) {
  const clientIp = getClientIp(request);
  let body: any = {};
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      auditReject(clientIp, {}, 'auth', 401, undefined, 'Unauthenticated PATCH attempt');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    body = await request.json();

    // --- Input Validation (Requirements 11.1) ---
    const validationResult = validateAppointmentUpdateInput(body);
    if (!validationResult.valid) {
      auditReject(clientIp, body, 'validation', 400, currentUser.vendorId, 'Input validation failed');
      return Response.json(buildValidationErrorResponse(validationResult.errors), { status: 400 });
    }

    const { appointmentId, paymentId, paymentStatus, paymentAmount, status, serviceId, staffId, vendorId, customer, createdBy, confirmOverlap, dateTime } = body;

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
    if (customer !== undefined) {
      // Sanitize customer string fields before persistence (Requirements 11.5)
      if (typeof customer === 'object' && customer !== null) {
        const sanitizedCustomer = { ...customer };
        if (customer.name !== undefined) {
          sanitizedCustomer.name = sanitizeCustomerName(customer.name);
        }
        if (customer.notes !== undefined) {
          sanitizedCustomer.notes = sanitizeNotes(customer.notes);
        }
        updateFields.customer = typeof customer === 'string' ? customer : JSON.stringify(sanitizedCustomer);
      } else {
        updateFields.customer = customer;
      }
    }

    // Record who performed the edit for audit purposes (Req 4.5)
    if (createdBy !== undefined) updateFields.createdBy = createdBy;

    // If staffId is being changed, resolve vendorId from StaffSchedule (Req 9.7)
    if (staffId !== undefined) {
      updateFields.staffId = staffId;

      // Entity verification: verify staffId exists and is active (Req 11.7)
      const staffCheck = await verifyStaffEntity(client, staffId);
      if (!staffCheck.valid) {
        auditReject(clientIp, body, 'not_found', 404, currentUser.vendorId, 'Staff not found');
        return Response.json({ error: staffCheck.error }, { status: staffCheck.statusCode || 404 });
      }

      const { data: staffSchedule } = await client.models.StaffSchedule.get({ visibleId: staffId });
      if (staffSchedule?.vendorId) {
        updateFields.vendorId = staffSchedule.vendorId;
      }
    } else if (vendorId !== undefined) {
      // Entity verification: verify vendorId exists and is active (Req 11.7)
      const vendorCheck = await verifyVendorEntity(client, vendorId);
      if (!vendorCheck.valid) {
        auditReject(clientIp, body, 'not_found', 404, currentUser.vendorId, 'Vendor not found');
        return Response.json({ error: vendorCheck.error }, { status: vendorCheck.statusCode || 404 });
      }

      updateFields.vendorId = vendorId;
    }

    // Overlap detection for edits that change dateTime or staffId (Requirements 7.1, 7.2, 7.3, 7.4)
    // Self-exclusion: exclude the appointment being edited from the conflict check
    // If conflict and no confirmOverlap: return 409 with conflict details
    // If conflict and confirmOverlap is true: persist the update (admin override)
    const targetStaffId = updateFields.staffId;
    const dateTimeChanged = dateTime !== undefined;

    if (targetStaffId || dateTimeChanged) {
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
        if (overlap && !confirmOverlap) {
          // Conflict detected and no override flag — reject with 409
          auditReject(clientIp, body, 'conflict', 409, currentUser.vendorId, `Conflict with appointment at ${overlap.dateTime}`);
          return Response.json({
            error: 'Scheduling conflict detected',
            conflict: overlap,
            message: 'Resubmit with confirmOverlap=true to override',
          }, { status: 409 });
        }
        // If overlap && confirmOverlap === true: proceed with update (admin override, Req 7.3)
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
    auditReject(clientIp, body, 'server_error', 500, undefined, 'Internal error during appointment update');
    return Response.json(safeErrorResponse(500), { status: 500 });
  }
}

export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  let body: any = {};
  try {
    // Rate limiting: 10 requests/min per IP for customer bookings (Req 11.2)
    const rateCheck = checkRateLimit(`customer-booking:${clientIp}`, 10, 60 * 1000);
    if (!rateCheck.allowed) {
      auditReject(clientIp, {}, 'rate_limit', 429, undefined, 'Customer booking rate limit exceeded');
      return rateLimitResponse(rateCheck.retryAfter!);
    }

    body = await request.json();

    // --- Input Validation (Requirements 11.1) ---
    const validationResult = validateCustomerBookingInput(body);
    if (!validationResult.valid) {
      auditReject(clientIp, body, 'validation', 400, undefined, 'Input validation failed');
      return Response.json(buildValidationErrorResponse(validationResult.errors), { status: 400 });
    }

    const { serviceId, bundleId, dateTime, customer, status: rawStatus, paymentId, paymentStatus, paymentAmount, staffId, createdBy: rawCreatedBy, confirmOverlap: rawConfirmOverlap, isManual: rawIsManual, timeFrame, isNewClient, extras: clientExtras } = body;

    if (!serviceId || !dateTime || !customer) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Security: Strip privileged fields from unauthenticated requests (Requirements 11.3, 11.4, 2.3, 2.4, 1.4)
    // Only authenticated vendor/admin users can set createdBy, confirmOverlap, isManual, or status.
    // This prevents malicious clients from bypassing double-booking protection or injecting privileged state.
    const user = await getCurrentUser();
    const createdBy = user ? rawCreatedBy : undefined;
    const confirmOverlap = user ? rawConfirmOverlap : false;
    // isManual stripped for unauthenticated users (Req 11.4) — not used directly, but must be removed from body
    const _isManual = user ? rawIsManual : undefined;
    const status = user ? rawStatus : undefined;

    // Strip privileged fields from the body object itself so helper functions
    // (handleMultiProviderBooking, handleQuantityBooking) also receive sanitized data
    if (!user) {
      delete body.createdBy;
      delete body.confirmOverlap;
      delete body.isManual;
      delete body.status;
    }

    // --- Booking Enhancement Validations ---

    // Validate isNewClient field (must be boolean type if provided)
    if (isNewClient !== undefined && isNewClient !== null) {
      const isNewClientResult = validateIsNewClient(isNewClient);
      if (!isNewClientResult.valid) {
        return Response.json({ error: isNewClientResult.error, field: 'isNewClient' }, { status: 400 });
      }
    }

    // Validate timeFrame field if provided
    if (timeFrame !== undefined && timeFrame !== null) {
      const timeFrameResult = validateTimeFrame(timeFrame);
      if (!timeFrameResult.valid) {
        return Response.json({ error: timeFrameResult.error, field: 'timeFrame' }, { status: 400 });
      }
    }

    // If bundle has useTimeFrames: true, timeFrame is required
    if (bundleId) {
      const { data: bundleData } = await client.models.Bundle.get({ bundleId });
      if (bundleData?.useTimeFrames && !timeFrame) {
        return Response.json({ error: 'timeFrame is required for time-frame-enabled bundles', field: 'timeFrame' }, { status: 400 });
      }
    }

    // Validate extras array if provided
    let extrasMetadata: any = null;
    if (clientExtras && Array.isArray(clientExtras) && clientExtras.length > 0) {
      // Check max count first
      if (clientExtras.length > 20) {
        return Response.json({ error: 'Maximum 20 extras per booking', field: 'extras' }, { status: 400 });
      }

      // Fetch the Extra catalog for validation
      const { data: extraCatalog } = await client.models.Extra.list() as any;
      const catalog = extraCatalog || [];

      // Extract extra IDs from client submission
      const extraIds = clientExtras.map((e: any) => typeof e === 'string' ? e : e.extraId);

      const extrasValidation = validateExtras(extraIds, bundleId || '', catalog);
      if (!extrasValidation.valid) {
        // Return the first error
        return Response.json({ error: extrasValidation.errors[0], field: 'extras' }, { status: 400 });
      }

      // Server-side price re-calculation from catalog (never trust client prices)
      const groupSize = customer?.people || customer?.groupSize || 1;
      const costResult = calculateExtrasCost(extrasValidation.validExtras, groupSize);
      extrasMetadata = costResult;
    }

    // Sanitize string inputs before persistence (Requirements 11.5)
    // Encode HTML entities, trim/normalize whitespace, truncate at max length
    const sanitizedNotes = sanitizeNotes(customer?.notes);
    const sanitizedCustomerName = sanitizeCustomerName(customer?.name);

    // Customer bookings NEVER allow overlap override — only vendor/admin via manual route can do so
    // The confirmOverlap flag is only respected for the PATCH endpoint (which is admin-only via calendar UI)
    const isCustomerBooking = !createdBy;

    // Entity verification: verify staffId and vendorId exist and are active (Req 11.7)
    const entityCheck = await verifyBookingEntities(client, staffId, body.vendorId);
    if (!entityCheck.valid) {
      auditReject(clientIp, body, 'not_found', entityCheck.statusCode || 404, user?.vendorId, 'Entity not found');
      return Response.json({ error: entityCheck.error }, { status: entityCheck.statusCode || 404 });
    }

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

    // Helper: check if a new slot overlaps with an existing appointment
    // Uses the shared intervalsOverlap to enforce buffer on BOTH sides:
    //   existing window = (existingStart, existingStart + existingDuration + existingBuffer)
    //   new window = (newStart, newStart + newDuration + newBuffer)
    const slotsOverlap = (aptDateTime: string, aptDuration: number, aptBuffer: number, newBuffer: number) => {
      const existingStart = timeToMinutes(extractTimeFromDateTime(aptDateTime));
      return intervalsOverlap({
        newStart: slotStart,
        newDuration: duration,
        newBuffer: newBuffer,
        existingStart,
        existingDuration: aptDuration,
        existingBuffer: aptBuffer,
      });
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
          auditReject(clientIp, body, 'conflict', 409, user?.vendorId, 'Spa room conflict');
          return Response.json({ error: 'This time slot is no longer available' }, { status: 409 });
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
            auditReject(clientIp, body, 'conflict', 409, user?.vendorId, 'Sauna conflict');
            return Response.json({ error: 'This time slot is no longer available' }, { status: 409 });
          }
        }
      }
    } else if (staffId) {
      // Staff-based: prevent double-booking the specified staff member (client path)
      // Uses shared detectConflict from overlapDetection module (Requirements 1.1, 1.2, 1.3, 1.5)
      const { data: staffSch } = await client.models.StaffSchedule.get({ visibleId: staffId });
      if (staffSch?.vendorId) {
        // Query appointments using vendorId-dateTime index with date prefix (Req 5.1)
        const result = await client.models.Appointment.listAppointmentByVendorIdAndDateTime({
          vendorId: staffSch.vendorId,
          dateTime: { beginsWith: bookingDate }
        } as any);
        const existingApts = (result as any).data || [];

        // Build service duration map for existing appointments (resolve in parallel per Req 5.2)
        const serviceIds = [...new Set(existingApts.map((a: any) => a.serviceId).filter(Boolean))] as string[];
        const serviceDurationMap: Record<string, number> = {};
        await Promise.all(serviceIds.map(async (sid: string) => {
          if (sid === 'blocked' || sid === 'manual') return;
          const { data: svc } = await client.models.Service.get({ serviceId: sid });
          if (svc?.duration) serviceDurationMap[sid] = svc.duration as number;
        }));

        // Run detectConflict — includes blocked-time entries (serviceId = "blocked") in the check
        const conflict = detectConflict(
          staffId,
          dateTime,
          duration,
          bufferMins,
          existingApts,
          serviceDurationMap,
          undefined, // no excludeAppointmentId for new bookings
          false // customer booking — not a vendor booking
        );

        if (conflict) {
          auditReject(clientIp, body, 'conflict', 409, user?.vendorId, 'Staff time slot conflict');
          return Response.json({ error: 'This time slot is no longer available' }, { status: 409 });
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
            auditReject(clientIp, body, 'conflict', 409, undefined, 'Customer booking conflict');
            return Response.json({
              error: 'This time slot is no longer available. Please select a different time.',
            }, { status: 409 });
          }
          auditReject(clientIp, body, 'conflict', 409, user?.vendorId, `Conflict with appointment at ${overlap.dateTime}`);
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

    // Determine booking status using the new status determination logic
    const resolvedIsNewClient = isNewClient === true;
    const determinedStatus = determineBookingStatus({
      isNewClient: resolvedIsNewClient,
      resourceType: resourceType as string,
      requiresConsultation: serviceCheck2?.requiresConsultation || false,
    });

    // Build customer JSON with isNewClient and sanitized fields
    const customerData = {
      ...customer,
      name: sanitizedCustomerName,
      notes: sanitizedNotes,
      isNewClient: resolvedIsNewClient,
      duration,
    };

    const { data, errors } = await client.models.Appointment.create({
      appointmentId,
      vendorId: resolvedVendorId,
      serviceId,
      staffId: assignedStaffId || undefined,
      bundleId: bundleId || undefined,
      dateTime,
      customer: JSON.stringify(customerData),
      status: status || determinedStatus,
      paymentId,
      paymentStatus: paymentStatus || undefined,
      paymentAmount: paymentAmount || undefined,
      createdBy: createdBy || undefined,
      createdAt: new Date().toISOString(),
      timeFrame: timeFrame || undefined,
      extras: extrasMetadata ? JSON.stringify(extrasMetadata.items) : undefined,
    } as any);

    if (errors) {
      console.error('Error creating appointment:', errors);
      return Response.json({ error: 'Failed to create appointment' }, { status: 500 });
    }

    // --- Post-write verification (Requirements 3.1–3.5) ---
    // Re-query appointments for the same staff/date and run detectConflict excluding
    // the new appointment's own ID to catch concurrent writes that slipped through.
    // Fail-open is scoped: only when the write itself succeeded (which it has at this point)
    // and the post-write re-query fails due to a transient error.
    if (assignedStaffId && isCustomerBooking) {
      try {
        const { data: staffSchedule } = await client.models.StaffSchedule.get({ visibleId: assignedStaffId });
        if (staffSchedule?.vendorId) {
          const { data: vendor } = await client.models.Vendor.get({ vendorId: staffSchedule.vendorId });
          const postWriteBuffer = (vendor?.bufferMinutes as number) ?? 15;

          const postWriteResult = await client.models.Appointment.listAppointmentByVendorIdAndDateTime({
            vendorId: staffSchedule.vendorId,
            dateTime: { beginsWith: bookingDate },
          } as any);
          const postWriteApts = (postWriteResult as any).data || [];

          // Build service duration map for existing appointments
          const postWriteServiceIds = [...new Set(postWriteApts.map((a: any) => a.serviceId).filter(Boolean))] as string[];
          const postWriteServiceDurationMap: Record<string, number> = {};
          await Promise.all(postWriteServiceIds.map(async (sid: string) => {
            if (sid === 'blocked' || sid === 'manual') return;
            const { data: svc } = await client.models.Service.get({ serviceId: sid });
            if (svc?.duration) postWriteServiceDurationMap[sid] = svc.duration as number;
          }));

          // Run detectConflict excluding our own newly created appointment
          const postWriteConflict = detectConflict(
            assignedStaffId,
            dateTime,
            duration,
            postWriteBuffer,
            postWriteApts,
            postWriteServiceDurationMap,
            appointmentId, // exclude self
            false // customer booking — not a vendor booking
          );

          if (postWriteConflict) {
            // Conflict detected after write — cancel our appointment and return 409
            await client.models.Appointment.update({ appointmentId, status: 'cancelled' } as any);
            auditReject(clientIp, body, 'conflict', 409, undefined, 'Post-write verification conflict');
            return Response.json({ error: 'This time slot is no longer available' }, { status: 409 });
          }
        }
      } catch (postWriteError) {
        // Fail-open: the write itself succeeded, but the post-write verification query
        // failed due to a transient error. Log the error with context and allow the
        // appointment to remain active (Requirements 3.4).
        console.error('Post-write verification failed (fail-open, write succeeded):', {
          appointmentId,
          staffId: assignedStaffId,
          dateTime,
          error: postWriteError,
        });
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
    await sendStaffBookingNotification({ appointmentId, vendorId: resolvedVendorId, serviceId, staffId: assignedStaffId, dateTime, customer: { ...customer, isNewClient: resolvedIsNewClient } }).catch(e => console.error('Staff notification failed:', e));

    return Response.json({ success: true, appointmentId, staffId: assignedStaffId, vendorId: resolvedVendorId, ...(extrasMetadata ? { extras: extrasMetadata } : {}) });
  } catch (error) {
    console.error('Error creating appointment:', error);
    auditReject(clientIp, body, 'server_error', 500, undefined, 'Internal error during appointment creation');
    return Response.json(safeErrorResponse(500), { status: 500 });
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

  // --- Pre-write conflict check for multi-provider bookings (Requirements 9.1, 9.3, 9.5) ---
  // Before persisting ANY appointments, verify each staff member independently
  // against existing appointments across all relevant vendors.
  {
    const multiProviderAssignments: BundleServiceAssignment[] = assignedStaffMembers.map((staff: any) => ({
      serviceId,
      staffId: staff.staffId,
      vendorId: staff.vendorId,
      startTime: time,
      endTime: minutesToTime(timeToMinutes(time) + (service.duration || 60)),
      duration: service.duration || 60,
    }));

    // Query across all relevant vendors (Req 9.5)
    const allVendorAppointments = await queryAppointmentsAcrossVendors(amplifyClient, vendorIds, date);

    // Build service duration map
    const serviceDurationMap = await buildServiceDurationMap(amplifyClient, allVendorAppointments);

    const conflictResult = checkBundleConflicts(
      multiProviderAssignments,
      allVendorAppointments,
      serviceDurationMap,
      bufferMinutes,
      date
    );

    if (conflictResult.hasConflict) {
      return Response.json(
        { error: conflictResult.message || 'This time slot is no longer available' },
        { status: 409 }
      );
    }
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
        const existingStart = timeToMinutes(extractTimeFromDateTime(apt.dateTime as string));

        if (intervalsOverlap({
          newStart: slotStart,
          newDuration: service.duration || 60,
          newBuffer: bufferMins,
          existingStart,
          existingDuration: aptDuration,
          existingBuffer: bufferMins,
        })) {
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

    // --- Pre-write conflict check for sequential quantity bookings (Requirements 9.1, 9.4) ---
    // Build assignments for all sequential slots and check for conflicts before persisting any
    if (assignedStaffId) {
      const seqAssignments: BundleServiceAssignment[] = [];
      let seqMinutes = startHour * 60 + startMin;
      for (let i = 0; i < quantity; i++) {
        const slotStart = minutesToTime(seqMinutes);
        const slotEnd = minutesToTime(seqMinutes + duration);
        seqAssignments.push({
          serviceId,
          staffId: assignedStaffId,
          vendorId,
          startTime: slotStart,
          endTime: slotEnd,
          duration,
        });
        seqMinutes += duration + actualBuffer;
      }

      // Query appointments across relevant vendor(s)
      const seqVendorAppointments = await queryAppointmentsAcrossVendors(amplifyClient, [vendorId], date);
      const seqServiceDurationMap = await buildServiceDurationMap(amplifyClient, seqVendorAppointments);

      const seqConflictResult = checkBundleConflicts(
        seqAssignments,
        seqVendorAppointments,
        seqServiceDurationMap,
        actualBuffer,
        date
      );

      if (seqConflictResult.hasConflict) {
        return Response.json(
          { error: seqConflictResult.message || 'This time slot is no longer available' },
          { status: 409 }
        );
      }
    }

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

/** Converts minutes since midnight to "HH:MM" format. */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
