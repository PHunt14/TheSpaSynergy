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

async function sendCancellationNotifications(appointment: any, serviceName: string, vendorName: string, vendorEmail: string, staffName: string) {
  const customer = typeof appointment.customer === 'string'
    ? JSON.parse(appointment.customer) : appointment.customer;

  const formattedDateTime = appointment.dateTime
    ? new Date(appointment.dateTime).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true
      }) : 'Not specified';

  const withName = staffName ? staffName.split(' ')[0] : '';
  const withLine = withName ? `With: ${withName}\n` : '';
  const withHtml = withName ? `<p><strong>With:</strong> ${withName}</p>` : '';

  const notifications: Promise<void>[] = [];

  // Customer SMS
  if (customer?.phone && customer?.smsOptIn) {
    const smsWithLine = withName ? `\nWith: ${withName}` : '';
    notifications.push(
      sendSms(customer.phone, `Your appointment with ${vendorName} has been cancelled.\n\nService: ${serviceName}${smsWithLine}\nDate/Time: ${formattedDateTime}\n\nThe Spa Synergy\nReply STOP to opt out`)
        .catch(err => console.error('Customer cancel SMS failed:', err)) as Promise<void>
    );
  }

  // Customer email
  if (customer?.email || process.env.EMAIL_TEST_ADDRESS) {
    notifications.push(
      sendEmail(
        customer?.email || 'customer@placeholder.com',
        'Appointment Cancelled - The Spa Synergy',
        emailWrapper(`
          <h2 style="color: #8B4789;">Appointment Cancelled</h2>
          <p>Your appointment has been cancelled.</p>
          <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Service:</strong> ${serviceName}</p>
            ${withHtml}
            <p><strong>Date &amp; Time:</strong> ${formatDateTime(appointment.dateTime || '')}</p>
          </div>
          <p>If you'd like to rebook, please visit <a href="https://thespasynergy.com/booking">thespasynergy.com</a>.</p>`)
      ).catch(err => console.error('Customer cancel email failed:', err))
    );
  }

  // Vendor email
  if (vendorEmail || process.env.EMAIL_TEST_ADDRESS) {
    notifications.push(
      sendEmail(
        vendorEmail || 'vendor@placeholder.com',
        'Appointment Cancelled - The Spa Synergy',
        emailWrapper(`
          <h2 style="color: #8B4789;">Appointment Cancelled</h2>
          <p>The following appointment has been cancelled:</p>
          <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Service:</strong> ${serviceName}</p>
            <p><strong>Date &amp; Time:</strong> ${formatDateTime(appointment.dateTime || '')}</p>
            <p><strong>Customer:</strong> ${customer?.name}</p>
            <p><strong>Phone:</strong> ${customer?.phone}</p>
            <p><strong>Email:</strong> ${customer?.email}</p>
          </div>`)
      ).catch(err => console.error('Vendor cancel email failed:', err))
    );
  }

  await Promise.all(notifications);
}

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

    // Fetch service, vendor, staff details for notifications
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

      await sendCancellationNotifications(appointment, serviceName, vendorName, vendorEmail, staffName);
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

    await sendCancellationNotifications(appointment, serviceName, vendorName, vendorEmail, staffName);

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    return Response.json({ error: 'Failed to cancel appointment' }, { status: 500 });
  }
}
