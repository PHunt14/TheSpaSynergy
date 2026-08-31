import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { getRecurrenceHours, generateTimeSlots, getMultiProviderSlots, getScheduleOverride } from '../../utils/availability.js';
import { getParallelQuantitySlots, getSequentialQuantitySlots } from '../../utils/quantityAvailability.js';
import { getEligibleStaff } from '../../utils/staffEligibility';
import { withErrorLogging } from '@/lib/logger/middleware';

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

export const GET = withErrorLogging(async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const vendorId = searchParams.get('vendorId');
  const serviceId = searchParams.get('serviceId');
  const date = searchParams.get('date'); // YYYY-MM-DD format
  const excludeAppointmentId = searchParams.get('excludeAppointmentId');
  const staffId = searchParams.get('staffId'); // Optional: specific staff member

  if (!serviceId || !date) {
    return Response.json({ error: 'Missing required parameters: serviceId and date are required' }, { status: 400 });
  }

  try {
    const [serviceRes, globalSettingRes] = await Promise.all([
      client.models.Service.get({ serviceId }),
      client.models.SiteSettings.get({ settingKey: 'globalBookingDisabledUntil' }),
    ]);

    if (serviceRes.errors || !serviceRes.data) {
      return Response.json({ error: 'Service not found' }, { status: 404 });
    }

    const service = serviceRes.data;

    // Check global booking blackout
    const globalUntil = globalSettingRes.data?.settingValue;
    if (globalUntil && new Date(globalUntil) > new Date()) {
      return Response.json({ availableSlots: [], bookingDisabled: true, disabledUntil: globalUntil });
    }

    // Fetch all staff schedules for eligibility resolution
    const { data: allStaffData } = await client.models.StaffSchedule.list();
    const allStaff = (allStaffData || []) as any[];

    // Use Staff Eligibility Resolver to determine which staff can perform this service
    const eligibleStaff = getEligibleStaff(
      {
        serviceId: service.serviceId,
        name: service.name,
        allowedStaff: service.allowedStaff as string[] | null,
      },
      allStaff.map((s: any) => ({
        visibleId: s.visibleId,
        staffName: s.staffName,
        vendorId: s.vendorId,
        isActive: s.isActive !== false,
        schedule: s.schedule,
        autoAssignRules: s.autoAssignRules,
        squareAccessToken: s.squareAccessToken,
        squareLocationId: s.squareLocationId,
        squareOAuthStatus: s.squareOAuthStatus,
        smsAlertsEnabled: s.smsAlertsEnabled,
        emailAlertsEnabled: s.emailAlertsEnabled,
      }))
    ).filter((staff: any) => {
      // Exclude staff with an active booking blackout
      const raw = allStaff.find((s: any) => s.visibleId === staff.visibleId);
      const disabledUntil = raw?.bookingDisabledUntil;
      if (disabledUntil && new Date(disabledUntil) > new Date()) return false;
      return true;
    });

    // If no staff are eligible, return empty slots with message (Req 5.7)
    if (eligibleStaff.length === 0) {
      return Response.json({
        availableSlots: [],
        message: 'No providers are available for this service',
      });
    }

    // If a specific staffId is provided, filter to only that staff member
    let targetStaff = eligibleStaff;
    if (staffId) {
      targetStaff = eligibleStaff.filter(s => s.visibleId === staffId);
      if (targetStaff.length === 0) {
        return Response.json({
          availableSlots: [],
          message: 'The selected provider is not available for this service',
        });
      }
    }

    // Check vendor-level booking blackout if vendorId is provided (backward compat)
    if (vendorId) {
      const vendorRes = await client.models.Vendor.get({ vendorId });
      if (vendorRes.data) {
        const vendorUntil = vendorRes.data.bookingDisabledUntil as string | null;
        if (vendorUntil && new Date(vendorUntil) > new Date()) {
          return Response.json({ availableSlots: [], bookingDisabled: true, disabledUntil: vendorUntil });
        }
      }
    }

    // Multi-provider availability path
    const multiProvider = searchParams.get('multiProvider');
    if (multiProvider === 'true' || (service.providersRequired && service.providersRequired > 1)) {
      return await handleMultiProviderAvailability(service, date, targetStaff, allStaff);
    }

    // Multi-quantity availability path
    const quantityParam = searchParams.get('quantity');
    const quantity = quantityParam ? parseInt(quantityParam) : 1;
    const mode = searchParams.get('mode') || 'sequential'; // 'parallel' or 'sequential'

    if (quantity > 1) {
      return await handleQuantityAvailability(service, date, targetStaff, quantity, mode);
    }

    const isSauna = (service.resourceType || 'staff') === 'sauna';
    const isRoom = (service.resourceType || 'staff') === 'room';

    // For "Any Available" (no staffId), merge slots across all eligible staff
    // For specific staff (staffId provided), compute slots for that one staff member
    if (!isSauna && targetStaff.length > 0) {
      const allSlots = await computeSlotsForStaff(targetStaff, service, date, excludeAppointmentId);

      // Sort chronologically and remove duplicates (Req 5.3, 5.4)
      const sortedUniqueSlots = deduplicateAndSort(allSlots);

      return Response.json({
        availableSlots: sortedUniqueSlots,
        ...(staffId && targetStaff.length === 1
          ? { assignedStaff: { id: targetStaff[0].visibleId, name: targetStaff[0].staffName } }
          : {}),
      });
    }

    // Room resource type — cross-vendor, use first vendor's spa room hours
    if (isRoom) {
      // Fetch all vendors to find spa room hours
      const { data: allVendors } = await client.models.Vendor.list();
      const vendorWithRoomHours = (allVendors || []).find((v: any) => v.spaRoomHours);
      if (!vendorWithRoomHours) {
        return Response.json({ availableSlots: [] });
      }
      
      const requestedDate = new Date(date + 'T00:00:00');
      const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][requestedDate.getDay()];
      const spaRoomHours = JSON.parse(vendorWithRoomHours.spaRoomHours as string);
      const dayHours = spaRoomHours[dayOfWeek] || null;
      if (!dayHours || !dayHours.start || !dayHours.end) {
        return Response.json({ availableSlots: [] });
      }

      // Get ALL room appointments across all vendors (cross-vendor)
      const aptPromises = (allVendors || []).map((v: any) =>
        client.models.Appointment.listAppointmentByVendorIdAndDateTime({
          vendorId: v.vendorId,
          dateTime: { beginsWith: date }
        } as any)
      );
      const aptResults = await Promise.all(aptPromises);
      const allApts = aptResults.flatMap((r: any) => (r as any).data || []);

      // Filter to only room appointments
      const roomApts = [];
      for (const apt of allApts) {
        if (apt.status === 'cancelled') continue;
        if (excludeAppointmentId && apt.appointmentId === excludeAppointmentId) continue;
        const { data: aptSvc } = await client.models.Service.get({ serviceId: apt.serviceId });
        if ((aptSvc?.resourceType || 'staff') === 'room') {
          roomApts.push(apt);
        }
      }

      const slots = generateTimeSlots(
        dayHours.start,
        dayHours.end,
        service.duration,
        service.bufferMinutes != null ? service.bufferMinutes : 15,
        roomApts,
        date
      );

      return Response.json({ availableSlots: slots });
    }

    // Sauna resource type path — use vendor sauna hours
    if (isSauna) {
      // Resolve vendor: from param, or from the resource-sauna staff entry, or from service
      let saunaVendorId = vendorId;
      if (!saunaVendorId) {
        const { data: saunaStaff } = await client.models.StaffSchedule.get({ visibleId: 'resource-sauna' } as any);
        saunaVendorId = saunaStaff?.vendorId;
      }
      if (!saunaVendorId) {
        return Response.json({ availableSlots: [] });
      }

      const vendorRes = await client.models.Vendor.get({ vendorId: saunaVendorId });
      if (!vendorRes.data) {
        return Response.json({ availableSlots: [] });
      }
      const vendor = vendorRes.data;
      const requestedDate = new Date(date + 'T00:00:00');
      const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][requestedDate.getDay()];

      let dayHours = null;
      if (vendor.saunaHours) {
        const saunaHours = JSON.parse(vendor.saunaHours as string);
        dayHours = saunaHours[dayOfWeek] || null;
      }
      if (!dayHours || !dayHours.start || !dayHours.end) {
        return Response.json({ availableSlots: [] });
      }

      // Get existing sauna appointments
      let allAppointments: any[] = [];
      let nextToken: string | undefined;
      do {
        const result = await client.models.Appointment.listAppointmentByVendorIdAndDateTime({
          vendorId: saunaVendorId,
          dateTime: { beginsWith: date },
          ...(nextToken ? { nextToken } : {})
        } as any);
        allAppointments = allAppointments.concat(result.data || []);
        nextToken = (result as any).nextToken;
      } while (nextToken);

      const relevantAppointments = allAppointments.filter(apt => {
        if (apt.status === 'cancelled') return false;
        if (excludeAppointmentId && apt.appointmentId === excludeAppointmentId) return false;
        return true;
      });

      const slots = generateTimeSlots(
        dayHours.start,
        dayHours.end,
        service.duration,
        service.bufferMinutes != null ? service.bufferMinutes : 15,
        relevantAppointments,
        date
      );

      return Response.json({ availableSlots: slots });
    }

    // Fallback: no slots available
    return Response.json({ availableSlots: [] });
  } catch (error) {
    console.error('Error fetching availability:', error);
    return Response.json({ error: 'Failed to fetch availability' }, { status: 500 });
  }
})

