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

export async function resolveStaffForAppointment(vendorId: string, staffId: string | null, dateTime: string): Promise<any> {
  if (staffId) {
    const { data: staffRec } = await client.models.StaffSchedule.get({ visibleId: staffId });
    if (staffRec) return staffRec;
  }
  const { data: staffList } = await client.models.StaffSchedule.listStaffScheduleByVendorId({ vendorId });
  const activeStaff = (staffList || []).filter(s => s.isActive);
  if (activeStaff.length === 1) return activeStaff[0];
  if (activeStaff.length <= 1) return null;

  const dayOfWeek = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(dateTime).getDay()];
  for (const staff of activeStaff) {
    if (!staff.autoAssignRules) continue;
    const rules = JSON.parse(staff.autoAssignRules as string);
    if (rules.some((r: any) => r.action === 'auto-assign' && r.days?.includes(dayOfWeek))) return staff;
  }
  return null;
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

const EVENT_DESCRIPTIONS: Record<NotificationEvent, string> = {
  confirmed: 'Great news — your appointment has been confirmed!',
  cancelled: 'Your appointment has been cancelled.',
  rescheduled: 'Your appointment has been rescheduled to a new date and time.',
};

const STAFF_ACTION_TEXT: Record<NotificationEvent, string> = {
  confirmed: 'You confirmed the following appointment:',
  cancelled: 'The following appointment has been cancelled:',
  rescheduled: 'The following appointment has been rescheduled:',
};

function buildCustomerEmailBody(params: NotificationParams): string {
  const { event, appointment, details, newDateTime } = params;
  const { heading } = EVENT_LABELS[event];
  const withName = details.staffName ? details.staffName.split(' ')[0] : '';
  const withHtml = withName ? `<p><strong>With:</strong> ${withName}</p>` : '';
  const dateTimeDisplay = event === 'rescheduled' && newDateTime ? newDateTime : (appointment.dateTime || '');

  let body = `
    <h2 style="color: #8B4789;">${heading}</h2>
    <p>${EVENT_DESCRIPTIONS[event]}</p>
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
  const actionText = STAFF_ACTION_TEXT[event];

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

export async function sendBookingNotifications(appointment: any) {
  const details = await resolveAppointmentDetails(appointment);
  const customer = parseCustomer(appointment);
  const withName = details.staffName ? details.staffName.split(' ')[0] : '';
  const formattedDateTime = formatDateTime(appointment.dateTime);
  const notifications: Promise<void>[] = [];

  // Customer SMS
  if (customer?.phone && customer?.smsOptIn) {
    const withLine = withName ? `\nWith: ${withName}` : '';
    const msg = `Your appointment with ${details.vendorName} has been booked!\n\nService: ${details.serviceName}${withLine}\nDate/Time: ${formattedDateTime}\n\nThe Spa Synergy\nReply STOP to opt out`;
    notifications.push(sendSms(customer.phone, msg).catch(err => console.error('Customer SMS failed:', err)) as Promise<void>);
  }

  // Customer email
  if (customer?.email || process.env.EMAIL_TEST_ADDRESS) {
    const [serviceRes] = await Promise.all([client.models.Service.get({ serviceId: appointment.serviceId })]);
    const { sendCustomerBookingEmail } = await import('@/lib/email');
    notifications.push(sendCustomerBookingEmail({
      to: customer.email || 'customer@placeholder.com',
      serviceName: details.serviceName,
      vendorName: details.vendorName,
      dateTime: appointment.dateTime,
      duration: serviceRes.data?.duration || 0,
      price: serviceRes.data?.price || 0,
      withName,
    }).catch(err => console.error('Customer email failed:', err)));
  }

  // Vendor SMS (via send-sms endpoint)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  notifications.push(
    fetch(`${appUrl}/api/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId: appointment.appointmentId, vendorId: appointment.vendorId })
    }).then(() => {}).catch(err => console.error('Vendor SMS failed:', err))
  );

  // Vendor email
  if (details.vendorEmail || process.env.EMAIL_TEST_ADDRESS) {
    const { sendVendorBookingEmail } = await import('@/lib/email');
    notifications.push(sendVendorBookingEmail({
      to: details.vendorEmail || 'vendor@placeholder.com',
      customerName: customer?.name, customerPhone: customer?.phone || '',
      customerEmail: customer?.email || '', serviceName: details.serviceName, dateTime: appointment.dateTime,
    }).catch(err => console.error('Vendor email failed:', err)));
  }

  // Staff notifications
  const staffRecord = await resolveStaffForAppointment(appointment.vendorId, appointment.staffId, appointment.dateTime);
  if (staffRecord) {
    if (staffRecord.smsAlertsEnabled && staffRecord.smsAlertPhone) {
      const staffMsg = `New Booking Alert!\n\nService: ${details.serviceName}\nCustomer: ${customer?.name}\nPhone: ${customer?.phone}\nDate/Time: ${formattedDateTime}\n\nThe Spa Synergy\nReply STOP to opt out`;
      notifications.push(sendSms(staffRecord.smsAlertPhone, staffMsg).catch(err => console.error('Staff SMS failed:', err)) as Promise<void>);
    }
    if (staffRecord.emailAlertsEnabled && staffRecord.staffEmail) {
      const { sendVendorBookingEmail } = await import('@/lib/email');
      notifications.push(sendVendorBookingEmail({
        to: staffRecord.staffEmail, customerName: customer?.name, customerPhone: customer?.phone || '',
        customerEmail: customer?.email || '', serviceName: details.serviceName, dateTime: appointment.dateTime,
      }).catch(err => console.error('Staff email failed:', err)));
    }
  }

  await Promise.all(notifications);
}

