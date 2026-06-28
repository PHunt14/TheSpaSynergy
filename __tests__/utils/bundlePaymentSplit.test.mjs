/**
 * Unit Tests for Bundle Payment Split Calculator
 *
 * Tests for app/utils/bundlePaymentSplit.js:
 * - calculateBundlePaymentSplit (proportional discount distribution, house fees, vendor shares)
 * - Edge cases: no house fees, all services have house fees
 *
 * Validates Requirements: 5.2, 5.3, 5.4, 5.5
 */

import { calculateBundlePaymentSplit } from '../../app/utils/bundlePaymentSplit.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

// NOTE: vendorId in these service fixtures represents the vendor context resolved at runtime
// from the assigned staff member's provider (StaffSchedule.vendorId), not a persisted field
// on the Service data model. The Service model no longer contains vendorId (Requirement 9.1).
// These bundle payment utilities still accept vendorId as input for payment routing purposes.
const makeService = (id, vendorId, price, opts = {}) => ({
  serviceId: id,
  vendorId,
  price,
  name: opts.name || `Service ${id}`,
  houseFeeEnabled: opts.houseFeeEnabled || false,
  houseFeeAmount: opts.houseFeeAmount || 0,
})

// ── Proportional Discount Distribution ───────────────────────────────────────

describe('calculateBundlePaymentSplit - proportional discount distribution', () => {
  test('distributes discount proportionally based on vendor undiscounted totals', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 100),
      makeService('svc-2', 'vendor-b', 200),
    ]
    const result = calculateBundlePaymentSplit({
      services,
      discountAmount: 30,
      houseVendorId: 'house',
    })

    // vendor-a: 100/300 share → discount 10, net = 90
    // vendor-b: 200/300 share → discount 20, net = 180
    expect(result.total).toBe(270)
    expect(result.vendorShares).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ vendorId: 'vendor-a', amount: 90 }),
        expect.objectContaining({ vendorId: 'vendor-b', amount: 180 }),
      ])
    )
  })

  test('distributes discount across 3 vendors proportionally', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 100),
      makeService('svc-2', 'vendor-b', 150),
      makeService('svc-3', 'vendor-c', 250),
    ]
    const result = calculateBundlePaymentSplit({
      services,
      discountAmount: 50,
      houseVendorId: 'house',
    })

    // subtotal = 500, discount = 50, total = 450
    expect(result.total).toBe(450)

    // vendor-a: 100/500 = 20% → discount 10, net = 90
    // vendor-b: 150/500 = 30% → discount 15, net = 135
    // vendor-c: 250/500 = 50% → discount 25, net = 225
    const shareA = result.vendorShares.find(s => s.vendorId === 'vendor-a')
    const shareB = result.vendorShares.find(s => s.vendorId === 'vendor-b')
    const shareC = result.vendorShares.find(s => s.vendorId === 'vendor-c')

    expect(shareA.amount).toBe(90)
    expect(shareB.amount).toBe(135)
    expect(shareC.amount).toBe(225)
  })

  test('zero discount means no reduction to vendor shares', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 100),
      makeService('svc-2', 'vendor-b', 200),
    ]
    const result = calculateBundlePaymentSplit({
      services,
      discountAmount: 0,
      houseVendorId: 'house',
    })

    expect(result.total).toBe(300)
    const shareA = result.vendorShares.find(s => s.vendorId === 'vendor-a')
    const shareB = result.vendorShares.find(s => s.vendorId === 'vendor-b')
    expect(shareA.amount).toBe(100)
    expect(shareB.amount).toBe(200)
  })

  test('last vendor absorbs rounding remainder for discount distribution', () => {
    // 3 services of $33.33 each = $99.99 total, discount $10
    // Proportional discount per vendor: 33.33/99.99 * 10 ≈ 3.33 each
    // Last vendor absorbs remainder to ensure total discount = $10
    const services = [
      makeService('svc-1', 'vendor-a', 33.33),
      makeService('svc-2', 'vendor-b', 33.33),
      makeService('svc-3', 'vendor-c', 33.33),
    ]
    const result = calculateBundlePaymentSplit({
      services,
      discountAmount: 10,
      houseVendorId: 'house',
    })

    // Sum of vendor shares should equal total
    const totalShares = result.vendorShares.reduce((sum, s) => sum + s.amount, 0)
    expect(totalShares).toBeCloseTo(result.total, 2)
  })
})