/**
 * Computes time slots for one or more staff members, merging results.
 * Each staff member's available slots are calculated based on their schedule
 * and existing appointments.
 */
async function computeSlotsForStaff(
  staffMembers: any[],
  service: any,
  date: string,
  excludeAppointmentId?: string | null
) {
  const requestedDate = new Date(date + 'T00:00:00');
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][requestedDate.getDay()];
  const allSlots: { time: string; display: string }[] = [];

  for (const staff of staffMembers) {
    // Get this staff member's working hours for the day
    const hours = getStaffWorkingHoursForDay(staff, dayOfWeek, requestedDate);
    if (!hours || !hours.start || !hours.end) continue;

    // Get appointments for this staff member on the requested date
    const staffAppointments = await getStaffAppointments(staff.vendorId, staff.visibleId, date, excludeAppointmentId);

    // Generate time slots
    const slots = generateTimeSlots(
      hours.start,
      hours.end,
      service.duration,
      service.bufferMinutes != null ? service.bufferMinutes : 15,
      staffAppointments,
      date
    );

    allSlots.push(...slots);
  }

  return allSlots;
}

/**
 * Retrieves working hours for a staff member on a specific day,
 * handling recurrence rules.
 */
function getStaffWorkingHoursForDay(staff: any, dayOfWeek: string, requestedDate: Date) {
  if (!staff.schedule) return null;
  const schedule = typeof staff.schedule === 'string' ? JSON.parse(staff.schedule) : staff.schedule;

  // Date-specific overrides take priority over the weekly template
  const overrides = schedule.overrides;
  const dateStr = requestedDate.toISOString().split('T')[0];
  const override = getScheduleOverride(overrides, dateStr);
  if (override !== undefined) {
    // null = explicitly closed for this date; { start, end } = custom hours
    return override ? { start: override.start, end: override.end } : null;
  }

  const daySchedule = schedule[dayOfWeek];
  if (!daySchedule || !daySchedule.start) return null;

  if (daySchedule.recurrence) {
    return getRecurrenceHours(daySchedule, requestedDate);
  }

  return { start: daySchedule.start, end: daySchedule.end };
}

