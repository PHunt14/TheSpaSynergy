/**
 * Unit Tests for Bundle Discount Calculator
 *
 * Tests for app/utils/bundleDiscount.js:
 * - calculateBundlePrice (tier discounts, pre-defined bundle override)
 * - distributeDiscountAcrossVendors (proportional distribution)
 * - validateBundleServices (vendor count, service count, active status)
 * - Edge cases: 0% discount, 100% discount
 *
 * Validates Requirements: 1.3, 1.4, 2.3, 3.3, 3.4, 3.5, 3.6
 */

import {
  calculateBundlePrice,
  distributeDiscountAcrossVendors,
  validateBundleServices
} from '../../app/utils/bundleDiscount.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

// NOTE: vendorId in these service fixtures represents the vendor context resolved at runtime
// from the assigned staff member's provider (StaffSchedule.vendorId), not a persisted field
// on the Service data model. The Service model no longer contains vendorId (Requirement 9.1).
// These bundle discount utilities still accept vendorId as input for payment routing purposes.
const makeService = (id, vendorId, price, opts = {}) => ({
  serviceId: id,
  vendorId,
  price,
  name: opts.name || `Service ${id}`,
  isActive: opts.isActive !== undefined ? opts.isActive : true,
  houseFeeEnabled: opts.houseFeeEnabled || false,
  houseFeeAmount: opts.houseFeeAmount || 0,
})

const defaultBundleSettings = {
  discount2Services: 5,
  discount3Services: 10,
  discount4PlusServices: 15,
}

// ── calculateBundlePrice: Tier Discount Selection ────────────────────────────

describe('calculateBundlePrice - tier discounts', () => {
  test('2 services: applies discount2Services percentage', () => {
    const services = [
      makeService('svc-1', 'v-a', 100),
      makeService('svc-2', 'v-b', 100),
    ]
    const result = calculateBundlePrice({
      services,
      predefinedBundle: null,
      bundleSettings: defaultBundleSettings,
    })

    expect(result.subtotal).toBe(200)
    expect(result.discountPercent).toBe(5)
    expect(result.discountAmount).toBe(10)
    expect(result.total).toBe(190)
  })

  test('3 services: applies discount3Services percentage', () => {
    const services = [
      makeService('svc-1', 'v-a', 100),
      makeService('svc-2', 'v-b', 80),
      makeService('svc-3', 'v-c', 120),
    ]
    const result = calculateBundlePrice({
      services,
      predefinedBundle: null,
      bundleSettings: defaultBundleSettings,
    })

    expect(result.subtotal).toBe(300)
    expect(result.discountPercent).toBe(10)
    expect(result.discountAmount).toBe(30)
    expect(result.total).toBe(270)
  })

  test('4 services: applies discount4PlusServices percentage', () => {
    const services = [
      makeService('svc-1', 'v-a', 50),
      makeService('svc-2', 'v-b', 60),
      makeService('svc-3', 'v-c', 70),
      makeService('svc-4', 'v-d', 80),
    ]
    const result = calculateBundlePrice({
      services,
      predefinedBundle: null,
      bundleSettings: defaultBundleSettings,
    })

    expect(result.subtotal).toBe(260)
    expect(result.discountPercent).toBe(15)
    expect(result.discountAmount).toBe(39)
    expect(result.total).toBe(221)
  })

  test('5+ services: still applies discount4PlusServices percentage', () => {
    const services = Array.from({ length: 7 }, (_, i) =>
      makeService(`svc-${i}`, `v-${i % 3}`, 40)
    )
    const result = calculateBundlePrice({
      services,
      predefinedBundle: null,
      bundleSettings: defaultBundleSettings,
    })

    expect(result.subtotal).toBe(280)
    expect(result.discountPercent).toBe(15)
    expect(result.discountAmount).toBe(42)
    expect(result.total).toBe(238)
  })

  test('1 service: no tier discount applied', () => {
    const services = [makeService('svc-1', 'v-a', 100)]
    const result = calculateBundlePrice({
      services,
      predefinedBundle: null,
      bundleSettings: defaultBundleSettings,
    })

    expect(result.subtotal).toBe(100)
    expect(result.discountPercent).toBe(0)
    expect(result.discountAmount).toBe(0)
    expect(result.total).toBe(100)
  })

  test('no bundleSettings: no discount applied', () => {
    const services = [
      makeService('svc-1', 'v-a', 100),
      makeService('svc-2', 'v-b', 100),
    ]
    const result = calculateBundlePrice({
      services,
      predefinedBundle: null,
      bundleSettings: null,
    })

    expect(result.subtotal).toBe(200)
    expect(result.discountPercent).toBe(0)
    expect(result.discountAmount).toBe(0)
    expect(result.total).toBe(200)
  })
})

