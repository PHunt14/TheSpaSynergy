import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const vendorId = searchParams.get('vendorId');
  const serviceId = searchParams.get('serviceId');
  const date = searchParams.get('date'); // YYYY-MM-DD format

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
    const relevantAppointments = [];
    for (const apt of allAppointments || []) {
      if (apt.status === 'cancelled') continue;
      const { data: aptService } = await client.models.Service.get({ serviceId: apt.serviceId });
      const aptIsSauna = (aptService?.resourceType || 'staff') === 'sauna';
      if (isSauna && aptIsSauna) {
        relevantAppointments.push(apt);
      } else if (!isSauna && !aptIsSauna) {
        // For staff services, only block if same staff member (or no staff tracking yet)
        if (!assignedStaff || !apt.staffId || apt.staffId === assignedStaff.visibleId) {
          relevantAppointments.push(apt);
        }
      }
    }

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

async function getDayHours(vendor: any, service: any, dayOfWeek: string, requestedDate: Date) {
  const isSauna = (service.resourceType || 'staff') === 'sauna';

  // Sauna uses its own hours if available
  if (isSauna && vendor.saunaHours) {
    const saunaHours = JSON.parse(vendor.saunaHours as string);
    return saunaHours[dayOfWeek] || null;
  }

  // Non-sauna: try staff schedules first
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

  // Fallback to vendor-level hours
  const workingHours = JSON.parse(vendor.workingHours as string);
  return workingHours[dayOfWeek] || null;
}

async function resolveStaff(vendorId: string, dayOfWeek: string, requestedDate: Date, allowedStaffIds?: string[] | null) {
  const { data: staffList } = await client.models.StaffSchedule.listStaffScheduleByVendorId({
    vendorId
  });

  if (!staffList || staffList.length === 0) return null;

  const isAllowed = (staff: any) => !allowedStaffIds || allowedStaffIds.length === 0 || allowedStaffIds.includes(staff.visibleId);

  // Check for auto-assign rules first
  for (const staff of staffList) {
    if (!staff.isActive || !staff.autoAssignRules || !isAllowed(staff)) continue;
    const rules = JSON.parse(staff.autoAssignRules as string);
    for (const rule of rules) {
      if (rule.action === 'auto-assign' && rule.days?.includes(dayOfWeek)) {
        return staff;
      }
    }
  }

  // Find any allowed staff member available on this day
  for (const staff of staffList) {
    if (!staff.isActive || !staff.schedule || !isAllowed(staff)) continue;
    const schedule = JSON.parse(staff.schedule as string);
    const daySchedule = schedule[dayOfWeek];
    if (!daySchedule) continue;

    // Handle recurrence patterns
    if (daySchedule.recurrence) {
      const hours = getRecurrenceHours(daySchedule, requestedDate);
      if (hours?.start) return staff;
    } else if (daySchedule.start) {
      return staff;
    }
  }

  return null;
}

function getRecurrenceHours(daySchedule: any, requestedDate: Date) {
  if (daySchedule.recurrence === 'every-other') {
    if (daySchedule.anchorDate) {
      const anchor = new Date(daySchedule.anchorDate + 'T00:00:00');
      const diffMs = requestedDate.getTime() - anchor.getTime();
      const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
      if (diffWeeks % 2 === 0) {
        return { start: daySchedule.start, end: daySchedule.end };
      }
    } else {
      const weekNum = Math.floor(requestedDate.getTime() / (7 * 24 * 60 * 60 * 1000));
      if (weekNum % 2 === 0) {
        return { start: daySchedule.start, end: daySchedule.end };
      }
    }
    return null;
  }

  if (daySchedule.recurrence === '2nd-of-month') {
    // Check if this is the 2nd occurrence of this weekday in the month
    const dayOfMonth = requestedDate.getDate();
    if (dayOfMonth >= 8 && dayOfMonth <= 14) {
      return { start: daySchedule.recurrenceStart, end: daySchedule.recurrenceEnd };
    }
    return null;
  }

  return daySchedule.start ? { start: daySchedule.start, end: daySchedule.end } : null;
}

function generateTimeSlots(startTime: string, endTime: string, serviceDuration: number, bufferMinutes: number, bookedSlots: any[], date: string) {
  const slots = [];
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);

  let currentMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const isToday = date === today;
  const currentTimeMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : 0;

  while (currentMinutes + serviceDuration <= endMinutes) {
    const hour = Math.floor(currentMinutes / 60);
    const min = currentMinutes % 60;
    const timeString = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;

    if (isToday && currentMinutes <= currentTimeMinutes) {
      currentMinutes += 30;
      continue;
    }

    const isBooked = bookedSlots.some(appointment => {
      const appointmentDateTime = appointment.dateTime;
      const appointmentTime = appointmentDateTime.includes('T')
        ? appointmentDateTime.split('T')[1].substring(0, 5)
        : appointmentDateTime.split(' ')[1];
      return timeOverlaps(timeString, appointmentTime, serviceDuration, bufferMinutes);
    });

    if (!isBooked) {
      slots.push({
        time: timeString,
        display: formatTime(hour, min)
      });
    }

    currentMinutes += 30;
  }

  return slots;
}

function timeOverlaps(newTime: string, bookedTime: string, newServiceDuration: number, bufferMinutes: number) {
  const [newHour, newMin] = newTime.split(':').map(Number);
  const newStart = newHour * 60 + newMin;
  const newEnd = newStart + newServiceDuration + bufferMinutes;

  const [bookedHour, bookedMin] = bookedTime.split(':').map(Number);
  const bookedStart = bookedHour * 60 + bookedMin;
  const bookedEnd = bookedStart + newServiceDuration + bufferMinutes;

  return (newStart < bookedEnd && newEnd > bookedStart);
}

function formatTime(hour: number, min: number) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${min.toString().padStart(2, '0')} ${period}`;
}
