/**
 * Shared bundle (multi-select) availability core.
 *
 * This is the SINGLE source of truth for multi-service ("bundle") availability.
 * Both the calendar endpoint (/api/available-dates) and the time-picker endpoint
 * (/api/bundle-availability) call into this module so they can never disagree:
 *
 *   - The time picker calls `computeBundleSlotsForDate(...)` for the selected day.
 *   - The calendar calls `computeBundleAvailableDates(...)`, which evaluates the
 *     SAME per-day computation for each day of the month.
 *
 * The heavy lifting (serial scheduling with buffers + conflict checks) is done by
 * getSequentialBundleSlots. This module only handles data gathering (services,
 * eligible staff per service, resource-type synthesis, and paginated appointment
 * fetching) and shaping — identically for both callers.
 */
import { getSequentialBundleSlots } from './sequentialAvailability.js';

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export interface BundleAvailabilityContext {
  services: any[];
  /** serviceId -> eligible human StaffSchedule[] (resource services excluded here) */
  staffByService: Record<string, any[]>;
  /** serviceId -> resource info for sauna services (null for staff/room services) */
  resourceByService: Record<string, { resourceId: string; vendorId?: string; hoursByDay: any } | null>;
  /** All non-cancelled appointments across relevant vendors for the queried window */
  appointments: any[];
  bufferMinutes: number;
  serviceIds: string[];
}

function dayOfWeekFor(dateStr: string): string {
  return DAY_NAMES[new Date(dateStr + 'T00:00:00').getDay()];
}

/**
 * Gathers all data both endpoints need, ONCE. `client` is an Amplify data client.
 * `datePrefix` scopes the appointment query (e.g. "2026-09" for a month, or a full
 * "2026-09-18" for a single day). Appointment fetching is paginated so blocked-time
 * and later records are never silently dropped.
 */
export async function buildBundleAvailabilityContext(
  client: any,
  services: any[],
  datePrefix: string
): Promise<BundleAvailabilityContext> {
  const serviceIds = services.map(s => s.serviceId);
  const vendorIds = new Set<string>();
  const allStaffIds = new Set<string>();

  for (const service of services) {
    if (service.vendorId) vendorIds.add(service.vendorId);
    const allowed = (service.allowedStaff as string[]) || [];
    allowed.forEach(id => allStaffIds.add(id));
  }

  // Fetch human staff. If any staffed service is "open" (no allowedStaff), we
  // need all staff. Only sauna is staff-less; room and staff both need humans.
  const hasOpenStaff = services.some(
    s => (s.resourceType || 'staff') !== 'sauna' && (!s.allowedStaff || s.allowedStaff.length === 0)
  );

  let staffSchedules: any[] = [];
  if (hasOpenStaff) {
    const { data: allStaff } = await client.models.StaffSchedule.list();
    staffSchedules = (allStaff || []).filter((s: any) => s.isActive !== false);
  } else if (allStaffIds.size > 0) {
    const staffResults = await Promise.all(
      Array.from(allStaffIds).map(id => client.models.StaffSchedule.get({ visibleId: id }))
    );
    staffSchedules = staffResults.filter((r: any) => !r.errors && r.data).map((r: any) => r.data);
  }

  // Exclude staff with an active booking blackout.
  const now = new Date();
  staffSchedules = staffSchedules.filter((s: any) => {
    if (s.bookingDisabledUntil && new Date(s.bookingDisabledUntil) > now) return false;
    return true;
  });
  staffSchedules.forEach((s: any) => {
    if (s.vendorId) vendorIds.add(s.vendorId);
  });

  // Eligible human staff per (staff-based) service.
  const staffByService: Record<string, any[]> = {};
  const resourceByService: Record<string, { resourceId: string; vendorId?: string; hoursByDay: any } | null> = {};
  // Services as the scheduler should see them. For sauna we override allowedStaff
  // to the resource id so the scheduler's allowedStaff eligibility filter matches
  // the synthetic resource-staff we inject (sauna services often list human staff
  // in allowedStaff, which would otherwise exclude the resource).
  const normalizedServices: any[] = [];

  const vendorCache: Record<string, any> = {};
  const getVendor = async (vid?: string) => {
    if (!vid) return null;
    if (!(vid in vendorCache)) {
      const { data } = await client.models.Vendor.get({ vendorId: vid });
      vendorCache[vid] = data || null;
    }
    return vendorCache[vid];
  };

  for (const service of services) {
    const rType = (service.resourceType as string) || 'staff';

    // ONLY sauna is a true staff-less resource (booked against the shared
    // resource-sauna calendar). Everything else — including "room" — is booked
    // against a human staff member (a room service is performed by a stylist in
    // a room; it always needs staff). So only sauna uses the synthesized
    // resource entry; room/staff go through normal staff eligibility below.
    if (rType === 'sauna') {
      const resourceId = 'resource-sauna';
      let resourceVendorId = service.vendorId as string | undefined;
      if (!resourceVendorId) {
        const { data: resourceStaff } = await client.models.StaffSchedule.get({ visibleId: resourceId });
        resourceVendorId = (resourceStaff as any)?.vendorId;
      }
      if (resourceVendorId) vendorIds.add(resourceVendorId);
      const vendor = await getVendor(resourceVendorId);
      const hoursByDay = vendor?.saunaHours ? JSON.parse(vendor.saunaHours as string) : null;
      resourceByService[service.serviceId] = { resourceId, vendorId: resourceVendorId, hoursByDay };
      staffByService[service.serviceId] = []; // sauna uses resourceByService
      // The resource calendar is the provider — make allowedStaff match it.
      normalizedServices.push({ ...service, allowedStaff: [resourceId] });
      continue;
    }

    normalizedServices.push(service);
    resourceByService[service.serviceId] = null;
    const allowed = (service.allowedStaff as string[]) || [];
    if (allowed.length > 0) {
      staffByService[service.serviceId] = staffSchedules.filter(s => allowed.includes(s.visibleId));
    } else {
      staffByService[service.serviceId] = staffSchedules.filter(
        (s: any) => !s.visibleId.startsWith('resource-')
      );
    }
  }

  // Fetch appointments for all relevant vendors, PAGINATED, via the vendorId+dateTime
  // GSI. Pagination matters: a single page can omit blocked-time or later records,
  // which previously made the calendar disagree with the time picker.
  const appointments: any[] = [];
  for (const vid of Array.from(vendorIds)) {
    let nextToken: string | undefined;
    do {
      const result: any = await client.models.Appointment.listAppointmentByVendorIdAndDateTime({
        vendorId: vid,
        dateTime: { beginsWith: datePrefix },
        ...(nextToken ? { nextToken } : {}),
      });
      for (const apt of result.data || []) {
        if (apt.status !== 'cancelled') appointments.push(apt);
      }
      nextToken = result.nextToken;
    } while (nextToken);
  }

  // Buffer from the first service's vendor (fallback 15).
  const firstVendor = await getVendor(services[0]?.vendorId);
  const bufferMinutes = (firstVendor as any)?.bufferMinutes || 15;

  return { services: normalizedServices, staffByService, resourceByService, appointments, bufferMinutes, serviceIds };
}

