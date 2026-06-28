import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { fetchAuthSession } from 'aws-amplify/auth/server';
import { Amplify } from 'aws-amplify';
import { createServerRunner } from '@aws-amplify/adapter-nextjs';
import { isAuthorized, getServiceAuthorization } from '../../utils/accessControl';
import type { Role } from '../../utils/accessControl';
import { validateCategoryName } from '../../utils/categoryValidator';
import { syncAllowedStaffChanges } from '../../utils/squareCatalogSync';
import type { Service as SyncService } from '../../utils/squareCatalogSync';

Amplify.configure(config, { ssr: true });

const { runWithAmplifyServerContext } = createServerRunner({ config });

function getClient() {
  return generateServerClientUsingCookies<Schema>({
    config,
    cookies,
  });
}

// Get current user from session
const getCurrentUser = async (): Promise<{ role: Role; staffId: string } | null> => {
  try {
    return await runWithAmplifyServerContext({
      nextServerContext: { cookies },
      operation: async (contextSpec) => {
        const session = await fetchAuthSession(contextSpec);
        const idToken = session.tokens?.idToken;
        if (!idToken) return null;

        const role = (idToken.payload['custom:role'] as string) || 'staff';
        const staffId = (idToken.payload['custom:staffId'] as string) || '';

        // Map legacy roles to the two-role model
        const normalizedRole: Role = role === 'admin' ? 'admin' : 'staff';

        return { role: normalizedRole, staffId };
      }
    });
  } catch {
    return null;
  }
};

/**
 * Fetches existing category names from ServiceCategory table.
 */
async function getExistingCategoryNames(client: ReturnType<typeof getClient>): Promise<string[]> {
  const categories: string[] = [];
  let nextToken: string | undefined;
  do {
    const result = await client.models.ServiceCategory.list({
      ...(nextToken ? { nextToken } : {}),
    } as any);
    if (result.data) {
      for (const cat of result.data) {
        if (cat.name) categories.push(cat.name);
      }
    }
    nextToken = (result as any).nextToken;
  } while (nextToken);
  return categories;
}

/**
 * GET /api/services
 *
 * Returns all active services by default.
 * Supports `includeInactive=true` query param to return all services.
 * No vendor filtering — services are global entities.
 */
export async function GET(request: Request) {
  const client = getClient();
  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get('includeInactive');

  try {
    const filter = includeInactive === 'true'
      ? undefined
      : { isActive: { eq: true } };

    const { data: services, errors } = await client.models.Service.list({
      ...(filter ? { filter: filter as any } : {}),
    });

    if (errors) {
      console.error('Error fetching services:', errors);
      return Response.json({ error: 'Failed to fetch services' }, { status: 500 });
    }

    return Response.json({
      services: (services || []).map((s: any) => ({
        ...s,
        // Normalize: ensure categories is always an array for frontend consumption
        categories: (s.categories && Array.isArray(s.categories) && s.categories.length > 0)
          ? s.categories
          : (s.category ? [s.category] : []),
      })),
    });
  } catch (error) {
    console.error('Error fetching services:', error);
    return Response.json({ error: 'Failed to fetch services' }, { status: 500 });
  }
}

/**
 * POST /api/services
 *
 * Creates a new service. vendorId is NOT required and is silently ignored if present.
 * Requires: serviceId, name, duration, price.
 * Integrates access control (admin can create; staff cannot).
 * Validates new categories inline via categoryValidator.
 */