/**
 * Fetches appointments for a specific staff member on a given date.
 * Filters out cancelled appointments and the excluded appointment.
 * Enriches each appointment with the actual service duration for accurate overlap detection.
 */
async function getStaffAppointments(
  vendorId: string,
  staffVisibleId: string,
  date: string,
  excludeAppointmentId?: string | null
) {
  let allAppointments: any[] = [];
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

  const filtered = allAppointments.filter(apt => {
    if (apt.status === 'cancelled') return false;
    if (excludeAppointmentId && apt.appointmentId === excludeAppointmentId) return false;
    // Only include appointments for this specific staff member
    if (apt.staffId && apt.staffId !== staffVisibleId) return false;
    return true;
  });

  // Enrich with actual service duration for overlap detection
  const serviceIds = [...new Set(filtered.map(a => a.serviceId).filter(Boolean))];
  const serviceMap: Record<string, number> = {};
  await Promise.all(serviceIds.map(async (sid) => {
    const { data } = await client.models.Service.get({ serviceId: sid });
    if (data?.duration) serviceMap[sid] = data.duration as number;
  }));

  return enrichAppointmentsWithDbDuration(filtered, serviceMap);
}

/**
 * Injects the CURRENT DB Service.duration into each appointment's customer JSON
 * (as customer.duration) so the slot calculators — which read customer.duration
 * — use the up-to-date duration rather than whatever was stored when the
 * appointment was originally booked. This keeps the availability (show) path's
 * existing-appointment durations aligned with the booking path (which also uses
 * current DB Service.duration via detectOverlap). Blocked-time durations are
 * preserved (never overwritten).
 *
 * @param appointments - Raw appointment records
 * @param serviceMap - Optional precomputed serviceId → duration map; built if omitted
 */
