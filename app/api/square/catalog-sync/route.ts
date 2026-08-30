import { Client, Environment } from 'square';
import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../../amplify/data/resource';
import config from '../../../../amplify_outputs.json' with { type: 'json' };
import { getStaffServices, groupByCategory, buildCategoryObject, buildItemObject, parseSyncResponse } from '@/lib/square/catalog.js';
import { randomUUID } from 'node:crypto';
import { withErrorLogging } from '@/lib/logger/middleware';

const dbClient = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

function createSquareClient(accessToken: string) {
  return new Client({
    accessToken,
    environment: process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production'
      ? Environment.Production
      : Environment.Sandbox,
  });
}

async function fetchExistingCategories(squareClient: Client): Promise<Map<string, string>> {
  const categories = new Map<string, string>();
  try {
    const { result } = await squareClient.catalogApi.listCatalog(undefined, 'CATEGORY');
    for (const obj of result.objects || []) {
      if (obj.categoryData?.name) categories.set(obj.categoryData.name, obj.id);
    }
  } catch { /* no existing categories */ }
  return categories;
}

function buildCatalogObjects(services: any[], existingCategories: Map<string, string>, savedMappings: Record<string, any>) {
  const objects: any[] = [];
  const categoryIdMap = new Map<string, string>();
  const tempIdToServiceId = new Map<string, string>();
  let created = 0;
  let updated = 0;

  for (const [catName] of groupByCategory(services)) {
    const existingId = existingCategories.get(catName);
    if (existingId) {
      categoryIdMap.set(catName, existingId);
    } else {
      const catObj = buildCategoryObject(catName);
      objects.push(catObj);
      categoryIdMap.set(catName, catObj.id);
    }
  }

  for (const svc of services) {
    const categoryId = categoryIdMap.get(svc.category || 'Other');
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

  return { objects, tempIdToServiceId, created, updated };
}

function buildMappingsFromResponse(result: any, savedMappings: Record<string, any>, tempIdToServiceId: Map<string, string>) {
  const newMappings = { ...savedMappings };
  for (const mapping of result.idMappings || []) {
    if (mapping.clientObjectId?.startsWith('#item-')) {
      const serviceId = tempIdToServiceId.get(mapping.clientObjectId);
      if (serviceId) newMappings[serviceId] = { itemId: mapping.objectId };
    }
    if (mapping.clientObjectId?.startsWith('#variation-')) {
      const svcId = mapping.clientObjectId.replace('#variation-', '');
      if (newMappings[svcId]) newMappings[svcId].variationId = mapping.objectId;
    }
  }
  return newMappings;
}

export const POST = withErrorLogging(async function POST(request: Request) {
  try {
    const { staffId } = await request.json();
    if (!staffId) return Response.json({ error: 'staffId required' }, { status: 400 });

    const { data: staff } = await dbClient.models.StaffSchedule.get({ visibleId: staffId });
    if (!staff) return Response.json({ error: 'Staff not found' }, { status: 404 });
    if (!staff.squareAccessToken || !staff.squareLocationId) {
      return Response.json({ error: 'Square not connected' }, { status: 400 });
    }

    const { data: allServices } = await dbClient.models.Service.list({
      filter: { vendorId: { eq: staff.vendorId }, isActive: { eq: 'true' } } as any,
    });
    const services = getStaffServices(allServices || [], staff.visibleId);
    if (services.length === 0) return Response.json({ error: 'No services to sync' }, { status: 400 });

    const squareClient = createSquareClient(staff.squareAccessToken);
    const savedMappings = staff.squareCatalogMappings ? JSON.parse(staff.squareCatalogMappings as string) : {};
    const existingCategories = await fetchExistingCategories(squareClient);
    const { objects, tempIdToServiceId, created, updated } = buildCatalogObjects(services, existingCategories, savedMappings);

    const { result } = await squareClient.catalogApi.batchUpsertCatalogObjects({
      idempotencyKey: randomUUID(),
      batches: [{ objects }],
    });

    const newMappings = buildMappingsFromResponse(result, savedMappings, tempIdToServiceId);
    await dbClient.models.StaffSchedule.update({
      visibleId: staffId,
      squareCatalogMappings: JSON.stringify(newMappings),
    } as any);

    const counts = parseSyncResponse(result.objects);
    return Response.json({ success: true, synced: counts.items, created, updated });
  } catch (error: any) {
    console.error('Catalog sync error:', error);
    return Response.json({ error: 'Catalog sync failed', details: error.message }, { status: 500 });
  }
})
