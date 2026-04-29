/**
 * Square Catalog Utility Tests
 *
 * Unit tests for:
 * - buildCategoryObject (category catalog object construction)
 * - buildItemObject (service item catalog object construction)
 * - getStaffServices (staff service filtering by allowedStaff)
 * - groupByCategory (service grouping)
 * - buildUpsertBatches (full batch request construction)
 * - parseSyncResponse (response counting)
 * - buildOrderLineItems (order line item construction for payments)
 */

import {
  buildCategoryObject,
  buildItemObject,
  getStaffServices,
  groupByCategory,
  buildUpsertBatches,
  parseSyncResponse,
  buildOrderLineItems,
} from '../../lib/square/catalog.js'

// ── buildCategoryObject ───────────────────────────────────────

describe('buildCategoryObject', () => {
  test('builds category with correct name and temp ID', () => {
    const result = buildCategoryObject('Relaxation')
    expect(result.type).toBe('CATEGORY')
    expect(result.id).toBe('#category-relaxation')
    expect(result.categoryData.name).toBe('Relaxation')
  })

  test('handles multi-word category names', () => {
    const result = buildCategoryObject('Hair Care')
    expect(result.id).toBe('#category-hair-care')
  })
})

// ── buildItemObject ───────────────────────────────────────────

describe('buildItemObject', () => {
  const service = {
    serviceId: 'svc-1',
    name: '60-min Swedish Massage',
    description: 'A relaxing full-body massage',
    price: 85,
    duration: 60,
  }

  test('builds item with correct structure', () => {
    const result = buildItemObject(service, 'CAT-123')
    expect(result.type).toBe('ITEM')
    expect(result.id).toBe('#item-svc-1')
    expect(result.itemData.name).toBe('60-min Swedish Massage')
    expect(result.itemData.productType).toBe('APPOINTMENTS_SERVICE')
    expect(result.itemData.descriptionPlaintext).toBe('A relaxing full-body massage')
    expect(result.itemData.categories).toEqual([{ id: 'CAT-123' }])
  })

  test('sets correct price in cents as BigInt', () => {
    const result = buildItemObject(service, null)
    const variation = result.itemData.variations[0]
    expect(variation.itemVariationData.priceMoney.amount).toBe(BigInt(8500))
    expect(variation.itemVariationData.priceMoney.currency).toBe('USD')
  })

  test('sets service duration in milliseconds as BigInt', () => {
    const result = buildItemObject(service, null)
    const variation = result.itemData.variations[0]
    // 60 min * 60 sec * 1000 ms = 3600000
    expect(variation.itemVariationData.serviceDuration).toBe(BigInt(3600000))
  })

  test('omits categories when categoryId is null', () => {
    const result = buildItemObject(service, null)
    expect(result.itemData.categories).toBeUndefined()
  })

  test('omits description when not provided', () => {
    const noDesc = { ...service, description: undefined }
    const result = buildItemObject(noDesc, null)
    expect(result.itemData.descriptionPlaintext).toBeUndefined()
  })

  test('handles fractional prices correctly', () => {
    const svc = { ...service, price: 12.50 }
    const result = buildItemObject(svc, null)
    expect(result.itemData.variations[0].itemVariationData.priceMoney.amount).toBe(BigInt(1250))
  })

  test('handles zero price', () => {
    const svc = { ...service, price: 0 }
    const result = buildItemObject(svc, null)
    expect(result.itemData.variations[0].itemVariationData.priceMoney.amount).toBe(BigInt(0))
  })
})

// ── getStaffServices ──────────────────────────────────────────

describe('getStaffServices', () => {
  const services = [
    { serviceId: 's1', name: 'Massage', isActive: true, allowedStaff: null },
    { serviceId: 's2', name: 'Facial', isActive: true, allowedStaff: ['staff-1', 'staff-2'] },
    { serviceId: 's3', name: 'Sauna', isActive: true, allowedStaff: ['staff-3'] },
    { serviceId: 's4', name: 'Inactive', isActive: false, allowedStaff: null },
    { serviceId: 's5', name: 'Open', isActive: true, allowedStaff: [] },
  ]

  test('includes services with no staff restriction', () => {
    const result = getStaffServices(services, 'staff-1')
    expect(result.map(s => s.serviceId)).toContain('s1')
  })

  test('includes services where staff is in allowedStaff', () => {
    const result = getStaffServices(services, 'staff-1')
    expect(result.map(s => s.serviceId)).toContain('s2')
  })

  test('excludes services where staff is not in allowedStaff', () => {
    const result = getStaffServices(services, 'staff-1')
    expect(result.map(s => s.serviceId)).not.toContain('s3')
  })

  test('excludes inactive services', () => {
    const result = getStaffServices(services, 'staff-1')
    expect(result.map(s => s.serviceId)).not.toContain('s4')
  })

  test('includes services with empty allowedStaff array', () => {
    const result = getStaffServices(services, 'staff-1')
    expect(result.map(s => s.serviceId)).toContain('s5')
  })

  test('returns empty for staff with no matching services', () => {
    const restrictedOnly = [
      { serviceId: 's1', isActive: true, allowedStaff: ['staff-99'] },
    ]
    expect(getStaffServices(restrictedOnly, 'staff-1')).toHaveLength(0)
  })
})

