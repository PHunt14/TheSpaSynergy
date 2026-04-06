import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import { Amplify } from 'aws-amplify';
import config from '@/amplify_outputs.json';
import { cookies } from 'next/headers';
import { fetchAuthSession } from 'aws-amplify/auth/server';
import { createServerRunner } from '@aws-amplify/adapter-nextjs';
import { randomUUID } from 'crypto';

Amplify.configure(config, { ssr: true });
const { runWithAmplifyServerContext } = createServerRunner({ config });
const client = generateClient<Schema>();

const getCurrentUser = async () => {
  try {
    return await runWithAmplifyServerContext({
      nextServerContext: { cookies },
      operation: async (contextSpec) => {
        const session = await fetchAuthSession(contextSpec);
        const idToken = session.tokens?.idToken;
        if (!idToken) return null;
        return {
          role: idToken.payload['custom:role'] as string || 'staff',
          vendorId: idToken.payload['custom:vendorId'] as string,
        };
      }
    });
  } catch { return null; }
};

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { vendorId, serviceId, staffId, dateTime, customerName, customerPhone, customerEmail, notes } = body;

    if (!vendorId || !dateTime) {
      return Response.json({ error: 'vendorId and dateTime are required' }, { status: 400 });
    }

    // Vendor role can only add to their own calendar
    if (user.role === 'vendor' && vendorId !== user.vendorId) {
      return Response.json({ error: 'Can only add appointments to your own calendar' }, { status: 403 });
    }

    const appointmentId = randomUUID();

    const { data, errors } = await client.models.Appointment.create({
      appointmentId,
      vendorId,
      serviceId: serviceId || 'manual',
      staffId: staffId || undefined,
      dateTime,
      customer: JSON.stringify({
        name: customerName || 'Manual Entry',
        phone: customerPhone || '',
        email: customerEmail || '',
        notes: notes || '',
        isManual: true,
      }),
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    } as any);

    if (errors) {
      console.error('Error creating manual appointment:', errors);
      return Response.json({ error: 'Failed to create appointment' }, { status: 500 });
    }

    return Response.json({ success: true, appointmentId });
  } catch (error) {
    console.error('Error creating manual appointment:', error);
    return Response.json({ error: 'Failed to create appointment' }, { status: 500 });
  }
}