function pushNotifications(
  notifications: Promise<void>[],
  params: NotificationParams,
  customer: any,
  formattedDateTime: string,
  fullSubject: string,
) {
  const { event, details } = params;
  const { customerVerb } = EVENT_LABELS[event];
  const withName = details.staffName ? details.staffName.split(' ')[0] : '';

  if (customer?.phone && customer?.smsOptIn) {
    const smsWithLine = withName ? `\nWith: ${withName}` : '';
    const dateLabel = event === 'rescheduled' ? 'New Date/Time' : 'Date/Time';
    notifications.push(
      sendSms(customer.phone, `Your appointment with ${details.vendorName} has been ${customerVerb}.\n\nService: ${details.serviceName}${smsWithLine}\n${dateLabel}: ${formattedDateTime}\n\nThe Spa Synergy\nReply STOP to opt out`)
        .catch(err => console.error(`Customer ${event} SMS failed:`, err)) as Promise<void>
    );
  }

  if (customer?.email || process.env.EMAIL_TEST_ADDRESS) {
    notifications.push(
      sendEmail(customer?.email || 'customer@placeholder.com', fullSubject, emailWrapper(buildCustomerEmailBody(params)))
        .catch(err => console.error(`Customer ${event} email failed:`, err))
    );
  }

  if (details.vendorEmail || process.env.EMAIL_TEST_ADDRESS) {
    notifications.push(
      sendEmail(details.vendorEmail || 'vendor@placeholder.com', fullSubject, emailWrapper(buildStaffVendorEmailBody(params, customer)))
        .catch(err => console.error(`Vendor ${event} email failed:`, err))
    );
  }
}

export async function sendAppointmentNotifications(params: NotificationParams) {
  const { event, appointment, details, newDateTime } = params;
  const { customerVerb, subject } = EVENT_LABELS[event];
  const fullSubject = `${subject} - The Spa Synergy`;
  const customer = parseCustomer(appointment);
  const dateTimeDisplay = event === 'rescheduled' && newDateTime ? newDateTime : appointment.dateTime;

  const formattedDateTime = dateTimeDisplay
    ? (() => {
        const dt = dateTimeDisplay.includes('Z') || dateTimeDisplay.includes('+') || dateTimeDisplay.includes('-', 10)
          ? dateTimeDisplay : dateTimeDisplay + '-04:00'
        return new Date(dt).toLocaleString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
          hour: 'numeric', minute: '2-digit', hour12: true,
          timeZone: 'America/New_York'
        })
      })()
    : 'Not specified';

  const notifications: Promise<void>[] = [];
  pushNotifications(notifications, params, customer, formattedDateTime, fullSubject);

  const staffRecord = await resolveStaffForAppointment(appointment.vendorId, appointment.staffId, dateTimeDisplay);
  if (staffRecord?.emailAlertsEnabled && staffRecord?.staffEmail) {
    notifications.push(
      sendEmail(staffRecord.staffEmail, fullSubject, emailWrapper(buildStaffVendorEmailBody(params, customer)))
        .catch(err => console.error(`Staff ${event} email failed:`, err))
    );
  }
  if (staffRecord?.smsAlertsEnabled && staffRecord?.smsAlertPhone) {
    notifications.push(
      sendSms(staffRecord.smsAlertPhone, `Appointment ${customerVerb}.\n\nService: ${details.serviceName}\nCustomer: ${customer?.name}\n${event === 'rescheduled' ? 'New ' : ''}Date/Time: ${formattedDateTime}\n\nThe Spa Synergy`)
        .catch(err => console.error(`Staff ${event} SMS failed:`, err)) as Promise<void>
    );
  }

  await Promise.all(notifications);
}
