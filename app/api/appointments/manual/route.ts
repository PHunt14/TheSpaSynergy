import { client, getCurrentUser } from '@/lib/auth';
import { randomUUID } from 'crypto';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';

const emailWrapper = (content: string) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    ${content}
    <p style="color: #666; font-size: 12px; margin-top: 30px;">The Spa Synergy<br>Fort Ritchie, MD</p>
  </div>`;

const formatDT = (dt: string) => new Date(dt).toLocaleString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
});

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
    const formattedDateTime = new Date(dateTime).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    });
    notifications.push(
      sendSms(staffRecord.smsAlertPhone, `Manual Appointment Added\n\nService: ${serviceName}\nCustomer: ${customerName || 'Manual Entry'}\nDate/Time: ${formattedDateTime}\n\nThe Spa Synergy\nReply STOP to opt out`)
        .catch(err => console.error('Manual appt staff SMS failed:', err)) as Promise<void>
    );
  }

  return notifications;
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { vendorId, serviceId, staffId, dateTime, customerName, customerPhone, customerEmail, notes } = body;

    if (!vendorId || !dateTime) return Response.json({ error: 'vendorId and dateTime are required' }, { status: 400 });
    if (user.role === 'vendor' && vendorId !== user.vendorId) {
      return Response.json({ error: 'Can only add appointments to your own calendar' }, { status: 403 });
    }

    const appointmentId = randomUUID();
    const { errors } = await client.models.Appointment.create({
      appointmentId, vendorId, serviceId: serviceId || 'manual', staffId: staffId || undefined, dateTime,
      customer: JSON.stringify({ name: customerName || 'Manual Entry', phone: customerPhone || '', email: customerEmail || '', notes: notes || '', isManual: true }),
      status: 'confirmed', createdAt: new Date().toISOString(),
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
    return Response.json({ error: 'Failed to create appointment' }, { status: 500 });
  }
}
