/**
 * Unit Tests for Vendor Revenue Scaler Utility
 *
 * Tests for app/utils/vendorRevenueScaler.ts:
 * - scaleVendorAllocations (proportional scaling with remainder-to-last-payer)
 * - Single vendor bundles, multi-vendor with house fee, zero-discount bundles
 * - Edge cases: very small amounts, totalCents === 0, custom splits
 *
 * Validates Requirements: 6.1, 6.5
 */

import { scaleVendorAllocations } from '../../app/utils/vendorRevenueScaler.ts'
import { dollarsToCents } from '../../app/utils/splitCalculator.ts'

// ── Single vendor bundle split equally between 2 payers ─────────────────────

describe('scaleVendorAllocations - single vendor equal split', () => {
  const fullBundlePayments = [
    { vendorId: 'vendor-A', amount: 100.00, isHouseFee: false },
  ]
  const totalCents = 10000 // $100.00

  test('first payer gets floor of proportional share', () => {
    const result = scaleVendorAllocations(fullBundlePayments, 5000, totalCents, 0, 2)
    expect(result).toEqual([
      { vendorId: 'vendor-A', amountCents: 5000, isHouseFee: false },
    ])
  })

  test('second (final) payer absorbs remainder', () => {
    const result = scaleVendorAllocations(fullBundlePayments, 5000, totalCents, 1, 2)
    expect(result).toEqual([
      { vendorId: 'vendor-A', amountCents: 5000, isHouseFee: false },
    ])
  })

  test('sum across both payers equals full allocation', () => {
    const payer0 = scaleVendorAllocations(fullBundlePayments, 5000, totalCents, 0, 2)
    const payer1 = scaleVendorAllocations(fullBundlePayments, 5000, totalCents, 1, 2)
    const totalVendorA = payer0[0].amountCents + payer1[0].amountCents
    expect(totalVendorA).toBe(10000)
  })

  test('uneven split with allPayerSharesCents: $33.33 and $66.67 from $100', () => {
    // Payer 0 gets 3333 cents, payer 1 gets 6667 cents — must use allPayerSharesCents for correctness
    const allShares = [3333, 6667]
    const payer0 = scaleVendorAllocations(fullBundlePayments, 3333, totalCents, 0, 2, allShares)
    const payer1 = scaleVendorAllocations(fullBundlePayments, 6667, totalCents, 1, 2, allShares)

    // Non-final: floor(10000 * 3333 / 10000) = 3333
    expect(payer0[0].amountCents).toBe(3333)
    // Final: 10000 - 3333 = 6667
    expect(payer1[0].amountCents).toBe(6667)
    expect(payer0[0].amountCents + payer1[0].amountCents).toBe(10000)
  })
})

// ── Multi-vendor bundle with house fee, equal 3-way split ───────────────────

