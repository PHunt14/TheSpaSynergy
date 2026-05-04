import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { getRecurrenceHours, generateTimeSlots } from '../../utils/availability.js';

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
    const isSauna = (service.resourceType || 'staff') === 'sauna';

    const requestedDate = new Date(date + 'T00:00:00');
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][requestedDate.getDay()];

    // Determine working hours for this day
    const dayHours = await getDayHours(vendor, service, dayOfWeek, requestedDate);
    if (!dayHours || !dayHours.start || !dayHours.end) {
      return Response.json({ availableSlots: [] });
    }

    // Resolve staff assignment
    let assignedStaff = null;
    if (!isSauna) {
      assignedStaff = await resolveStaff(vendorId, dayOfWeek, requestedDate, service.allowedStaff as string[] | null);
    }

    // Get existing appointments for conflict checking
    const { data: allAppointments } = await client.models.Appointment.list({
      filter: {
        vendorId: { eq: vendorId },
        dateTime: { beginsWith: date }
      }
    });

    // Filter by resource type — sauna appointments don't block staff and vice versa
    const relevantAppointments = await filterRelevantAppointments(allAppointments || [], isSauna, assignedStaff, serviceId, excludeAppointmentId);

    const slots = generateTimeSlots(
      dayHours.start,
      dayHours.end,
      service.duration,
      vendor.bufferMinutes || 15,
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

async function filterRelevantAppointments(appointments: any[], isSauna: boolean, assignedStaff: any, serviceId: string, excludeAppointmentId?: string | null) {
  const relevant = [];
  for (const apt of appointments) {
    if (apt.status === 'cancelled') continue;
    if (excludeAppointmentId && apt.appointmentId === excludeAppointmentId) continue;
    const { data: aptService } = await client.models.Service.get({ serviceId: apt.serviceId });
    const aptIsSauna = (aptService?.resourceType || 'staff') === 'sauna';
    if (isSauna && aptIsSauna) {
      relevant.push(apt);
    } else if (!isSauna && !aptIsSauna) {
      if (!assignedStaff || !apt.staffId || apt.staffId === assignedStaff.visibleId) {
        relevant.push(apt);
      }
    }
  }
  return relevant;
}

async function getDayHours(vendor: any, service: any, dayOfWeek: string, requestedDate: Date) {
  const isSauna = (service.resourceType || 'staff') === 'sauna';

  if (isSauna && vendor.saunaHours) {
    const saunaHours = JSON.parse(vendor.saunaHours as string);
    return saunaHours[dayOfWeek] || null;
  }

  if (!isSauna) {
    const staff = await resolveStaff(vendor.vendorId, dayOfWeek, requestedDate, service.allowedStaff as string[] | null);
    if (staff) {
      const schedule = JSON.parse(staff.schedule as string);
      const daySchedule = schedule[dayOfWeek];
      if (daySchedule?.recurrence) {
        return getRecurrenceHours(daySchedule, requestedDate);
      }
      return daySchedule || null;
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

  const autoAssigned = eligible.find(staff => {
    if (!staff.autoAssignRules) return false;
    const rules = JSON.parse(staff.autoAssignRules as string);
    return rules.some((r: any) => r.action === 'auto-assign' && r.days?.includes(dayOfWeek));
  });
  if (autoAssigned) return autoAssigned;

  return eligible.find(staff => {
    if (!staff.schedule) return false;
    const schedule = JSON.parse(staff.schedule as string);
    const daySchedule = schedule[dayOfWeek];
    if (!daySchedule) return false;
    if (daySchedule.recurrence) return !!getRecurrenceHours(daySchedule, requestedDate)?.start;
    return !!daySchedule.start;
  }) || null;
}
