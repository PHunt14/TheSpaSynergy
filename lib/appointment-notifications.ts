import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '@/amplify/data/resource';
import config from '@/amplify_outputs.json' with { type: 'json' };
import { sendSms } from '@/lib/sms';
import { sendEmail, formatDateTime, emailWrapper } from '@/lib/email';

const client = generateServerClientUsingCookies<Schema>({ config, cookies });

export { client };

export interface AppointmentDetails {
  serviceName: string;
  vendorName: string;
  vendorEmail: string;
  staffName: string;
}

export async function resolveAppointmentDetails(appointment: any): Promise<AppointmentDetails> {
  const details: AppointmentDetails = { serviceName: 'your service', vendorName: '', vendorEmail: '', staffName: '' };
  try {
    const [serviceRes, vendorRes] = await Promise.all([
      client.models.Service.get({ serviceId: appointment.serviceId }),
      client.models.Vendor.get({ vendorId: appointment.vendorId }),
    ]);
    if (serviceRes.data?.name) details.serviceName = serviceRes.data.name;
    details.vendorName = vendorRes.data?.name || '';
    details.vendorEmail = vendorRes.data?.email || '';
    if (appointment.staffId) {
      const staffRes = await client.models.StaffSchedule.get({ visibleId: appointment.staffId });
      details.staffName = staffRes.data?.staffName || '';
    }
  } catch { /* use defaults */ }
  return details;
}

export function parseCustomer(appointment: any) {
  return typeof appointment.customer === 'string'
    ? JSON.parse(appointment.customer)
    : appointment.customer;
}

type NotificationEvent = 'confirmed' | 'cancelled' | 'rescheduled';

interface NotificationParams {
  event: NotificationEvent;
  appointment: any;
  details: AppointmentDetails;
  newDateTime?: string;
}

const EVENT_LABELS: Record<NotificationEvent, { customerVerb: string; subject: string; heading: string }> = {
  confirmed:   { customerVerb: 'confirmed',   subject: 'Appointment Confirmed',   heading: 'Appointment Confirmed!' },
  cancelled:   { customerVerb: 'cancelled',   subject: 'Appointment Cancelled',   heading: 'Appointment Cancelled' },
  rescheduled: { customerVerb: 'rescheduled', subject: 'Appointment Rescheduled', heading: 'Appointment Rescheduled' },
};

function buildCustomerEmailBody(params: NotificationParams): string {
  const { event, appointment, details, newDateTime } = params;
  const { heading } = EVENT_LABELS[event];
  const withName = details.staffName ? details.staffName.split(' ')[0] : '';
  const withHtml = withName ? `<p><strong>With:</strong> ${withName}</p>` : '';
  const dateTimeDisplay = event === 'rescheduled' && newDateTime ? newDateTime : (appointment.dateTime || '');

  let body = `
    <h2 style="color: #8B4789;">${heading}</h2>
    <p>${event === 'confirmed' ? 'Great news — your appointment has been confirmed!' : event === 'cancelled' ? 'Your appointment has been cancelled.' : 'Your appointment has been rescheduled to a new date and time.'}</p>
    <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p><strong>Service:</strong> ${details.serviceName}</p>
      ${withHtml}
      <p><strong>${event === 'rescheduled' ? 'New Date &amp; Time' : 'Date &amp; Time'}:</strong> ${formatDateTime(dateTimeDisplay)}</p>
      ${event === 'rescheduled' && appointment.dateTime ? `<p style="color: #999; font-size: 0.9em;"><strong>Previously:</strong> ${formatDateTime(appointment.dateTime)}</p>` : ''}
    </div>`;

  if (event === 'cancelled') body += `<p>If you'd like to rebook, please visit <a href="https://thespasynergy.com/booking">thespasynergy.com</a>.</p>`;
  else body += `<p>If you need to cancel or reschedule, please contact us at least 24 hours in advance.</p>`;
  if (event === 'confirmed') body += `<p>We look forward to seeing you!</p>`;

  return body;
}