async function enrichAppointmentsWithDbDuration(appointments: any[], serviceMap?: Record<string, number>) {
  let map = serviceMap;
  if (!map) {
    const serviceIds = [...new Set(appointments.map(a => a.serviceId).filter(Boolean))];
    map = {};
    await Promise.all(serviceIds.map(async (sid) => {
      const { data } = await client.models.Service.get({ serviceId: sid });
      if (data?.duration) (map as Record<string, number>)[sid] = data.duration as number;
    }));
  }

  return appointments.map(apt => {
    let customer = apt.customer;
    if (typeof customer === 'string') { try { customer = JSON.parse(customer); } catch { customer = {}; } }
    if (!customer) customer = {};
    // Never overwrite a blocked-time duration — it is authoritative.
    if (customer.isBlockedTime) return apt;
    const duration = (map as Record<string, number>)[apt.serviceId];
    if (duration) {
      customer.duration = duration;
      return { ...apt, customer: JSON.stringify(customer) };
    }
    return apt;
  });
}

/**
 * Sorts time slots in ascending chronological order and removes duplicates.
 * Duplicates are identified by the `time` value (e.g., "09:00").
 */
function deduplicateAndSort(slots: { time: string; display: string }[]): { time: string; display: string }[] {
  // Sort chronologically by time string (HH:MM format sorts naturally)
  const sorted = [...slots].sort((a, b) => a.time.localeCompare(b.time));

  // Remove duplicates based on time value
  const seen = new Set<string>();
  const unique: { time: string; display: string }[] = [];
  for (const slot of sorted) {
    if (!seen.has(slot.time)) {
      seen.add(slot.time);
      unique.push(slot);
    }
  }

  return unique;
}

async function handleMultiProviderAvailability(service: any, date: string, eligibleStaff: any[], allStaff: any[]) {
  const bufferMinutes = service.bufferMinutes != null ? service.bufferMinutes : 15;

  // Map eligible staff to full schedule records for getMultiProviderSlots
  const staffScheduleIds = eligibleStaff.map(s => s.visibleId);
  const staffSchedulePromises = staffScheduleIds.map(staffId =>
    client.models.StaffSchedule.get({ visibleId: staffId } as any)
  );
  const staffScheduleResults = await Promise.all(staffSchedulePromises);

  const staffSchedules = staffScheduleResults
    .filter(result => !result.errors && result.data)
    .map(result => result.data);

  if (staffSchedules.length === 0) {
    return Response.json({ availableSlots: [], message: 'No providers are available for this service' });
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

  const rawAppointments = appointmentResults
    .flatMap(result => (result as any).data || [])
    .filter(apt => apt.status !== 'cancelled' && staffScheduleIds.includes(apt.staffId));

  // Enrich with current DB Service.duration so show-path conflict math matches booking.
  const allAppointments = await enrichAppointmentsWithDbDuration(rawAppointments);

  // Call getMultiProviderSlots
  const slots = getMultiProviderSlots({
    service,
    staffSchedules,
    appointments: allAppointments,
    date,
    bufferMinutes
  });

  // Sort and deduplicate slots
  const sortedUniqueSlots = deduplicateAndSort(slots);

  return Response.json({ availableSlots: sortedUniqueSlots });
}

async function handleQuantityAvailability(service: any, date: string, eligibleStaff: any[], quantity: number, mode: string) {
  const bufferMinutes = service.bufferMinutes != null ? service.bufferMinutes : 15;

  // Enforce maxQuantityPerBooking
  const maxQuantity = service.maxQuantityPerBooking || 1;
  if (quantity > maxQuantity) {
    return Response.json({ error: `Maximum quantity for this service is ${maxQuantity}` }, { status: 400 });
  }

  // Map eligible staff to full schedule records
  const staffScheduleIds = eligibleStaff.map(s => s.visibleId);
  const staffSchedulePromises = staffScheduleIds.map(staffId =>
    client.models.StaffSchedule.get({ visibleId: staffId } as any)
  );
  const staffScheduleResults = await Promise.all(staffSchedulePromises);

  const staffSchedules = staffScheduleResults
    .filter(result => !result.errors && result.data)
    .map(result => result.data);

  if (staffSchedules.length === 0) {
    return Response.json({ availableSlots: [], message: 'No providers are available for this service' });
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

  const rawAppointments = appointmentResults
    .flatMap(result => (result as any).data || [])
    .filter(apt => apt.status !== 'cancelled' && staffScheduleIds.includes(apt.staffId));

  // Enrich with current DB Service.duration so show-path conflict math matches booking.
  const allAppointments = await enrichAppointmentsWithDbDuration(rawAppointments);

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

  // Sort and deduplicate slots
  const sortedUniqueSlots = deduplicateAndSort(slots);

  return Response.json({
    availableSlots: sortedUniqueSlots,
    quantity,
    mode,
    totalDuration: mode === 'parallel'
      ? service.duration
      : (quantity * service.duration) + ((quantity - 1) * bufferMinutes)
  });
}
