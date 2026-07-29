import { client, resolveAppointmentDetails, sendAppointmentNotifications } from '@/lib/appointment-notifications';
import { checkStaffConflict, resolveAppointmentDuration } from '@/app/utils/overlapDetection';

export async function POST(request: Request) {
  try {
    const { appointmentId, newDateTime, confirmOverlap } = await request.json();

    if (!appointmentId || !newDateTime) {
      return Response.json({ error: 'appointmentId and newDateTime required' }, { status: 400 });
    }

    const { data: appointment, errors: getErrors } = await client.models.Appointment.get({ appointmentId });

    if (getErrors || !appointment) {
      return Response.json({ error: 'Appointment not found' }, { status: 404 });
    }

    // --- Overlap detection for reschedule (prevents double-booking) ---
    const staffId = appointment.staffId as string | undefined;
    const isVendorBooking = !!(appointment as any).createdBy;

    if (staffId && !confirmOverlap) {
      const duration = await resolveAppointmentDuration(client, appointment);
      const conflict = await checkStaffConflict(
        client, staffId, newDateTime, duration, appointmentId,
        { isVendorBooking }
      );

      if (conflict) {
        if (isVendorBooking) {
          return Response.json({
            warning: 'Scheduling conflict detected',
            conflict,
            message: 'This time overlaps with an existing appointment. Resubmit with confirmOverlap=true to save anyway.',
          }, { status: 409 });
        }
        return Response.json({
          error: 'This time slot is no longer available. Please select a different time.',
        }, { status: 409 });
      }
    }

    const { errors } = await client.models.Appointment.update({
      appointmentId,
      dateTime: newDateTime as any
    });

    if (errors) {
      console.error('Error rescheduling appointment:', errors);
      return Response.json({ error: 'Failed to reschedule appointment' }, { status: 500 });
    }

    const details = await resolveAppointmentDetails(appointment);
    await sendAppointmentNotifications({ event: 'rescheduled', appointment, details, newDateTime });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error rescheduling appointment:', error);
    return Response.json({ error: 'Failed to reschedule appointment' }, { status: 500 });
  }
}
