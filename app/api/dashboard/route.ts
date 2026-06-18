import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { fetchAuthSession } from 'aws-amplify/auth/server';
import { Amplify } from 'aws-amplify';
import { createServerRunner } from '@aws-amplify/adapter-nextjs';

Amplify.configure(config, { ssr: true });

const { runWithAmplifyServerContext } = createServerRunner({ config });

function getClient() {
  return generateServerClientUsingCookies<Schema>({
    config,
    cookies,
  });
}

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
  const client = getClient();
  const { searchParams } = new URL(request.url);
  const vendorId = searchParams.get('vendorId');
  const clientId = searchParams.get('clientId');
  const staffId = searchParams.get('staffId');

  if (!vendorId && !clientId && !staffId) {
    return Response.json({ error: 'vendorId, staffId, or clientId required' }, { status: 400 });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Client lookup — return appointments for a specific client across all vendors
  if (clientId) {
    try {
      const { data: allAppointments } = await client.models.Appointment.list({
        filter: { clientId: { eq: clientId } }
      });
      const appointments = allAppointments || [];
      const serviceIds = [...new Set(appointments.map(a => a.serviceId).filter(Boolean))];
      const services: Record<string, any> = {};
      await Promise.all(serviceIds.map(async (sid) => {
        const { data } = await client.models.Service.get({ serviceId: sid });
        if (data) services[sid] = data;
      }));
      return Response.json({
        appointments: appointments.map(a => ({ ...a, service: services[a.serviceId] || null, customer: typeof a.customer === 'string' ? JSON.parse(a.customer) : a.customer }))
      });
    } catch (error) {
      return Response.json({ error: 'Failed to fetch client appointments' }, { status: 500 });
    }
  }

  // Staff-based calendar lookup — any authenticated user can view any staff calendar
  if (staffId) {
    try {
      // Find the staff member's vendor
      const { data: staffRecord } = await client.models.StaffSchedule.get({ visibleId: staffId } as any);
      if (!staffRecord) {
        return Response.json({ error: 'Staff not found' }, { status: 404 });
      }
      const staffVendorId = staffRecord.vendorId;
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');

      let appointments: any[] = [];
      if (startDate && endDate) {
        let nextToken: string | undefined;
        do {
          const { data, nextToken: token } = await client.models.Appointment.listAppointmentByVendorIdAndDateTime({
            vendorId: staffVendorId,
            dateTime: { between: [startDate, endDate] },
            ...(nextToken ? { nextToken } : {})
          } as any);
          appointments = appointments.concat(data || []);
          nextToken = token as string | undefined;
        } while (nextToken);
      } else {
        const { data } = await client.models.Appointment.list({
          filter: { vendorId: { eq: staffVendorId } }
        });
        appointments = data || [];
      }

      // Filter to only this staff member's appointments
      appointments = appointments.filter(apt => apt.staffId === staffId);

      // Batch-fetch unique services to avoid N+1 queries
      const uniqueServiceIds = [...new Set(appointments.map(a => a.serviceId).filter(Boolean))];
      const serviceMap: Record<string, any> = {};
      await Promise.all(uniqueServiceIds.map(async (sid) => {
        const { data } = await client.models.Service.get({ serviceId: sid });
        if (data) serviceMap[sid] = data;
      }));

      // Enrich appointments using the pre-fetched service map
      const enrichedAppointments = appointments.map((appointment) => {
        const service = serviceMap[appointment.serviceId] || null;
        let customer = appointment.customer;
        if (typeof customer === 'string') { try { customer = JSON.parse(customer); } catch {} }
        const staffName = staffRecord.staffName || null;
        return { ...appointment, rawDateTime: appointment.dateTime, customer, service, staffName };
      });

      return Response.json({ appointments: enrichedAppointments });
    } catch (error) {
      console.error('Error fetching staff appointments:', error);
      return Response.json({ error: 'Failed to fetch staff appointments' }, { status: 500 });
    }
  }

  // Vendor/owner can only access their own vendor's appointments
  if ((currentUser.role === 'vendor' || currentUser.role === 'owner') && vendorId !== currentUser.vendorId) {
    return Response.json({ error: 'Unauthorized: Cannot access other vendor appointments' }, { status: 403 });
  }

  try {
    // Get appointments for this vendor, optionally filtered by date range
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let appointments;
    if (startDate && endDate) {
      // Use the vendorId + dateTime index for efficient range queries
      let allData: any[] = [];
      let nextToken: string | undefined;
      do {
        const { data, errors: listErrors, nextToken: token } = await client.models.Appointment.listAppointmentByVendorIdAndDateTime({
          vendorId,
          dateTime: { between: [startDate, endDate] },
          ...(nextToken ? { nextToken } : {})
        } as any);
        if (listErrors) {
          console.error('Error fetching appointments:', listErrors);
          return Response.json({ error: 'Failed to fetch appointments' }, { status: 500 });
        }
        allData = allData.concat(data || []);
        nextToken = token as string | undefined;
      } while (nextToken);
      appointments = allData;
    } else {
      const { data, errors: listErrors } = await client.models.Appointment.list({
        filter: { vendorId: { eq: vendorId } }
      });
      if (listErrors) {
        console.error('Error fetching appointments:', listErrors);
        return Response.json({ error: 'Failed to fetch appointments' }, { status: 500 });
      }
      appointments = data || [];
    }

    // Enrich appointments with service details — batch-fetch to avoid N+1
    const uniqueServiceIds = [...new Set((appointments || []).map((a: any) => a.serviceId).filter(Boolean))] as string[];
    const uniqueStaffIds = [...new Set((appointments || []).map((a: any) => a.staffId).filter(Boolean))] as string[];

    const serviceMap: Record<string, any> = {};
    const staffMap: Record<string, any> = {};

    await Promise.all([
      ...uniqueServiceIds.map(async (sid: string) => {
        const { data } = await client.models.Service.get({ serviceId: sid });
        if (data) serviceMap[sid] = data;
      }),
      ...uniqueStaffIds.map(async (sid: string) => {
        const { data } = await client.models.StaffSchedule.get({ visibleId: sid });
        if (data) staffMap[sid] = data;
      })
    ]);

    const enrichedAppointments = (appointments || []).map((appointment: any) => {
      const service = serviceMap[appointment.serviceId] || null;

      // Parse customer JSON if it's a string
      let customer = appointment.customer;
      if (typeof customer === 'string') {
        try { customer = JSON.parse(customer); } catch (e) { console.error('Error parsing customer data:', e); }
      }

      // Format dateTime to human-readable format
      let formattedDateTime = appointment.dateTime;
      try {
        let dateStr = appointment.dateTime;
        if (typeof dateStr === 'string') {
          dateStr = dateStr.split(' ')[0].split('T')[0] + 'T' + dateStr.split('T')[1]?.split(' ')[0];
          if (dateStr.includes('ZT')) {
            dateStr = dateStr.split('ZT')[0] + 'Z';
          }
        }
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          formattedDateTime = date.toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true
          });
        }
      } catch (e) { console.error('Error formatting date:', e); }

      const staffName = appointment.staffId ? (staffMap[appointment.staffId]?.staffName || null) : null;

      return {
        ...appointment,
        rawDateTime: appointment.dateTime,
        dateTime: formattedDateTime,
        customer,
        service,
        staffName
      };
    });

    return Response.json({ appointments: enrichedAppointments });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    return Response.json({ error: 'Failed to fetch appointments' }, { status: 500 });
  }
}
