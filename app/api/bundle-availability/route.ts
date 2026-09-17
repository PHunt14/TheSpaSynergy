import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { buildBundleAvailabilityContext, computeBundleSlotsForDate } from '../../utils/bundleAvailabilityCore';
import { checkBookingBlackout, blackoutResponseFields } from '../../utils/bookingBlackout';
import { withErrorLogging } from '@/lib/logger/middleware';

const client = generateServerClientUsingCookies<Schema>({ config, cookies });

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * GET /api/bundle-availability?serviceIds=svc-a,svc-b&date=2026-05-15
 *
 * Returns available start times where ALL services in the bundle can be
 * scheduled sequentially (back-to-back with buffers) using real, conflict-free
 * staff/resource assignment. Shares its per-day computation with the calendar
 * endpoint via bundleAvailabilityCore so the two can never disagree.
 */
export const GET = withErrorLogging(async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const serviceIdsParam = searchParams.get('serviceIds');
  const date = searchParams.get('date');

  if (!serviceIdsParam || !date) {
    return Response.json({ error: 'serviceIds and date required' }, { status: 400 });
  }

  // Validate date format (YYYY-MM-DD) to avoid building invalid queries/ranges.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: 'Invalid date format (expected YYYY-MM-DD)' }, { status: 400 });
  }

  // Cap the number of services to bound work per request (the UI allows up to 4;
  // this guards the API against abusive/oversized requests, since the scheduler
  // permutes service orderings).
  const serviceIds = serviceIdsParam.split(',').filter(Boolean);
  if (serviceIds.length === 0 || serviceIds.length > 10) {
    return Response.json({ error: 'serviceIds must contain between 1 and 10 services' }, { status: 400 });
  }
  const bundleId = searchParams.get('bundleId');

  try {
    // Enforce bundle allowedDays constraint (server-side).
    if (bundleId) {
      const { data: bundleRecord } = await client.models.Bundle.get({ bundleId } as any);
      if (bundleRecord?.allowedDays && (bundleRecord.allowedDays as string[]).length > 0) {
        const requestedDay = DAY_NAMES[new Date(date + 'T00:00:00').getDay()];
        if (!(bundleRecord.allowedDays as string[]).includes(requestedDay)) {
          return Response.json({ availableSlots: [], disallowedDay: true });
        }
      }
    }

    // Fetch services (preserve requested order).
    const serviceResults = await Promise.all(
      serviceIds.map(id => client.models.Service.get({ serviceId: id }))
    );
    const services = serviceResults
      .filter(r => !r.errors && r.data)
      .map(r => r.data) as any[];

    if (services.length === 0) {
      return Response.json({ availableSlots: [] });
    }

    // Global / vendor-level booking blackouts.
    const blackout = await checkBookingBlackout(client, services);
    if (blackout.blocked) {
      return Response.json({ availableSlots: [], ...blackoutResponseFields(blackout) });
    }

    // Shared availability context, scoped to just this date.
    const ctx = await buildBundleAvailabilityContext(client, services, date);
    const { slots, suggestedOrder } = computeBundleSlotsForDate(ctx, date);

    const availableSlots = slots.map((slot: any) => ({
      time: slot.startTime,
      display: formatTime(slot.startTime),
      schedule: slot.schedule,
    }));

    return Response.json({ availableSlots, suggestedOrder });
  } catch (error) {
    console.error('Bundle availability error:', error);
    return Response.json({ error: 'Failed to fetch bundle availability' }, { status: 500 });
  }
});

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  let displayHour = h;
  if (h > 12) displayHour = h - 12;
  else if (h === 0) displayHour = 12;
  return `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
}
