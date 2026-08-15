import { client, getCurrentUser } from '@/lib/auth';
import { randomUUID } from 'crypto';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';
import { sanitizeCustomerName, sanitizeNotes } from '@/app/utils/inputSanitization';
import { checkRateLimit, rateLimitResponse, getClientIp } from '@/app/utils/rateLimiter';
import { validateManualBookingInput, buildValidationErrorResponse } from '@/app/utils/inputValidation';
import { verifyBookingEntities } from '@/app/utils/entityVerification';
import { auditReject, safeErrorResponse } from '@/app/utils/auditLogger';

const emailWrapper = (content: string) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    ${content}
    <p style="color: #666; font-size: 12px; margin-top: 30px;">The Spa Synergy<br>Fort Ritchie, MD</p>
  </div>`;

const formatDT = (dt: string) => {
  // Dynamically determine EDT vs EST based on the actual date
  if (dt.includes('Z') || dt.includes('+') || dt.includes('-', 10)) {
    return new Date(dt).toLocaleString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
    });
  }
  const tempDate = new Date(dt + 'Z');
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).formatToParts(tempDate);
  const tzAbbr = parts.find(p => p.type === 'timeZoneName')?.value || '';
  const offset = tzAbbr.includes('DT') || tzAbbr === 'EDT' ? '-04:00' : '-05:00';
  return new Date(dt + offset).toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  });
};

interface ManualApptContext {
  serviceName: string;
  vendorName: string;
  vendorEmail: string;
  staffRecord: any;
  dateTime: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
}

async function resolveManualApptContext(vendorId: string, serviceId: string | null, staffId: string | null): Promise<Partial<ManualApptContext>> {
  const ctx: Partial<ManualApptContext> = { serviceName: 'your appointment', vendorName: '', vendorEmail: '', staffRecord: null };
  const [vendorRes, serviceRes] = await Promise.all([
    client.models.Vendor.get({ vendorId }),
    serviceId && serviceId !== 'manual' ? client.models.Service.get({ serviceId }) : Promise.resolve({ data: null }),
  ]);
  ctx.vendorName = vendorRes.data?.name || '';
  ctx.vendorEmail = vendorRes.data?.email || '';
  if (serviceRes.data?.name) ctx.serviceName = serviceRes.data.name;
  if (staffId) {
    const { data: staffRec } = await client.models.StaffSchedule.get({ visibleId: staffId });
    ctx.staffRecord = staffRec;
  }
  return ctx;
}

function sendManualApptNotifications(ctx: ManualApptContext): Promise<void>[] {
  const notifications: Promise<void>[] = [];
  const { serviceName, vendorName, vendorEmail, staffRecord, dateTime, customerName, customerPhone, customerEmail } = ctx;
  const staffFirstName = staffRecord?.staffName?.split(' ')[0] || '';
  const withHtml = staffFirstName ? `<p><strong>With:</strong> ${staffFirstName}</p>` : '';

  const apptBlock = (extra = '') => `
    <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p><strong>Service:</strong> ${serviceName}</p>
      ${extra}
      <p><strong>Date &amp; Time:</strong> ${formatDT(dateTime)}</p>
      <p><strong>Customer:</strong> ${customerName || 'Manual Entry'}</p>
      ${customerPhone ? `<p><strong>Phone:</strong> ${customerPhone}</p>` : ''}
      ${customerEmail ? `<p><strong>Email:</strong> ${customerEmail}</p>` : ''}
    </div>`;

  if (customerEmail) {
    notifications.push(
      sendEmail(customerEmail, 'Appointment Confirmed - The Spa Synergy', emailWrapper(`
        <h2 style="color: #8B4789;">Appointment Confirmed!</h2>
        <p>Your appointment with ${vendorName} has been scheduled.</p>
        <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Service:</strong> ${serviceName}</p>
          ${withHtml}
          <p><strong>Date &amp; Time:</strong> ${formatDT(dateTime)}</p>
        </div>
        <p>If you need to cancel or reschedule, please contact us at least 24 hours in advance.</p>
        <p>We look forward to seeing you!</p>`))
        .catch(err => console.error('Manual appt customer email failed:', err))
    );
  }

  if (vendorEmail || process.env.EMAIL_TEST_ADDRESS) {
    notifications.push(
      sendEmail(vendorEmail || 'vendor@placeholder.com', 'Manual Appointment Added - The Spa Synergy',
        emailWrapper(`<h2 style="color: #8B4789;">Manual Appointment Added</h2>${apptBlock()}`))
        .catch(err => console.error('Manual appt vendor email failed:', err))
    );
  }

  if (staffRecord?.emailAlertsEnabled && staffRecord?.staffEmail) {
    notifications.push(
      sendEmail(staffRecord.staffEmail, 'Manual Appointment Added - The Spa Synergy',
        emailWrapper(`<h2 style="color: #8B4789;">Manual Appointment Added</h2>${apptBlock()}`))
        .catch(err => console.error('Manual appt staff email failed:', err))
    );
  }

  if (staffRecord?.smsAlertsEnabled && staffRecord?.smsAlertPhone) {
    const formattedDateTime = (() => {
      const dt = dateTime.includes('Z') || dateTime.includes('+') || dateTime.includes('-', 10)
        ? dateTime : dateTime + '-04:00'
      return new Date(dt).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
        timeZone: 'America/New_York',
      })
    })();
    notifications.push(
      sendSms(staffRecord.smsAlertPhone, `Manual Appointment Added\n\nService: ${serviceName}\nCustomer: ${customerName || 'Manual Entry'}\nDate/Time: ${formattedDateTime}\n\nThe Spa Synergy\nReply STOP to opt out`)
        .catch(err => console.error('Manual appt staff SMS failed:', err)) as Promise<void>
    );
  }

  return notifications;
}

export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  let body: any = {};
  try {
    const user = await getCurrentUser();
    if (!user) {
      auditReject(clientIp, {}, 'auth', 401, undefined, 'Unauthenticated manual booking attempt');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limiting: 30 requests/min per authenticated user for manual bookings (Req 11.2)
    const userKey = user.vendorId || 'unknown-user';
    const rateCheck = checkRateLimit(`manual-booking:${userKey}`, 30, 60 * 1000);
    if (!rateCheck.allowed) {
      auditReject(clientIp, {}, 'rate_limit', 429, userKey, 'Manual booking rate limit exceeded');
      return rateLimitResponse(rateCheck.retryAfter!);
    }

    body = await request.json();

    // --- Input Validation (Requirements 11.1) ---
    const validationResult = validateManualBookingInput(body);
    if (!validationResult.valid) {
      auditReject(clientIp, body, 'validation', 400, user.vendorId, 'Manual booking validation failed');
      return Response.json(buildValidationErrorResponse(validationResult.errors), { status: 400 });
    }

    const { vendorId, serviceId, staffId, staffIds, dateTime, customerName: rawCustomerName, customerPhone, customerEmail, notes: rawNotes, isBlockedTime, duration, createdBy, confirmOverlap } = body;

    // Sanitize string inputs before persistence (Requirements 11.5)
    const customerName = sanitizeCustomerName(rawCustomerName);
    const notes = sanitizeNotes(rawNotes);

    if (!vendorId || !dateTime) return Response.json({ error: 'vendorId and dateTime are required' }, { status: 400 });

    // Entity verification: verify staffId and vendorId exist and are active (Req 11.7)
    const entityCheck = await verifyBookingEntities(client, staffId, vendorId);
    if (!entityCheck.valid) {
      auditReject(clientIp, body, 'not_found', entityCheck.statusCode || 404, user.vendorId, 'Entity not found');
      return Response.json({ error: entityCheck.error }, { status: entityCheck.statusCode || 404 });
    }

    const appointmentId = randomUUID();

    if (isBlockedTime) {
      const { errors } = await client.models.Appointment.create({
        appointmentId, vendorId, serviceId: 'blocked', staffId: staffId || undefined, dateTime,
        customer: JSON.stringify({ name: 'Blocked Time', notes: notes || '', isBlockedTime: true, duration: duration || 60 }),
        status: 'blocked', createdBy: createdBy || undefined, createdAt: new Date().toISOString(),
      } as any);

      if (errors) {
        console.error('Error creating blocked time:', errors);
        return Response.json({ error: 'Failed to block time' }, { status: 500 });
      }

      return Response.json({ success: true, appointmentId });
    }

    // Overlap detection (Req 4.6): check before saving if a staffId is specified
    let svcDuration = duration || 60;
    if (serviceId && serviceId !== 'manual') {
      const { data: svcData } = await client.models.Service.get({ serviceId });
      if (svcData?.duration) svcDuration = svcData.duration as number;
    }

    if (staffId) {
      const overlap = await detectManualOverlap(staffId, dateTime, svcDuration, undefined);
      if (overlap && !confirmOverlap) {
        auditReject(clientIp, body, 'conflict', 409, user.vendorId, `Conflict with appointment at ${overlap.dateTime}`);
        return Response.json({
          error: 'Scheduling conflict detected',
          conflict: { dateTime: overlap.dateTime, staffId: overlap.staffId, appointmentId: overlap.appointmentId },
          message: 'Resubmit with confirmOverlap=true to override',
        }, { status: 409 });
      }
      // If confirmOverlap is true, proceed to persist regardless of overlap
    }

    // Multi-provider booking (e.g., couples head bath)
    if (staffIds && staffIds.length > 1) {
      const groupId = randomUUID();
      const appointmentIds: string[] = [];

      // Look up each staff member to get their vendorId
      for (const sid of staffIds) {
        const { data: staffRecord } = await client.models.StaffSchedule.get({ visibleId: sid });
        const staffVendorId = staffRecord?.vendorId || vendorId;
        const aptId = randomUUID();

        const { errors: createErrors } = await client.models.Appointment.create({
          appointmentId: aptId, vendorId: staffVendorId, serviceId: serviceId || 'manual', staffId: sid, groupId, dateTime,
          customer: JSON.stringify({ name: customerName || 'Manual Entry', phone: customerPhone || '', email: customerEmail || '', notes: notes || '', isManual: true, duration: svcDuration }),
          status: 'confirmed', createdBy: createdBy || undefined, createdAt: new Date().toISOString(),
        } as any);

        if (createErrors) {
          console.error('Error creating multi-provider appointment:', createErrors);
          // Roll back any already created
          for (const id of appointmentIds) {
            await client.models.Appointment.update({ appointmentId: id, status: 'cancelled' } as any).catch(() => {});
          }
          return Response.json({ error: 'Failed to create appointments' }, { status: 500 });
        }
        appointmentIds.push(aptId);
      }

      // Send notifications for each appointment
      try {
        for (let i = 0; i < staffIds.length; i++) {
          const { data: staffRecord } = await client.models.StaffSchedule.get({ visibleId: staffIds[i] });
          const staffVendorId = staffRecord?.vendorId || vendorId;
          const ctx = await resolveManualApptContext(staffVendorId, serviceId, staffIds[i]);
          await Promise.all(sendManualApptNotifications({ ...ctx, dateTime, customerName, customerPhone, customerEmail } as ManualApptContext));
        }
      } catch (e) { console.error('Multi-provider notification error:', e); }

      return Response.json({ success: true, appointmentIds, groupId });
    }

    const { errors } = await client.models.Appointment.create({
      appointmentId, vendorId, serviceId: serviceId || 'manual', staffId: staffId || undefined, dateTime,
      customer: JSON.stringify({ name: customerName || 'Manual Entry', phone: customerPhone || '', email: customerEmail || '', notes: notes || '', isManual: true, duration: svcDuration }),
      status: 'confirmed', createdBy: createdBy || undefined, createdAt: new Date().toISOString(),
    } as any);

    if (errors) {
      console.error('Error creating manual appointment:', errors);
      return Response.json({ error: 'Failed to create appointment' }, { status: 500 });
    }

    try {
      const ctx = await resolveManualApptContext(vendorId, serviceId, staffId);
      await Promise.all(sendManualApptNotifications({ ...ctx, dateTime, customerName, customerPhone, customerEmail } as ManualApptContext));
    } catch (e) { console.error('Manual appointment notification error:', e); }

    return Response.json({ success: true, appointmentId });
  } catch (error) {
    console.error('Error creating manual appointment:', error);
    auditReject(clientIp, body, 'server_error', 500, undefined, 'Internal error during manual appointment creation');
    return Response.json(safeErrorResponse(500), { status: 500 });
  }
}

/**
 * Overlap detection helper for manual appointments (Req 4.6)
 * Uses shared overlap detection that enforces buffer time on both sides.
 * For vendor/admin bookings, blocked time IS included in overlap detection
 * (vendors still get warned but can override via confirmOverlap).
 * Returns the conflicting appointment info if overlap exists, null otherwise.
 */
async function detectManualOverlap(
  staffId: string,
  dateTime: string,
  durationMinutes: number,
  excludeAppointmentId?: string
): Promise<{ appointmentId: string; dateTime: string; staffId: string } | null> {
  const date = dateTime.includes('T') ? dateTime.split('T')[0] : dateTime.split(' ')[0];

  // Fetch staff's vendorId to query appointments by vendor index
  const { data: staffSchedule } = await client.models.StaffSchedule.get({ visibleId: staffId });
  if (!staffSchedule?.vendorId) return null;

  // Get buffer minutes from vendor config
  const { data: vendor } = await client.models.Vendor.get({ vendorId: staffSchedule.vendorId });
  const vendorBuffer = vendor?.bufferMinutes ?? 15;

  const { data: appointments } = await client.models.Appointment.listAppointmentByVendorIdAndDateTime({
    vendorId: staffSchedule.vendorId,
    dateTime: { beginsWith: date },
  } as any);

  if (!appointments || appointments.length === 0) return null;

  // Build service duration map for existing appointments
  const serviceIds = [...new Set(appointments.map((a: any) => a.serviceId).filter(Boolean))];
  const serviceDurationMap: Record<string, number> = {};
  await Promise.all(serviceIds.map(async (sid: string) => {
    if (sid === 'blocked' || sid === 'manual') return;
    const { data: svc } = await client.models.Service.get({ serviceId: sid });
    if (svc?.duration) serviceDurationMap[sid] = svc.duration as number;
  }));

  // Import and use shared detection
  const { detectConflict } = await import('@/app/utils/overlapDetection');

  return detectConflict(
    staffId,
    dateTime,
    durationMinutes,
    vendorBuffer,
    appointments,
    serviceDurationMap,
    excludeAppointmentId,
    true // isVendorBooking — vendors can override via confirmOverlap
  );
}
