import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../../amplify/data/resource';
import config from '../../../../amplify_outputs.json' with { type: 'json' };

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

export async function POST(request: Request) {
  try {
    const { appointmentId, newDateTime } = await request.json();

    if (!appointmentId || !newDateTime) {
      return Response.json({ error: 'appointmentId and newDateTime required' }, { status: 400 });
    }

    const { errors } = await client.models.Appointment.update({
      appointmentId,
      dateTime: newDateTime as any
    });

    if (errors) {
      console.error('Error rescheduling appointment:', errors);
      return Response.json({ error: 'Failed to reschedule appointment' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error rescheduling appointment:', error);
    return Response.json({ error: 'Failed to reschedule appointment' }, { status: 500 });
  }
}
