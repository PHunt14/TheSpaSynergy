import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../../amplify/data/resource';
import config from '../../../../amplify_outputs.json' with { type: 'json' };
import { fetchAuthSession } from 'aws-amplify/auth/server';
import { Amplify } from 'aws-amplify';
import { createServerRunner } from '@aws-amplify/adapter-nextjs';
import { withErrorLogging } from '@/lib/logger/middleware';

Amplify.configure(config, { ssr: true });

const { runWithAmplifyServerContext } = createServerRunner({ config });

function getClient() {
  return generateServerClientUsingCookies<Schema>({ config, cookies });
}

const getCurrentUser = async () => {
  try {
    return await runWithAmplifyServerContext({
      nextServerContext: { cookies },
      operation: async (contextSpec) => {
        const session = await fetchAuthSession(contextSpec);
        const idToken = session.tokens?.idToken;
        if (!idToken) return null;
        return {
          role: (idToken.payload['custom:role'] as string) || 'staff',
          vendorId: idToken.payload['custom:vendorId'] as string | undefined,
          staffId: idToken.payload['custom:staffId'] as string | undefined,
        };
      },
    });
  } catch {
    return null;
  }
};

/**
 * GET /api/dashboard/house-fees?month=YYYY-MM[&staffId=...][&status=owed|settled|all]
 *
 * Returns house-fee obligations grouped by provider for a month, with totals.
 * - Admins see all providers; non-admins are scoped to their own staffId.
 * - Defaults to the current UTC month and status 'all'.
 */
export const GET = withErrorLogging(async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = getClient();
  const { searchParams } = new URL(request.url);

  const now = new Date();
  const defaultMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const month = searchParams.get('month') || defaultMonth;
  const statusFilter = searchParams.get('status') || 'all';
  const requestedStaffId = searchParams.get('staffId') || undefined;

  const isAdmin = currentUser.role === 'admin';
  // Non-admins may only ever see their own obligations.
  const scopedStaffId = isAdmin ? requestedStaffId : currentUser.staffId;

  if (!isAdmin && !scopedStaffId) {
    // A non-admin without a resolvable staffId has nothing to show.
    return Response.json({ month, isAdmin, providers: [], totals: { owed: 0, settled: 0, count: 0 } });
  }

  // Query by GSI: prefer staffId+month when scoped; otherwise the month index.
  let items: any[] = [];
  try {
    if (scopedStaffId) {
      const { data } = await (client.models as any).HouseFeeLedger.listHouseFeeLedgerByStaffIdAndMonth({
        staffId: scopedStaffId,
        month: { eq: month },
      });
      items = data || [];
    } else {
      const { data } = await (client.models as any).HouseFeeLedger.listHouseFeeLedgerByMonth({
        month,
      });
      items = data || [];
    }
  } catch (err) {
    // Fall back to a filtered list if the GSI query helper name differs.
    const { data } = await (client.models as any).HouseFeeLedger.list({
      filter: { month: { eq: month }, ...(scopedStaffId ? { staffId: { eq: scopedStaffId } } : {}) },
    });
    items = data || [];
  }

  const filtered = statusFilter === 'all'
    ? items
    : items.filter((i: any) => i.status === statusFilter);

  // Group by provider.
  const byProvider = new Map<string, any>();
  for (const item of filtered) {
    const key = item.staffId;
    if (!byProvider.has(key)) {
      byProvider.set(key, {
        staffId: item.staffId,
        staffName: item.staffName || item.staffId,
        vendorId: item.vendorId || null,
        owedAmount: 0,
        settledAmount: 0,
        owedCount: 0,
        settledCount: 0,
        entries: [] as any[],
      });
    }
    const group = byProvider.get(key);
    const amount = item.houseFeeAmount || 0;
    if (item.status === 'settled') {
      group.settledAmount += amount;
      group.settledCount += 1;
    } else {
      group.owedAmount += amount;
      group.owedCount += 1;
    }
    group.entries.push({
      ledgerId: item.ledgerId,
      appointmentId: item.appointmentId,
      serviceName: item.serviceName,
      customerName: item.customerName,
      houseFeeAmount: amount,
      status: item.status,
      paymentId: item.paymentId,
      createdAt: item.createdAt,
      settledAt: item.settledAt,
    });
  }

  const providers = Array.from(byProvider.values()).map((p) => ({
    ...p,
    entries: p.entries.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || '')),
  }));
  providers.sort((a, b) => b.owedAmount - a.owedAmount);

  const totals = providers.reduce(
    (acc, p) => ({
      owed: acc.owed + p.owedAmount,
      settled: acc.settled + p.settledAmount,
      count: acc.count + p.owedCount + p.settledCount,
    }),
    { owed: 0, settled: 0, count: 0 },
  );

  return Response.json({ month, isAdmin, providers, totals });
});

/**
 * POST /api/dashboard/house-fees
 * Body: { ledgerId } or { ledgerIds: [...] } to mark obligation(s) settled.
 * Admin only (only the house/admin collects and settles fees).
 */
export const POST = withErrorLogging(async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (currentUser.role !== 'admin') {
    return Response.json({ error: 'Forbidden', details: 'Only an admin can settle house fees' }, { status: 403 });
  }

  const body = await request.json();
  const ledgerIds: string[] = Array.isArray(body.ledgerIds)
    ? body.ledgerIds
    : body.ledgerId
      ? [body.ledgerId]
      : [];

  if (ledgerIds.length === 0) {
    return Response.json({ error: 'Missing ledgerId(s)' }, { status: 400 });
  }

  const client = getClient();
  const settledAt = new Date().toISOString();
  const settledBy = currentUser.staffId || currentUser.vendorId || 'admin';

  const results: { ledgerId: string; ok: boolean; error?: string }[] = [];
  for (const ledgerId of ledgerIds) {
    try {
      await (client.models as any).HouseFeeLedger.update({
        ledgerId,
        status: 'settled',
        settledAt,
        settledBy,
      });
      results.push({ ledgerId, ok: true });
    } catch (err: any) {
      results.push({ ledgerId, ok: false, error: err?.message || 'update failed' });
    }
  }

  const allOk = results.every((r) => r.ok);
  return Response.json({ success: allOk, settledAt, results }, { status: allOk ? 200 : 207 });
});
