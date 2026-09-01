import { client } from '@/lib/auth';
import { withErrorLogging } from '@/lib/logger/middleware';
import { isSquareRecordChargeable, squareRecordNeedsReconnect } from '@/lib/square/core.js';
import { validateSquareServerConfig } from '@/lib/square/config.js';

/**
 * Authoritative Square connection status for the kiosk.
 *
 * The kiosk previously resolved "connected vs disconnected" by scanning
 * several endpoints on the client and requiring an exact match on
 * `squareOAuthStatus === 'connected'`. That was fragile: reconnect writes
 * the token to a StaffSchedule record, but the client's fast-path read the
 * Vendor record (which never has a location), and any network hiccup left
 * the resolver silently hanging — so the kiosk showed "not connected" even
 * when Square was fully connected.
 *
 * This endpoint centralizes the decision on the server. It checks, in order:
 *   1. The specific staff member assigned to the appointment (by visibleId)
 *   2. Any active, connected staff member on the vendor
 *   3. The vendor record itself
 * It is READ-ONLY (no token refresh / no writes — see usableRecord) so it is
 * safe to expose publicly, and always returns a definitive result the kiosk
 * can act on. Token refresh happens on the authenticated payment path.
 *
 * Query params (any combination):
 *   - staffId:  StaffSchedule.visibleId of the assigned provider (preferred)
 *   - vendorId: Vendor.vendorId
 *
 * Response: { connected: boolean, locationId: string | null, reason: string, source: string | null }
 */

type StatusResult = {
  connected: boolean;
  locationId: string | null;
  reason: string;
  source: 'staff' | 'vendor' | null;
};

// usableRecord / recordNeedsReconnect delegate to the shared, unit-tested
// predicates in lib/square/core.js so the kiosk status gate stays in lockstep
// with what the payment path can actually charge. See isSquareRecordChargeable
// for the rationale (expired-but-refreshable tokens are still chargeable because
// the authenticated payment path refreshes them just-in-time).
//
// This endpoint is READ-ONLY and intentionally does NOT refresh tokens: it is
// public (called by the kiosk before payment), so a side-effecting OAuth refresh
// + DB write inside a GET would let anonymous callers drive outbound Square
// traffic and writes. The refresh belongs on the authenticated payment path.
function usableRecord(rec: any): boolean {
  return isSquareRecordChargeable(rec);
}

function recordNeedsReconnect(rec: any): boolean {
  return squareRecordNeedsReconnect(rec);
}

async function resolveStatus(vendorId: string | null, staffId: string | null): Promise<StatusResult> {
  // Track whether we saw a record that has credentials but genuinely needs a
  // reconnect (error status, or expired with no refresh token). If nothing is
  // usable, we prefer the accurate "needs_reconnect" message over the
  // misleading "not_connected" when such a record exists.
  let sawNeedsReconnect: 'staff' | 'vendor' | null = null;

  // 1) Assigned staff member (preferred — payment routes to this provider).
  if (staffId) {
    try {
      const { data: staff } = await client.models.StaffSchedule.get({ visibleId: staffId } as any);
      if (staff) {
        if (usableRecord(staff)) {
          return { connected: true, locationId: staff.squareLocationId, reason: 'ok', source: 'staff' };
        }
        if (staff.squareOAuthStatus === 'error' || recordNeedsReconnect(staff)) {
          sawNeedsReconnect = 'staff';
        }
      }
    } catch (err) {
      console.error('Square status: staff lookup failed for', staffId, err);
    }
  }

  // 2) Any active, connected staff member on the vendor.
  if (vendorId) {
    try {
      const { data: staffList } = await (client.models as any).StaffSchedule.listStaffScheduleByVendorId({ vendorId });
      const candidates = (staffList || []).filter((s: any) => s.isActive !== false && s.squareOAuthStatus !== 'error');
      for (const candidate of candidates) {
        if (usableRecord(candidate)) {
          return { connected: true, locationId: candidate.squareLocationId, reason: 'ok', source: 'staff' };
        }
        if (recordNeedsReconnect(candidate)) {
          sawNeedsReconnect = sawNeedsReconnect || 'staff';
        }
      }
    } catch (err) {
      console.error('Square status: vendor staff scan failed for', vendorId, err);
    }

    // 3) Vendor record fallback.
    try {
      const { data: vendor } = await client.models.Vendor.get({ vendorId });
      if (vendor) {
        if (usableRecord(vendor)) {
          return { connected: true, locationId: vendor.squareLocationId, reason: 'ok', source: 'vendor' };
        }
        if (vendor.squareOAuthStatus === 'error' || recordNeedsReconnect(vendor)) {
          sawNeedsReconnect = sawNeedsReconnect || 'vendor';
        }
      }
    } catch (err) {
      console.error('Square status: vendor lookup failed for', vendorId, err);
    }
  }

  if (sawNeedsReconnect) {
    return { connected: false, locationId: null, reason: 'needs_reconnect', source: sawNeedsReconnect };
  }

  return { connected: false, locationId: null, reason: 'not_connected', source: null };
}

export const GET = withErrorLogging(async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const vendorId = searchParams.get('vendorId');
  const staffId = searchParams.get('staffId');

  if (!vendorId && !staffId) {
    return Response.json(
      { connected: false, locationId: null, reason: 'missing_params', source: null },
      { status: 400 }
    );
  }

  // Fail loudly on a fundamental misconfiguration (missing app id or an
  // environment mismatch). This is more fundamental than any per-vendor
  // connection state, so we report it before touching the database.
  const cfg = validateSquareServerConfig({
    appId: process.env.SQUARE_APPLICATION_ID || process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID,
    environment: process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT,
  });
  if (!cfg.ok) {
    // Log the specific misconfiguration server-side for operators, but do NOT
    // return env-var names / config details to this public endpoint's callers.
    console.error(`Square status: server config error [${cfg.code}]: ${cfg.message}`);
    return Response.json(
      {
        connected: false,
        locationId: null,
        reason: 'config_error',
        detail: 'Card payments are temporarily unavailable due to a configuration issue.',
        source: null,
      },
      { status: 500 }
    );
  }

  const result = await resolveStatus(vendorId, staffId);
  return Response.json(result);
});
