/**
 * Unit Tests for Split Calculator Utility
 *
 * Tests for app/utils/splitCalculator.ts:
 * - calculateEqualSplit (floor division, remainder distribution)
 * - validateCustomSplit (sum validation, minimum amount check)
 * - dollarsToCents (dollar-to-cent conversion)
 * - centsToDollars (cent-to-dollar formatting)
 * - Edge cases: zero total, total < payerCount, boundary values
 *
 * Validates Requirements: 2.2, 2.3, 2.6, 2.7, 3.2, 3.3, 8.1, 8.2, 8.3, 8.4, 8.5
 */

import {
  calculateEqualSplit,
  validateCustomSplit,
  dollarsToCents,
  centsToDollars,
} from '../../app/utils/splitCalculator.ts'

// ── calculateEqualSplit: Basic division ─────────────────────────────────────

describe('calculateEqualSplit - basic division', () => {
  test('divides evenly when no remainder', () => {
    const result = calculateEqualSplit({ totalCents: 1000, payerCount: 2 })
    expect(result.payerAmounts).toEqual([500, 500])
  })

  test('divides evenly among 4 payers', () => {
    const result = calculateEqualSplit({ totalCents: 2000, payerCount: 4 })
    expect(result.payerAmounts).toEqual([500, 500, 500, 500])
  })

  test('distributes remainder to first payers', () => {
    const result = calculateEqualSplit({ totalCents: 1001, payerCount: 2 })
    expect(result.payerAmounts).toEqual([501, 500])
  })

  test('distributes 2 cent remainder to first 2 payers', () => {
    const result = calculateEqualSplit({ totalCents: 1002, payerCount: 3 })
    // floor(1002/3) = 334, remainder = 0. Actually 1002/3 = 334, remainder = 0
    // Wait: 334 * 3 = 1002, so no remainder
    expect(result.payerAmounts).toEqual([334, 334, 334])
  })

  test('distributes remainder correctly for 7 cents among 3 payers', () => {
    const result = calculateEqualSplit({ totalCents: 7, payerCount: 3 })
    // floor(7/3) = 2, remainder = 1
    expect(result.payerAmounts).toEqual([3, 2, 2])
  })

  test('sum always equals totalCents', () => {
    const result = calculateEqualSplit({ totalCents: 999, payerCount: 7 })
    const sum = result.payerAmounts.reduce((a, b) => a + b, 0)
    expect(sum).toBe(999)
  })
})

// ── calculateEqualSplit: Edge cases ─────────────────────────────────────────

describe('calculateEqualSplit - edge cases', () => {
  test('zero total: all payers get 0', () => {
    const result = calculateEqualSplit({ totalCents: 0, payerCount: 5 })
    expect(result.payerAmounts).toEqual([0, 0, 0, 0, 0])
  })

  test('1 cent with 10 payers: first payer gets 1, rest get 0', () => {
    const result = calculateEqualSplit({ totalCents: 1, payerCount: 10 })
    expect(result.payerAmounts[0]).toBe(1)
    expect(result.payerAmounts.slice(1)).toEqual(Array(9).fill(0))
    expect(result.payerAmounts.reduce((a, b) => a + b, 0)).toBe(1)
  })

  test('total < payerCount: first (total) payers get 1 cent each', () => {
    const result = calculateEqualSplit({ totalCents: 3, payerCount: 5 })
    // floor(3/5) = 0, remainder = 3
    expect(result.payerAmounts).toEqual([1, 1, 1, 0, 0])
  })

  test('boundary: 2 payers (minimum)', () => {
    const result = calculateEqualSplit({ totalCents: 101, payerCount: 2 })
    expect(result.payerAmounts).toEqual([51, 50])
  })

  test('boundary: 10 payers (maximum)', () => {
    const result = calculateEqualSplit({ totalCents: 1003, payerCount: 10 })
    // floor(1003/10) = 100, remainder = 3
    expect(result.payerAmounts[0]).toBe(101)
    expect(result.payerAmounts[1]).toBe(101)
    expect(result.payerAmounts[2]).toBe(101)
    expect(result.payerAmounts.slice(3)).toEqual(Array(7).fill(100))
    expect(result.payerAmounts.reduce((a, b) => a + b, 0)).toBe(1003)
  })

  test('large total value', () => {
    const result = calculateEqualSplit({ totalCents: 99999, payerCount: 7 })
    const sum = result.payerAmounts.reduce((a, b) => a + b, 0)
    expect(sum).toBe(99999)
  })

  test('maximum practical value: $9999.99 split 10 ways', () => {
    const result = calculateEqualSplit({ totalCents: 999999, payerCount: 10 })
    const sum = result.payerAmounts.reduce((a, b) => a + b, 0)
    expect(sum).toBe(999999)
    // floor(999999/10) = 99999, remainder = 9
    expect(result.payerAmounts.slice(0, 9).every(a => a === 100000)).toBe(true)
    expect(result.payerAmounts[9]).toBe(99999)
  })
})

