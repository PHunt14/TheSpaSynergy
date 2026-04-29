import { Client, Environment } from 'square';
import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../../amplify/data/resource';
import config from '../../../../amplify_outputs.json' with { type: 'json' };
import { getStaffServices, groupByCategory, buildCategoryObject, buildItemObject, parseSyncResponse } from '../../../lib/square/catalog.js';
import { randomUUID } from 'crypto';

const dbClient = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

export async function POST(request: Request) {
  try {
    const { staffId } = await request.json();

    if (!staffId) {
      return Response.json({ error: 'staffId required' }, { status: 400 });
    }

    const { data: staff } = await dbClient.models.StaffSchedule.get({ visibleId: staffId });
    if (!staff) {
      return Response.json({ error: 'Staff not found' }, { status: 404 });
    }
    if (!staff.squareAccessToken || !staff.squareLocationId) {
      return Response.json({ error: 'Square not connected' }, { status: 400 });
    }

    const { data: allServices } = await dbClient.models.Service.list({
      filter: { vendorId: { eq: staff.vendorId }, isActive: { eq: true } },
    });

    const services = getStaffServices(allServices || [], staff.visibleId);
    if (services.length === 0) {
      return Response.json({ error: 'No services to sync' }, { status: 400 });
    }

    const squareClient = new Client({
      accessToken: staff.squareAccessToken,
      environment: process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production'
        ? Environment.Production
        : Environment.Sandbox,
    });

    // Load existing mappings from staff record (serviceId -> { itemId, variationId })
    const savedMappings: Record<string, { itemId: string; variationId?: string }> =
      staff.squareCatalogMappings ? JSON.parse(staff.squareCatalogMappings as string) : {};

    // Fetch existing categories from Square (matched by name since categories have no local ID)
    const existingCategories = new Map<string, string>();
    try {
      const { result: catResult } = await squareClient.catalogApi.listCatalog(undefined, 'CATEGORY');
      for (const obj of catResult.objects || []) {
        if (obj.categoryData?.name) {
          existingCategories.set(obj.categoryData.name, obj.id);
        }
      }
    } catch { /* no existing categories */ }

    // Build catalog objects
    const objects: any[] = [];
    const categoryGroups = groupByCategory(services);
    const categoryIdMap = new Map<string, string>();

    for (const [catName] of categoryGroups) {
      const existingId = existingCategories.get(catName);
      if (existingId) {
        categoryIdMap.set(catName, existingId);
      } else {
        const catObj = buildCategoryObject(catName);
        objects.push(catObj);
        categoryIdMap.set(catName, catObj.id);
      }
    }

    let created = 0;
    let updated = 0;
    // Track temp ID -> serviceId so we can map response back
    const tempIdToServiceId = new Map<string, string>();

    for (const svc of services) {
      const catName = svc.category || 'Other';
      const categoryId = categoryIdMap.get(catName);
      const itemObj = buildItemObject(svc, categoryId);

      const existing = savedMappings[svc.serviceId];
      if (existing?.itemId) {
        itemObj.id = existing.itemId;
        if (existing.variationId && itemObj.itemData.variations[0]) {
          itemObj.itemData.variations[0].id = existing.variationId;
        }
        updated++;
      } else {
        tempIdToServiceId.set(itemObj.id, svc.serviceId);
        created++;
      }

      objects.push(itemObj);
    }

    const { result } = await squareClient.catalogApi.batchUpsertCatalogObjects({
      idempotencyKey: randomUUID(),
      batches: [{ objects }],
    });

    // Build updated mappings from response
    const newMappings: Record<string, { itemId: string; variationId?: string }> = { ...savedMappings };
    const idMapping = result.idMappings || [];

    // For newly created items, Square returns idMappings (tempId -> realId)
    for (const mapping of idMapping) {
      if (mapping.clientObjectId?.startsWith('#item-')) {
        const serviceId = tempIdToServiceId.get(mapping.clientObjectId);
        if (serviceId) {
          newMappings[serviceId] = { itemId: mapping.objectId };
        }
      }
      if (mapping.clientObjectId?.startsWith('#variation-')) {
        const svcId = mapping.clientObjectId.replace('#variation-', '');
        if (newMappings[svcId]) {
          newMappings[svcId].variationId = mapping.objectId;
        }
      }
    }

    // For updated items, preserve existing mappings (IDs don't change on update)

    // Save mappings back to staff record
    await dbClient.models.StaffSchedule.update({
      visibleId: staffId,
      squareCatalogMappings: JSON.stringify(newMappings),
    } as any);

    const counts = parseSyncResponse(result.objects);

    return Response.json({
      success: true,
      synced: counts.items,
      created,
      updated,
    });
  } catch (error: any) {
    console.error('Catalog sync error:', error);
    return Response.json({ error: 'Catalog sync failed', details: error.message }, { status: 500 });
  }
}
