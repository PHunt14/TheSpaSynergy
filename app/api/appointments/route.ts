import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { randomUUID } from 'crypto';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });

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

    // Send confirmation email to customer (non-blocking)
    try {
      // Auto-discover function name from stack or use env var
      const functionName = process.env.SEND_EMAIL_FUNCTION_NAME || 
        `amplify-${process.env.AWS_APP_ID || 'd16a4tljua629i'}-${process.env.AWS_BRANCH || 'dev'}-branch-sendEmail`;
      
      console.log('Sending confirmation email to:', customer.email, 'via', functionName);
      
      await lambdaClient.send(new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'Event',
        Payload: JSON.stringify({
          body: JSON.stringify({
            to: customer.email,
            subject: 'Appointment Confirmation - The Spa Synergy',
            appointmentDetails: {
              appointmentId,
              vendorId,
              serviceId,
              dateTime
            }
          })
        })
      }));
      
      console.log('Email notification queued');
    } catch (emailError) {
      console.error('Email notification failed:', emailError);
    }

    return Response.json({ 
      success: true, 
      appointmentId 
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    return Response.json({ error: 'Failed to create appointment' }, { status: 500 });
  }
}
