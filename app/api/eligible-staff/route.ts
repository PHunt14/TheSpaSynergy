import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { getEligibleStaff } from '../../utils/staffEligibility';

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

/**
 * GET /api/eligible-staff?serviceId=X
 *
 * Returns the list of eligible staff members for a given service,
 * based on the service's allowedStaff configuration.
 * Staff members are sorted alphabetically by name.
 *
 * Requirements: 5.1, 5.2, 13.2
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const serviceId = searchParams.get('serviceId');

  if (!serviceId) {
    return Response.json({ error: 'Missing required parameter: serviceId' }, { status: 400 });
  }

  try {
    // Fetch the service
    const serviceRes = await client.models.Service.get({ serviceId });
    if (serviceRes.errors || !serviceRes.data) {
      return Response.json({ error: 'Service not found' }, { status: 404 });
    }

    const service = serviceRes.data;

    // Fetch all staff schedules
    const { data: allStaffData } = await client.models.StaffSchedule.list();
    const allStaff = (allStaffData || []) as any[];

    // Use Staff Eligibility Resolver
    const eligibleStaff = getEligibleStaff(
      {
        serviceId: service.serviceId,
        name: service.name,
        allowedStaff: service.allowedStaff as string[] | null,
      },
      allStaff.map((s: any) => ({
        visibleId: s.visibleId,
        staffName: s.staffName,
        vendorId: s.vendorId,
        isActive: s.isActive !== false,
        schedule: s.schedule,
        squareAccessToken: s.squareAccessToken,
        squareLocationId: s.squareLocationId,
        squareOAuthStatus: s.squareOAuthStatus,
        smsAlertsEnabled: s.smsAlertsEnabled,
        emailAlertsEnabled: s.emailAlertsEnabled,
      }))
    );

    // Sort alphabetically by name (Req 5.1 - listed alphabetically)
    const sorted = [...eligibleStaff].sort((a, b) => {
      const nameA = (a.staffName || '').toLowerCase();
      const nameB = (b.staffName || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    // Return minimal public-facing staff info
    const staffList = sorted.map(s => ({
      visibleId: s.visibleId,
      staffName: s.staffName || 'Staff Member',
    }));

    return Response.json({
      staff: staffList,
      serviceName: service.name,
      serviceId: service.serviceId,
    });
  } catch (error) {
    console.error('Error fetching eligible staff:', error);
    return Response.json({ error: 'Failed to fetch eligible staff' }, { status: 500 });
  }
}
