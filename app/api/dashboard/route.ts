import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const vendorId = searchParams.get('vendorId');

  if (!vendorId) {
    return Response.json({ error: 'vendorId required' }, { status: 400 });
  }

  try {
    // Get all appointments for this vendor
    const { data: appointments, errors } = await client.models.Appointment.list({
      filter: { vendorId: { eq: vendorId } }
    });

    if (errors) {
      console.error('Error fetching appointments:', errors);
      return Response.json({ error: 'Failed to fetch appointments' }, { status: 500 });
    }

    // Enrich appointments with service details
    const enrichedAppointments = await Promise.all(
      (appointments || []).map(async (appointment) => {
        const { data: service } = await client.models.Service.get({ 
          serviceId: appointment.serviceId 
        });

        return {
          ...appointment,
          service
        };
      })
    );

    return Response.json({ appointments: enrichedAppointments });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    return Response.json({ error: 'Failed to fetch appointments' }, { status: 500 });
  }
}