// ── calculateBundlePrice: Pre-Defined Bundle Discount Override ───────────────

describe('calculateBundlePrice - pre-defined bundle discount', () => {
  test('uses predefinedBundle discountPercent instead of tier discount', () => {
    const services = [
      makeService('svc-1', 'v-a', 100),
      makeService('svc-2', 'v-b', 100),
    ]
    const predefinedBundle = { discountPercent: 20 }

    const result = calculateBundlePrice({
      services,
      predefinedBundle,
      bundleSettings: defaultBundleSettings,
    })

    // Should use 20% from predefined, not 5% from tier
    expect(result.subtotal).toBe(200)
    expect(result.discountPercent).toBe(20)
    expect(result.discountAmount).toBe(40)
    expect(result.total).toBe(160)
  })

  test('predefined bundle with 0 discountPercent results in no discount', () => {
    const services = [
      makeService('svc-1', 'v-a', 100),
      makeService('svc-2', 'v-b', 100),
    ]
    const predefinedBundle = { discountPercent: 0 }

    const result = calculateBundlePrice({
      services,
      predefinedBundle,
      bundleSettings: defaultBundleSettings,
    })

    expect(result.discountPercent).toBe(0)
    expect(result.discountAmount).toBe(0)
    expect(result.total).toBe(200)
  })

  test('predefined bundle takes priority over bundleSettings even for 4+ services', () => {
    const services = Array.from({ length: 5 }, (_, i) =>
      makeService(`svc-${i}`, `v-${i % 2}`, 50)
    )
    const predefinedBundle = { discountPercent: 25 }

    const result = calculateBundlePrice({
      services,
      predefinedBundle,
      bundleSettings: defaultBundleSettings,
    })

    expect(result.subtotal).toBe(250)
    expect(result.discountPercent).toBe(25)
    expect(result.discountAmount).toBe(62.5)
    expect(result.total).toBe(187.5)
  })
})

// ── distributeDiscountAcrossVendors ──────────────────────────────────────────

