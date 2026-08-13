/**
 * Property-Based Tests for Extra Pricing Calculation
 *
 * Uses fast-check to validate correctness properties for extras cost calculation.
 * Feature: booking-enhancements
 *
 * Properties tested:
 * - Property 4: Extra pricing calculation
 *
 * **Validates: Requirements 3.3, 3.5, 3.6, 3.11**
 */

import fc from 'fast-check'
import { calculateExtrasCost } from '../../app/utils/extrasCalculator.js'

// ── Helpers ───────────────────────────────────────────────────

/**
 * Rounds a number to 2 decimal places (cents), matching the implementation.
 */
function roundCents(value) {
  return Math.round(value * 100) / 100
}

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a price as an integer in cents (1-999999) then converts to dollars.
 * This avoids floating-point precision issues with fc.float constraints.
 */
function arbPrice() {
  return fc.integer({ min: 1, max: 999999 }).map(cents => cents / 100)
}

/**
 * Generates a valid Extra object with a price and perPerson flag.
 */
function arbExtra() {
  return fc.record({
    extraId: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    price: arbPrice(),
    perPerson: fc.boolean(),
  })
}

/**
 * Generates an array of 1-10 extras.
 */
function arbExtras() {
  return fc.array(arbExtra(), { minLength: 1, maxLength: 10 })
}

/**
 * Generates a valid group size (integer >= 1, capped at a reasonable max).
 */
function arbGroupSize() {
  return fc.integer({ min: 1, max: 50 })
}

// ── Property 4: Extra pricing calculation ─────────────────────

describe('Feature: booking-enhancements, Property 4: Extra pricing calculation', () => {
  test('total extras cost equals the sum of each extra individual cost', () => {
    fc.assert(
      fc.property(
        arbExtras(),
        arbGroupSize(),
        (extras, groupSize) => {
          const result = calculateExtrasCost(extras, groupSize)

          const expectedTotal = roundCents(
            extras.reduce((sum, extra) => {
              const cost = extra.perPerson
                ? roundCents(extra.price * groupSize)
                : roundCents(extra.price)
              return sum + cost
            }, 0)
          )

          return result.grandTotal === expectedTotal
        }
      ),
      { numRuns: 100 }
    )
  })

  test('per-person extras: cost equals price × groupSize', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            extraId: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 50 }),
            price: arbPrice(),
            perPerson: fc.constant(true),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        arbGroupSize(),
        (extras, groupSize) => {
          const result = calculateExtrasCost(extras, groupSize)

          return result.items.every((item, i) => {
            const expectedCost = roundCents(extras[i].price * groupSize)
            return item.quantity === groupSize && item.total === expectedCost
          })
        }
      ),
      { numRuns: 100 }
    )
  })

  test('flat extras: cost equals price regardless of group size', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            extraId: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 50 }),
            price: arbPrice(),
            perPerson: fc.constant(false),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        arbGroupSize(),
        (extras, groupSize) => {
          const result = calculateExtrasCost(extras, groupSize)

          return result.items.every((item, i) => {
            const expectedCost = roundCents(extras[i].price)
            return item.quantity === 1 && item.total === expectedCost
          })
        }
      ),
      { numRuns: 100 }
    )
  })

  test('bundle discount applies only to base services; extras are added at full price', () => {
    // This test validates that calculateExtrasCost does NOT apply any discounting.
    // The bundle discount logic lives in calculateBundlePrice (separate function).
    // Extras total must always equal sum of individual extras at full price.
    fc.assert(
      fc.property(
        arbExtras(),
        arbGroupSize(),
        fc.integer({ min: 0, max: 100 }), // hypothetical discount percentage
        (extras, groupSize, discountPercent) => {
          const result = calculateExtrasCost(extras, groupSize)

          // The extras cost must be computed independently without any discount factor
          const manualTotal = roundCents(
            extras.reduce((sum, extra) => {
              const cost = extra.perPerson
                ? roundCents(extra.price * groupSize)
                : roundCents(extra.price)
              return sum + cost
            }, 0)
          )

          // Regardless of what discount might apply to the bundle,
          // extras grandTotal must equal the undiscounted sum
          return result.grandTotal === manualTotal
        }
      ),
      { numRuns: 100 }
    )
  })
})
