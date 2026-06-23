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

    await sendAppointmentNotifications({ event: 'confirmed', appointment, details });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error confirming appointment:', error);
    return Response.json({ error: 'Failed to confirm appointment' }, { status: 500 });
  }
}