describe('distributeDiscountAcrossVendors - proportional distribution', () => {
  test('distributes discount proportionally based on vendor share of total', () => {
    const services = [
      makeService('svc-1', 'v-a', 100),
      makeService('svc-2', 'v-b', 200),
    ]
    const discountAmount = 30
    const houseVendorId = 'house'

    const breakdown = distributeDiscountAcrossVendors(services, discountAmount, houseVendorId)

    expect(breakdown).toHaveLength(2)
    // v-a has 100/300 = 33.33% share → discount = 10
    expect(breakdown[0].originalPrice).toBe(100)
    expect(breakdown[0].discountedPrice).toBe(90)
    // v-b has 200/300 = 66.67% share → discount = 20
    expect(breakdown[1].originalPrice).toBe(200)
    expect(breakdown[1].discountedPrice).toBe(180)
  })

  test('total discounted prices sum to subtotal minus discount', () => {
    const services = [
      makeService('svc-1', 'v-a', 80),
      makeService('svc-2', 'v-b', 120),
      makeService('svc-3', 'v-c', 100),
    ]
    const discountAmount = 45
    const houseVendorId = 'house'

    const breakdown = distributeDiscountAcrossVendors(services, discountAmount, houseVendorId)

    const totalDiscounted = breakdown.reduce((sum, b) => sum + b.discountedPrice, 0)
    expect(totalDiscounted).toBeCloseTo(300 - 45, 2)
  })

  test('house fees are deducted from discounted price for non-house vendors', () => {
    const services = [
      makeService('svc-1', 'v-a', 100, { houseFeeEnabled: true, houseFeeAmount: 10 }),
      makeService('svc-2', 'v-b', 100, { houseFeeEnabled: true, houseFeeAmount: 15 }),
    ]
    const discountAmount = 20
    const houseVendorId = 'house'

    const breakdown = distributeDiscountAcrossVendors(services, discountAmount, houseVendorId)

    // Each service gets 50% of discount = 10 each
    expect(breakdown[0].discountedPrice).toBe(90)
    expect(breakdown[0].houseFee).toBe(10)
    expect(breakdown[0].vendorNet).toBe(80)

    expect(breakdown[1].discountedPrice).toBe(90)
    expect(breakdown[1].houseFee).toBe(15)
    expect(breakdown[1].vendorNet).toBe(75)
  })

  test('house vendor services do not have house fee deducted', () => {
    const services = [
      makeService('svc-1', 'house', 100, { houseFeeEnabled: true, houseFeeAmount: 10 }),
      makeService('svc-2', 'v-b', 100, { houseFeeEnabled: true, houseFeeAmount: 10 }),
    ]
    const discountAmount = 20
    const houseVendorId = 'house'

    const breakdown = distributeDiscountAcrossVendors(services, discountAmount, houseVendorId)

    // House vendor: no house fee deducted
    expect(breakdown[0].houseFee).toBe(0)
    expect(breakdown[0].vendorNet).toBe(90)

    // Non-house vendor: house fee deducted
    expect(breakdown[1].houseFee).toBe(10)
    expect(breakdown[1].vendorNet).toBe(80)
  })

  test('zero discount: all services keep original price', () => {
    const services = [
      makeService('svc-1', 'v-a', 100),
      makeService('svc-2', 'v-b', 200),
    ]
    const breakdown = distributeDiscountAcrossVendors(services, 0, 'house')

    expect(breakdown[0].discountedPrice).toBe(100)
    expect(breakdown[1].discountedPrice).toBe(200)
  })

  test('handles zero subtotal gracefully', () => {
    const services = [
      makeService('svc-1', 'v-a', 0),
      makeService('svc-2', 'v-b', 0),
    ]
    const breakdown = distributeDiscountAcrossVendors(services, 0, 'house')

    expect(breakdown[0].discountedPrice).toBe(0)
    expect(breakdown[1].discountedPrice).toBe(0)
  })

  test('last service absorbs rounding remainder', () => {
    // 3 services of $33.33 each = $99.99 total, discount $10
    // Each share = 33.33%, proportional discount = 3.33 each
    // Last service should absorb rounding to ensure total discount = $10
    const services = [
      makeService('svc-1', 'v-a', 33.33),
      makeService('svc-2', 'v-b', 33.33),
      makeService('svc-3', 'v-c', 33.33),
    ]
    const discountAmount = 10
    const breakdown = distributeDiscountAcrossVendors(services, discountAmount, 'house')

    const totalDiscount = breakdown.reduce((sum, b) => sum + (b.originalPrice - b.discountedPrice), 0)
    expect(totalDiscount).toBeCloseTo(10, 2)
  })
})

// ── validateBundleServices: Fewer than 2 vendors rejected ────────────────────

describe('validateBundleServices - vendor count validation', () => {
  test('rejects services from only 1 vendor', () => {
    const services = [
      makeService('svc-1', 'v-a', 100),
      makeService('svc-2', 'v-a', 100),
    ]
    const result = validateBundleServices(services)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('at least 2 vendors')
  })

  test('accepts services from exactly 2 vendors', () => {
    const services = [
      makeService('svc-1', 'v-a', 100),
      makeService('svc-2', 'v-b', 100),
    ]
    const result = validateBundleServices(services)

    expect(result.valid).toBe(true)
    expect(result.error).toBeNull()
  })

  test('accepts services from 3+ vendors', () => {
    const services = [
      makeService('svc-1', 'v-a', 100),
      makeService('svc-2', 'v-b', 100),
      makeService('svc-3', 'v-c', 100),
    ]
    const result = validateBundleServices(services)

    expect(result.valid).toBe(true)
    expect(result.error).toBeNull()
  })
})

// ── validateBundleServices: More than 10 services rejected ───────────────────

describe('validateBundleServices - service count validation', () => {
  test('rejects more than 10 services', () => {
    const services = Array.from({ length: 11 }, (_, i) =>
      makeService(`svc-${i}`, `v-${i % 3}`, 50)
    )
    const result = validateBundleServices(services)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Maximum 10 services')
  })

  test('accepts exactly 10 services from 2+ vendors', () => {
    const services = Array.from({ length: 10 }, (_, i) =>
      makeService(`svc-${i}`, `v-${i % 2}`, 50)
    )
    const result = validateBundleServices(services)

    expect(result.valid).toBe(true)
    expect(result.error).toBeNull()
  })

  test('rejects fewer than 2 services', () => {
    const services = [makeService('svc-1', 'v-a', 100)]
    const result = validateBundleServices(services)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('at least 2 services')
  })

  test('rejects empty array', () => {
    const result = validateBundleServices([])

    expect(result.valid).toBe(false)
    expect(result.error).toContain('at least 2 services')
  })

  test('rejects null/undefined input', () => {
    expect(validateBundleServices(null).valid).toBe(false)
    expect(validateBundleServices(undefined).valid).toBe(false)
  })
})