describe('scaleVendorAllocations - multi-vendor with house fee, 3-way split', () => {
  // Simulates: house fee $10, vendor-A net $50, vendor-B net $40
  const fullBundlePayments = [
    { vendorId: 'house', amount: 10.00, isHouseFee: true },
    { vendorId: 'vendor-A', amount: 50.00, isHouseFee: false },
    { vendorId: 'vendor-B', amount: 40.00, isHouseFee: false },
  ]
  const totalCents = 10000 // $100.00
  // Equal 3-way: first 2 get 3334, last gets 3332 (per calculateEqualSplit: remainder to first payers)
  // Actually: floor(10000/3)=3333, remainder=1 → first payer gets 3334, others get 3333
  const allShares = [3334, 3333, 3333]

  test('non-final payer (index 0) gets floor of each vendor share', () => {
    const result = scaleVendorAllocations(fullBundlePayments, 3334, totalCents, 0, 3, allShares)

    // house: floor(1000 * 3334 / 10000) = floor(333.4) = 333
    expect(result[0]).toEqual({ vendorId: 'house', amountCents: 333, isHouseFee: true })
    // vendor-A: floor(5000 * 3334 / 10000) = floor(1667) = 1667
    expect(result[1]).toEqual({ vendorId: 'vendor-A', amountCents: 1667, isHouseFee: false })
    // vendor-B: floor(4000 * 3334 / 10000) = floor(1333.6) = 1333
    expect(result[2]).toEqual({ vendorId: 'vendor-B', amountCents: 1333, isHouseFee: false })
  })

  test('non-final payer (index 1) gets floor of each vendor share', () => {
    const result = scaleVendorAllocations(fullBundlePayments, 3333, totalCents, 1, 3, allShares)

    // house: floor(1000 * 3333 / 10000) = floor(333.3) = 333
    expect(result[0]).toEqual({ vendorId: 'house', amountCents: 333, isHouseFee: true })
    // vendor-A: floor(5000 * 3333 / 10000) = floor(1666.5) = 1666
    expect(result[1]).toEqual({ vendorId: 'vendor-A', amountCents: 1666, isHouseFee: false })
    // vendor-B: floor(4000 * 3333 / 10000) = floor(1333.2) = 1333
    expect(result[2]).toEqual({ vendorId: 'vendor-B', amountCents: 1333, isHouseFee: false })
  })

  test('final payer (index 2) absorbs remainder for each vendor', () => {
    const result = scaleVendorAllocations(fullBundlePayments, 3333, totalCents, 2, 3, allShares)

    // house: 1000 - floor(1000*3334/10000) - floor(1000*3333/10000) = 1000 - 333 - 333 = 334
    expect(result[0]).toEqual({ vendorId: 'house', amountCents: 334, isHouseFee: true })
    // vendor-A: 5000 - floor(5000*3334/10000) - floor(5000*3333/10000) = 5000 - 1667 - 1666 = 1667
    expect(result[1]).toEqual({ vendorId: 'vendor-A', amountCents: 1667, isHouseFee: false })
    // vendor-B: 4000 - floor(4000*3334/10000) - floor(4000*3333/10000) = 4000 - 1333 - 1333 = 1334
    expect(result[2]).toEqual({ vendorId: 'vendor-B', amountCents: 1334, isHouseFee: false })
  })

  test('sum across all 3 payers equals full allocation for each vendor', () => {
    const payer0 = scaleVendorAllocations(fullBundlePayments, 3334, totalCents, 0, 3, allShares)
    const payer1 = scaleVendorAllocations(fullBundlePayments, 3333, totalCents, 1, 3, allShares)
    const payer2 = scaleVendorAllocations(fullBundlePayments, 3333, totalCents, 2, 3, allShares)

    const houseTotal = payer0[0].amountCents + payer1[0].amountCents + payer2[0].amountCents
    const vendorATotal = payer0[1].amountCents + payer1[1].amountCents + payer2[1].amountCents
    const vendorBTotal = payer0[2].amountCents + payer1[2].amountCents + payer2[2].amountCents

    expect(houseTotal).toBe(1000)
    expect(vendorATotal).toBe(5000)
    expect(vendorBTotal).toBe(4000)
  })
})

// ── Zero-discount bundle (all amounts go to vendor shares) ──────────────────

describe('scaleVendorAllocations - zero-discount bundle', () => {
  // No house fee, full price goes to vendors
  const fullBundlePayments = [
    { vendorId: 'vendor-X', amount: 75.00, isHouseFee: false },
    { vendorId: 'vendor-Y', amount: 25.00, isHouseFee: false },
  ]
  const totalCents = 10000 // $100.00

  test('equal 2-way split distributes correctly', () => {
    const payer0 = scaleVendorAllocations(fullBundlePayments, 5000, totalCents, 0, 2)
    const payer1 = scaleVendorAllocations(fullBundlePayments, 5000, totalCents, 1, 2)

    // vendor-X: floor(7500 * 5000 / 10000) = 3750
    expect(payer0[0].amountCents).toBe(3750)
    // vendor-Y: floor(2500 * 5000 / 10000) = 1250
    expect(payer0[1].amountCents).toBe(1250)

    // Final payer: vendor-X: 7500 - 3750 = 3750, vendor-Y: 2500 - 1250 = 1250
    expect(payer1[0].amountCents).toBe(3750)
    expect(payer1[1].amountCents).toBe(1250)

    // Totals
    expect(payer0[0].amountCents + payer1[0].amountCents).toBe(7500)
    expect(payer0[1].amountCents + payer1[1].amountCents).toBe(2500)
  })

  test('preserves isHouseFee: false for all allocations', () => {
    const result = scaleVendorAllocations(fullBundlePayments, 5000, totalCents, 0, 2)
    result.forEach(allocation => {
      expect(allocation.isHouseFee).toBe(false)
    })
  })
})

// ── Very small amounts: $1.01 split 3 ways ──────────────────────────────────