export async function POST(request: Request) {
  const client = getClient();

  try {
    const body = await request.json();

    // Silently strip vendorId from the payload
    const { vendorId: _ignoredVendorId, leadVendorId: _ignoredLeadVendorId, ...payload } = body;

    const {
      serviceId,
      name,
      duration,
      price,
      description,
      categories,
      resourceType,
      bufferMinutes,
      houseFeeEnabled,
      houseFeeAmount,
      houseFeePercent,
      isActive,
      cardPaymentDisabled,
      allowedStaff,
      parentServiceIds,
      maxQuantityPerBooking,
      providersRequired,
      requiresConsultation,
      minPeople,
      maxPeople,
      paymentSplitRules,
    } = payload;

    // Validate required fields (vendorId is no longer required)
    if (!serviceId || !name || !duration || price === undefined) {
      return Response.json({ error: 'Missing required fields: serviceId, name, duration, price' }, { status: 400 });
    }

    // Access control: only admin can create services
    const currentUser = await getCurrentUser();
    if (currentUser && !isAuthorized(currentUser.role, 'create_service')) {
      return Response.json({ error: 'Unauthorized: Insufficient permissions to create services' }, { status: 403 });
    }

    // Validate categories if provided — check for new category names
    if (categories && Array.isArray(categories) && categories.length > 0) {
      const existingCategoryNames = await getExistingCategoryNames(client);

      for (const categoryName of categories) {
        if (typeof categoryName !== 'string') continue;
        // If it's not in the existing list, validate it as a new category
        const isExisting = existingCategoryNames.some(
          (existing) => existing.toLowerCase() === categoryName.trim().toLowerCase()
        );
        if (!isExisting) {
          const validation = validateCategoryName(categoryName, existingCategoryNames);
          if (!validation.valid) {
            return Response.json({ error: `Invalid category "${categoryName}": ${validation.error}` }, { status: 400 });
          }
          // Create the new category inline
          await client.models.ServiceCategory.create({
            categoryId: crypto.randomUUID(),
            name: categoryName.trim(),
            createdAt: new Date().toISOString(),
          } as any);
          // Add to list so subsequent checks see it
          existingCategoryNames.push(categoryName.trim());
        }
      }
    }

    const { data, errors } = await client.models.Service.create({
      serviceId,
      name,
      description: description || undefined,
      categories: categories || undefined,
      resourceType: resourceType || 'staff',
      duration,
      price,
      bufferMinutes: bufferMinutes != null ? bufferMinutes : undefined,
      houseFeeEnabled: houseFeeEnabled || false,
      houseFeeAmount: houseFeeAmount || 0,
      houseFeePercent: houseFeePercent || 0,
      isActive: isActive !== undefined ? isActive : true,
      cardPaymentDisabled: cardPaymentDisabled || false,
      allowedStaff: allowedStaff || null,
      parentServiceIds: parentServiceIds?.length ? parentServiceIds : null,
      maxQuantityPerBooking: maxQuantityPerBooking || 1,
      providersRequired: providersRequired || 1,
      requiresConsultation: requiresConsultation || false,
      minPeople: minPeople || undefined,
      maxPeople: maxPeople || undefined,
      paymentSplitRules: paymentSplitRules || undefined,
    });

    if (errors) {
      console.error('Error creating service:', errors);
      return Response.json({ error: 'Failed to create service' }, { status: 500 });
    }

    return Response.json({ success: true, data });
  } catch (error) {
    console.error('Error creating service:', error);
    return Response.json({ error: 'Failed to create service' }, { status: 500 });
  }
}

/**
 * PATCH /api/services
 *
 * Updates an existing service. vendorId in the body is silently ignored.
 * Integrates access control:
 * - Admin can update any service.
 * - Staff can update only if their staffId is in allowedStaff or allowedStaff is empty.
 * Validates new categories inline via categoryValidator.
 * Triggers Square catalog sync when allowedStaff changes (Req 3.5, 3.6, 3.8).
 */