// ── House Fee Collection from Multiple Services ──────────────────────────────

describe('calculateBundlePaymentSplit - house fee collection', () => {
  test('collects house fees from services with houseFeeEnabled', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 100, { houseFeeEnabled: true, houseFeeAmount: 10 }),
      makeService('svc-2', 'vendor-b', 100, { houseFeeEnabled: true, houseFeeAmount: 15 }),
    ]
    const result = calculateBundlePaymentSplit({
      services,
      discountAmount: 0,
      houseVendorId: 'house',
    })

    expect(result.houseFee).toBe(25)
  })

  test('house fee appears in bundlePayments with isHouseFee true', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 100, { houseFeeEnabled: true, houseFeeAmount: 10 }),
      makeService('svc-2', 'vendor-b', 100, { houseFeeEnabled: true, houseFeeAmount: 15 }),
    ]
    const result = calculateBundlePaymentSplit({
      services,
      discountAmount: 0,
      houseVendorId: 'house',
    })

    const houseFeePayment = result.bundlePayments.find(p => p.isHouseFee === true)
    expect(houseFeePayment).toBeDefined()
    expect(houseFeePayment.vendorId).toBe('house')
    expect(houseFeePayment.amount).toBe(25)
  })

  test('house vendor services do not pay house fees to themselves', () => {
    const services = [
      makeService('svc-1', 'house', 100, { houseFeeEnabled: true, houseFeeAmount: 10 }),
      makeService('svc-2', 'vendor-b', 100, { houseFeeEnabled: true, houseFeeAmount: 15 }),
    ]
    const result = calculateBundlePaymentSplit({
      services,
      discountAmount: 0,
      houseVendorId: 'house',
    })

    // Only vendor-b's house fee is collected (house vendor doesn't pay itself)
    expect(result.houseFee).toBe(15)
  })

  test('house fees are deducted from vendor net amounts', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 100, { houseFeeEnabled: true, houseFeeAmount: 10 }),
      makeService('svc-2', 'vendor-b', 200, { houseFeeEnabled: true, houseFeeAmount: 20 }),
    ]
    const result = calculateBundlePaymentSplit({
      services,
      discountAmount: 0,
      houseVendorId: 'house',
    })

    // vendor-a: 100 - 10 house fee = 90
    // vendor-b: 200 - 20 house fee = 180
    const shareA = result.vendorShares.find(s => s.vendorId === 'vendor-a')
    const shareB = result.vendorShares.find(s => s.vendorId === 'vendor-b')
    expect(shareA.amount).toBe(90)
    expect(shareB.amount).toBe(180)
  })

  test('house fees combined with discount reduce vendor shares correctly', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 100, { houseFeeEnabled: true, houseFeeAmount: 10 }),
      makeService('svc-2', 'vendor-b', 100, { houseFeeEnabled: true, houseFeeAmount: 10 }),
    ]
    const result = calculateBundlePaymentSplit({
      services,
      discountAmount: 20,
      houseVendorId: 'house',
    })

    // subtotal = 200, discount = 20, total = 180
    expect(result.total).toBe(180)
    // Each vendor: 100/200 = 50% share → discount 10 each → discounted = 90
    // Then house fee 10 deducted → net = 80 each
    const shareA = result.vendorShares.find(s => s.vendorId === 'vendor-a')
    const shareB = result.vendorShares.find(s => s.vendorId === 'vendor-b')
    expect(shareA.amount).toBe(80)
    expect(shareB.amount).toBe(80)
    expect(result.houseFee).toBe(20)
  })
})

// ── Vendor Shares Sum to Total Minus Discount ────────────────────────────────

