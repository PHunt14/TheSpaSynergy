import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../../amplify/data/resource';
import config from '../../../../amplify_outputs.json' with { type: 'json' };
import { getSequentialBundleSlots, calculateTotalBundleDuration } from '../../../utils/sequentialAvailability.js';
import { validateBundleServices } from '../../../utils/bundleDiscount.js';

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

/**
 * Collects all unique staff IDs from the allowedStaff arrays of the given services.
 */
function collectAllStaffIds(services: any[]): Set<string> {
  const staffIds = new Set<string>();
  for (const service of services) {
    const allowedStaff = (service.allowedStaff as string[]) || [];
    for (const staffId of allowedStaff) {
      staffIds.add(staffId);
    }
  }
  return staffIds;
}

/**
 * Builds a map of serviceId → eligible StaffSchedule[] from the fetched staff schedules.
 */
function buildStaffSchedulesByService(services: any[], staffSchedules: any[]): Record<string, any[]> {
  const map: Record<string, any[]> = {};
  for (const service of services) {
    const allowedStaff = (service.allowedStaff as string[]) || [];
    map[service.serviceId] = staffSchedules.filter(
      (staff: any) => allowedStaff.includes(staff.visibleId)
    );
  }
  return map;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const serviceIdsParam = searchParams.get('serviceIds');
  const date = searchParams.get('date');
  const orderParam = searchParams.get('order');
  const multiDayParam = searchParams.get('multiDay');

  if (!serviceIdsParam || !date) {
    return Response.json({ error: 'Missing required parameters: serviceIds and date' }, { status: 400 });
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
  }

  const serviceIds = serviceIdsParam.split(',').map(id => id.trim()).filter(Boolean);
  const serviceOrder = orderParam ? orderParam.split(',').map(id => id.trim()).filter(Boolean) : null;
  const multiDay = multiDayParam === 'true';

  if (serviceIds.length < 2) {
    return Response.json({ error: 'At least 2 service IDs are required' }, { status: 400 });
  }

  if (serviceIds.length > 10) {
    return Response.json({ error: 'Maximum 10 services per bundle' }, { status: 400 });
  }

  try {
    // Fetch all services by ID
    const servicePromises = serviceIds.map(serviceId =>
      client.models.Service.get({ serviceId })
    );
    const serviceResults = await Promise.all(servicePromises);

    const services: any[] = [];
    for (let i = 0; i < serviceResults.length; i++) {
      const result = serviceResults[i];
      if (result.errors || !result.data) {
        return Response.json(
          { error: `Service not found: ${serviceIds[i]}` },
          { status: 404 }
        );
      }
      services.push(result.data);
    }

    // Validate bundle constraints (2+ vendors, max 10 services, all active)
    const validation = validateBundleServices(services);
    if (!validation.valid) {
      return Response.json({ error: validation.error }, { status: 400 });
    }

    // --- Check global booking blackout ---
    const { data: globalSetting } = await client.models.SiteSettings.get({ settingKey: 'globalBookingDisabledUntil' });
    const globalUntil = globalSetting?.settingValue;
    if (globalUntil && new Date(globalUntil) > new Date()) {
      return Response.json({ slots: [], suggestedOrder: serviceIds, totalDuration: 0, bookingDisabled: true, disabledUntil: globalUntil });
    }

    // --- Check vendor-level booking blackouts ---
    const uniqueVendorIdsForBlackout = [...new Set(services.map((s: any) => s.vendorId))] as string[];
    const vendorBlackoutPromises = uniqueVendorIdsForBlackout.map(vid => client.models.Vendor.get({ vendorId: vid }));
    const vendorBlackoutResults = await Promise.all(vendorBlackoutPromises);

    const disabledVendors: string[] = [];
    for (const vr of vendorBlackoutResults) {
      if (vr.data) {
        const vendorUntil = vr.data.bookingDisabledUntil as string | null;
        if (vendorUntil && new Date(vendorUntil) > new Date()) {
          disabledVendors.push(vr.data.name || vr.data.vendorId);
        }
      }
    }
    if (disabledVendors.length > 0) {
      return Response.json({
        slots: [],
        suggestedOrder: serviceIds,
        totalDuration: 0,
        bookingDisabled: true,
        disabledVendors,
        error: `Booking is temporarily disabled for: ${disabledVendors.join(', ')}`
      });
    }

    // Determine buffer minutes from the first service's vendor (or default 15)
    const firstVendorId = services[0].vendorId;
    const { data: firstVendor } = await client.models.Vendor.get({ vendorId: firstVendorId });
    const bufferMinutes = firstVendor?.bufferMinutes || 15;

    // Collect all unique staff IDs across all services
    const allStaffIds = collectAllStaffIds(services);

    if (allStaffIds.size === 0) {
      return Response.json({ slots: [], suggestedOrder: serviceIds, totalDuration: 0 });
    }

    // Fetch staff schedules for all relevant staff
    const staffPromises = Array.from(allStaffIds).map(staffId =>
      client.models.StaffSchedule.get({ visibleId: staffId } as any)
    );
    const staffResults = await Promise.all(staffPromises);

    const staffSchedules = staffResults
      .filter(result => !result.errors && result.data)
      .map(result => result.data);

    // Build staffSchedulesByService map: serviceId → eligible StaffSchedule[]
    const staffSchedulesByService = buildStaffSchedulesByService(services, staffSchedules);

    // Fetch existing appointments for relevant staff on the date
    // Get unique vendor IDs from staff schedules to query appointments
    const vendorIds = [...new Set(staffSchedules.map((s: any) => s.vendorId).filter(Boolean))];

    const appointmentPromises = vendorIds.map(vendorId =>
      client.models.Appointment.list({
        filter: {
          vendorId: { eq: vendorId },
          dateTime: { beginsWith: date }
        }
      })
    );
    const appointmentResults = await Promise.all(appointmentPromises);

    const allAppointments = appointmentResults
      .flatMap(result => result.data || [])
      .filter(apt => apt.status !== 'cancelled' && apt.staffId && allStaffIds.has(apt.staffId));

    // Call getSequentialBundleSlots to compute available start times
    const result = getSequentialBundleSlots({
      services: services.map(s => ({
        serviceId: s.serviceId,
        duration: s.duration,
        allowedStaff: (s.allowedStaff as string[]) || [],
        providersRequired: s.providersRequired || 1,
        vendorId: s.vendorId
      })),
      staffSchedulesByService,
      appointments: allAppointments,
      startDate: date,
      bufferMinutes,
      serviceOrder,
      multiDay,
      maxDays: multiDay ? 3 : 1
    });

    const totalDuration = calculateTotalBundleDuration(
      services.map(s => ({ duration: s.duration })),
      bufferMinutes
    );

    return Response.json({
      slots: result.slots,
      suggestedOrder: result.suggestedOrder,
      totalDuration
    });
  } catch (error) {
    console.error('Error fetching sequential availability:', error);
    return Response.json({ error: 'Failed to fetch availability' }, { status: 500 });
  }
}
