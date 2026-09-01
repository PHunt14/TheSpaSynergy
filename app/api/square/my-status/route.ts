import { client, getCurrentUser } from '@/lib/auth';
import { withErrorLogging } from '@/lib/logger/middleware';
import { squareRecordNeedsReconnect, isSquareRecordChargeable } from '@/lib/square/core.js';

/**
 * Per-user Square connection status for the signed-in staff member.
 *
 * Used by the dashboard login gate to warn a staff member when their own Square
 * account needs to be reconnected (token in 'error' state, or an expired access
 * token with no refresh token to recover it). This mirrors the exact predicate
 * used by the kiosk status endpoint (squareRecordNeedsReconnect) so the warning
 * only fires when card payments to this person would actually fail.
 *
 * Authenticated. The caller may pass ?email= to identify which staff record on
 * their vendor is theirs (a vendor can have multiple staff). The lookup is
 * scoped to the caller's own vendor, and no token values are ever returned.
 *
 * Response: {
 *   found: boolean,
 *   staffName: string | null,
 *   connected: boolean,      // chargeable now (or refreshable at charge time)
 *   needsReconnect: boolean, // has creds but must reconnect manually
 *   reason: 'ok' | 'needs_reconnect' | 'not_connected'
 * }
 */
export const GET = withErrorLogging(async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const email = (searchParams.get('email') || '').toLowerCase();

  const vendorId = currentUser.vendorId;
  if (!vendorId) {
    // No vendor scope (e.g. admin without a vendorId) — nothing to warn about here.
    return Response.json({ found: false, staffName: null, connected: false, needsReconnect: false, reason: 'not_connected' });
  }

  try {
    const { data: staffList } = await (client.models as any).StaffSchedule.listStaffScheduleByVendorId({ vendorId });
    const list = staffList || [];

    // Prefer the record matching the caller's email; otherwise, if the vendor has
    // exactly one staff record, use it.
    let staff = email
      ? list.find((s: any) => (s.staffEmail || '').toLowerCase() === email)
      : null;
    if (!staff && list.length === 1) staff = list[0];

    if (!staff) {
      return Response.json({ found: false, staffName: null, connected: false, needsReconnect: false, reason: 'not_connected' });
    }

    const needsReconnect = squareRecordNeedsReconnect(staff);
    const connected = isSquareRecordChargeable(staff);
    const reason = connected ? 'ok' : needsReconnect ? 'needs_reconnect' : 'not_connected';

    return Response.json({
      found: true,
      staffName: staff.staffName || null,
      connected,
      needsReconnect,
      reason,
    });
  } catch (err) {
    console.error('Square my-status lookup failed for vendor', vendorId, err);
    // Fail safe: do not nag the user on a transient error.
    return Response.json({ found: false, staffName: null, connected: false, needsReconnect: false, reason: 'not_connected' });
  }
});