describe('calculateBundlePaymentSplit - vendor shares sum to total', () => {
  test('vendor shares plus house fees equal total (no discount)', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 100, { houseFeeEnabled: true, houseFeeAmount: 10 }),
      makeService('svc-2', 'vendor-b', 150, { houseFeeEnabled: true, houseFeeAmount: 15 }),
      makeService('svc-3', 'vendor-c', 200, { houseFeeEnabled: true, houseFeeAmount: 20 }),
    ]
    const result = calculateBundlePaymentSplit({
      services,
      discountAmount: 0,
      houseVendorId: 'house',
    })

    const totalVendorShares = result.vendorShares.reduce((sum, s) => sum + s.amount, 0)
    expect(totalVendorShares + result.houseFee).toBeCloseTo(result.total, 2)
  })

  test('vendor shares plus house fees equal total (with discount)', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 80, { houseFeeEnabled: true, houseFeeAmount: 8 }),
      makeService('svc-2', 'vendor-b', 120, { houseFeeEnabled: true, houseFeeAmount: 12 }),
      makeService('svc-3', 'vendor-c', 100, { houseFeeEnabled: true, houseFeeAmount: 10 }),
    ]
    const result = calculateBundlePaymentSplit({
      services,
      discountAmount: 45,
      houseVendorId: 'house',
    })

    const totalVendorShares = result.vendorShares.reduce((sum, s) => sum + s.amount, 0)
    expect(totalVendorShares + result.houseFee).toBeCloseTo(result.total, 2)
  })

  test('vendor shares plus house fees equal total (large discount)', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 200, { houseFeeEnabled: true, houseFeeAmount: 20 }),
      makeService('svc-2', 'vendor-b', 300, { houseFeeEnabled: true, houseFeeAmount: 30 }),
    ]
    const result = calculateBundlePaymentSplit({
      services,
      discountAmount: 100,
      houseVendorId: 'house',
    })

    // subtotal = 500, discount = 100, total = 400
    expect(result.total).toBe(400)
    const totalVendorShares = result.vendorShares.reduce((sum, s) => sum + s.amount, 0)
    expect(totalVendorShares + result.houseFee).toBeCloseTo(400, 2)
  })

  test('total equals subtotal minus discount', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 75),
      makeService('svc-2', 'vendor-b', 125),
      makeService('svc-3', 'vendor-c', 50),
    ]
    const result = calculateBundlePaymentSplit({
      services,
      discountAmount: 25,
      houseVendorId: 'house',
    })

    expect(result.total).toBe(225)
  })
})

// ── Services with No House Fees ──────────────────────────────────────────────

describe('calculateBundlePaymentSplit - services with no house fees', () => {
  test('no house fees: houseFee is 0', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 100),
      makeService('svc-2', 'vendor-b', 200),
    ]
    const result = calculateBundlePaymentSplit({
      services,
      discountAmount: 30,
      houseVendorId: 'house',
    })

    expect(result.houseFee).toBe(0)
  })

  test('no house fees: no house fee entry in bundlePayments', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 100),
      makeService('svc-2', 'vendor-b', 200),
    ]
    const result = calculateBundlePaymentSplit({
      services,
      discountAmount: 0,
      houseVendorId: 'house',
    })

    const houseFeePayment = result.bundlePayments.find(p => p.isHouseFee === true)
    expect(houseFeePayment).toBeUndefined()
  })

  test('no house fees: vendor shares equal their discounted totals', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 100),
      makeService('svc-2', 'vendor-b', 100),
    ]
    const result = calculateBundlePaymentSplit({
      services,
      discountAmount: 20,
      houseVendorId: 'house',
    })

    // Each vendor: 50% share → discount 10 each → net = 90 each
    const shareA = result.vendorShares.find(s => s.vendorId === 'vendor-a')
    const shareB = result.vendorShares.find(s => s.vendorId === 'vendor-b')
    expect(shareA.amount).toBe(90)
    expect(shareB.amount).toBe(90)
  })

  test('no house fees: all vendor shares sum to total', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 60),
      makeService('svc-2', 'vendor-b', 80),
      makeService('svc-3', 'vendor-c', 100),
    ]
    const result = calculateBundlePaymentSplit({
      services,
      discountAmount: 24,
      houseVendorId: 'house',
    })

    const totalShares = result.vendorShares.reduce((sum, s) => sum + s.amount, 0)
    expect(totalShares).toBeCloseTo(result.total, 2)
  })

  test('houseFeeEnabled false is treated same as missing', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 100, { houseFeeEnabled: false, houseFeeAmount: 10 }),
      makeService('svc-2', 'vendor-b', 100, { houseFeeEnabled: false, houseFeeAmount: 15 }),
    ]
    const result = calculateBundlePaymentSplit({
      services,
      discountAmount: 0,
      houseVendorId: 'house',
    })

    expect(result.houseFee).toBe(0)
  })
})