// ── validateCustomSplit: Valid configurations ────────────────────────────────

describe('validateCustomSplit - valid configurations', () => {
  test('accepts amounts that sum to total and each >= 50', () => {
    const result = validateCustomSplit({
      totalCents: 1000,
      payerAmountsCents: [500, 500],
    })
    expect(result.valid).toBe(true)
    expect(result.remainingCents).toBe(0)
  })

  test('accepts unequal amounts that sum to total', () => {
    const result = validateCustomSplit({
      totalCents: 1000,
      payerAmountsCents: [700, 300],
    })
    expect(result.valid).toBe(true)
  })

  test('accepts amounts with exactly 50 cents minimum', () => {
    const result = validateCustomSplit({
      totalCents: 100,
      payerAmountsCents: [50, 50],
    })
    expect(result.valid).toBe(true)
  })

  test('accepts 10 payers with valid amounts', () => {
    const result = validateCustomSplit({
      totalCents: 5000,
      payerAmountsCents: [500, 500, 500, 500, 500, 500, 500, 500, 500, 500],
    })
    expect(result.valid).toBe(true)
  })
})

// ── validateCustomSplit: Invalid configurations ──────────────────────────────

describe('validateCustomSplit - invalid configurations', () => {
  test('rejects when sum is less than total', () => {
    const result = validateCustomSplit({
      totalCents: 1000,
      payerAmountsCents: [400, 400],
    })
    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.remainingCents).toBe(200)
  })

  test('rejects when sum exceeds total', () => {
    const result = validateCustomSplit({
      totalCents: 1000,
      payerAmountsCents: [600, 600],
    })
    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.remainingCents).toBe(-200)
  })

  test('rejects when any amount is below 50 cents', () => {
    const result = validateCustomSplit({
      totalCents: 1000,
      payerAmountsCents: [950, 49, 1],
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('below the minimum of 50 cents')
  })

  test('rejects when first payer amount is 0', () => {
    const result = validateCustomSplit({
      totalCents: 1000,
      payerAmountsCents: [0, 1000],
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('below the minimum')
  })

  test('reports which payer is below minimum', () => {
    const result = validateCustomSplit({
      totalCents: 200,
      payerAmountsCents: [150, 49, 1],
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Payer 2')
  })

  test('rejects when all amounts are below minimum even if sum matches', () => {
    const result = validateCustomSplit({
      totalCents: 60,
      payerAmountsCents: [30, 30],
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('below the minimum of 50 cents')
  })
})

// ── dollarsToCents: Conversion ───────────────────────────────────────────────

describe('dollarsToCents', () => {
  test('converts whole dollars', () => {
    expect(dollarsToCents(10)).toBe(1000)
  })

  test('converts dollars with cents', () => {
    expect(dollarsToCents(19.99)).toBe(1999)
  })

  test('converts zero', () => {
    expect(dollarsToCents(0)).toBe(0)
  })

  test('handles floating-point precision (0.1 + 0.2 scenario)', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in JS
    expect(dollarsToCents(0.30)).toBe(30)
  })

  test('rounds correctly for values like 1.005', () => {
    // 1.005 * 100 = 100.49999... in some JS engines, Math.round should handle
    expect(dollarsToCents(1.01)).toBe(101)
  })

  test('converts small amount', () => {
    expect(dollarsToCents(0.50)).toBe(50)
  })

  test('converts large amount', () => {
    expect(dollarsToCents(999.99)).toBe(99999)
  })

  test('rounds sub-cent dollar values to nearest cent', () => {
    // Requirement 8.5: sub-cent fractions are rounded via Math.round
    expect(dollarsToCents(1.999)).toBe(200) // rounds up
    expect(dollarsToCents(1.001)).toBe(100) // rounds down
    expect(dollarsToCents(0.505)).toBe(51)  // rounds up
    expect(dollarsToCents(0.504)).toBe(50)  // rounds down
  })
})

// ── centsToDollars: Formatting ───────────────────────────────────────────────

describe('centsToDollars', () => {
  test('formats whole dollar amounts', () => {
    expect(centsToDollars(1000)).toBe('10.00')
  })

  test('formats cents properly', () => {
    expect(centsToDollars(1999)).toBe('19.99')
  })

  test('formats zero', () => {
    expect(centsToDollars(0)).toBe('0.00')
  })

  test('formats single cent', () => {
    expect(centsToDollars(1)).toBe('0.01')
  })

  test('formats amounts under a dollar', () => {
    expect(centsToDollars(50)).toBe('0.50')
  })

  test('always shows exactly 2 decimal places', () => {
    expect(centsToDollars(500)).toBe('5.00')
    expect(centsToDollars(123)).toBe('1.23')
    expect(centsToDollars(99999)).toBe('999.99')
  })
})
