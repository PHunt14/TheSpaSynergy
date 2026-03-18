import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { randomUUID } from 'crypto';
import { sendSms } from '@/lib/sms';
import { sendCustomerBookingEmail, sendVendorBookingEmail } from '@/lib/email';

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { vendorId, serviceId, bundleId, dateTime, customer, status, paymentId, staffId } = body;

    if (!vendorId || !serviceId || !dateTime || !customer) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
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
      status: status || 'pending',
      paymentId,
      createdAt: new Date().toISOString(),
    } as any);

    if (errors) {
      console.error('Error creating appointment:', errors);
      return Response.json({ error: 'Failed to create appointment' }, { status: 500 });
    }

    // Fetch service + vendor details for notifications
    let serviceName = 'your service';
    let serviceDuration = 0;
    let servicePrice = 0;
    let vendorName = '';
    let vendorEmail = '';
    try {
      const [serviceRes, vendorRes] = await Promise.all([
        client.models.Service.get({ serviceId }),
        client.models.Vendor.get({ vendorId }),
      ]);
      if (serviceRes.data?.name) serviceName = serviceRes.data.name;
      serviceDuration = serviceRes.data?.duration || 0;
      servicePrice = serviceRes.data?.price || 0;
      vendorName = vendorRes.data?.name || '';
      vendorEmail = vendorRes.data?.email || '';
    } catch (e) { /* use defaults */ }

    const formattedDateTime = new Date(dateTime).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });

    // --- Customer notifications (non-blocking) ---
    if (customer.phone && customer.smsOptIn) {
      const customerMsg = `Booking Submitted!\n\nService: ${serviceName}\nDate/Time: ${formattedDateTime}\n\nWe look forward to seeing you!\n\nThe Spa Synergy\nReply STOP to opt out`;
      sendSms(customer.phone, customerMsg).catch(err => console.error('Customer SMS failed:', err));
    }
    if (customer.email) {
      sendCustomerBookingEmail({
        to: customer.email, serviceName, vendorName, dateTime, duration: serviceDuration, price: servicePrice,
      }).catch(err => console.error('Customer email failed:', err));
    }

    // --- Vendor notifications (non-blocking) ---
    fetch(`${request.headers.get('origin')}/api/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId, vendorId })
    }).catch(err => console.error('Vendor SMS failed:', err));
    if (vendorEmail) {
      sendVendorBookingEmail({
        to: vendorEmail, customerName: customer.name, customerPhone: customer.phone || '',
        customerEmail: customer.email || '', serviceName, dateTime,
      }).catch(err => console.error('Vendor email failed:', err));
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
