import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { DAY_NAMES, getDayHoursSync, resolveStaffSync, hasAnySlot } from '../../utils/availability.js';

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const vendorId = searchParams.get('vendorId');
  const serviceId = searchParams.get('serviceId');
  const month = searchParams.get('month'); // 1-12
  const year = searchParams.get('year');
  const allowedDaysParam = searchParams.get('allowedDays');
  const allowedDays = allowedDaysParam ? allowedDaysParam.split(',') : null;

  if (!vendorId || !serviceId || !month || !year) {
    return Response.json({ error: 'Missing required parameters' }, { status: 400 });
  }

  try {
    const [vendorRes, serviceRes, globalSettingRes] = await Promise.all([
      client.models.Vendor.get({ vendorId }),
      client.models.Service.get({ serviceId }),
      client.models.SiteSettings.get({ settingKey: 'globalBookingDisabledUntil' }),
    ]);

    if (!vendorRes.data || !serviceRes.data) {
      return Response.json({ availableDates: [] });
    }

    const vendor = vendorRes.data;
    const service = serviceRes.data;

    // Check global/vendor blackout
    const globalUntil = globalSettingRes.data?.settingValue;
    if (globalUntil && new Date(globalUntil) > new Date()) {
      return Response.json({ availableDates: [], bookingDisabled: true });
    }
    const vendorUntil = vendor.bookingDisabledUntil as string | null;
    if (vendorUntil && new Date(vendorUntil) > new Date()) {
      return Response.json({ availableDates: [], bookingDisabled: true });
    }

    const isSauna = (service.resourceType || 'staff') === 'sauna';
    const monthNum = Number.parseInt(month);
    const yearNum = Number.parseInt(year);

    // Build date range for the month
    const firstDay = new Date(yearNum, monthNum - 1, 1);
    const lastDay = new Date(yearNum, monthNum, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Minimum bookable date: tomorrow for non-sauna, today for sauna
    const minDate = new Date(today);
    if (!isSauna) minDate.setDate(minDate.getDate() + 1);

    // Pre-fetch staff schedules once
    const { data: staffList } = await client.models.StaffSchedule.listStaffScheduleByVendorId({ vendorId });
    const workingHours = JSON.parse(vendor.workingHours as string || '{}');
    const saunaHours = vendor.saunaHours ? JSON.parse(vendor.saunaHours as string) : null;
    const allowedStaffIds = service.allowedStaff as string[] | null;

    // Pre-fetch all appointments for this month
    const datePrefix = `${yearNum}-${String(monthNum).padStart(2, '0')}`;
    const { data: monthAppointments } = await client.models.Appointment.list({
      filter: { vendorId: { eq: vendorId }, dateTime: { beginsWith: datePrefix } }
    });

    const availableDates = buildAvailableDates(
      firstDay, lastDay, minDate, isSauna, vendor, service,
      { staffList: staffList || [], workingHours, saunaHours, allowedStaffIds, monthAppointments: monthAppointments || [], allowedDays }
    );

    return Response.json({ availableDates });
  } catch (error) {
    console.error('Error fetching available dates:', error);
    return Response.json({ error: 'Failed to fetch available dates' }, { status: 500 });
  }
}

function buildAvailableDates(
  firstDay: Date, lastDay: Date, minDate: Date, isSauna: boolean,
  vendor: any, service: any, ctx: { staffList: any[]; workingHours: any; saunaHours: any; allowedStaffIds: string[] | null; monthAppointments: any[]; allowedDays: string[] | null }
): string[] {
  const { staffList, workingHours, saunaHours, allowedStaffIds, monthAppointments, allowedDays } = ctx;
  const availableDates: string[] = [];

  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    if (d < minDate) continue;
    const dateStr = d.toISOString().split('T')[0];
    const dayOfWeek = DAY_NAMES[d.getDay()];

    // Skip days not in allowedDays
    if (allowedDays && !allowedDays.includes(dayOfWeek)) continue;

    const dayHours = getDayHoursSync(vendor, service, dayOfWeek, d, { staffList, workingHours, saunaHours, allowedStaffIds });
    if (!dayHours?.start) continue;

    const staff = isSauna ? null : resolveStaffSync(staffList, dayOfWeek, d, allowedStaffIds);
    const dayAppointments = monthAppointments.filter(apt =>
      apt.status !== 'cancelled' && apt.dateTime.startsWith(dateStr)
    );

    if (hasAnySlot(dayHours.start, dayHours.end, service.duration, vendor.bufferMinutes || 15, { appointments: dayAppointments, dateStr, date: d, staff })) {
      availableDates.push(dateStr);
    }
  }

  return availableDates;
}
