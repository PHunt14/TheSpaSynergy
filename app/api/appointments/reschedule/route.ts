import { client, resolveAppointmentDetails, sendAppointmentNotifications } from '@/lib/appointment-notifications';
import { detectConflict, extractDateFromDateTime } from '@/app/utils/overlapDetection';

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
      const date = extractDateFromDateTime(newDateTime);

      // Resolve staff's vendorId for appointment lookup
      const { data: staffSchedule } = await client.models.StaffSchedule.get({ visibleId: staffId });
      if (staffSchedule?.vendorId) {
        // Get buffer minutes from vendor config
        const { data: vendor } = await client.models.Vendor.get({ vendorId: staffSchedule.vendorId });
        const bufferMinutes = (vendor?.bufferMinutes as number) ?? 15;

        // Fetch existing appointments for this staff on the new date
        const { data: existingApts } = await client.models.Appointment.listAppointmentByVendorIdAndDateTime({
          vendorId: staffSchedule.vendorId,
          dateTime: { beginsWith: date },
        } as any);

        if (existingApts && existingApts.length > 0) {
          // Determine duration of the appointment being rescheduled
          let duration = 60;
          const customerData = typeof appointment.customer === 'string'
            ? (() => { try { return JSON.parse(appointment.customer); } catch { return {}; } })()
            : (appointment.customer || {});

          if (customerData.duration) {
            duration = customerData.duration;
          } else if (appointment.serviceId && appointment.serviceId !== 'blocked' && appointment.serviceId !== 'manual') {
            const { data: svc } = await client.models.Service.get({ serviceId: appointment.serviceId });
            if (svc?.duration) duration = svc.duration as number;
          }

          // Build service duration map for existing appointments
          const serviceIds = [...new Set(existingApts.map((a: any) => a.serviceId).filter(Boolean))];
          const serviceDurationMap: Record<string, number> = {};
          await Promise.all(serviceIds.map(async (sid: string) => {
            if (sid === 'blocked' || sid === 'manual') return;
            const { data: svc } = await client.models.Service.get({ serviceId: sid });
            if (svc?.duration) serviceDurationMap[sid] = svc.duration as number;
          }));

          const conflict = detectConflict(
            staffId,
            newDateTime,
            duration,
            bufferMinutes,
            existingApts as any[],
            serviceDurationMap,
            appointmentId, // Exclude the appointment being rescheduled
            isVendorBooking
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
