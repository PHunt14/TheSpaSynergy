import { client, resolveAppointmentDetails, sendAppointmentNotifications } from '@/lib/appointment-notifications';

export async function POST(request: Request) {
  try {
    const { appointmentId } = await request.json();

    if (!appointmentId) {
      return Response.json({ error: 'appointmentId required' }, { status: 400 });
    }

    const { data: appointment, errors: getErrors } = await client.models.Appointment.get({ appointmentId });

    if (getErrors || !appointment) {
      return Response.json({ error: 'Appointment not found' }, { status: 404 });
    }

    const { errors: updateErrors } = await client.models.Appointment.update({
      appointmentId,
      status: 'confirmed' as any
    });

    if (updateErrors) {
      return Response.json({ error: 'Failed to confirm appointment' }, { status: 500 });
    }

    const details = await resolveAppointmentDetails(appointment);

    // Vendor SMS (via dedicated endpoint)
    try {
      const { data: vendor } = await client.models.Vendor.get({ vendorId: appointment.vendorId });
      if (vendor?.smsAlertsEnabled && vendor?.smsAlertPhone) {
        const { sendSms } = await import('@/lib/sms');
        const customer = typeof appointment.customer === 'string' ? JSON.parse(appointment.customer) : appointment.customer;
        const formattedDateTime = appointment.dateTime
          ? new Date(appointment.dateTime).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
          : 'Not specified';
        await sendSms(vendor.smsAlertPhone, `Appointment with ${customer?.name} has been confirmed.\n\nService: ${details.serviceName}\nDate/Time: ${formattedDateTime}\n\nThe Spa Synergy`)
          .catch(err => console.error('Vendor confirmation SMS failed:', err));
      }
    } catch (e) { /* non-blocking */ }

    await sendAppointmentNotifications({ event: 'confirmed', appointment, details });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error confirming appointment:', error);
    return Response.json({ error: 'Failed to confirm appointment' }, { status: 500 });
  }
}
