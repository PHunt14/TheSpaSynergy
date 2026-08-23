import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { DAY_NAMES, getDayHoursSync, resolveStaffSync, hasAnySlot, getRecurrenceHours } from '../../utils/availability.js';
import { getEligibleStaff } from '../../utils/staffEligibility';

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const vendorId = searchParams.get('vendorId');
  const serviceId = searchParams.get('serviceId');
  const serviceIdsParam = searchParams.get('serviceIds'); // comma-separated, for bundle availability
  const staffIdParam = searchParams.get('staffId');
  const month = searchParams.get('month'); // 1-12
  const year = searchParams.get('year');
  const allowedDaysParam = searchParams.get('allowedDays');
  const allowedDays = allowedDaysParam ? allowedDaysParam.split(',') : null;

  // serviceId (or serviceIds for bundles), month, year are required; vendorId is optional in unified flow
  if ((!serviceId && !serviceIdsParam) || !month || !year) {
    return Response.json({ error: 'Missing required parameters: serviceId (or serviceIds), month, year' }, { status: 400 });
  }

  // Bundle multi-service path: check all services have staff availability
  if (serviceIdsParam) {
    return handleBundleAvailableDates(serviceIdsParam.split(','), month, year, allowedDays);
  }

  try {
    const [serviceRes, globalSettingRes] = await Promise.all([
      client.models.Service.get({ serviceId: serviceId! }),
      client.models.SiteSettings.get({ settingKey: 'globalBookingDisabledUntil' }),
    ]);

    if (!serviceRes.data) {
      return Response.json({ availableDates: [] });
    }

    const service = serviceRes.data;

    // Check global booking blackout
    const globalUntil = globalSettingRes.data?.settingValue;
    if (globalUntil && new Date(globalUntil) > new Date()) {
      return Response.json({ availableDates: [], bookingDisabled: true });
    }

    // If vendorId is provided (legacy flow or vendor-specific), check vendor blackout
    let vendor: any = null;
    if (vendorId) {
      const vendorRes = await client.models.Vendor.get({ vendorId });
      vendor = vendorRes.data;
      if (vendor) {
        const vendorUntil = vendor.bookingDisabledUntil as string | null;
        if (vendorUntil && new Date(vendorUntil) > new Date()) {
          return Response.json({ availableDates: [], bookingDisabled: true });
        }
      }
    }

    const isSauna = (service.resourceType || 'staff') === 'sauna';
    const isRoom = (service.resourceType || 'staff') === 'room';
    const monthNum = Number.parseInt(month);
    const yearNum = Number.parseInt(year);

    // Build date range for the month
    const firstDay = new Date(yearNum, monthNum - 1, 1);
    const lastDay = new Date(yearNum, monthNum, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Minimum bookable date: tomorrow for non-sauna/non-room, today for sauna/room
    const minDate = new Date(today);
    if (!isSauna && !isRoom) minDate.setDate(minDate.getDate() + 1);

    // ─── Unified flow (no vendorId): resolve staff via eligibility ───
    if (!vendorId) {
      const { data: allStaffData } = await client.models.StaffSchedule.list();
      const allStaff = (allStaffData || []) as any[];

      let eligibleStaff = getEligibleStaff(
        { serviceId: service.serviceId, name: service.name, allowedStaff: service.allowedStaff as string[] | null },
        allStaff.map((s: any) => ({
          visibleId: s.visibleId,
          staffName: s.staffName,
          vendorId: s.vendorId,
          isActive: s.isActive !== false,
          schedule: s.schedule,
          autoAssignRules: s.autoAssignRules,
          bookingDisabledUntil: s.bookingDisabledUntil,
        }))
      ).filter((staff: any) => {
        // Exclude staff with active booking blackout
        const disabledUntil = staff.bookingDisabledUntil;
        if (disabledUntil && new Date(disabledUntil) > new Date()) return false;
        return true;
      });

      // If specific staffId requested, narrow to that one
      if (staffIdParam) {
        eligibleStaff = eligibleStaff.filter(s => s.visibleId === staffIdParam);
      }

      if (eligibleStaff.length === 0) {
        return Response.json({ availableDates: [] });
      }

      // For sauna/room, delegate to legacy path with the house vendor
      if (isSauna || isRoom) {
        // Find the house vendor (or first vendor with sauna/room hours)
        const { data: allVendors } = await client.models.Vendor.list();
        const houseVendor = (allVendors || []).find((v: any) => v.isHouse) || (allVendors || [])[0];
        if (!houseVendor) return Response.json({ availableDates: [] });

        return handleLegacyFlow(houseVendor, service, isSauna, isRoom, monthNum, yearNum, firstDay, lastDay, minDate, allowedDays);
      }

      // Fetch appointments across all vendors that the eligible staff belong to
      const vendorIds = [...new Set(eligibleStaff.map(s => s.vendorId).filter(Boolean))];
      const datePrefix = `${yearNum}-${String(monthNum).padStart(2, '0')}`;
      const aptPromises = vendorIds.map(vid =>
        client.models.Appointment.list({ filter: { vendorId: { eq: vid }, dateTime: { beginsWith: datePrefix } } })
      );
      const aptResults = await Promise.all(aptPromises);
      const monthAppointments = aptResults.flatMap(r => r.data || []);

      // Build available dates using eligible staff schedules
      const availableDates = buildAvailableDatesUnified(
        firstDay, lastDay, minDate, service, eligibleStaff, monthAppointments, allowedDays
      );

      return Response.json({ availableDates });
    }

    // ─── Legacy flow (vendorId provided) ───
    if (!vendor) {
      return Response.json({ availableDates: [] });
    }

    return handleLegacyFlow(vendor, service, isSauna, isRoom, monthNum, yearNum, firstDay, lastDay, minDate, allowedDays);
  } catch (error) {
    console.error('Error fetching available dates:', error);
    return Response.json({ error: 'Failed to fetch available dates' }, { status: 500 });
  }
}

