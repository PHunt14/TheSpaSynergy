import { client } from '@/lib/appointment-notifications';

export async function POST(request: Request) {
  try {
    const { appointmentId, newStaffId, requestingVendorId, role } = await request.json();

    if (!appointmentId || !newStaffId || !requestingVendorId) {
      return Response.json(
        { error: 'appointmentId, newStaffId, and requestingVendorId are required' },
        { status: 400 }
      );
    }

    // 1. Fetch the appointment
    const { data: appointment, errors: getErrors } = await client.models.Appointment.get({ appointmentId });

    if (getErrors || !appointment) {
      return Response.json({ error: 'Appointment not found' }, { status: 404 });
    }

    // 2. Verify appointment is in a valid state for reassignment
    const validStatuses = ['pending-confirmation', 'confirmed', 'pending'];
    if (!validStatuses.includes(appointment.status as string)) {
      return Response.json(
        { error: 'Cannot reassign cancelled booking' },
        { status: 400 }
      );
    }

    // 3. Fetch the service to get allowedStaff and leadVendorId
    const { data: service, errors: serviceErrors } = await client.models.Service.get({
      serviceId: appointment.serviceId,
    });

    if (serviceErrors || !service) {
      return Response.json({ error: 'Service not found' }, { status: 404 });
    }

    // 4. Authorization check: requestingVendorId must be the leadVendorId
    //    OR must equal the vendorId on the appointment being reassigned
    //    OR the user must have an admin/owner role
    const leadVendorId = service.leadVendorId;
    const isLeadVendor = requestingVendorId === leadVendorId;
    const ownsCurrentStaff = requestingVendorId === appointment.vendorId;
    const isPrivilegedRole = role === 'admin' || role === 'owner';

    if (!isLeadVendor && !ownsCurrentStaff && !isPrivilegedRole) {
      return Response.json(
        { error: 'Not authorized to reassign this appointment' },
        { status: 403 }
      );
    }

    // 5. Verify newStaffId is in service.allowedStaff
    //    If allowedStaff is null or empty, all staff are eligible (no restriction)
    const allowedStaff: string[] | null = (service.allowedStaff as string[] | null) || null;
    if (allowedStaff && allowedStaff.length > 0 && !allowedStaff.includes(newStaffId)) {
      return Response.json(
        { error: 'Staff member not eligible for this service' },
        { status: 400 }
      );
    }

    // 6. Fetch the new staff's schedule and check for conflicts at the appointment's dateTime
    const { data: newStaffRecord, errors: staffErrors } = await client.models.StaffSchedule.get({
      visibleId: newStaffId,
    });

    if (staffErrors || !newStaffRecord) {
      return Response.json({ error: 'Staff member not found' }, { status: 404 });
    }

    // Check for conflicting appointments at the booked time
    const hasConflict = await checkStaffConflict(
      newStaffId,
      newStaffRecord.vendorId,
      appointment.dateTime,
      service.duration || 60,
      appointmentId
    );

    if (hasConflict) {
      return Response.json(
        { error: 'Staff member has a conflicting appointment' },
        { status: 409 }
      );
    }

    // 7. Update the appointment with new staffId and vendorId
    const { errors: updateErrors } = await client.models.Appointment.update({
      appointmentId,
      staffId: newStaffId,
      vendorId: newStaffRecord.vendorId as any,
    });

    if (updateErrors) {
      console.error('Error reassigning appointment:', updateErrors);
      return Response.json({ error: 'Failed to reassign appointment' }, { status: 500 });
    }

    return Response.json({
      success: true,
      appointmentId,
      newStaffId,
      newVendorId: newStaffRecord.vendorId,
    });
  } catch (error) {
    console.error('Error reassigning appointment:', error);
    return Response.json({ error: 'Failed to reassign appointment' }, { status: 500 });
  }
}

/**
 * Checks if a staff member has a conflicting appointment at the given dateTime.
 * Queries appointments for the staff member's vendor on the same day and checks for overlaps.
 */
async function checkStaffConflict(
  staffId: string,
  vendorId: string,
  dateTime: string,
  durationMinutes: number,
  excludeAppointmentId: string
): Promise<boolean> {
  // Get the date range for the day of the appointment
  const appointmentDate = new Date(dateTime);
  const dayStart = new Date(appointmentDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(appointmentDate);
  dayEnd.setHours(23, 59, 59, 999);

  const { data: dayAppointments } = await client.models.Appointment.listAppointmentByVendorIdAndDateTime({
    vendorId,
    dateTime: { between: [dayStart.toISOString(), dayEnd.toISOString()] },
  });

  if (!dayAppointments || dayAppointments.length === 0) {
    return false;
  }

  const appointmentStart = appointmentDate.getTime();
  const appointmentEnd = appointmentStart + durationMinutes * 60 * 1000;

  for (const existing of dayAppointments) {
    // Skip the appointment being reassigned (it will be updated)
    if (existing.appointmentId === excludeAppointmentId) continue;
    // Only check appointments for the same staff member
    if (existing.staffId !== staffId) continue;
    // Skip cancelled appointments
    if (existing.status === 'cancelled') continue;

    const existingStart = new Date(existing.dateTime).getTime();
    const existingEnd = existingStart + durationMinutes * 60 * 1000;

    // Check for overlap
    if (appointmentStart < existingEnd && appointmentEnd > existingStart) {
      return true;
    }
  }

  return false;
}
