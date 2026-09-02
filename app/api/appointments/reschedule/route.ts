import { client, resolveAppointmentDetails, sendAppointmentNotifications } from '@/lib/appointment-notifications';
import { checkStaffConflict, resolveAppointmentDuration } from '@/app/utils/overlapDetection';
import { moveReservation } from '@/app/utils/slotReservation';
import { withErrorLogging } from '@/lib/logger/middleware';

export const POST = withErrorLogging(async function POST(request: Request) {
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
    const duration = await resolveAppointmentDuration(client, appointment);

    if (staffId && !confirmOverlap) {
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

    // --- Atomically move the slot reservation to the new time ---
    // Reserve the new interval first; only if it succeeds do we release the old
    // cells and update the appointment. If the new interval is taken, the move
    // is rejected and the original booking stays intact. Vendors overriding via
    // confirmOverlap intentionally double-book and skip the atomic guard.
    if (staffId && !(isVendorBooking && confirmOverlap)) {
      const { data: staffSchedule } = await client.models.StaffSchedule.get({ visibleId: staffId });
      const buffer = await resolveBuffer(appointment, staffSchedule);
      const moved = await moveReservation(client, appointmentId, {
        staffId,
        dateTime: newDateTime,
        durationMinutes: duration,
        bufferMinutes: buffer,
        appointmentId,
        vendorId: (staffSchedule?.vendorId as string) || (appointment.vendorId as string) || undefined,
      });
      if (!moved.ok) {
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
})

/**
 * Resolves the buffer minutes to enforce for an appointment's reservation.
 * Priority: the service's own bufferMinutes, then the staff's vendor buffer,
 * then a 15-minute default — matching the booking (show/book) path authority.
 */
async function resolveBuffer(appointment: any, staffSchedule: any): Promise<number> {
  const serviceId = appointment?.serviceId as string | undefined;
  if (serviceId && serviceId !== 'blocked' && serviceId !== 'manual') {
    const { data: svc } = await client.models.Service.get({ serviceId });
    if (svc && svc.bufferMinutes != null) return svc.bufferMinutes as number;
  }
  if (staffSchedule?.vendorId) {
    const { data: vendor } = await client.models.Vendor.get({ vendorId: staffSchedule.vendorId });
    if (vendor && vendor.bufferMinutes != null) return vendor.bufferMinutes as number;
  }
  return 15;
}