/**
 * Unified flow: determine available dates based on eligible staff schedules.
 * A date is available if at least one eligible staff member is working AND
 * has at least one open slot.
 */
function buildAvailableDatesUnified(
  firstDay: Date, lastDay: Date, minDate: Date,
  service: any, eligibleStaff: any[], monthAppointments: any[],
  allowedDays: string[] | null
): string[] {
  const availableDates: string[] = [];
  const duration = service.duration;
  const buffer = service.bufferMinutes != null ? service.bufferMinutes : 15;

  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    if (d < minDate) continue;
    const dateStr = d.toISOString().split('T')[0];
    const dayOfWeek = DAY_NAMES[d.getDay()];

    if (allowedDays && !allowedDays.includes(dayOfWeek)) continue;

    // Check if ANY eligible staff member has availability on this day
    let dayAvailable = false;
    for (const staff of eligibleStaff) {
      const hours = getStaffHoursForDay(staff, dayOfWeek, d);
      if (!hours || !hours.start || !hours.end) continue;

      // Get appointments for this staff member on this day
      const staffDayAppointments = monthAppointments.filter(apt =>
        apt.status !== 'cancelled' &&
        apt.dateTime.startsWith(dateStr) &&
        apt.staffId === staff.visibleId
      );

      if (hasAnySlot(hours.start, hours.end, duration, buffer, { appointments: staffDayAppointments, dateStr, date: d, staff })) {
        dayAvailable = true;
        break; // At least one staff member has a slot — day is available
      }
    }

    if (dayAvailable) {
      availableDates.push(dateStr);
    }
  }

  return availableDates;
}

/**
 * Get working hours for a staff member on a specific day, handling recurrence.
 */
function getStaffHoursForDay(staff: any, dayOfWeek: string, requestedDate: Date) {
  if (!staff.schedule) return null;
  const schedule = typeof staff.schedule === 'string' ? JSON.parse(staff.schedule) : staff.schedule;
  const daySchedule = schedule[dayOfWeek];
  if (!daySchedule || !daySchedule.start) return null;

  if (daySchedule.recurrence) {
    return getRecurrenceHours(daySchedule, requestedDate);
  }

  return { start: daySchedule.start, end: daySchedule.end };
}

/**
 * Legacy flow: vendor-centric available dates computation.
 */
async function handleLegacyFlow(
  vendor: any, service: any, isSauna: boolean, isRoom: boolean,
  monthNum: number, yearNum: number, firstDay: Date, lastDay: Date, minDate: Date,
  allowedDays: string[] | null
) {
  const vendorId = vendor.vendorId;

  // Pre-fetch staff schedules for this vendor
  const { data: staffList } = await client.models.StaffSchedule.listStaffScheduleByVendorId({ vendorId });
  const workingHours = JSON.parse(vendor.workingHours as string || '{}');
  const saunaHours = vendor.saunaHours ? JSON.parse(vendor.saunaHours as string) : null;
  const spaRoomHours = vendor.spaRoomHours ? JSON.parse(vendor.spaRoomHours as string) : null;
  const allowedStaffIds = service.allowedStaff as string[] | null;

  // Pre-fetch appointments for this month
  const datePrefix = `${yearNum}-${String(monthNum).padStart(2, '0')}`;
  let monthAppointments: any[];
  if (isRoom) {
    const { data: allVendors } = await client.models.Vendor.list();
    const aptPromises = (allVendors || []).map(v =>
      client.models.Appointment.list({ filter: { vendorId: { eq: v.vendorId }, dateTime: { beginsWith: datePrefix } } })
    );
    const aptResults = await Promise.all(aptPromises);
    monthAppointments = aptResults.flatMap(r => r.data || []);
  } else {
    const { data: vendorAppointments } = await client.models.Appointment.list({
      filter: { vendorId: { eq: vendorId }, dateTime: { beginsWith: datePrefix } }
    });
    monthAppointments = vendorAppointments || [];
  }

  const availableDates = buildAvailableDatesLegacy(
    firstDay, lastDay, minDate, isSauna, isRoom, vendor, service,
    { staffList: staffList || [], workingHours, saunaHours, spaRoomHours, allowedStaffIds, monthAppointments, allowedDays }
  );

  return Response.json({ availableDates });
}

