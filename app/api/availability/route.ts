import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { getRecurrenceHours, generateTimeSlots, getMultiProviderSlots } from '../../utils/availability.js';
import { getParallelQuantitySlots, getSequentialQuantitySlots } from '../../utils/quantityAvailability.js';

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const vendorId = searchParams.get('vendorId');
  const serviceId = searchParams.get('serviceId');
  const date = searchParams.get('date'); // YYYY-MM-DD format
  const excludeAppointmentId = searchParams.get('excludeAppointmentId');

  if (!vendorId || !serviceId || !date) {
    return Response.json({ error: 'Missing required parameters' }, { status: 400 });
  }

  try {
    const [vendorRes, serviceRes, globalSettingRes] = await Promise.all([
      client.models.Vendor.get({ vendorId }),
      client.models.Service.get({ serviceId }),
      client.models.SiteSettings.get({ settingKey: 'globalBookingDisabledUntil' }),
    ]);

    if (vendorRes.errors || !vendorRes.data) {
      return Response.json({ error: 'Vendor not found' }, { status: 404 });
    }
    if (serviceRes.errors || !serviceRes.data) {
      return Response.json({ error: 'Service not found' }, { status: 404 });
    }

    const vendor = vendorRes.data;
    const service = serviceRes.data;

    // Check global booking blackout
    const globalUntil = globalSettingRes.data?.settingValue;
    if (globalUntil && new Date(globalUntil) > new Date()) {
      return Response.json({ availableSlots: [], bookingDisabled: true, disabledUntil: globalUntil });
    }

    // Check vendor-level booking blackout
    const vendorUntil = vendor.bookingDisabledUntil as string | null;
    if (vendorUntil && new Date(vendorUntil) > new Date()) {
      return Response.json({ availableSlots: [], bookingDisabled: true, disabledUntil: vendorUntil });
    }

    // Multi-provider availability path
    const multiProvider = searchParams.get('multiProvider');
    if (multiProvider === 'true' || (service.providersRequired && service.providersRequired > 1)) {
      return await handleMultiProviderAvailability(service, date, vendor);
    }

    // Multi-quantity availability path
    const quantityParam = searchParams.get('quantity');
    const quantity = quantityParam ? parseInt(quantityParam) : 1;
    const mode = searchParams.get('mode') || 'sequential'; // 'parallel' or 'sequential'

    if (quantity > 1) {
      return await handleQuantityAvailability(service, date, vendor, quantity, mode);
    }

    const isSauna = (service.resourceType || 'staff') === 'sauna';
    const isRoom = (service.resourceType || 'staff') === 'room';

    const requestedDate = new Date(date + 'T00:00:00');
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][requestedDate.getDay()];

    // Determine working hours for this day
    const dayHours = await getDayHours(vendor, service, dayOfWeek, requestedDate);
    if (!dayHours || !dayHours.start || !dayHours.end) {
      return Response.json({ availableSlots: [] });
    }

    // Resolve staff assignment
    let assignedStaff = null;
    if (!isSauna && !isRoom) {
      assignedStaff = await resolveStaff(vendorId, dayOfWeek, requestedDate, service.allowedStaff as string[] | null);
    }

    // Get existing appointments for conflict checking
    let allAppointments: any[] = [];
    if (isRoom) {
      // Room resources are cross-vendor — fetch appointments from ALL vendors for this date
      allAppointments = await getAllRoomAppointments(date);
    } else {
      let nextToken: string | undefined;
      do {
        const result = await client.models.Appointment.listAppointmentByVendorIdAndDateTime({
          vendorId,
          dateTime: { beginsWith: date },
          ...(nextToken ? { nextToken } : {})
        } as any);
        allAppointments = allAppointments.concat(result.data || []);
        nextToken = (result as any).nextToken;
      } while (nextToken);
    }

    // Filter by resource type — sauna appointments don't block staff and vice versa
    const relevantAppointments = await filterRelevantAppointments(allAppointments || [], isSauna, isRoom, assignedStaff, serviceId, excludeAppointmentId);

    const slots = generateTimeSlots(
      dayHours.start,
      dayHours.end,
      service.duration,
      service.bufferMinutes != null ? service.bufferMinutes : (vendor.bufferMinutes || 15),
      relevantAppointments,
      date
    );

    return Response.json({
      availableSlots: slots,
      ...(assignedStaff ? { assignedStaff: { id: assignedStaff.visibleId, name: assignedStaff.staffName } } : {})
    });
  } catch (error) {
    console.error('Error fetching availability:', error);
    return Response.json({ error: 'Failed to fetch availability' }, { status: 500 });
  }
}