describe('scaleVendorAllocations - very small amounts', () => {
  // $1.01 bundle with single vendor
  const fullBundlePayments = [
    { vendorId: 'vendor-tiny', amount: 1.01, isHouseFee: false },
  ]
  const totalCents = 101

  test('$1.01 split 3 ways: sum equals 101 cents exactly', () => {
    // Equal split of 101 cents among 3: floor(101/3)=33, remainder=2 → first 2 get 34, last gets 33
    const allShares = [34, 34, 33]

    const payer0 = scaleVendorAllocations(fullBundlePayments, 34, totalCents, 0, 3, allShares)
    const payer1 = scaleVendorAllocations(fullBundlePayments, 34, totalCents, 1, 3, allShares)
    const payer2 = scaleVendorAllocations(fullBundlePayments, 33, totalCents, 2, 3, allShares)

    // Non-final payers: floor(101 * 34 / 101) = floor(34) = 34
    expect(payer0[0].amountCents).toBe(34)
    expect(payer1[0].amountCents).toBe(34)
    // Final: 101 - 34 - 34 = 33
    expect(payer2[0].amountCents).toBe(33)

    const total = payer0[0].amountCents + payer1[0].amountCents + payer2[0].amountCents
    expect(total).toBe(101)
  })

  test('multi-vendor $1.01 split preserves exact totals', () => {
    const multiVendor = [
      { vendorId: 'v1', amount: 0.67, isHouseFee: false }, // 67 cents
      { vendorId: 'v2', amount: 0.34, isHouseFee: false }, // 34 cents
    ]
    const total = 101
    const allShares = [34, 34, 33]

    const payer0 = scaleVendorAllocations(multiVendor, 34, total, 0, 3, allShares)
    const payer1 = scaleVendorAllocations(multiVendor, 34, total, 1, 3, allShares)
    const payer2 = scaleVendorAllocations(multiVendor, 33, total, 2, 3, allShares)

    const v1Total = payer0[0].amountCents + payer1[0].amountCents + payer2[0].amountCents
    const v2Total = payer0[1].amountCents + payer1[1].amountCents + payer2[1].amountCents

    expect(v1Total).toBe(67)
    expect(v2Total).toBe(34)
  })
})

// ── Verify sum across all payers equals full allocation exactly ──────────────

describe('scaleVendorAllocations - sum conservation across payers', () => {
  const fullBundlePayments = [
    { vendorId: 'house', amount: 15.00, isHouseFee: true },
    { vendorId: 'vendor-1', amount: 45.50, isHouseFee: false },
    { vendorId: 'vendor-2', amount: 39.50, isHouseFee: false },
  ]
  const totalCents = 10000

  test('5-way equal split conserves all vendor totals', () => {
    // Equal split of 10000 among 5: each gets 2000
    const payerResults = []
    for (let i = 0; i < 5; i++) {
      payerResults.push(scaleVendorAllocations(fullBundlePayments, 2000, totalCents, i, 5))
    }

    // Sum each vendor across all payers
    const houseSum = payerResults.reduce((sum, r) => sum + r[0].amountCents, 0)
    const v1Sum = payerResults.reduce((sum, r) => sum + r[1].amountCents, 0)
    const v2Sum = payerResults.reduce((sum, r) => sum + r[2].amountCents, 0)

    expect(houseSum).toBe(dollarsToCents(15.00))
    expect(v1Sum).toBe(dollarsToCents(45.50))
    expect(v2Sum).toBe(dollarsToCents(39.50))
  })

  test('7-way split with uneven amounts conserves totals', () => {
    // 10000 / 7 = 1428 remainder 4 → first 4 get 1429, rest get 1428
    const shares = [1429, 1429, 1429, 1429, 1428, 1428, 1428]
    const payerResults = []
    for (let i = 0; i < 7; i++) {
      payerResults.push(scaleVendorAllocations(fullBundlePayments, shares[i], totalCents, i, 7, shares))
    }

    const houseSum = payerResults.reduce((sum, r) => sum + r[0].amountCents, 0)
    const v1Sum = payerResults.reduce((sum, r) => sum + r[1].amountCents, 0)
    const v2Sum = payerResults.reduce((sum, r) => sum + r[2].amountCents, 0)

    expect(houseSum).toBe(1500)
    expect(v1Sum).toBe(4550)
    expect(v2Sum).toBe(3950)
  })
})

// ── Custom split with allPayerSharesCents provided ──────────────────────────