function buildStaffVendorEmailBody(params: NotificationParams, customer: any): string {
  const { event, appointment, details, newDateTime } = params;
  const { heading } = EVENT_LABELS[event];
  const dateTimeDisplay = event === 'rescheduled' && newDateTime ? newDateTime : (appointment.dateTime || '');
  const actionText = event === 'confirmed' ? 'You confirmed the following appointment:' : event === 'cancelled' ? 'The following appointment has been cancelled:' : 'The following appointment has been rescheduled:';

  return `
    <h2 style="color: #8B4789;">${heading}</h2>
    <p>${actionText}</p>
    <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p><strong>Service:</strong> ${details.serviceName}</p>
      <p><strong>${event === 'rescheduled' ? 'New Date &amp; Time' : 'Date &amp; Time'}:</strong> ${formatDateTime(dateTimeDisplay)}</p>
      ${event === 'rescheduled' && appointment.dateTime ? `<p style="color: #999; font-size: 0.9em;"><strong>Previously:</strong> ${formatDateTime(appointment.dateTime)}</p>` : ''}
      <p><strong>Customer:</strong> ${customer?.name}</p>
      <p><strong>Phone:</strong> ${customer?.phone}</p>
      <p><strong>Email:</strong> ${customer?.email}</p>
    </div>`;
}

export async function sendAppointmentNotifications(params: NotificationParams) {
  const { event, appointment, details, newDateTime } = params;
  const { customerVerb, subject } = EVENT_LABELS[event];
  const fullSubject = `${subject} - The Spa Synergy`;
  const customer = parseCustomer(appointment);
  const withName = details.staffName ? details.staffName.split(' ')[0] : '';
  const dateTimeDisplay = event === 'rescheduled' && newDateTime ? newDateTime : appointment.dateTime;

  const formattedDateTime = dateTimeDisplay
    ? new Date(dateTimeDisplay).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true
      })
    : 'Not specified';

  const notifications: Promise<void>[] = [];

  // Customer SMS
  if (customer?.phone && customer?.smsOptIn) {
    const smsWithLine = withName ? `\nWith: ${withName}` : '';
    const dateLabel = event === 'rescheduled' ? 'New Date/Time' : 'Date/Time';
    notifications.push(
      sendSms(customer.phone, `Your appointment with ${details.vendorName} has been ${customerVerb}.\n\nService: ${details.serviceName}${smsWithLine}\n${dateLabel}: ${formattedDateTime}\n\nThe Spa Synergy\nReply STOP to opt out`)
        .catch(err => console.error(`Customer ${event} SMS failed:`, err)) as Promise<void>
    );
  }

  // Customer email
  if (customer?.email || process.env.EMAIL_TEST_ADDRESS) {
    notifications.push(
      sendEmail(customer?.email || 'customer@placeholder.com', fullSubject, emailWrapper(buildCustomerEmailBody(params)))
        .catch(err => console.error(`Customer ${event} email failed:`, err))
    );
  }

  // Vendor email
  if (details.vendorEmail || process.env.EMAIL_TEST_ADDRESS) {
    notifications.push(
      sendEmail(details.vendorEmail || 'vendor@placeholder.com', fullSubject, emailWrapper(buildStaffVendorEmailBody(params, customer)))
        .catch(err => console.error(`Vendor ${event} email failed:`, err))
    );
  }

  // Staff email + SMS
  try {
    if (appointment.staffId) {
      const { data: staffRec } = await client.models.StaffSchedule.get({ visibleId: appointment.staffId });
      if (staffRec?.emailAlertsEnabled && staffRec?.staffEmail) {
        notifications.push(
          sendEmail(staffRec.staffEmail, fullSubject, emailWrapper(buildStaffVendorEmailBody(params, customer)))
            .catch(err => console.error(`Staff ${event} email failed:`, err))
        );
      }
      if (staffRec?.smsAlertsEnabled && staffRec?.smsAlertPhone) {
        notifications.push(
          sendSms(staffRec.smsAlertPhone, `Appointment ${customerVerb}.\n\nService: ${details.serviceName}\nCustomer: ${customer?.name}\n${event === 'rescheduled' ? 'New ' : ''}Date/Time: ${formattedDateTime}\n\nThe Spa Synergy`)
            .catch(err => console.error(`Staff ${event} SMS failed:`, err)) as Promise<void>
        );
      }
    }
  } catch (e) { console.error('Staff notification lookup failed:', e); }

  await Promise.all(notifications);
}
