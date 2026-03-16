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
    const { appointmentId } = await request.json();

    if (!appointmentId) {
      return Response.json({ error: 'appointmentId required' }, { status: 400 });
    }

    const { data: appointment, errors: getErrors } = await client.models.Appointment.get({ 
      appointmentId 
    });

    if (getErrors || !appointment) {
      return Response.json({ error: 'Appointment not found' }, { status: 404 });
    }

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

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    return Response.json({ error: 'Failed to cancel appointment' }, { status: 500 });
  }
}