async function filterRelevantAppointments(appointments: any[], isSauna: boolean, isRoom: boolean, assignedStaff: any, serviceId: string, excludeAppointmentId?: string | null) {
  const relevant = [];
  for (const apt of appointments) {
    if (apt.status === 'cancelled') continue;
    if (excludeAppointmentId && apt.appointmentId === excludeAppointmentId) continue;
    const { data: aptService } = await client.models.Service.get({ serviceId: apt.serviceId });
    const aptResourceType = aptService?.resourceType || 'staff';
    const aptIsSauna = aptResourceType === 'sauna';
    const aptIsRoom = aptResourceType === 'room';

    if (isRoom && aptIsRoom) {
      // Cross-vendor room conflict: any room appointment blocks any other room appointment
      relevant.push(apt);
    } else if (isSauna && aptIsSauna) {
      relevant.push(apt);
    } else if (!isSauna && !isRoom && !aptIsSauna && !aptIsRoom) {
      if (!assignedStaff || !apt.staffId || apt.staffId === assignedStaff.visibleId) {
        relevant.push(apt);
      }
    }
  }
  return relevant;
}

async function getAllRoomAppointments(date: string): Promise<any[]> {
  // Room resources are shared across all vendors — fetch all vendors and their appointments
  const { data: allVendors } = await client.models.Vendor.list();
  if (!allVendors || allVendors.length === 0) return [];

  const appointmentPromises = allVendors.map(v =>
    client.models.Appointment.listAppointmentByVendorIdAndDateTime({
      vendorId: v.vendorId,
      dateTime: { beginsWith: date }
    } as any)
  );
  const results = await Promise.all(appointmentPromises);
  return results.flatMap(r => (r as any).data || []);
}

async function getDayHours(vendor: any, service: any, dayOfWeek: string, requestedDate: Date) {
  const isSauna = (service.resourceType || 'staff') === 'sauna';
  const isRoom = (service.resourceType || 'staff') === 'room';

  if (isSauna && vendor.saunaHours) {
    const saunaHours = JSON.parse(vendor.saunaHours as string);
    return saunaHours[dayOfWeek] || null;
  }

  if (isRoom && vendor.spaRoomHours) {
    const spaRoomHours = JSON.parse(vendor.spaRoomHours as string);
    return spaRoomHours[dayOfWeek] || null;
  }

  if (!isSauna && !isRoom) {
    const { data: staffList } = await client.models.StaffSchedule.listStaffScheduleByVendorId({ vendorId: vendor.vendorId });
    const staff = await resolveStaff(vendor.vendorId, dayOfWeek, requestedDate, service.allowedStaff as string[] | null);
    if (staff) {
      const schedule = JSON.parse(staff.schedule as string);
      const daySchedule = schedule[dayOfWeek];
      if (daySchedule?.recurrence) {
        return getRecurrenceHours(daySchedule, requestedDate);
      }
      return daySchedule || null;
    }
    // If staff schedules exist but no one is working this day, don't fall back to vendor hours
    if (staffList && staffList.length > 0) {
      return null;
    }
  }

  const workingHours = JSON.parse(vendor.workingHours as string);
  return workingHours[dayOfWeek] || null;
}

async function resolveStaff(vendorId: string, dayOfWeek: string, requestedDate: Date, allowedStaffIds?: string[] | null) {
  const { data: staffList } = await client.models.StaffSchedule.listStaffScheduleByVendorId({ vendorId });
  if (!staffList || staffList.length === 0) return null;

  const isAllowed = (staff: any) => !allowedStaffIds || allowedStaffIds.length === 0 || allowedStaffIds.includes(staff.visibleId);
  const eligible = staffList.filter(s => s.isActive && isAllowed(s));

  // Helper: check if a staff member actually works on this specific day (respects recurrence)
  const isWorkingThisDay = (staff: any): boolean => {
    if (!staff.schedule) return false;
    const schedule = JSON.parse(staff.schedule as string);
    const daySchedule = schedule[dayOfWeek];
    if (!daySchedule || !daySchedule.start) return false;
    if (daySchedule.recurrence) return !!getRecurrenceHours(daySchedule, requestedDate)?.start;
    return true;
  };

  // Auto-assign only if the staff member is actually working this day
  const autoAssigned = eligible.find(staff => {
    if (!staff.autoAssignRules) return false;
    const rules = JSON.parse(staff.autoAssignRules as string);
    const hasAutoAssign = rules.some((r: any) => r.action === 'auto-assign' && r.days?.includes(dayOfWeek));
    if (!hasAutoAssign) return false;
    return isWorkingThisDay(staff);
  });
  if (autoAssigned) return autoAssigned;

  return eligible.find(staff => isWorkingThisDay(staff)) || null;
}

