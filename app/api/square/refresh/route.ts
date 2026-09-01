import { client, getCurrentUser } from '@/lib/auth';
import { withErrorLogging } from '@/lib/logger/middleware';
import { refreshSquareToken } from '@/lib/square-token-enhanced';
import { shouldProactivelyRefresh } from '@/lib/square/core.js';

/**
 * Manually refresh Square OAuth access token(s). This is the on-demand
 * equivalent of the daily scheduled refresh-square-tokens function — it lets an
 * admin force a renewal instead of waiting for the next scheduled run or the
 * next card payment.
 *
 * Body (JSON):
 *   { staffId: "<visibleId>" }  → refresh a single staff member
 *   { all: true }               → refresh every staff member that is due
 *                                 (has a refresh token and is expiring/expired)
 *
 * Authorization:
 *   - admin: may refresh any staff member, or all.
 *   - vendor/owner: may refresh only staff on their own vendor.
 *   - staff: may refresh only their own record (matched by staffId).
 *
 * On success a record's token/expiry are updated and status set to 'connected'.
 * If a refresh fails because the refresh token is revoked/expired, that record
 * is reported as needing a manual reconnect (the caller does not retry).
 */
export const POST = withErrorLogging(async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = currentUser.role === 'admin';
  const isVendorRole = currentUser.role === 'vendor' || currentUser.role === 'owner';

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { staffId, all } = body;

  // --- Bulk refresh (admin, or vendor/owner scoped to their vendor) ---
  if (all) {
    if (!isAdmin && !isVendorRole) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    let candidates: any[] = [];
    try {
      if (isAdmin) {
        const { data } = await client.models.StaffSchedule.list();
        candidates = data || [];
      } else {
        const { data } = await (client.models as any).StaffSchedule.listStaffScheduleByVendorId({ vendorId: currentUser.vendorId });
        candidates = data || [];
      }
    } catch (err) {
      console.error('Square refresh: failed to list staff', err);
      return Response.json({ error: 'Failed to load staff' }, { status: 500 });
    }

    const due = candidates.filter((s) => shouldProactivelyRefresh(s, 7));
    const results: Array<{ staffId: string; staffName: string | null; ok: boolean; error?: string }> = [];

    for (const s of due) {
      const res = await refreshSquareToken(s.visibleId);
      if (!res.success) {
        try {
          await client.models.StaffSchedule.update({ visibleId: s.visibleId, squareOAuthStatus: 'error' } as any);
        } catch { /* best-effort */ }
      }
      results.push({ staffId: s.visibleId, staffName: s.staffName || null, ok: res.success, error: res.success ? undefined : res.error });
    }

    const refreshed = results.filter((r) => r.ok).length;
    const failed = results.length - refreshed;
    return Response.json({ success: true, checked: candidates.length, due: due.length, refreshed, failed, results });
  }

  // --- Single-staff refresh ---
  if (!staffId) {
    return Response.json({ error: 'staffId or all is required' }, { status: 400 });
  }

  // Authorization for a single record: fetch it and check ownership/scope.
  let staff: any = null;
  try {
    const { data } = await client.models.StaffSchedule.get({ visibleId: staffId } as any);
    staff = data;
  } catch (err) {
    console.error('Square refresh: staff lookup failed', staffId, err);
  }
  if (!staff) return Response.json({ error: 'Staff member not found' }, { status: 404 });

  // Admins may refresh any record; vendor/owner only their own vendor's staff.
  const allowed = isAdmin || (isVendorRole && staff.vendorId === currentUser.vendorId);
  if (!allowed) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!staff.squareRefreshToken) {
    return Response.json({
      success: false,
      needsReconnect: true,
      error: 'No refresh token on file. This staff member must reconnect Square.',
    }, { status: 400 });
  }

  const res = await refreshSquareToken(staffId);
  if (!res.success) {
    try {
      await client.models.StaffSchedule.update({ visibleId: staffId, squareOAuthStatus: 'error' } as any);
    } catch { /* best-effort */ }
    return Response.json({
      success: false,
      needsReconnect: true,
      error: res.error || 'Refresh failed. This staff member must reconnect Square.',
    }, { status: 400 });
  }

  return Response.json({ success: true, staffId, staffName: staff.staffName || null });
});
