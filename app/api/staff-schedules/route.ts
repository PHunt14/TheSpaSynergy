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

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

const getCurrentUser = async () => {
  try {
    return await runWithAmplifyServerContext({
      nextServerContext: { cookies },
      operation: async (contextSpec) => {
        const session = await fetchAuthSession(contextSpec);
        const idToken = session.tokens?.idToken;
        if (!idToken) return null;
        return {
          role: idToken.payload['custom:role'] as string || 'vendor',
          vendorId: idToken.payload['custom:vendorId'] as string
        };
      }
    });
  } catch {
    return null;
  }
};

export async function GET(request: Request) {
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

  // Vendor/owner can only see their own vendor's schedules
  const effectiveVendorId = (currentUser.role === 'vendor' || currentUser.role === 'owner')
    ? currentUser.vendorId
    : vendorId;

  try {
    if (effectiveVendorId) {
      const { data, errors } = await client.models.StaffSchedule.listStaffScheduleByVendorId({ vendorId: effectiveVendorId });
      if (errors) return Response.json({ error: 'Failed to fetch' }, { status: 500 });
      return Response.json({ schedules: data || [] });
    }

    const { data, errors } = await client.models.StaffSchedule.list();
    if (errors) return Response.json({ error: 'Failed to fetch' }, { status: 500 });
    return Response.json({ schedules: data || [] });
  } catch (error) {
    return Response.json({ error: 'Failed to fetch staff schedules' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { staffName, staffEmail, vendorId, schedule, autoAssignRules, smsAlertsEnabled, smsAlertPhone, emailAlertsEnabled } = body;

    if (!staffName || !vendorId) {
      return Response.json({ error: 'Staff name and vendor required' }, { status: 400 });
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

export async function PATCH(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { visibleId, staffName, staffEmail, schedule, autoAssignRules, isActive } = body;

    if (!visibleId) {
      return Response.json({ error: 'visibleId required' }, { status: 400 });
    }

    // Vendor/owner can only edit schedules for their own vendor
    if (currentUser.role === 'vendor' || currentUser.role === 'owner') {
      const { data: existing } = await client.models.StaffSchedule.get({ visibleId } as any);
      if (existing && existing.vendorId !== currentUser.vendorId) {
        return Response.json({ error: 'Unauthorized: Can only manage schedules for your own vendor' }, { status: 403 });
      }
    }

    const updateData: any = { visibleId };
    if (staffName !== undefined) updateData.staffName = staffName;
    if (staffEmail !== undefined) updateData.staffEmail = staffEmail;
    if (schedule !== undefined) updateData.schedule = JSON.stringify(schedule);
    if (autoAssignRules !== undefined) updateData.autoAssignRules = autoAssignRules ? JSON.stringify(autoAssignRules) : null;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (body.smsAlertsEnabled !== undefined) updateData.smsAlertsEnabled = body.smsAlertsEnabled;
    if (body.smsAlertPhone !== undefined) updateData.smsAlertPhone = body.smsAlertPhone;
    if (body.emailAlertsEnabled !== undefined) updateData.emailAlertsEnabled = body.emailAlertsEnabled;

    const { data, errors } = await client.models.StaffSchedule.update(updateData as any);
    if (errors) return Response.json({ error: 'Failed to update' }, { status: 500 });
    return Response.json({ success: true, schedule: data });
  } catch (error) {
    return Response.json({ error: 'Failed to update staff schedule' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
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
