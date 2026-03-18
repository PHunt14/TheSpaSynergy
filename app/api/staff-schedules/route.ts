import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { randomUUID } from 'crypto';

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const vendorId = searchParams.get('vendorId');

  try {
    if (vendorId) {
      const { data, errors } = await client.models.StaffSchedule.listStaffScheduleByVendorId({ vendorId });
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
    const body = await request.json();
    const { staffName, staffEmail, vendorId, schedule, autoAssignRules } = body;

    if (!staffName || !vendorId) {
      return Response.json({ error: 'Staff name and vendor required' }, { status: 400 });
    }

    const { data, errors } = await client.models.StaffSchedule.create({
      visibleId: `staff-${vendorId}-${staffName.toLowerCase().replace(/\s+/g, '-')}-${randomUUID().slice(0, 4)}`,
      staffName,
      staffEmail: staffEmail || '',
      vendorId,
      schedule: JSON.stringify(schedule || {}),
      autoAssignRules: autoAssignRules ? JSON.stringify(autoAssignRules) : null,
      isActive: true,
    });

    if (errors) return Response.json({ error: 'Failed to create' }, { status: 500 });
    return Response.json({ success: true, schedule: data });
  } catch (error) {
    return Response.json({ error: 'Failed to create staff schedule' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { visibleId, staffName, staffEmail, schedule, autoAssignRules, isActive } = body;

    if (!visibleId) {
      return Response.json({ error: 'visibleId required' }, { status: 400 });
    }

    const updateData: any = { visibleId };
    if (staffName !== undefined) updateData.staffName = staffName;
    if (staffEmail !== undefined) updateData.staffEmail = staffEmail;
    if (schedule !== undefined) updateData.schedule = JSON.stringify(schedule);
    if (autoAssignRules !== undefined) updateData.autoAssignRules = autoAssignRules ? JSON.stringify(autoAssignRules) : null;
    if (isActive !== undefined) updateData.isActive = isActive;

    const { data, errors } = await client.models.StaffSchedule.update(updateData);
    if (errors) return Response.json({ error: 'Failed to update' }, { status: 500 });
    return Response.json({ success: true, schedule: data });
  } catch (error) {
    return Response.json({ error: 'Failed to update staff schedule' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const visibleId = searchParams.get('visibleId');

    if (!visibleId) {
      return Response.json({ error: 'visibleId required' }, { status: 400 });
    }

    const { errors } = await client.models.StaffSchedule.delete({ visibleId });
    if (errors) return Response.json({ error: 'Failed to delete' }, { status: 500 });
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: 'Failed to delete staff schedule' }, { status: 500 });
  }
}