// ── All Services Have House Fees ─────────────────────────────────────────────

describe('calculateBundlePaymentSplit - all services have house fees', () => {
  test('all services with house fees: total house fee is sum of all fees', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 100, { houseFeeEnabled: true, houseFeeAmount: 10 }),
      makeService('svc-2', 'vendor-b', 150, { houseFeeEnabled: true, houseFeeAmount: 15 }),
      makeService('svc-3', 'vendor-c', 200, { houseFeeEnabled: true, houseFeeAmount: 20 }),
    ]
    const result = calculateBundlePaymentSplit({
      services,
      discountAmount: 0,
      houseVendorId: 'house',
    })

    expect(result.houseFee).toBe(45)
  })

  test('all services with house fees and discount: vendor shares reduced by both', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 100, { houseFeeEnabled: true, houseFeeAmount: 10 }),
      makeService('svc-2', 'vendor-b', 100, { houseFeeEnabled: true, houseFeeAmount: 10 }),
    ]
    const result = calculateBundlePaymentSplit({
      services,
      discountAmount: 40,
      houseVendorId: 'house',
    })

    // subtotal = 200, discount = 40, total = 160
    expect(result.total).toBe(160)
    // Each vendor: 50% share → discount 20 each → discounted = 80
    // Then house fee 10 deducted → net = 70 each
    const shareA = result.vendorShares.find(s => s.vendorId === 'vendor-a')
    const shareB = result.vendorShares.find(s => s.vendorId === 'vendor-b')
    expect(shareA.amount).toBe(70)
    expect(shareB.amount).toBe(70)
    expect(result.houseFee).toBe(20)
  })

  test('all services with house fees: bundlePayments includes house fee entry and vendor entries', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 100, { houseFeeEnabled: true, houseFeeAmount: 10 }),
      makeService('svc-2', 'vendor-b', 100, { houseFeeEnabled: true, houseFeeAmount: 10 }),
    ]
    const result = calculateBundlePaymentSplit({
      services,
      discountAmount: 0,
      houseVendorId: 'house',
    })

    // Should have house fee entry + 2 vendor entries
    expect(result.bundlePayments.length).toBe(3)

    const houseFeeEntry = result.bundlePayments.find(p => p.isHouseFee === true)
    expect(houseFeeEntry.vendorId).toBe('house')
    expect(houseFeeEntry.amount).toBe(20)

    const vendorEntries = result.bundlePayments.filter(p => p.isHouseFee === false)
    expect(vendorEntries).toHaveLength(2)
  })

  test('multiple services from same vendor: house fees aggregated per vendor', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 100, { houseFeeEnabled: true, houseFeeAmount: 10 }),
      makeService('svc-2', 'vendor-a', 80, { houseFeeEnabled: true, houseFeeAmount: 8 }),
      makeService('svc-3', 'vendor-b', 120, { houseFeeEnabled: true, houseFeeAmount: 12 }),
    ]
    const result = calculateBundlePaymentSplit({
      services,
      discountAmount: 0,
      houseVendorId: 'house',
    })

    // vendor-a house fees: 10 + 8 = 18
    // vendor-b house fees: 12
    // total house fee: 30
    expect(result.houseFee).toBe(30)

    // vendor-a net: (100 + 80) - 18 = 162
    // vendor-b net: 120 - 12 = 108
    const shareA = result.vendorShares.find(s => s.vendorId === 'vendor-a')
    const shareB = result.vendorShares.find(s => s.vendorId === 'vendor-b')
    expect(shareA.amount).toBe(162)
    expect(shareB.amount).toBe(108)
  })

  test('edge case: zero subtotal returns empty result', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 0, { houseFeeEnabled: true, houseFeeAmount: 0 }),
      makeService('svc-2', 'vendor-b', 0, { houseFeeEnabled: true, houseFeeAmount: 0 }),
    ]
    const result = calculateBundlePaymentSplit({
      services,
      discountAmount: 0,
      houseVendorId: 'house',
    })

    expect(result.total).toBe(0)
    expect(result.houseFee).toBe(0)
    expect(result.vendorShares).toEqual([])
    expect(result.bundlePayments).toEqual([])
  })
})
