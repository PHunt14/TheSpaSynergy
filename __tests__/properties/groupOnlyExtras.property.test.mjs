/**
 * Property-Based Tests for Group-Only Extra Availability
 *
 * Uses fast-check to validate correctness properties for filtering
 * group-only extras based on booking group size.
 * Feature: booking-enhancements
 *
 * Properties tested:
 * - Property 5: Group-only extra availability
 *
 * **Validates: Requirements 3.7, 3.8**
 */

import fc from 'fast-check'
import { filterAvailableExtras } from '../../app/utils/extrasCalculator.js'

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a group-only extra (groupOnly: true, isActive: true).
 */
function arbGroupOnlyExtra() {
  return fc.record({
    extraId: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    price: fc.integer({ min: 1, max: 999999 }).map(v => v / 100),
    perPerson: fc.boolean(),
    groupOnly: fc.constant(true),
    isActive: fc.constant(true),
  })
}

/**
 * Generates a regular extra (groupOnly: false, isActive: true).
 */
function arbRegularExtra() {
  return fc.record({
    extraId: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    price: fc.integer({ min: 1, max: 999999 }).map(v => v / 100),
    perPerson: fc.boolean(),
    groupOnly: fc.constant(false),
    isActive: fc.constant(true),
  })
}

/**
 * Generates a mixed array of extras (some group-only, some regular, all active).
 */
function arbMixedExtras() {
  return fc.array(
    fc.oneof(arbGroupOnlyExtra(), arbRegularExtra()),
    { minLength: 1, maxLength: 10 }
  )
}

/**
 * Generates a group size that qualifies for group-only extras (>= 3).
 */
function arbQualifyingGroupSize() {
  return fc.integer({ min: 3, max: 50 })
}

/**
 * Generates a group size that does NOT qualify for group-only extras (< 3).
 */
function arbNonQualifyingGroupSize() {
  return fc.integer({ min: 1, max: 2 })
}

// ── Property 5: Group-only extra availability ─────────────────

describe('Feature: booking-enhancements, Property 5: Group-only extra availability', () => {
  test('group-only extras are available when groupSize >= 3', () => {
    fc.assert(
      fc.property(
        arbGroupOnlyExtra(),
        arbQualifyingGroupSize(),
        (extra, groupSize) => {
          const result = filterAvailableExtras([extra], groupSize)
          return result.length === 1 && result[0].extraId === extra.extraId
        }
      ),
      { numRuns: 100 }
    )
  })

  test('group-only extras are NOT available when groupSize < 3', () => {
    fc.assert(
      fc.property(
        arbGroupOnlyExtra(),
        arbNonQualifyingGroupSize(),
        (extra, groupSize) => {
          const result = filterAvailableExtras([extra], groupSize)
          return result.length === 0
        }
      ),
      { numRuns: 100 }
    )
  })

  test('group-only extras are available if and only if groupSize >= 3', () => {
    fc.assert(
      fc.property(
        arbGroupOnlyExtra(),
        fc.integer({ min: 1, max: 50 }),
        (extra, groupSize) => {
          const result = filterAvailableExtras([extra], groupSize)
          const isAvailable = result.length === 1
          const shouldBeAvailable = groupSize >= 3
          return isAvailable === shouldBeAvailable
        }
      ),
      { numRuns: 100 }
    )
  })

  test('when group size decreases below 3, group-only extras are excluded from filtered results', () => {
    fc.assert(
      fc.property(
        arbMixedExtras(),
        arbNonQualifyingGroupSize(),
        (extras, smallGroupSize) => {
          const result = filterAvailableExtras(extras, smallGroupSize)
          // No group-only extra should appear in the result
          return result.every(e => e.groupOnly !== true)
        }
      ),
      { numRuns: 100 }
    )
  })

  test('regular (non-group-only) active extras remain available regardless of group size', () => {
    fc.assert(
      fc.property(
        arbRegularExtra(),
        fc.integer({ min: 1, max: 50 }),
        (extra, groupSize) => {
          const result = filterAvailableExtras([extra], groupSize)
          return result.length === 1 && result[0].extraId === extra.extraId
        }
      ),
      { numRuns: 100 }
    )
  })

  test('mixed extras: only group-only ones are removed when groupSize < 3', () => {
    fc.assert(
      fc.property(
        arbMixedExtras(),
        arbNonQualifyingGroupSize(),
        (extras, groupSize) => {
          const result = filterAvailableExtras(extras, groupSize)
          const expectedCount = extras.filter(e => !e.groupOnly).length
          return result.length === expectedCount
        }
      ),
      { numRuns: 100 }
    )
  })

  test('mixed extras: all active extras are included when groupSize >= 3', () => {
    fc.assert(
      fc.property(
        arbMixedExtras(),
        arbQualifyingGroupSize(),
        (extras, groupSize) => {
          const result = filterAvailableExtras(extras, groupSize)
          // All extras are active, so all should be included when groupSize >= 3
          return result.length === extras.length
        }
      ),
      { numRuns: 100 }
    )
  })
})
