import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../../amplify/data/resource';
import config from '../../../../amplify_outputs.json' with { type: 'json' };
import { fetchAuthSession } from 'aws-amplify/auth/server';
import { Amplify } from 'aws-amplify';
import { createServerRunner } from '@aws-amplify/adapter-nextjs';
import { withErrorLogging } from '@/lib/logger/middleware';
import { getCache } from '@/lib/dashboard-cache';

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
          role: idToken.payload['custom:role'] as string || 'staff',
          vendorId: idToken.payload['custom:vendorId'] as string,
        };
      },
    });
  } catch {
    return null;
  }
};

/**
 * GET /api/dashboard/transactions
 *
 * Returns all appointments (with payment details) for a date range.
 * Accessible to all authenticated dashboard users. Vendor/owner roles see only their own vendor's data.
 *
 * Query params:
 *   - startDate (required): ISO date string for range start (e.g., "2026-07-28T00:00")
 *   - endDate (required): ISO date string for range end (e.g., "2026-07-28T23:59")
 *   - status: optional filter (e.g., "confirmed", "cancelled")
 *   - paymentStatus: optional filter (e.g., "paid", "unpaid")
 */
export const GET = withErrorLogging(async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = getClient();
  const { searchParams } = new URL(request.url);

  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const statusFilter = searchParams.get('status');
  const paymentStatusFilter = searchParams.get('paymentStatus');
  const limit = Math.min(Number.parseInt(searchParams.get('limit') || '50', 10), 100); // Max 100, default 50
  const nextTokenParam = searchParams.get('nextToken');
  
  // Decode nextToken (base64 encoded offset)
  let offset = 0;
  if (nextTokenParam) {
    try {
      offset = Number.parseInt(Buffer.from(nextTokenParam, 'base64').toString('utf-8'), 10);
    } catch {
      offset = 0;
    }
  }

  if (!startDate || !endDate) {
    return Response.json({ error: 'startDate and endDate are required' }, { status: 400 });
  }

  try {
    // Get all active vendors
    const { data: vendors } = await client.models.Vendor.list();
    const activeVendors = (vendors || []).filter(v => v.isActive !== false);
    const vendorMap = new Map(activeVendors.map(v => [v.vendorId, v.name]));

    // Determine which vendors to query based on user role (Requirement 10.4, 10.5)
    // - Admin role: can see all vendors' transactions
    // - Vendor/staff role: can only see their own vendor's transactions
    let vendorsToQuery = activeVendors;
    if (currentUser.role !== 'admin' && currentUser.vendorId) {
      vendorsToQuery = activeVendors.filter(v => v.vendorId === currentUser.vendorId);
    }

    // Fetch appointments across all relevant vendors for the date range
    const allAppointments: any[] = [];
    for (const vendor of vendorsToQuery) {
      let nextToken: string | undefined;
      do {
        const { data, nextToken: token } = await client.models.Appointment.listAppointmentByVendorIdAndDateTime({
          vendorId: vendor.vendorId,
          dateTime: { between: [startDate, endDate] },
          ...(nextToken ? { nextToken } : {}),
        } as any);
        allAppointments.push(...(data || []));
        nextToken = token as string | undefined;
      } while (nextToken);
    }

    // Apply status filters
    let filtered = allAppointments.filter(apt => apt.status !== 'cancelled');
    if (statusFilter === 'cancelled') {
      filtered = allAppointments.filter(apt => apt.status === 'cancelled');
    } else if (statusFilter && statusFilter !== 'all') {
      filtered = allAppointments.filter(apt => apt.status === statusFilter);
    } else if (!statusFilter) {
      // Default: exclude cancelled
      filtered = allAppointments.filter(apt => apt.status !== 'cancelled');
    } else {
      filtered = allAppointments;
    }

    if (paymentStatusFilter === 'paid') {
      filtered = filtered.filter(apt => apt.paymentId || apt.paymentStatus === 'paid');
    } else if (paymentStatusFilter === 'unpaid') {
      filtered = filtered.filter(apt => !apt.paymentId && apt.paymentStatus !== 'paid');
    }

    // Batch-fetch unique services and staff with caching (Requirement 12.3)
    const uniqueServiceIds = [...new Set(filtered.map(a => a.serviceId).filter(Boolean))] as string[];
    const uniqueStaffIds = [...new Set(filtered.map(a => a.staffId).filter(Boolean))] as string[];

    const serviceMap: Record<string, any> = {};
    const staffMap: Record<string, any> = {};

    const cache = getCache();

    await Promise.all([
      ...uniqueServiceIds.map(async (sid) => {
        try {
          const data = await cache.getService(sid, async (id) => {
            const { data: serviceData } = await client.models.Service.get({ serviceId: id });
            return serviceData;
          });
          if (data) serviceMap[sid] = data;
        } catch (err) {
          console.error(`Failed to fetch service ${sid}:`, err);
        }
      }),
      ...uniqueStaffIds.map(async (sid) => {
        try {
          const data = await cache.getStaff(sid, async (id) => {
            const { data: staffData } = await client.models.StaffSchedule.get({ visibleId: id });
            return staffData;
          });
          if (data) staffMap[sid] = data;
        } catch (err) {
          console.error(`Failed to fetch staff ${sid}:`, err);
        }
      }),
    ]);

    // Enrich appointments
    // For grouped appointments (multi-provider), each appointment represents one provider's share,
    // NOT the full service price. The service price applies to the group as a whole.

    const enriched = filtered.map((apt: any) => {
      const service = serviceMap[apt.serviceId] || null;
      const staff = staffMap[apt.staffId] || null;
      let customer = apt.customer;
      if (typeof customer === 'string') {
        try { customer = JSON.parse(customer); } catch {}
      }

      // Determine the display amount for this appointment:
      // - If it has a paymentAmount recorded, use that (it's the actual share charged)
      // - If it's part of a group, calculate from service split rules
      // - Otherwise show the service price
      const isGrouped = !!apt.groupId;
      const groupSize = isGrouped
        ? filtered.filter((a: any) => a.groupId === apt.groupId).length
        : 1;
      const servicePrice = service?.price || 0;
      const houseFeeEnabled = service?.houseFeeEnabled || false;
      const houseFeeAmount = (houseFeeEnabled && service?.houseFeeAmount > 0) ? service.houseFeeAmount : 0;
      
      // For grouped appointments, provider share = (price - houseFee) / groupSize
      const providerShare = isGrouped ? (servicePrice - houseFeeAmount) / groupSize : servicePrice;
      const displayAmount = apt.paymentAmount ?? providerShare;

      // Parse paymentRaw if available for full payment breakdown
      let paymentRaw = null;
      if (apt.paymentRaw) {
        try { paymentRaw = typeof apt.paymentRaw === 'string' ? JSON.parse(apt.paymentRaw) : apt.paymentRaw; } catch {}
      }

      return {
        appointmentId: apt.appointmentId,
        vendorId: apt.vendorId,
        vendorName: vendorMap.get(apt.vendorId) || 'Unknown',
        serviceId: apt.serviceId,
        serviceName: service?.name || 'Unknown Service',
        servicePrice,
        houseFeeAmount,
        providerShare,
        displayAmount,
        staffId: apt.staffId,
        staffName: staff?.staffName || null,
        groupId: apt.groupId || null,
        bundleId: apt.bundleId || null,
        dateTime: apt.dateTime,
        status: apt.status,
        customer: { name: customer?.name || 'Unknown', phone: customer?.phone || '', email: customer?.email || '' },
        paymentId: apt.paymentId || null,
        paymentStatus: apt.paymentStatus || null,
        paymentAmount: apt.paymentAmount || null,
        paymentRaw,
        createdAt: apt.createdAt,
        updatedAt: apt.updatedAt,
      };
    });

    // Sort by dateTime
    enriched.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

    // Summary stats — avoid double-counting grouped appointments.
    // For groups: count as 1 transaction, use service price once (not per-appointment).
    const seenGroupIds = new Set<string>();
    let totalTransactions = 0;
    let paidCount = 0;
    let unpaidCount = 0;
    let totalRevenue = 0;

    for (const apt of enriched) {
      if (apt.groupId) {
        if (seenGroupIds.has(apt.groupId)) continue; // already counted this group
        seenGroupIds.add(apt.groupId);
        const groupMembers = enriched.filter(a => a.groupId === apt.groupId);
        const groupPaid = groupMembers.some(m => m.paymentId || m.paymentStatus === 'paid');
        totalTransactions++;
        if (groupPaid) {
          paidCount++;
          // Revenue = sum of actual paymentAmounts if available, else service price
          const groupRevenue = groupMembers.reduce((sum, m) => sum + (m.paymentAmount || 0), 0);
          totalRevenue += groupRevenue > 0 ? groupRevenue : apt.servicePrice;
        } else {
          unpaidCount++;
        }
      } else {
        totalTransactions++;
        if (apt.paymentId || apt.paymentStatus === 'paid') {
          paidCount++;
          totalRevenue += apt.paymentAmount || apt.servicePrice || 0;
        } else {
          unpaidCount++;
        }
      }
    }

    // Pagination (Requirement 11.2)
    const totalCount = enriched.length;
    const paginatedTransactions = enriched.slice(offset, offset + limit);
    const hasMore = offset + limit < totalCount;
    
    // Encode nextToken as base64(offset)
    const nextToken = hasMore ? Buffer.from(String(offset + limit)).toString('base64') : null;

    return Response.json({
      transactions: paginatedTransactions,
      summary: { totalAppointments: totalTransactions, paidCount, unpaidCount, totalRevenue },
      pagination: {
        offset,
        limit,
        totalCount,
        hasMore,
        nextToken,
      },
    });
  } catch (error) {
    console.error('Transactions API error:', error);
    return Response.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
})