// ── validateBundleServices: Inactive service rejected ────────────────────────

describe('validateBundleServices - inactive service validation', () => {
  test('rejects when any service is inactive', () => {
    const services = [
      makeService('svc-1', 'v-a', 100, { isActive: true }),
      makeService('svc-2', 'v-b', 100, { isActive: false, name: 'Massage' }),
    ]
    const result = validateBundleServices(services)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Massage')
    expect(result.error).toContain('no longer available')
  })

  test('rejects when first service is inactive', () => {
    const services = [
      makeService('svc-1', 'v-a', 100, { isActive: false, name: 'Facial' }),
      makeService('svc-2', 'v-b', 100, { isActive: true }),
    ]
    const result = validateBundleServices(services)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Facial')
  })

  test('accepts when all services are active', () => {
    const services = [
      makeService('svc-1', 'v-a', 100, { isActive: true }),
      makeService('svc-2', 'v-b', 100, { isActive: true }),
    ]
    const result = validateBundleServices(services)

    expect(result.valid).toBe(true)
  })
})

// ── Edge Cases: 0% and 100% discount ────────────────────────────────────────

describe('Edge cases - extreme discount values', () => {
  test('0% discount: total equals subtotal', () => {
    const services = [
      makeService('svc-1', 'v-a', 100),
      makeService('svc-2', 'v-b', 100),
    ]
    const bundleSettings = {
      discount2Services: 0,
      discount3Services: 0,
      discount4PlusServices: 0,
    }
    const result = calculateBundlePrice({
      services,
      predefinedBundle: null,
      bundleSettings,
    })

    expect(result.discountPercent).toBe(0)
    expect(result.discountAmount).toBe(0)
    expect(result.total).toBe(200)
  })

  test('100% discount: total is 0', () => {
    const services = [
      makeService('svc-1', 'v-a', 100),
      makeService('svc-2', 'v-b', 100),
    ]
    const predefinedBundle = { discountPercent: 100 }

    const result = calculateBundlePrice({
      services,
      predefinedBundle,
      bundleSettings: defaultBundleSettings,
    })

    expect(result.discountPercent).toBe(100)
    expect(result.discountAmount).toBe(200)
    expect(result.total).toBe(0)
  })

  test('100% discount distribution: all discounted prices are 0', () => {
    const services = [
      makeService('svc-1', 'v-a', 100),
      makeService('svc-2', 'v-b', 200),
    ]
    const subtotal = 300
    const breakdown = distributeDiscountAcrossVendors(services, subtotal, 'house')

    expect(breakdown[0].discountedPrice).toBe(0)
    expect(breakdown[1].discountedPrice).toBe(0)
  })

  test('0% tier discount with bundleSettings having all zeros', () => {
    const services = [
      makeService('svc-1', 'v-a', 50),
      makeService('svc-2', 'v-b', 75),
      makeService('svc-3', 'v-c', 100),
      makeService('svc-4', 'v-d', 125),
    ]
    const bundleSettings = {
      discount2Services: 0,
      discount3Services: 0,
      discount4PlusServices: 0,
    }
    const result = calculateBundlePrice({
      services,
      predefinedBundle: null,
      bundleSettings,
    })

    expect(result.discountPercent).toBe(0)
    expect(result.discountAmount).toBe(0)
    expect(result.total).toBe(350)
  })

  test('distributeDiscountAcrossVendors with 0 discount preserves all prices', () => {
    const services = [
      makeService('svc-1', 'v-a', 75, { houseFeeEnabled: true, houseFeeAmount: 5 }),
      makeService('svc-2', 'v-b', 125, { houseFeeEnabled: true, houseFeeAmount: 10 }),
    ]
    const breakdown = distributeDiscountAcrossVendors(services, 0, 'house')

    expect(breakdown[0].originalPrice).toBe(75)
    expect(breakdown[0].discountedPrice).toBe(75)
    expect(breakdown[0].houseFee).toBe(5)
    expect(breakdown[0].vendorNet).toBe(70)

    expect(breakdown[1].originalPrice).toBe(125)
    expect(breakdown[1].discountedPrice).toBe(125)
    expect(breakdown[1].houseFee).toBe(10)
    expect(breakdown[1].vendorNet).toBe(115)
  })
})