describe('scaleVendorAllocations - custom split with allPayerSharesCents', () => {
  const fullBundlePayments = [
    { vendorId: 'vendor-A', amount: 80.00, isHouseFee: false },
    { vendorId: 'vendor-B', amount: 20.00, isHouseFee: false },
  ]
  const totalCents = 10000

  test('custom 70/30 split conserves vendor totals', () => {
    const allShares = [7000, 3000]

    const payer0 = scaleVendorAllocations(fullBundlePayments, 7000, totalCents, 0, 2, allShares)
    const payer1 = scaleVendorAllocations(fullBundlePayments, 3000, totalCents, 1, 2, allShares)

    // vendor-A (8000 cents): payer0 = floor(8000 * 7000 / 10000) = 5600
    expect(payer0[0].amountCents).toBe(5600)
    // vendor-A final: 8000 - 5600 = 2400
    expect(payer1[0].amountCents).toBe(2400)

    // vendor-B (2000 cents): payer0 = floor(2000 * 7000 / 10000) = 1400
    expect(payer0[1].amountCents).toBe(1400)
    // vendor-B final: 2000 - 1400 = 600
    expect(payer1[1].amountCents).toBe(600)

    // Conservation
    expect(payer0[0].amountCents + payer1[0].amountCents).toBe(8000)
    expect(payer0[1].amountCents + payer1[1].amountCents).toBe(2000)
  })

  test('custom 3-way split with unequal amounts conserves totals', () => {
    const allShares = [5000, 3000, 2000]

    const payer0 = scaleVendorAllocations(fullBundlePayments, 5000, totalCents, 0, 3, allShares)
    const payer1 = scaleVendorAllocations(fullBundlePayments, 3000, totalCents, 1, 3, allShares)
    const payer2 = scaleVendorAllocations(fullBundlePayments, 2000, totalCents, 2, 3, allShares)

    const vendorATotal = payer0[0].amountCents + payer1[0].amountCents + payer2[0].amountCents
    const vendorBTotal = payer0[1].amountCents + payer1[1].amountCents + payer2[1].amountCents

    expect(vendorATotal).toBe(8000)
    expect(vendorBTotal).toBe(2000)
  })

  test('custom split with amounts that cause rounding differences', () => {
    // $33.33 bundle: vendor gets $33.33 → 3333 cents
    const payments = [
      { vendorId: 'solo-vendor', amount: 33.33, isHouseFee: false },
    ]
    const total = 3333
    const allShares = [1111, 1111, 1111] // sum = 3333

    const payer0 = scaleVendorAllocations(payments, 1111, total, 0, 3, allShares)
    const payer1 = scaleVendorAllocations(payments, 1111, total, 1, 3, allShares)
    const payer2 = scaleVendorAllocations(payments, 1111, total, 2, 3, allShares)

    const sum = payer0[0].amountCents + payer1[0].amountCents + payer2[0].amountCents
    expect(sum).toBe(3333)
  })
})

// ── Edge case: totalCents === 0 ─────────────────────────────────────────────

describe('scaleVendorAllocations - totalCents === 0', () => {
  test('returns 0 for all allocations when totalCents is 0', () => {
    const fullBundlePayments = [
      { vendorId: 'vendor-A', amount: 50.00, isHouseFee: false },
      { vendorId: 'house', amount: 10.00, isHouseFee: true },
    ]

    const result = scaleVendorAllocations(fullBundlePayments, 0, 0, 0, 2)

    expect(result).toEqual([
      { vendorId: 'vendor-A', amountCents: 0, isHouseFee: false },
      { vendorId: 'house', amountCents: 0, isHouseFee: true },
    ])
  })

  test('returns 0 for final payer when totalCents is 0', () => {
    const fullBundlePayments = [
      { vendorId: 'vendor-A', amount: 25.00, isHouseFee: false },
    ]

    const result = scaleVendorAllocations(fullBundlePayments, 0, 0, 1, 2)

    expect(result).toEqual([
      { vendorId: 'vendor-A', amountCents: 0, isHouseFee: false },
    ])
  })

  test('preserves vendorId and isHouseFee in zero-total scenario', () => {
    const fullBundlePayments = [
      { vendorId: 'house', amount: 0, isHouseFee: true },
      { vendorId: 'v1', amount: 0, isHouseFee: false },
      { vendorId: 'v2', amount: 0, isHouseFee: false },
    ]

    const result = scaleVendorAllocations(fullBundlePayments, 0, 0, 0, 3)

    expect(result[0].vendorId).toBe('house')
    expect(result[0].isHouseFee).toBe(true)
    expect(result[1].vendorId).toBe('v1')
    expect(result[1].isHouseFee).toBe(false)
    expect(result[2].vendorId).toBe('v2')
    expect(result[2].isHouseFee).toBe(false)
  })
})
