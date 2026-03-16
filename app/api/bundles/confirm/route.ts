import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../../amplify/data/resource';
import config from '../../../../amplify_outputs.json' with { type: 'json' };
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const client = generateServerClientUsingCookies<Schema>({ config, cookies });
const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });

function formatPhone(phone: string): string {
  return phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`;
}

export async function POST(request: Request) {
  try {
    const { bundleId, vendorId, action } = await request.json();

    if (!bundleId || !vendorId || !action) {
      return Response.json({ error: 'bundleId, vendorId, and action required' }, { status: 400 });
    }

    const { data: bundle } = await client.models.Bundle.get({ bundleId });
    if (!bundle || !bundle.status) {
      return Response.json({ error: 'Bundle booking not found' }, { status: 404 });
    }

    const confirmations = typeof bundle.vendorConfirmations === 'string'
      ? JSON.parse(bundle.vendorConfirmations)
      : bundle.vendorConfirmations || {};

    if (!(vendorId in confirmations)) {
      return Response.json({ error: 'Vendor not part of this bundle' }, { status: 400 });
    }

    const customer = typeof bundle.customer === 'string'
      ? JSON.parse(bundle.customer)
      : bundle.customer;

    if (action === 'cancel') {
      // Cancel all appointments in the bundle
      if (bundle.appointmentIds) {
        await Promise.all(
          bundle.appointmentIds.map(id =>
            client.models.Appointment.update({ appointmentId: id, status: 'cancelled' as any })
          )
        );
      }

      await client.models.Bundle.update({
        bundleId: bundleId as any,
        status: 'cancelled' as any,
        vendorConfirmations: JSON.stringify(
          Object.fromEntries(Object.keys(confirmations).map(v => [v, v === vendorId ? 'cancelled' : confirmations[v]]))
        ) as any,
      });

      // Notify customer
      if (customer?.phone) {
        snsClient.send(new PublishCommand({
          PhoneNumber: formatPhone(customer.phone),
          Message: `Bundle Cancelled\n\nYour ${bundle.name} booking has been cancelled by a vendor.\n\nThe Spa Synergy`,
        })).catch(err => console.error('SMS failed:', err));
      }

      return Response.json({ success: true, bundleStatus: 'cancelled' });
    }

    // Confirm this vendor's portion
    confirmations[vendorId] = 'confirmed';

    const allConfirmed = Object.values(confirmations).every(s => s === 'confirmed');
    const newStatus = allConfirmed ? 'confirmed' : 'pending-confirmation';

    // Update bundle
    await client.models.Bundle.update({
      bundleId: bundleId as any,
      status: newStatus as any,
      vendorConfirmations: JSON.stringify(confirmations) as any,
    });

    // Confirm this vendor's appointments
    if (bundle.appointmentIds) {
      const appointments = await Promise.all(
        bundle.appointmentIds.map(id => client.models.Appointment.get({ appointmentId: id }))
      );
      await Promise.all(
        appointments
          .filter(a => a.data?.vendorId === vendorId)
          .map(a => client.models.Appointment.update({
            appointmentId: a.data!.appointmentId,
            status: 'confirmed' as any,
          }))
      );
    }

    // If fully confirmed, notify customer
    if (allConfirmed && customer?.phone) {
      const formattedDateTime = bundle.dateTime
        ? new Date(bundle.dateTime).toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true
          })
        : '';

      snsClient.send(new PublishCommand({
        PhoneNumber: formatPhone(customer.phone),
        Message: `Bundle Confirmed!\n\n${bundle.name}\nDate/Time: ${formattedDateTime}\n\nAll vendors have confirmed your appointment.\n\nThe Spa Synergy`,
      })).catch(err => console.error('SMS failed:', err));
    }

    return Response.json({ success: true, bundleStatus: newStatus });
  } catch (error) {
    console.error('Bundle confirm error:', error);
    return Response.json({ error: 'Failed to process bundle confirmation' }, { status: 500 });
  }
}