async function handleMultiProviderAvailability(service: any, date: string, vendor: any) {
  let allowedStaff = (service.allowedStaff as string[]) || [];

  // If allowedStaff is empty (null = all staff), fetch all active staff across all vendors
  if (allowedStaff.length === 0) {
    const { data: allStaff } = await client.models.StaffSchedule.list();
    allowedStaff = (allStaff || []).filter((s: any) => s.isActive !== false).map((s: any) => s.visibleId);
  }

  if (allowedStaff.length === 0) {
    return Response.json({ availableSlots: [] });
  }

  // Fetch staff schedules for ALL staff in service.allowedStaff
  // Staff may span multiple vendors, so fetch each individually
  const staffSchedulePromises = allowedStaff.map(staffId =>
    client.models.StaffSchedule.get({ visibleId: staffId } as any)
  );
  const staffScheduleResults = await Promise.all(staffSchedulePromises);

  const staffSchedules = staffScheduleResults
    .filter(result => !result.errors && result.data)
    .map(result => result.data);

  if (staffSchedules.length === 0) {
    return Response.json({ availableSlots: [] });
  }

  // Collect unique vendorIds from the staff schedules to fetch appointments
  const vendorIds = [...new Set(staffSchedules.map((s: any) => s.vendorId).filter(Boolean))];

  // Fetch appointments for ALL those staff members on the requested date
  const appointmentPromises = vendorIds.map(vid =>
    client.models.Appointment.listAppointmentByVendorIdAndDateTime({
      vendorId: vid,
      dateTime: { beginsWith: date }
    } as any)
  );
  const appointmentResults = await Promise.all(appointmentPromises);

  const allAppointments = appointmentResults
    .flatMap(result => (result as any).data || [])
    .filter(apt => apt.status !== 'cancelled' && allowedStaff.includes(apt.staffId));

  // Call getMultiProviderSlots
  const slots = getMultiProviderSlots({
    service,
    staffSchedules,
    appointments: allAppointments,
    date,
    bufferMinutes: vendor.bufferMinutes || 15
  });

  return Response.json({ availableSlots: slots });
}

async function handleQuantityAvailability(service: any, date: string, vendor: any, quantity: number, mode: string) {
  const allowedStaff = (service.allowedStaff as string[]) || [];

  if (allowedStaff.length === 0) {
    return Response.json({ availableSlots: [] });
  }

  // Enforce maxQuantityPerBooking
  const maxQuantity = service.maxQuantityPerBooking || 1;
  if (quantity > maxQuantity) {
    return Response.json({ error: `Maximum quantity for this service is ${maxQuantity}` }, { status: 400 });
  }

  // Fetch staff schedules
  const staffSchedulePromises = allowedStaff.map(staffId =>
    client.models.StaffSchedule.get({ visibleId: staffId } as any)
  );
  const staffScheduleResults = await Promise.all(staffSchedulePromises);

  const staffSchedules = staffScheduleResults
    .filter(result => !result.errors && result.data)
    .map(result => result.data);

  if (staffSchedules.length === 0) {
    return Response.json({ availableSlots: [] });
  }

  // Collect unique vendorIds to fetch appointments
  const vendorIds = [...new Set(staffSchedules.map((s: any) => s.vendorId).filter(Boolean))];

  const appointmentPromises = vendorIds.map(vid =>
    client.models.Appointment.listAppointmentByVendorIdAndDateTime({
      vendorId: vid,
      dateTime: { beginsWith: date }
    } as any)
  );
  const appointmentResults = await Promise.all(appointmentPromises);

  const allAppointments = appointmentResults
    .flatMap(result => (result as any).data || [])
    .filter(apt => apt.status !== 'cancelled' && allowedStaff.includes(apt.staffId));

  const bufferMinutes = vendor.bufferMinutes || 15;

  let slots;
  if (mode === 'parallel') {
    slots = getParallelQuantitySlots({
      service,
      quantity,
      staffSchedules,
      appointments: allAppointments,
      date,
      bufferMinutes
    });
  } else {
    slots = getSequentialQuantitySlots({
      service,
      quantity,
      staffSchedules,
      appointments: allAppointments,
      date,
      bufferMinutes
    });
  }

  return Response.json({
    availableSlots: slots,
    quantity,
    mode,
    totalDuration: mode === 'parallel'
      ? service.duration
      : (quantity * service.duration) + ((quantity - 1) * bufferMinutes)
  });
}
