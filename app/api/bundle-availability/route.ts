import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { getSequentialBundleSlots } from '../../utils/sequentialAvailability.js';
import { checkBookingBlackout, blackoutResponseFields } from '../../utils/bookingBlackout';
import { withErrorLogging } from '@/lib/logger/middleware';

const client = generateServerClientUsingCookies<Schema>({ config, cookies });

/**
 * GET /api/bundle-availability?serviceIds=svc-a,svc-b&date=2026-05-15
 *
 * Returns available start times where ALL services in the bundle
 * can be scheduled sequentially with appropriate staff.
 */
export const GET = withErrorLogging(async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const serviceIdsParam = searchParams.get('serviceIds');
  const date = searchParams.get('date');

  if (!serviceIdsParam || !date) {
    return Response.json({ error: 'serviceIds and date required' }, { status: 400 });
  }

  const serviceIds = serviceIdsParam.split(',');
  const bundleId = searchParams.get('bundleId');

  try {
    // --- Enforce bundle allowedDays constraint (server-side) ---
    if (bundleId) {
      const { data: bundleRecord } = await client.models.Bundle.get({ bundleId } as any);
      if (bundleRecord?.allowedDays && (bundleRecord.allowedDays as string[]).length > 0) {
        const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const requestedDay = DAY_NAMES[new Date(date + 'T00:00:00').getDay()];
        if (!(bundleRecord.allowedDays as string[]).includes(requestedDay)) {
          return Response.json({ availableSlots: [], disallowedDay: true });
        }
      }
    }
    // Fetch all services
    const servicePromises = serviceIds.map(id => client.models.Service.get({ serviceId: id }));
    const serviceResults = await Promise.all(servicePromises);
    const services = serviceResults.filter(r => !r.errors && r.data).map(r => r.data) as any[];

    if (services.length === 0) {
      return Response.json({ availableSlots: [] });
    }

    // --- Check global and vendor-level booking blackouts ---
    const blackout = await checkBookingBlackout(client, services);
    if (blackout.blocked) {
      return Response.json({ availableSlots: [], ...blackoutResponseFields(blackout) });
    }

    // Collect all staff IDs across all services
    const allStaffIds = new Set<string>();
    const vendorIds = new Set<string>();

    for (const service of services) {
      if (service.vendorId) vendorIds.add(service.vendorId);
      const allowed = (service.allowedStaff as string[]) || [];
      if (allowed.length > 0) {
        allowed.forEach(id => allStaffIds.add(id));
      }
    }

    // If any service has allowedStaff: null, fetch all staff from all vendors
    const hasOpenStaff = services.some(s => !s.allowedStaff || s.allowedStaff.length === 0);
    let staffSchedules: any[];

    if (hasOpenStaff) {
      const { data: allStaff } = await client.models.StaffSchedule.list();
      staffSchedules = (allStaff || []).filter((s: any) => s.isActive !== false);
      staffSchedules.forEach((s: any) => {
        allStaffIds.add(s.visibleId);
        if (s.vendorId) vendorIds.add(s.vendorId);
      });
    } else {
      const staffPromises = Array.from(allStaffIds).map(id =>
        client.models.StaffSchedule.get({ visibleId: id } as any)
      );
      const staffResults = await Promise.all(staffPromises);
      staffSchedules = staffResults.filter(r => !r.errors && r.data).map(r => r.data) as any[];
      // Add staff vendorIds so we query their appointments correctly
      staffSchedules.forEach((s: any) => {
        if (s.vendorId) vendorIds.add(s.vendorId);
      });
    }

    // Exclude staff with active booking blackout
    const now = new Date();
    staffSchedules = staffSchedules.filter((s: any) => {
      if (s.bookingDisabledUntil && new Date(s.bookingDisabledUntil) > now) return false;
      return true;
    });

    // Build staffSchedulesByService map
    const staffSchedulesByService: Record<string, any[]> = {};
    for (const service of services) {
      const allowed = (service.allowedStaff as string[]) || [];
      if (allowed.length > 0) {
        staffSchedulesByService[service.serviceId] = staffSchedules.filter(s => allowed.includes(s.visibleId));
      } else {
        // null allowedStaff = all staff eligible (exclude resource calendars)
        staffSchedulesByService[service.serviceId] = staffSchedules.filter(
          (s: any) => !s.visibleId.startsWith('resource-')
        );
      }
    }

    // Fetch existing appointments for all relevant vendors on the date
    const appointmentPromises = Array.from(vendorIds).map(vid =>
      client.models.Appointment.listAppointmentByVendorIdAndDateTime({
        vendorId: vid,
        dateTime: { beginsWith: date }
      } as any)
    );
    const appointmentResults = await Promise.all(appointmentPromises);
    const appointments = appointmentResults
      .flatMap(r => (r as any).data || [])
      .filter((apt: any) => apt.status !== 'cancelled');

    // Determine buffer from first service's vendor
    const { data: firstVendor } = await client.models.Vendor.get({ vendorId: services[0].vendorId });
    const bufferMinutes = (firstVendor as any)?.bufferMinutes || 15;

    // Get sequential bundle slots
    const { slots, suggestedOrder } = getSequentialBundleSlots({
      services,
      staffSchedulesByService,
      appointments,
      startDate: date,
      bufferMinutes,
      serviceOrder: serviceIds,
      multiDay: false,
      maxDays: 1,
    });

    // Convert to the format the time picker expects
    const availableSlots = slots.map((slot: any) => ({
      time: slot.startTime,
      display: formatTime(slot.startTime),
      schedule: slot.schedule, // individual service start/end times
    }));

    return Response.json({ availableSlots, suggestedOrder });
  } catch (error) {
    console.error('Bundle availability error:', error);
    return Response.json({ error: 'Failed to fetch bundle availability' }, { status: 500 });
  }
})

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  let displayHour = h;
  if (h > 12) displayHour = h - 12;
  else if (h === 0) displayHour = 12;
  return `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
}
