import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { randomUUID } from 'crypto';
import { sendBookingNotifications } from '@/lib/appointment-notifications';

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

export async function PATCH(request: Request) {
  try {
    const { appointmentId, paymentId, paymentStatus, paymentAmount, status } = await request.json();

    if (!appointmentId) {
      return Response.json({ error: 'appointmentId required' }, { status: 400 });
    }

    const updateFields: any = { appointmentId };
    if (paymentId !== undefined) updateFields.paymentId = paymentId;
    if (paymentStatus !== undefined) updateFields.paymentStatus = paymentStatus;
    if (paymentAmount !== undefined) updateFields.paymentAmount = paymentAmount;
    if (status !== undefined) updateFields.status = status;

    const { errors } = await client.models.Appointment.update(updateFields);

    if (errors) {
      console.error('Error updating appointment:', errors);
      return Response.json({ error: 'Failed to update appointment' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error updating appointment:', error);
    return Response.json({ error: 'Failed to update appointment' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { vendorId, serviceId, bundleId, dateTime, customer, status, paymentId, paymentStatus, paymentAmount, staffId } = body;

    if (!vendorId || !serviceId || !dateTime || !customer) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check global booking blackout
    const { data: globalSetting } = await client.models.SiteSettings.get({ settingKey: 'globalBookingDisabledUntil' });
    if (globalSetting?.settingValue && new Date(globalSetting.settingValue) > new Date()) {
      return Response.json({ error: 'Online booking is temporarily disabled' }, { status: 403 });
    }

    // Check vendor-level booking blackout
    const { data: vendorCheck } = await client.models.Vendor.get({ vendorId });
    const vendorUntil = vendorCheck?.bookingDisabledUntil as string | null;
    if (vendorUntil && new Date(vendorUntil) > new Date()) {
      return Response.json({ error: 'Booking is temporarily disabled for this vendor' }, { status: 403 });
    }

    const appointmentId = randomUUID();

    const { data, errors } = await client.models.Appointment.create({
      appointmentId,
      vendorId,
      serviceId,
      staffId: staffId || undefined,
      bundleId: bundleId || undefined,
      dateTime,
      customer: JSON.stringify(customer),
      status: status || 'pending-confirmation',
      paymentId,
      paymentStatus: paymentStatus || undefined,
      paymentAmount: paymentAmount || undefined,
      createdAt: new Date().toISOString(),
    } as any);

    if (errors) {
      console.error('Error creating appointment:', errors);
      return Response.json({ error: 'Failed to create appointment' }, { status: 500 });
    }

    // Auto-populate client catalog
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const clientRes = await fetch(`${appUrl}/api/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: customer.name, phone: customer.phone, email: customer.email })
      });
      const clientData = await clientRes.json();
      if (clientData.client?.clientId) {
        await client.models.Appointment.update({ appointmentId, clientId: clientData.client.clientId } as any);
      }
    } catch (e) { console.error('Client auto-populate failed:', e); }

    await sendBookingNotifications({ appointmentId, vendorId, serviceId, staffId, dateTime, customer });

    return Response.json({ success: true, appointmentId });
  } catch (error) {
    console.error('Error creating appointment:', error);
    return Response.json({ error: 'Failed to create appointment' }, { status: 500 });
  }
}
