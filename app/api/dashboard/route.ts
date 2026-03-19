import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { fetchAuthSession } from 'aws-amplify/auth/server';
import { Amplify } from 'aws-amplify';
import { createServerRunner } from '@aws-amplify/adapter-nextjs';

Amplify.configure(config, { ssr: true });

const { runWithAmplifyServerContext } = createServerRunner({ config });

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

const getCurrentUser = async () => {
  try {
    return await runWithAmplifyServerContext({
      nextServerContext: { cookies },
      operation: async (contextSpec) => {
        const session = await fetchAuthSession(contextSpec);
        const idToken = session.tokens?.idToken;
        if (!idToken) return null;
        return {
          role: idToken.payload['custom:role'] as string || 'vendor',
          vendorId: idToken.payload['custom:vendorId'] as string
        };
      }
    });
  } catch {
    return null;
  }
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const vendorId = searchParams.get('vendorId');

  if (!vendorId) {
    return Response.json({ error: 'vendorId required' }, { status: 400 });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Vendor/owner can only access their own vendor's appointments
  if ((currentUser.role === 'vendor' || currentUser.role === 'owner') && vendorId !== currentUser.vendorId) {
    return Response.json({ error: 'Unauthorized: Cannot access other vendor appointments' }, { status: 403 });
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

        // Parse customer JSON if it's a string
        let customer = appointment.customer;
        if (typeof customer === 'string') {
          try {
            customer = JSON.parse(customer);
          } catch (e) {
            console.error('Error parsing customer data:', e);
          }
        }

        // Format dateTime to human-readable format
        let formattedDateTime = appointment.dateTime;
        try {
          // Extract just the ISO date part before any space or extra characters
          let dateStr = appointment.dateTime;
          if (typeof dateStr === 'string') {
            // Remove any trailing time format like " 4:00 PM" or "T11:00 AM:00"
            dateStr = dateStr.split(' ')[0].split('T')[0] + 'T' + dateStr.split('T')[1]?.split(' ')[0];
            // If there's a malformed part, just take the first valid ISO part
            if (dateStr.includes('ZT')) {
              dateStr = dateStr.split('ZT')[0] + 'Z';
            }
          }
          const date = new Date(dateStr);
          if (!isNaN(date.getTime())) {
            formattedDateTime = date.toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            });
          }
        } catch (e) {
          console.error('Error formatting date:', e);
        }

        // Look up staff name if staffId is set
        let staffName = null;
        if (appointment.staffId) {
          try {
            const { data: staff } = await client.models.StaffSchedule.get({ visibleId: appointment.staffId });
            staffName = staff?.staffName || null;
          } catch (e) { /* ignore */ }
        }

        return {
          ...appointment,
          dateTime: formattedDateTime,
          customer,
          service,
          staffName
        };
      })
    );

    return Response.json({ appointments: enrichedAppointments });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    return Response.json({ error: 'Failed to fetch appointments' }, { status: 500 });
  }
}