export async function PATCH(request: Request) {
  const client = getClient();

  try {
    const body = await request.json();

    // Silently strip vendorId from the payload
    const { vendorId: _ignoredVendorId, leadVendorId: _ignoredLeadVendorId, ...payload } = body;

    const { serviceId } = payload;

    if (!serviceId) {
      return Response.json({ error: 'serviceId required' }, { status: 400 });
    }

    // Access control check — also capture existing service for allowedStaff diff
    let existingService: any = null;
    const currentUser = await getCurrentUser();
    if (currentUser) {
      // Fetch existing service to check authorization
      const { data: svcData } = await client.models.Service.get({ serviceId });
      existingService = svcData;
      if (existingService) {
        const auth = getServiceAuthorization(currentUser.role, currentUser.staffId, {
          serviceId: existingService.serviceId,
          name: existingService.name,
          allowedStaff: existingService.allowedStaff as string[] | null,
        });
        if (!auth.canUpdate) {
          return Response.json({ error: 'Unauthorized: Insufficient permissions to update this service' }, { status: 403 });
        }
      }
    } else {
      // If no auth context, still fetch existing service for sync diff
      const { data: svcData } = await client.models.Service.get({ serviceId });
      existingService = svcData;
    }

    // Validate categories if being updated
    if (payload.categories && Array.isArray(payload.categories) && payload.categories.length > 0) {
      const existingCategoryNames = await getExistingCategoryNames(client);

      for (const categoryName of payload.categories) {
        if (typeof categoryName !== 'string') continue;
        const isExisting = existingCategoryNames.some(
          (existing) => existing.toLowerCase() === categoryName.trim().toLowerCase()
        );
        if (!isExisting) {
          const validation = validateCategoryName(categoryName, existingCategoryNames);
          if (!validation.valid) {
            return Response.json({ error: `Invalid category "${categoryName}": ${validation.error}` }, { status: 400 });
          }
          // Create the new category inline
          await client.models.ServiceCategory.create({
            categoryId: crypto.randomUUID(),
            name: categoryName.trim(),
            createdAt: new Date().toISOString(),
          } as any);
          existingCategoryNames.push(categoryName.trim());
        }
      }
    }

    const { data, errors } = await client.models.Service.update(payload);

    if (errors) {
      console.error('Error updating service:', errors);
      return Response.json({ error: 'Failed to update service' }, { status: 500 });
    }

    // Trigger Square catalog sync if allowedStaff changed (Req 3.5, 3.6, 3.8)
    // Sync is non-blocking: local change is always retained even if sync fails.
    let syncErrors: { staffId: string; action: string; error: string }[] = [];
    if (payload.allowedStaff !== undefined && existingService) {
      const oldAllowedStaff = existingService.allowedStaff as string[] | null;
      const newAllowedStaff = payload.allowedStaff as string[] | null;

      // Build a service object for the sync function
      const serviceForSync: SyncService = {
        serviceId: data?.serviceId || serviceId,
        name: data?.name || existingService.name,
        description: data?.description || existingService.description || undefined,
        categories: (data?.categories || existingService.categories) as string[] | null,
        duration: data?.duration || existingService.duration,
        price: data?.price || existingService.price,
        allowedStaff: newAllowedStaff,
      };

      try {
        const syncResults = await syncAllowedStaffChanges(
          oldAllowedStaff,
          newAllowedStaff,
          serviceForSync
        );

        // Collect any sync failures to include in response (non-blocking)
        syncErrors = syncResults
          .filter((r) => !r.result.success)
          .map((r) => ({
            staffId: r.staffId,
            action: r.action,
            error: r.result.error || 'Unknown sync error',
          }));
      } catch (syncError) {
        // Sync failure should never block the local update response
        console.error('[PATCH /api/services] Square catalog sync error (non-blocking):', syncError);
        syncErrors = [{ staffId: 'unknown', action: 'sync', error: 'Catalog sync process failed' }];
      }
    }

    // Return success with optional sync error info (Req 3.8: retain local change, show error)
    const response: any = { success: true, data };
    if (syncErrors.length > 0) {
      response.syncErrors = syncErrors;
      response.syncWarning = 'Service updated successfully but one or more Square catalog syncs failed. You can retry the sync from the staff settings.';
    }

    return Response.json(response);
  } catch (error) {
    console.error('Error updating service:', error);
    return Response.json({ error: 'Failed to update service' }, { status: 500 });
  }
}

/**
 * DELETE /api/services
 *
 * Deletes a service by serviceId.
 * Integrates access control:
 * - Admin can delete any service.
 * - Staff cannot delete services.
 */
export async function DELETE(request: Request) {
  const client = getClient();

  try {
    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get('serviceId');

    if (!serviceId) {
      return Response.json({ error: 'serviceId required' }, { status: 400 });
    }

    // Access control check
    const currentUser = await getCurrentUser();
    if (currentUser) {
      if (!isAuthorized(currentUser.role, 'delete_service')) {
        return Response.json({ error: 'Unauthorized: Insufficient permissions to delete services' }, { status: 403 });
      }

      // For admin, additionally check service-level authorization
      const { data: existingService } = await client.models.Service.get({ serviceId });
      if (existingService) {
        const auth = getServiceAuthorization(currentUser.role, currentUser.staffId, {
          serviceId: existingService.serviceId,
          name: existingService.name,
          allowedStaff: existingService.allowedStaff as string[] | null,
        });
        if (!auth.canDelete) {
          return Response.json({ error: 'Unauthorized: Insufficient permissions to delete this service' }, { status: 403 });
        }
      }
    }

    const { data, errors } = await client.models.Service.delete({ serviceId });

    if (errors) {
      console.error('Error deleting service:', errors);
      return Response.json({ error: 'Failed to delete service' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error deleting service:', error);
    return Response.json({ error: 'Failed to delete service' }, { status: 500 });
  }
}