// ── groupByCategory ───────────────────────────────────────────

describe('groupByCategory', () => {
  test('groups services by category', () => {
    const services = [
      { serviceId: 's1', category: 'Relaxation' },
      { serviceId: 's2', category: 'Beauty' },
      { serviceId: 's3', category: 'Relaxation' },
    ]
    const groups = groupByCategory(services)
    expect(groups.get('Relaxation')).toHaveLength(2)
    expect(groups.get('Beauty')).toHaveLength(1)
  })

  test('uses "Other" for services without category', () => {
    const services = [{ serviceId: 's1', category: null }]
    const groups = groupByCategory(services)
    expect(groups.has('Other')).toBe(true)
  })

  test('handles empty array', () => {
    expect(groupByCategory([]).size).toBe(0)
  })
})

// ── buildUpsertBatches ────────────────────────────────────────

describe('buildUpsertBatches', () => {
  const services = [
    { serviceId: 's1', name: 'Massage', price: 85, duration: 60, category: 'Relaxation' },
    { serviceId: 's2', name: 'Facial', price: 65, duration: 45, category: 'Beauty' },
  ]

  test('creates batches with categories and items', () => {
    const batches = buildUpsertBatches(services)
    expect(batches).toHaveLength(1)
    const objects = batches[0].batches[0].objects
    // 2 categories + 2 items = 4 objects
    expect(objects).toHaveLength(4)
    expect(objects.filter(o => o.type === 'CATEGORY')).toHaveLength(2)
    expect(objects.filter(o => o.type === 'ITEM')).toHaveLength(2)
  })

  test('skips existing categories', () => {
    const existing = {
      items: new Map(),
      categories: new Map([['Relaxation', 'EXISTING-CAT-ID']]),
    }
    const batches = buildUpsertBatches(services, existing)
    const objects = batches[0].batches[0].objects
    // Only 1 new category (Beauty) + 2 items = 3
    expect(objects.filter(o => o.type === 'CATEGORY')).toHaveLength(1)
    // Relaxation item should reference existing category ID
    const massageItem = objects.find(o => o.itemData?.name === 'Massage')
    expect(massageItem.itemData.categories[0].id).toBe('EXISTING-CAT-ID')
  })

  test('uses existing item IDs for updates', () => {
    const existing = {
      items: new Map([['s1', 'EXISTING-ITEM-ID']]),
      categories: new Map(),
    }
    const batches = buildUpsertBatches(services, existing)
    const objects = batches[0].batches[0].objects
    const massageItem = objects.find(o => o.itemData?.name === 'Massage')
    expect(massageItem.id).toBe('EXISTING-ITEM-ID')
  })

  test('has idempotency key on each batch', () => {
    const batches = buildUpsertBatches(services)
    expect(batches[0].idempotencyKey).toBeDefined()
    expect(typeof batches[0].idempotencyKey).toBe('string')
  })
})

// ── parseSyncResponse ─────────────────────────────────────────

describe('parseSyncResponse', () => {
  test('counts items and categories', () => {
    const responseObjects = [
      { type: 'CATEGORY', id: 'CAT-1', categoryData: { name: 'Relaxation' } },
      { type: 'ITEM', id: 'ITEM-1', itemData: { name: 'Massage' } },
      { type: 'ITEM', id: 'ITEM-2', itemData: { name: 'Facial' } },
    ]
    const result = parseSyncResponse(responseObjects)
    expect(result).toEqual({ items: 2, categories: 1 })
  })

  test('handles null response', () => {
    expect(parseSyncResponse(null)).toEqual({ items: 0, categories: 0 })
  })

  test('handles empty array', () => {
    expect(parseSyncResponse([])).toEqual({ items: 0, categories: 0 })
  })
})

// ── buildOrderLineItems ───────────────────────────────────────

describe('buildOrderLineItems', () => {
  const services = [
    { serviceId: 's1', name: 'Massage', price: 85 },
    { serviceId: 's2', name: 'Facial', price: 65 },
  ]

  test('builds line items with correct structure', () => {
    const items = buildOrderLineItems(services, 1)
    expect(items).toHaveLength(2)
    expect(items[0].name).toBe('Massage')
    expect(items[0].quantity).toBe('1')
    expect(items[0].basePriceMoney.amount).toBe(BigInt(8500))
    expect(items[0].catalogObjectId).toBeUndefined()
  })

  test('multiplies quantity for groups', () => {
    const items = buildOrderLineItems(services, 3)
    expect(items[0].quantity).toBe('3')
    expect(items[1].quantity).toBe('3')
  })

  test('defaults to quantity 1 when people is null', () => {
    const items = buildOrderLineItems(services, null)
    expect(items[0].quantity).toBe('1')
  })
})
