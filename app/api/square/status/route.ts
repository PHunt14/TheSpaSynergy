import { client } from '@/lib/auth';
import { withErrorLogging } from '@/lib/logger/middleware';
import { refreshSquareToken, isTokenExpiringSoon } from '@/lib/square-token.js';
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
 * It proactively refreshes tokens that are expiring soon, and always returns
 * a definitive result the kiosk can act on.
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

function usableRecord(rec: any): boolean {
  // A record is usable if it has a location, a token, and is not in an error state.
  return Boolean(
    rec &&
    rec.squareLocationId &&
    rec.squareAccessToken &&
    rec.squareOAuthStatus !== 'error' &&
    rec.squareOAuthStatus !== 'disconnected'
  );
}

async function refreshIfNeeded(staff: any): Promise<any> {
  // Refresh proactively when the token is expiring within 1 day.
  if (staff?.squareRefreshToken && isTokenExpiringSoon(staff.squareTokenExpiresAt, 1)) {
    try {
      const ok = await refreshSquareToken(staff.visibleId);
      if (ok) {
        const { data: refreshed } = await client.models.StaffSchedule.get({ visibleId: staff.visibleId } as any);
        return refreshed || staff;
      }
    } catch (err) {
      console.error('Square status: token refresh failed for', staff.visibleId, err);
    }
  }
  return staff;
}

async function resolveStatus(vendorId: string | null, staffId: string | null): Promise<StatusResult> {
  // 1) Assigned staff member (preferred — payment routes to this provider).
  if (staffId) {
    try {
      const { data: staff } = await client.models.StaffSchedule.get({ visibleId: staffId } as any);
      if (staff) {
        if (staff.squareOAuthStatus === 'error') {
          return { connected: false, locationId: null, reason: 'needs_reconnect', source: 'staff' };
        }
        const fresh = await refreshIfNeeded(staff);
        if (usableRecord(fresh)) {
          return { connected: true, locationId: fresh.squareLocationId, reason: 'ok', source: 'staff' };
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
        const fresh = await refreshIfNeeded(candidate);
        if (usableRecord(fresh)) {
          return { connected: true, locationId: fresh.squareLocationId, reason: 'ok', source: 'staff' };
        }
      }
    } catch (err) {
      console.error('Square status: vendor staff scan failed for', vendorId, err);
    }

    // 3) Vendor record fallback.
    try {
      const { data: vendor } = await client.models.Vendor.get({ vendorId });
      if (vendor) {
        if (vendor.squareOAuthStatus === 'error') {
          return { connected: false, locationId: null, reason: 'needs_reconnect', source: 'vendor' };
        }
        if (usableRecord(vendor)) {
          return { connected: true, locationId: vendor.squareLocationId, reason: 'ok', source: 'vendor' };
        }
      }
    } catch (err) {
      console.error('Square status: vendor lookup failed for', vendorId, err);
    }
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
    console.error(`Square status: server config error [${cfg.code}]: ${cfg.message}`);
    return Response.json(
      { connected: false, locationId: null, reason: 'config_error', configCode: cfg.code, detail: cfg.message, source: null },
      { status: 500 }
    );
  }

  const result = await resolveStatus(vendorId, staffId);
  return Response.json(result);
});
