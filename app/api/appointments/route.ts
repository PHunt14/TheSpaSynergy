import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { randomUUID } from 'crypto';
import { sendSms } from '@/lib/sms';

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { vendorId, serviceId, bundleId, dateTime, customer, status, paymentId } = body;

    if (!vendorId || !serviceId || !dateTime || !customer) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const appointmentId = randomUUID();

    const { data, errors } = await client.models.Appointment.create({
      appointmentId,
      vendorId,
      serviceId,
      bundleId: bundleId || undefined,
      dateTime,
      customer: JSON.stringify(customer),
      status: status || 'pending',
      paymentId,
      createdAt: new Date().toISOString(),
    } as any);

    if (errors) {
      console.error('Error creating appointment:', errors);
      return Response.json({ error: 'Failed to create appointment' }, { status: 500 });
    }

    // Get service name for SMS messages
    let serviceName = 'your service';
    try {
      const { data: service } = await client.models.Service.get({ serviceId });
      if (service?.name) serviceName = service.name;
    } catch (e) { /* use default */ }

    const formattedDateTime = new Date(dateTime).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });

    // Send confirmation SMS to customer (non-blocking, only if opted in)
    console.log('Customer SMS check:', { phone: customer.phone, smsOptIn: customer.smsOptIn })
    if (customer.phone && customer.smsOptIn) {
      const customerMsg = `Booking Submitted!\n\nService: ${serviceName}\nDate/Time: ${formattedDateTime}\n\nWe look forward to seeing you!\n\nThe Spa Synergy\nReply STOP to opt out`;
      sendSms(customer.phone, customerMsg).catch(err => console.error('Customer SMS failed:', err));
    }

    // Trigger vendor SMS alert (non-blocking)
    fetch(`${request.headers.get('origin')}/api/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId, vendorId })
    }).catch(err => console.error('Vendor SMS failed:', err));

    return Response.json({ 
      success: true, 
      appointmentId 
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    return Response.json({ error: 'Failed to create appointment' }, { status: 500 });
  }
}
