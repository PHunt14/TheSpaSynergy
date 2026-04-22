import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../../amplify/data/resource';
import config from '../../../../amplify_outputs.json' with { type: 'json' };
import { sendSms } from '@/lib/sms';
import { sendEmail } from '@/lib/email';

const client = generateServerClientUsingCookies<Schema>({ config, cookies });

function formatDateTime(dateTime: string): string {
  return new Date(dateTime).toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  });
}

function emailWrapper(content: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      ${content}
      <p style="color: #666; font-size: 12px; margin-top: 30px;">
        The Spa Synergy<br>Fort Ritchie, MD
      </p>
    </div>`;
}

export async function POST(request: Request) {
  try {
    const { appointmentId, newDateTime } = await request.json();

    if (!appointmentId || !newDateTime) {
      return Response.json({ error: 'appointmentId and newDateTime required' }, { status: 400 });
    }

    // Get appointment before updating so we have the old dateTime
    const { data: appointment, errors: getErrors } = await client.models.Appointment.get({ appointmentId });

    if (getErrors || !appointment) {
      return Response.json({ error: 'Appointment not found' }, { status: 404 });
    }

    const oldDateTime = appointment.dateTime;

    const { errors } = await client.models.Appointment.update({
      appointmentId,
      dateTime: newDateTime as any
    });

    if (errors) {
      console.error('Error rescheduling appointment:', errors);
      return Response.json({ error: 'Failed to reschedule appointment' }, { status: 500 });
    }

    // Fetch service, vendor, staff details
    let serviceName = 'your service';
    let vendorName = '';
    let vendorEmail = '';
    let staffName = '';
    try {
      const [serviceRes, vendorRes] = await Promise.all([
        client.models.Service.get({ serviceId: appointment.serviceId }),
        client.models.Vendor.get({ vendorId: appointment.vendorId }),
      ]);
      if (serviceRes.data?.name) serviceName = serviceRes.data.name;
      vendorName = vendorRes.data?.name || '';
      vendorEmail = vendorRes.data?.email || '';
      if (appointment.staffId) {
        const staffRes = await client.models.StaffSchedule.get({ visibleId: appointment.staffId });
        staffName = staffRes.data?.staffName || '';
      }
    } catch (e) { /* use defaults */ }

    const customer = typeof appointment.customer === 'string'
      ? JSON.parse(appointment.customer) : appointment.customer;

    const formattedNewDateTime = new Date(newDateTime).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });

    const withName = staffName ? staffName.split(' ')[0] : '';
    const withLine = withName ? `With: ${withName}\n` : '';
    const withHtml = withName ? `<p><strong>With:</strong> ${withName}</p>` : '';

    const notifications: Promise<void>[] = [];

    // Customer SMS
    if (customer?.phone && customer?.smsOptIn) {
      const smsWithLine = withName ? `\nWith: ${withName}` : '';
      notifications.push(
        sendSms(customer.phone, `Your appointment with ${vendorName} has been rescheduled.\n\nService: ${serviceName}${smsWithLine}\nNew Date/Time: ${formattedNewDateTime}\n\nThe Spa Synergy\nReply STOP to opt out`)
          .catch(err => console.error('Customer reschedule SMS failed:', err)) as Promise<void>
      );
    }

    // Customer email
    if (customer?.email || process.env.EMAIL_TEST_ADDRESS) {
      notifications.push(
        sendEmail(
          customer?.email || 'customer@placeholder.com',
          'Appointment Rescheduled - The Spa Synergy',
          emailWrapper(`
            <h2 style="color: #8B4789;">Appointment Rescheduled</h2>
            <p>Your appointment has been rescheduled to a new date and time.</p>
            <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Service:</strong> ${serviceName}</p>
              ${withHtml}
              <p><strong>New Date &amp; Time:</strong> ${formatDateTime(newDateTime)}</p>
              <p style="color: #999; font-size: 0.9em;"><strong>Previously:</strong> ${formatDateTime(oldDateTime || '')}</p>
            </div>
            <p>If you need to cancel or reschedule, please contact us at least 24 hours in advance.</p>`)
        ).catch(err => console.error('Customer reschedule email failed:', err))
      );
    }

    // Vendor email
    if (vendorEmail || process.env.EMAIL_TEST_ADDRESS) {
      notifications.push(
        sendEmail(
          vendorEmail || 'vendor@placeholder.com',
          'Appointment Rescheduled - The Spa Synergy',
          emailWrapper(`
            <h2 style="color: #8B4789;">Appointment Rescheduled</h2>
            <p>The following appointment has been rescheduled:</p>
            <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Service:</strong> ${serviceName}</p>
              <p><strong>New Date &amp; Time:</strong> ${formatDateTime(newDateTime)}</p>
              <p style="color: #999; font-size: 0.9em;"><strong>Previously:</strong> ${formatDateTime(oldDateTime || '')}</p>
              <p><strong>Customer:</strong> ${customer?.name}</p>
              <p><strong>Phone:</strong> ${customer?.phone}</p>
              <p><strong>Email:</strong> ${customer?.email}</p>
            </div>`)
        ).catch(err => console.error('Vendor reschedule email failed:', err))
      );
    }

    // Staff email
    try {
      let assignedStaff = null;
      if (appointment.staffId) {
        const { data: staffRec } = await client.models.StaffSchedule.get({ visibleId: appointment.staffId });
        assignedStaff = staffRec;
      }
      if (assignedStaff?.emailAlertsEnabled && assignedStaff?.staffEmail) {
        notifications.push(
          sendEmail(
            assignedStaff.staffEmail,
            'Appointment Rescheduled - The Spa Synergy',
            emailWrapper(`
              <h2 style="color: #8B4789;">Appointment Rescheduled</h2>
              <p>The following appointment has been rescheduled:</p>
              <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p><strong>Service:</strong> ${serviceName}</p>
                <p><strong>New Date &amp; Time:</strong> ${formatDateTime(newDateTime)}</p>
                <p style="color: #999; font-size: 0.9em;"><strong>Previously:</strong> ${formatDateTime(oldDateTime || '')}</p>
                <p><strong>Customer:</strong> ${customer?.name}</p>
                <p><strong>Phone:</strong> ${customer?.phone}</p>
              </div>`)
          ).catch(err => console.error('Staff reschedule email failed:', err))
        );
      }
    } catch (e) { console.error('Staff email lookup failed:', e); }

    await Promise.all(notifications);

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error rescheduling appointment:', error);
    return Response.json({ error: 'Failed to reschedule appointment' }, { status: 500 });
  }
}
