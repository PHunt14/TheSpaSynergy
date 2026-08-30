import { client, getCurrentUser } from '@/lib/auth';
import { withErrorLogging } from '@/lib/logger/middleware';

const SENSITIVE_VENDOR_FIELDS = [
  'squareAccessToken', 'squareRefreshToken', 'squareApplicationId',
  'squareAccountId', 'squareTokenExpiresAt', 'squareConnectedAt',
  'smsAlertPhone',
] as const;

function stripSensitiveFields(vendor: any) {
  const safe = { ...vendor };
  for (const field of SENSITIVE_VENDOR_FIELDS) delete safe[field];
  return safe;
}

export const GET = withErrorLogging(async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive');
    const providerId = searchParams.get('providerId');

    // includeInactive requires authentication
    if (includeInactive === 'true') {
      const currentUser = await getCurrentUser();
      if (!currentUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // If providerId is provided, fetch single provider
    if (providerId) {
      const { data: provider, errors } = await client.models.Vendor.get({ vendorId: providerId });

      if (errors) {
        console.error('Error fetching provider:', errors);
        return Response.json({ error: 'Failed to fetch provider' }, { status: 500 });
      }

      if (!provider) {
        return Response.json({ error: 'Provider not found' }, { status: 404 });
      }

      return Response.json({ provider: stripSensitiveFields(provider) });
    }

    // Otherwise, fetch all providers
    const filter = includeInactive === 'true'
      ? {}
      : { isActive: { eq: true } };

    const { data: providers, errors } = await client.models.Vendor.list({
      filter: filter as any
    });

    if (errors) {
      console.error('Error fetching providers:', errors);
      return Response.json({ error: 'Failed to fetch providers' }, { status: 500 });
    }

    // Optionally include active staff members grouped by provider
    const includeStaff = searchParams.get('includeStaff');
    if (includeStaff === 'true' && providers) {
      const providersWithStaff = await Promise.all(
        (providers as any[]).map(async (provider: any) => {
          try {
            const { data: staffMembers } = await client.models.StaffSchedule.listStaffScheduleByVendorId({
              vendorId: provider.vendorId
            });
            const activeStaff = (staffMembers || [])
              .filter((s: any) => s.isActive === true)
              .map((s: any) => ({ visibleId: s.visibleId, staffName: s.staffName }));
          return { ...stripSensitiveFields(provider), staff: activeStaff };
          } catch {
            return { ...stripSensitiveFields(provider), staff: [] };
          }
        })
      );
      return Response.json({ providers: providersWithStaff });
    }

    return Response.json({ providers: (providers as any[]).map(stripSensitiveFields) });
  } catch (error) {
    console.error('Error fetching providers:', error);
    return Response.json({ error: 'Failed to fetch providers' }, { status: 500 });
  }
})

export const POST = withErrorLogging(async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || (currentUser.role !== 'admin')) {
      return Response.json({ error: 'Unauthorized: Only admins can create providers' }, { status: 403 });
    }

    const body = await request.json();
    const { vendorId, name, email, description, phone, bufferMinutes, isActive, workingHours } = body;

    if (!name || !email) {
      return Response.json({ error: 'Missing required fields: name and email are required' }, { status: 400 });
    }

    if (!vendorId) {
      return Response.json({ error: 'Missing required field: vendorId is required' }, { status: 400 });
    }

    const { data, errors } = await client.models.Vendor.create({
      vendorId,
      name,
      email,
      description,
      phone,
      bufferMinutes: bufferMinutes || 15,
      isActive: isActive !== undefined ? isActive : true,
      workingHours: workingHours ? JSON.stringify(workingHours) as any : null
    });

    if (errors) {
      console.error('Error creating provider:', errors);
      return Response.json({ error: 'Failed to create provider' }, { status: 500 });
    }

    return Response.json({ success: true, data });
  } catch (error) {
    console.error('Error creating provider:', error);
    return Response.json({ error: 'Failed to create provider' }, { status: 500 });
  }
})

export const PATCH = withErrorLogging(async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { vendorId } = body;

    if (!vendorId) {
      return Response.json({ error: 'vendorId required' }, { status: 400 });
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if ((currentUser.role === 'vendor' || currentUser.role === 'owner') && vendorId !== currentUser.vendorId) {
      return Response.json({ error: 'Unauthorized: Can only update your own provider' }, { status: 403 });
    }

    // Protection: If deactivating provider, check for active staff
    if (body.isActive === false) {
      const { data: staffMembers, errors: staffErrors } = await client.models.StaffSchedule.listStaffScheduleByVendorId({
        vendorId
      });

      if (staffErrors) {
        console.error('Error checking staff for provider:', staffErrors);
        return Response.json({ error: 'Failed to verify provider staff status' }, { status: 500 });
      }

      const activeStaff = (staffMembers || []).filter((staff: any) => staff.isActive === true);
      if (activeStaff.length > 0) {
        const staffNames = activeStaff.map((s: any) => s.staffName || s.staffEmail).join(', ');
        return Response.json({
          error: `Cannot deactivate provider: ${activeStaff.length} active staff member(s) must be reassigned or deactivated first. Active staff: ${staffNames}`
        }, { status: 409 });
      }
    }

    const { data, errors } = await client.models.Vendor.update(body as any);

    if (errors) {
      console.error('Error updating provider:', errors);
      return Response.json({ error: 'Failed to update provider' }, { status: 500 });
    }

    return Response.json({ success: true, data });
  } catch (error) {
    console.error('Error updating provider:', error);
    return Response.json({ error: 'Failed to update provider' }, { status: 500 });
  }
})

export const DELETE = withErrorLogging(async function DELETE(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || (currentUser.role !== 'admin')) {
      return Response.json({ error: 'Unauthorized: Only admins can delete providers' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get('providerId');

    if (!providerId) {
      return Response.json({ error: 'providerId required' }, { status: 400 });
    }

    // Protection: Check for active staff before deletion
    const { data: staffMembers, errors: staffErrors } = await client.models.StaffSchedule.listStaffScheduleByVendorId({
      vendorId: providerId
    });

    if (staffErrors) {
      console.error('Error checking staff for provider:', staffErrors);
      return Response.json({ error: 'Failed to verify provider staff status' }, { status: 500 });
    }

    const activeStaff = (staffMembers || []).filter((staff: any) => staff.isActive === true);
    if (activeStaff.length > 0) {
      const staffNames = activeStaff.map((s: any) => s.staffName || s.staffEmail).join(', ');
      return Response.json({
        error: `Cannot delete provider: ${activeStaff.length} active staff member(s) must be reassigned or deactivated first. Active staff: ${staffNames}`
      }, { status: 409 });
    }

    const { data, errors } = await client.models.Vendor.delete({ vendorId: providerId });

    if (errors) {
      console.error('Error deleting provider:', errors);
      return Response.json({ error: 'Failed to delete provider' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error deleting provider:', error);
    return Response.json({ error: 'Failed to delete provider' }, { status: 500 });
  }
})
