import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../../amplify/data/resource';
import config from '../../../../amplify_outputs.json' with { type: 'json' };
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const client = generateServerClientUsingCookies<Schema>({ config, cookies });
const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });

function formatPhone(phone: string): string {
  return phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`;
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

    const { errors: updateErrors } = await client.models.Appointment.update({
      appointmentId,
      status: 'confirmed' as any
    });

    if (updateErrors) {
      return Response.json({ error: 'Failed to confirm appointment' }, { status: 500 });
    }

    // Get service name
    let serviceName = 'your service';
    try {
      const { data: service } = await client.models.Service.get({ serviceId: appointment.serviceId });
      if (service?.name) serviceName = service.name;
    } catch (e) { /* use default */ }

    const formattedDateTime = appointment.dateTime ? new Date(appointment.dateTime).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    }) : 'Not specified';

    const customer = typeof appointment.customer === 'string'
      ? JSON.parse(appointment.customer)
      : appointment.customer;

    // SMS to customer (only if opted in)
    if (customer?.phone && customer?.smsOptIn) {
      snsClient.send(new PublishCommand({
        PhoneNumber: formatPhone(customer.phone),
        Message: `Appointment Confirmed!\n\nService: ${serviceName}\nDate/Time: ${formattedDateTime}\n\nYour appointment has been confirmed by the vendor.\n\nThe Spa Synergy\nReply STOP to opt out`,
      })).catch(err => console.error('Customer confirmation SMS failed:', err));
    }

    // SMS to vendor
    try {
      const { data: vendor } = await client.models.Vendor.get({ vendorId: appointment.vendorId });
      if (vendor?.smsAlertsEnabled && vendor?.smsAlertPhone) {
        snsClient.send(new PublishCommand({
          PhoneNumber: formatPhone(vendor.smsAlertPhone),
          Message: `Appointment Confirmed\n\nService: ${serviceName}\nCustomer: ${customer?.name}\nDate/Time: ${formattedDateTime}\n\nThe Spa Synergy`,
        })).catch(err => console.error('Vendor confirmation SMS failed:', err));
      }
    } catch (e) { /* non-blocking */ }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error confirming appointment:', error);
    return Response.json({ error: 'Failed to confirm appointment' }, { status: 500 });
  }
}