/**
 * Builds the staffSchedulesByService map for a SPECIFIC day. Sauna services get
 * a synthesized resource-staff entry from that day's sauna hours; all other
 * services (staff and room) use their real eligible staff.
 */
function staffForDay(ctx: BundleAvailabilityContext, dateStr: string): Record<string, any[]> {
  const dow = dayOfWeekFor(dateStr);
  const map: Record<string, any[]> = {};

  for (const service of ctx.services) {
    const resource = ctx.resourceByService[service.serviceId];
    if (resource) {
      const hours = resource.hoursByDay ? resource.hoursByDay[dow] : null;
      map[service.serviceId] = hours && hours.start && hours.end
        ? [{
            visibleId: resource.resourceId,
            vendorId: resource.vendorId,
            isActive: true,
            name: 'Sauna',
            autoAssignRules: null,
            schedule: JSON.stringify({ [dow]: { start: hours.start, end: hours.end } }),
          }]
        : [];
    } else {
      map[service.serviceId] = ctx.staffByService[service.serviceId] || [];
    }
  }
  return map;
}

/**
 * Computes the serial bundle slots for one day. Used directly by the time picker
 * and (for slots.length > 0) by the calendar. This is the single per-day truth.
 */
export function computeBundleSlotsForDate(ctx: BundleAvailabilityContext, dateStr: string) {
  const staffSchedulesByService = staffForDay(ctx, dateStr);
  const dayAppointments = ctx.appointments.filter(
    (apt: any) => apt.dateTime && apt.dateTime.startsWith(dateStr)
  );

  return getSequentialBundleSlots({
    services: ctx.services,
    staffSchedulesByService,
    appointments: dayAppointments,
    startDate: dateStr,
    bufferMinutes: ctx.bufferMinutes,
    serviceOrder: ctx.serviceIds,
    multiDay: false,
    maxDays: 1,
  });
}

/**
 * Computes which days in [firstDay, lastDay] (inclusive) have at least one
 * bookable serial slot. A day is available iff computeBundleSlotsForDate yields
 * slots — the exact condition the time picker enforces on selection.
 */
export function computeBundleAvailableDates(
  ctx: BundleAvailabilityContext,
  firstDay: Date,
  lastDay: Date,
  minDate: Date,
  allowedDays: string[] | null,
  formatDateLocal: (d: Date) => string
): string[] {
  const availableDates: string[] = [];
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    if (d < minDate) continue;
    const dateStr = formatDateLocal(d);
    const dayOfWeek = DAY_NAMES[d.getDay()];
    if (allowedDays && !allowedDays.includes(dayOfWeek)) continue;

    const { slots } = computeBundleSlotsForDate(ctx, dateStr);
    if (slots.length > 0) availableDates.push(dateStr);
  }
  return availableDates;
}
