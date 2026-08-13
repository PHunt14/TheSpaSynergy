/**
 * Extras Calculator Utility Tests
 *
 * Unit tests for calculateExtrasCost and filterAvailableExtras:
 * - Per-person pricing multiplied by group size
 * - Flat pricing independent of group size
 * - Grand total aggregation
 * - Inactive extras filtered out
 * - Group-only extras excluded when groupSize < 3
 * - Group-only extras included when groupSize >= 3
 * - Edge cases: empty arrays, missing fields
 */

import { calculateExtrasCost, filterAvailableExtras } from '../../app/utils/extrasCalculator.js'

describe('calculateExtrasCost', () => {
  test('per-person extra multiplies price by groupSize', () => {
    const extras = [
      { extraId: 'e1', name: 'Drink Package', price: 15, perPerson: true }
    ]
    const result = calculateExtrasCost(extras, 4)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toEqual({
      extraId: 'e1',
      name: 'Drink Package',
      unitPrice: 15,
      quantity: 4,
      total: 60
    })
    expect(result.grandTotal).toBe(60)
  })

  test('flat-price extra uses price regardless of groupSize', () => {
    const extras = [
      { extraId: 'e2', name: 'Charcuterie Board', price: 45, perPerson: false }
    ]
    const result = calculateExtrasCost(extras, 5)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toEqual({
      extraId: 'e2',
      name: 'Charcuterie Board',
      unitPrice: 45,
      quantity: 1,
      total: 45
    })
    expect(result.grandTotal).toBe(45)
  })

  test('calculates grand total for mixed extras', () => {
    const extras = [
      { extraId: 'e1', name: 'Drink Package', price: 15, perPerson: true },
      { extraId: 'e2', name: 'Charcuterie Board', price: 45, perPerson: false },
      { extraId: 'e3', name: 'Fruit Tray', price: 10, perPerson: true }
    ]
    const result = calculateExtrasCost(extras, 3)
    // Drink: 15 * 3 = 45, Board: 45 * 1 = 45, Fruit: 10 * 3 = 30
    expect(result.grandTotal).toBe(120)
    expect(result.items[0].total).toBe(45)
    expect(result.items[1].total).toBe(45)
    expect(result.items[2].total).toBe(30)
  })

  test('returns empty items and zero grandTotal for empty array', () => {
    const result = calculateExtrasCost([], 2)
    expect(result.items).toEqual([])
    expect(result.grandTotal).toBe(0)
  })

  test('returns empty items and zero grandTotal for null input', () => {
    const result = calculateExtrasCost(null, 2)
    expect(result.items).toEqual([])
    expect(result.grandTotal).toBe(0)
  })

  test('treats groupSize of 1 as minimum', () => {
    const extras = [
      { extraId: 'e1', name: 'Drink', price: 10, perPerson: true }
    ]
    const result = calculateExtrasCost(extras, 0)
    expect(result.items[0].quantity).toBe(1)
    expect(result.items[0].total).toBe(10)
  })

  test('handles extras with missing price gracefully', () => {
    const extras = [
      { extraId: 'e1', name: 'No Price', perPerson: true }
    ]
    const result = calculateExtrasCost(extras, 3)
    expect(result.items[0].unitPrice).toBe(0)
    expect(result.items[0].total).toBe(0)
    expect(result.grandTotal).toBe(0)
  })

  test('rounds to cents correctly', () => {
    const extras = [
      { extraId: 'e1', name: 'Odd Price', price: 7.33, perPerson: true }
    ]
    const result = calculateExtrasCost(extras, 3)
    // 7.33 * 3 = 21.99
    expect(result.items[0].total).toBe(21.99)
    expect(result.grandTotal).toBe(21.99)
  })
})

describe('filterAvailableExtras', () => {
  const extras = [
    { extraId: 'e1', name: 'Active Flat', isActive: true, groupOnly: false },
    { extraId: 'e2', name: 'Active Group-Only', isActive: true, groupOnly: true },
    { extraId: 'e3', name: 'Inactive', isActive: false, groupOnly: false },
    { extraId: 'e4', name: 'Inactive Group-Only', isActive: false, groupOnly: true },
  ]

  test('excludes inactive extras regardless of group size', () => {
    const result = filterAvailableExtras(extras, 5)
    const ids = result.map(e => e.extraId)
    expect(ids).not.toContain('e3')
    expect(ids).not.toContain('e4')
  })

  test('excludes group-only extras when groupSize < 3', () => {
    const result = filterAvailableExtras(extras, 2)
    const ids = result.map(e => e.extraId)
    expect(ids).toContain('e1')
    expect(ids).not.toContain('e2')
  })

  test('includes group-only extras when groupSize >= 3', () => {
    const result = filterAvailableExtras(extras, 3)
    const ids = result.map(e => e.extraId)
    expect(ids).toContain('e1')
    expect(ids).toContain('e2')
  })

  test('includes group-only extras when groupSize is exactly 3 (boundary)', () => {
    const result = filterAvailableExtras(extras, 3)
    const ids = result.map(e => e.extraId)
    expect(ids).toContain('e2')
  })

  test('excludes group-only extras when groupSize is exactly 2 (boundary)', () => {
    const result = filterAvailableExtras(extras, 2)
    const ids = result.map(e => e.extraId)
    expect(ids).not.toContain('e2')
  })

  test('returns empty array for null input', () => {
    const result = filterAvailableExtras(null, 5)
    expect(result).toEqual([])
  })

  test('returns empty array for empty array input', () => {
    const result = filterAvailableExtras([], 5)
    expect(result).toEqual([])
  })

  test('returns all active non-group-only extras for groupSize of 1', () => {
    const result = filterAvailableExtras(extras, 1)
    expect(result).toHaveLength(1)
    expect(result[0].extraId).toBe('e1')
  })
})
