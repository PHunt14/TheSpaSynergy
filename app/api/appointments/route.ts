import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { randomUUID } from 'crypto';

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { vendorId, serviceId, dateTime, customer, status, paymentId } = body;

    if (!vendorId || !serviceId || !dateTime || !customer) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const appointmentId = randomUUID();

    const { data, errors } = await client.models.Appointment.create({
      appointmentId,
      vendorId,
      serviceId,
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

    // Trigger SMS alert (non-blocking)
    try {
      await fetch(`${request.headers.get('origin')}/api/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, vendorId })
      });
    } catch (smsError) {
      console.error('SMS notification failed:', smsError);
    }

    // Trigger email via Lambda (has IAM role for SES)
    fetch('https://YOUR_LAMBDA_URL/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: customer.email,
        appointmentId,
        vendorId,
        serviceId,
        dateTime
      })
    }).catch(err => console.error('Email failed:', err));

    return Response.json({ 
      success: true, 
      appointmentId 
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    return Response.json({ error: 'Failed to create appointment' }, { status: 500 });
  }
}