function buildAvailableDatesLegacy(
  firstDay: Date, lastDay: Date, minDate: Date, isSauna: boolean, isRoom: boolean,
  vendor: any, service: any, ctx: { staffList: any[]; workingHours: any; saunaHours: any; spaRoomHours: any; allowedStaffIds: string[] | null; monthAppointments: any[]; allowedDays: string[] | null }
): string[] {
  const { staffList, workingHours, saunaHours, spaRoomHours, allowedStaffIds, monthAppointments, allowedDays } = ctx;
  const availableDates: string[] = [];

  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    if (d < minDate) continue;
    const dateStr = d.toISOString().split('T')[0];
    const dayOfWeek = DAY_NAMES[d.getDay()];

    if (allowedDays && !allowedDays.includes(dayOfWeek)) continue;

    const dayHours = getDayHoursSync(vendor, service, dayOfWeek, d, { staffList, workingHours, saunaHours, spaRoomHours, allowedStaffIds });
    if (!dayHours?.start) continue;

    const staff = (isSauna || isRoom) ? null : resolveStaffSync(staffList, dayOfWeek, d, allowedStaffIds);
    const dayAppointments = monthAppointments.filter(apt =>
      apt.status !== 'cancelled' && apt.dateTime.startsWith(dateStr)
    );

    if (hasAnySlot(dayHours.start, dayHours.end, service.duration, service.bufferMinutes != null ? service.bufferMinutes : (vendor.bufferMinutes || 15), { appointments: dayAppointments, dateStr, date: d, staff })) {
      availableDates.push(dateStr);
    }
  }

  return availableDates;
}

/**
 * Bundle available dates: checks that ALL services have at least one eligible
 * staff member working on each day. This prevents days from showing as green
 * when only some services can be scheduled.
 */
async function handleBundleAvailableDates(
  serviceIds: string[],
  month: string,
  year: string,
  allowedDays: string[] | null
) {
  try {
    const monthNum = Number.parseInt(month);
    const yearNum = Number.parseInt(year);

    // Fetch all services
    const servicePromises = serviceIds.map(id => client.models.Service.get({ serviceId: id }));
    const serviceResults = await Promise.all(servicePromises);
    const services = serviceResults.filter(r => r.data).map(r => r.data!) as any[];

    if (services.length === 0) {
      return Response.json({ availableDates: [] });
    }

    // Check global booking blackout
    const { data: globalSetting } = await client.models.SiteSettings.get({ settingKey: 'globalBookingDisabledUntil' });
    const globalUntil = globalSetting?.settingValue;
    if (globalUntil && new Date(globalUntil as string) > new Date()) {
      return Response.json({ availableDates: [], bookingDisabled: true });
    }

    // Fetch all staff schedules
    const { data: allStaffData } = await client.models.StaffSchedule.list();
    const allStaff = ((allStaffData || []) as any[]).filter((s: any) => s.isActive !== false);

    // Exclude staff with active booking blackout
    const now = new Date();
    const activeStaff = allStaff.filter((s: any) => {
      if (s.bookingDisabledUntil && new Date(s.bookingDisabledUntil) > now) return false;
      return true;
    });

    // Build eligible staff per service
    const staffByService: Record<string, any[]> = {};
    for (const service of services) {
      const allowed = (service.allowedStaff as string[] | null) || [];
      if (allowed.length > 0) {
        staffByService[service.serviceId] = activeStaff.filter(s => allowed.includes(s.visibleId));
      } else {
        // All Staff — exclude resource calendars
        staffByService[service.serviceId] = activeStaff.filter(s => !s.visibleId.startsWith('resource-'));
      }
    }

    // Build date range
    const firstDay = new Date(yearNum, monthNum - 1, 1);
    const lastDay = new Date(yearNum, monthNum, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minDate = new Date(today);
    minDate.setDate(minDate.getDate() + 1); // Bundle services are staff-based, require booking tomorrow+

    const availableDates: string[] = [];

    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
      if (d < minDate) continue;
      const dateStr = d.toISOString().split('T')[0];
      const dayOfWeek = DAY_NAMES[d.getDay()];

      if (allowedDays && !allowedDays.includes(dayOfWeek)) continue;

      // Check that EVERY service has at least one eligible staff working this day
      let allServicesHaveStaff = true;
      for (const service of services) {
        const eligibleStaff = staffByService[service.serviceId] || [];
        const hasWorkingStaff = eligibleStaff.some(staff => {
          const hours = getStaffHoursForDay(staff, dayOfWeek, d);
          return hours && hours.start && hours.end;
        });
        if (!hasWorkingStaff) {
          allServicesHaveStaff = false;
          break;
        }
      }

      if (allServicesHaveStaff) {
        availableDates.push(dateStr);
      }
    }

    return Response.json({ availableDates });
  } catch (error) {
    console.error('Error fetching bundle available dates:', error);
    return Response.json({ error: 'Failed to fetch available dates' }, { status: 500 });
  }
}
