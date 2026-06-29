import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { randomUUID } from 'crypto';
import { fetchAuthSession } from 'aws-amplify/auth/server';
import { Amplify } from 'aws-amplify';
import { createServerRunner } from '@aws-amplify/adapter-nextjs';

Amplify.configure(config, { ssr: true });

const { runWithAmplifyServerContext } = createServerRunner({ config });

function getClient() {
  return generateServerClientUsingCookies<Schema>({
    config,
    cookies,
  });
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
          vendorId: idToken.payload['custom:vendorId'] as string
        };
      }
    });
  } catch {
    return null;
  }
};

export async function GET(request: Request) {
  const client = getClient();
  const { searchParams } = new URL(request.url);
  const vendorId = searchParams.get('vendorId');
  const visibleId = searchParams.get('visibleId');

  // Public lookup by visibleId (for booking flow to check staff Square status)
  if (visibleId) {
    try {
      const { data, errors } = await client.models.StaffSchedule.get({ visibleId } as any);
      if (errors || !data) return Response.json({ schedule: null });
      // Only expose non-sensitive fields
      return Response.json({
        schedule: {
          visibleId: data.visibleId,
          staffName: data.staffName,
          vendorId: data.vendorId,
          squareLocationId: data.squareLocationId,
          squareOAuthStatus: data.squareOAuthStatus,
        }
      });
    } catch {
      return Response.json({ schedule: null });
    }
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Role-based filtering:
  // - Admin role: sees all staff across all providers
  // - Vendor/owner role: sees only staff belonging to their own vendorId
  //   UNLESS ?all=true is passed (used by calendar view per Req 4.1-4.3 for unified calendar access)
  const isVendorRole = currentUser.role === 'vendor' || currentUser.role === 'owner';
  const allParam = searchParams.get('all');
  const effectiveVendorId = isVendorRole && allParam !== 'true'
    ? currentUser.vendorId
    : vendorId;

  try {
    if (effectiveVendorId) {
      const { data, errors } = await client.models.StaffSchedule.listStaffScheduleByVendorId({ vendorId: effectiveVendorId });
      if (errors) return Response.json({ error: 'Failed to fetch' }, { status: 500 });
      return Response.json({ schedules: data || [] });
    }

    // Admin with no vendorId filter: return all staff
    const { data, errors } = await client.models.StaffSchedule.list();
    if (errors) return Response.json({ error: 'Failed to fetch' }, { status: 500 });
    return Response.json({ schedules: data || [] });
  } catch (error) {
    return Response.json({ error: 'Failed to fetch staff schedules' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const client = getClient();
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { staffName, staffEmail, vendorId, schedule, autoAssignRules, smsAlertsEnabled, smsAlertPhone, emailAlertsEnabled } = body;

    if (!staffName) {
      return Response.json({ error: 'Staff name is required' }, { status: 400 });
    }

    if (!vendorId) {
      return Response.json({ error: 'vendorId is required: staff must be assigned to a provider' }, { status: 400 });
    }

    // Vendor/owner can only create schedules for their own vendor
    if ((currentUser.role === 'vendor' || currentUser.role === 'owner') && vendorId !== currentUser.vendorId) {
      return Response.json({ error: 'Unauthorized: Can only manage schedules for your own vendor' }, { status: 403 });
    }

    const id = `staff-${vendorId}-${staffName.toLowerCase().replace(/\s+/g, '-')}-${randomUUID().slice(0, 4)}`;

    const { data, errors } = await client.models.StaffSchedule.create({
      visibleId: id,
      staffName,
      staffEmail: staffEmail || '',
      vendorId,
      schedule: JSON.stringify(schedule || {}),
      autoAssignRules: autoAssignRules ? JSON.stringify(autoAssignRules) : null,
      smsAlertsEnabled: smsAlertsEnabled || false,
      smsAlertPhone: smsAlertPhone || '',
      emailAlertsEnabled: emailAlertsEnabled || false,
      isActive: true,
    } as any);

    if (errors) return Response.json({ error: 'Failed to create' }, { status: 500 });
    return Response.json({ success: true, schedule: data });
  } catch (error) {
    return Response.json({ error: 'Failed to create staff schedule' }, { status: 500 });
  }
}

function buildScheduleUpdateData(visibleId: string, body: any): any {
  const updateData: any = { visibleId };
  const directFields = ['staffName', 'staffEmail', 'isActive', 'smsAlertsEnabled', 'smsAlertPhone', 'emailAlertsEnabled', 'vendorId'];
  for (const field of directFields) {
    if (body[field] !== undefined) updateData[field] = body[field];
  }
  if (body.schedule !== undefined) {
    updateData.schedule = typeof body.schedule === 'string' ? body.schedule : JSON.stringify(body.schedule);
  }
  if (body.autoAssignRules !== undefined) {
    if (body.autoAssignRules === null) {
      updateData.autoAssignRules = null;
    } else {
      updateData.autoAssignRules = typeof body.autoAssignRules === 'string' ? body.autoAssignRules : JSON.stringify(body.autoAssignRules);
    }
  }
  return updateData;
}

export async function PATCH(request: Request) {
  const client = getClient();
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { visibleId } = body;
    if (!visibleId) return Response.json({ error: 'visibleId required' }, { status: 400 });

    const { data: existing, errors: getErrors } = await client.models.StaffSchedule.get({ visibleId } as any);
    if (getErrors || !existing) {
      console.error('Staff schedule not found or get error:', getErrors);
      return Response.json({ error: 'Staff schedule not found' }, { status: 404 });
    }

    const isVendorRole = currentUser.role === 'vendor' || currentUser.role === 'owner';
    const isReassignment = body.vendorId !== undefined && body.vendorId !== existing.vendorId;

    // Vendor/owner role: can only manage their own staff and cannot reassign to another provider
    if (isVendorRole) {
      if (existing.vendorId !== currentUser.vendorId) {
        return Response.json({ error: 'Unauthorized: Can only manage schedules for your own vendor' }, { status: 403 });
      }
      if (isReassignment) {
        return Response.json({ error: 'Unauthorized: Only admins can reassign staff to a different provider' }, { status: 403 });
      }
    }

    // Staff reassignment: only update vendorId, preserve all other attributes
    // The buildScheduleUpdateData function includes vendorId as a direct field,
    // so when vendorId is in the body, it will be set on the update.
    // All other attributes (Square credentials, schedule, name, email, alerts, catalog mappings)
    // remain unchanged because we only update fields explicitly provided in the request body.
    const updateData = buildScheduleUpdateData(visibleId, body);
    const { data, errors } = await client.models.StaffSchedule.update(updateData as any);
    if (errors) {
      console.error('Staff schedule update errors:', JSON.stringify(errors, null, 2));
      return Response.json({ error: 'Failed to update', details: errors }, { status: 500 });
    }
    return Response.json({ success: true, schedule: data });
  } catch (error: any) {
    console.error('Staff schedule PATCH error:', error?.message || error);
    return Response.json({ error: 'Failed to update staff schedule', details: error?.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const client = getClient();
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const visibleId = searchParams.get('visibleId');

    if (!visibleId) {
      return Response.json({ error: 'visibleId required' }, { status: 400 });
    }

    // Vendor/owner can only delete schedules for their own vendor
    if (currentUser.role === 'vendor' || currentUser.role === 'owner') {
      const { data: existing } = await client.models.StaffSchedule.get({ visibleId } as any);
      if (existing && existing.vendorId !== currentUser.vendorId) {
        return Response.json({ error: 'Unauthorized: Can only manage schedules for your own vendor' }, { status: 403 });
      }
    }

    const { errors } = await client.models.StaffSchedule.delete({ visibleId } as any);
    if (errors) return Response.json({ error: 'Failed to delete' }, { status: 500 });
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: 'Failed to delete staff schedule' }, { status: 500 });
  }
}
