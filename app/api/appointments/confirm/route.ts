import { client, resolveAppointmentDetails, sendAppointmentNotifications } from '@/lib/appointment-notifications';
import { detectConflict, extractDateFromDateTime } from '@/app/utils/overlapDetection';

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

    // --- Double-booking guard: re-check for conflicts before confirming ---
    // This catches race conditions where two pending appointments were created for the same slot
    const staffId = appointment.staffId as string | undefined;
    if (staffId) {
      const dateTime = appointment.dateTime as string;
      const date = extractDateFromDateTime(dateTime);

      const { data: staffSchedule } = await client.models.StaffSchedule.get({ visibleId: staffId });
      if (staffSchedule?.vendorId) {
        const { data: vendor } = await client.models.Vendor.get({ vendorId: staffSchedule.vendorId });
        const bufferMinutes = (vendor?.bufferMinutes as number) ?? 15;

        const { data: existingApts } = await client.models.Appointment.listAppointmentByVendorIdAndDateTime({
          vendorId: staffSchedule.vendorId,
          dateTime: { beginsWith: date },
        } as any);

        if (existingApts && existingApts.length > 0) {
          // Only check against already-confirmed appointments (not other pending ones)
          const confirmedApts = existingApts.filter(
            (a: any) => a.status === 'confirmed' && a.appointmentId !== appointmentId
          );

          if (confirmedApts.length > 0) {
            // Determine duration
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

            // Build service duration map
            const serviceIds = [...new Set(confirmedApts.map((a: any) => a.serviceId).filter(Boolean))];
            const serviceDurationMap: Record<string, number> = {};
            await Promise.all(serviceIds.map(async (sid: string) => {
              if (sid === 'blocked' || sid === 'manual') return;
              const { data: svc } = await client.models.Service.get({ serviceId: sid });
              if (svc?.duration) serviceDurationMap[sid] = svc.duration as number;
            }));

            const conflict = detectConflict(
              staffId,
              dateTime,
              duration,
              bufferMinutes,
              confirmedApts as any[],
              serviceDurationMap,
              appointmentId
            );

            if (conflict) {
              return Response.json({
                error: 'Cannot confirm — this time slot conflicts with another confirmed appointment. Please reschedule first.',
                conflict,
              }, { status: 409 });
            }
          }
        }
      }
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
