import { randomUUID } from 'node:crypto'

// Build a CatalogObject for a category
export function buildCategoryObject(categoryName) {
  return {
    type: 'CATEGORY',
    id: `#category-${categoryName.toLowerCase().replace(/\s+/g, '-')}`,
    categoryData: {
      name: categoryName,
    },
  }
}

// Build a CatalogObject for a service item
export function buildItemObject(service, categoryId) {
  const variationId = `#variation-${service.serviceId}`
  const item = {
    type: 'ITEM',
    id: `#item-${service.serviceId}`,
    itemData: {
      name: service.name,
      productType: 'APPOINTMENTS_SERVICE',
      variations: [
        {
          type: 'ITEM_VARIATION',
          id: variationId,
          itemVariationData: {
            name: service.name,
            pricingType: 'FIXED_PRICING',
            priceMoney: {
              amount: BigInt(Math.round(service.price * 100)),
              currency: 'USD',
            },
            serviceDuration: BigInt(service.duration * 60 * 1000),
          },
        },
      ],
    },
  }
  if (categoryId) {
    item.itemData.categories = [{ id: categoryId }]
  }
  if (service.description) {
    item.itemData.descriptionPlaintext = service.description
  }
  return item
}

// Determine which services a staff member can perform
export function getStaffServices(allServices, staffVisibleId) {
  return allServices.filter(s => {
    if (!s.isActive) return false
    if (!s.allowedStaff || s.allowedStaff.length === 0) return true
    return s.allowedStaff.includes(staffVisibleId)
  })
}

// Group services by category, returns Map<categoryName, service[]>
export function groupByCategory(services) {
  const groups = new Map()
  for (const svc of services) {
    const cat = svc.category || 'Other'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat).push(svc)
  }
  return groups
}

// Build the full batch upsert request body
// existingCatalog: { items: Map<serviceId, catalogItemId>, categories: Map<name, categoryId> }
export function buildUpsertBatches(services, existingCatalog = { items: new Map(), categories: new Map() }) {
  const objects = []
  const categoryGroups = groupByCategory(services)
  const categoryIdMap = new Map() // categoryName -> temp or real ID

  // Build category objects (only for new categories)
  for (const [catName] of categoryGroups) {
    const existingId = existingCatalog.categories.get(catName)
    if (existingId) {
      categoryIdMap.set(catName, existingId)
    } else {
      const catObj = buildCategoryObject(catName)
      objects.push(catObj)
      categoryIdMap.set(catName, catObj.id)
    }
  }

  // Build item objects
  for (const svc of services) {
    const catName = svc.category || 'Other'
    const categoryId = categoryIdMap.get(catName)
    const itemObj = buildItemObject(svc, categoryId)

    // If already synced, use the real catalog ID for update
    const existingItemId = existingCatalog.items.get(svc.serviceId)
    if (existingItemId) {
      itemObj.id = existingItemId
    }

    objects.push(itemObj)
  }

  // Square batch upsert accepts max 1000 objects per batch
  const batches = []
  for (let i = 0; i < objects.length; i += 1000) {
    batches.push({
      idempotencyKey: randomUUID(),
      batches: [{ objects: objects.slice(i, i + 1000) }],
    })
  }

  return batches
}

// Parse the batch upsert response to count synced items
export function parseSyncResponse(responseObjects) {
  if (!responseObjects) return { items: 0, categories: 0 }
  let items = 0
  let categories = 0
  for (const obj of responseObjects) {
    if (obj.type === 'ITEM') items++
    else if (obj.type === 'CATEGORY') categories++
  }
  return { items, categories }
}

// Build an Order with line items for a payment (named line items, no catalog reference)
export function buildOrderLineItems(services, people) {
  const multiplier = people || 1
  return services.map(svc => ({
    name: svc.name,
    quantity: String(multiplier),
    basePriceMoney: {
      amount: BigInt(Math.round(svc.price * 100)),
      currency: 'USD',
    },
  }))
}
