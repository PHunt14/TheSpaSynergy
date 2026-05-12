/**
 * Property-Based Tests for Pre-Defined Bundle Discount Calculation
 *
 * Uses fast-check to validate correctness properties for pre-defined bundle
 * discount calculation where the bundle's discountPercent takes precedence.
 * Feature: multi-vendor-bundle-booking
 *
 * Properties tested:
 * - Property 4: Pre-Defined Bundle Discount Calculation
 *
 * **Validates: Requirements 2.3**
 */

import fc from 'fast-check'
import { calculateBundlePrice } from '../../app/utils/bundleDiscount.js'

// ── Helpers ───────────────────────────────────────────────────

/**
 * Rounds a number to 2 decimal places (cents), matching the implementation.
 */
function roundCents(value) {
  return Math.round(value * 100) / 100
}

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a service object with a positive price (10-500).
 */
function arbService() {
  return fc.record({
    serviceId: fc.uuid(),
    vendorId: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 20 }),
    price: fc.integer({ min: 10, max: 500 }),
    isActive: fc.constant(true),
  })
}

/**
 * Generates an array of 2-10 services with positive prices.
 */
function arbServices() {
  return fc.array(arbService(), { minLength: 2, maxLength: 10 })
}

/**
 * Generates a pre-defined bundle object with discountPercent > 0 (1-50).
 */
function arbPredefinedBundle() {
  return fc.record({
    bundleId: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    discountPercent: fc.integer({ min: 1, max: 50 }),
  })
}

// ── Property 4: Pre-Defined Bundle Discount Calculation ───────

describe('Feature: multi-vendor-bundle-booking, Property 4: Pre-Defined Bundle Discount Calculation', () => {
  test('package price equals sum of individual service prices multiplied by (1 - discountPercent/100)', () => {
    fc.assert(
      fc.property(
        arbServices(),
        arbPredefinedBundle(),
        (services, predefinedBundle) => {
          const result = calculateBundlePrice({
            services,
            predefinedBundle,
            bundleSettings: null,
          })

          const subtotal = services.reduce((sum, s) => sum + s.price, 0)
          const expectedTotal = roundCents(subtotal * (1 - predefinedBundle.discountPercent / 100))

          return result.total === expectedTotal
        }
      ),
      { numRuns: 100 }
    )
  })

  test('subtotal equals the sum of all individual service prices', () => {
    fc.assert(
      fc.property(
        arbServices(),
        arbPredefinedBundle(),
        (services, predefinedBundle) => {
          const result = calculateBundlePrice({
            services,
            predefinedBundle,
            bundleSettings: null,
          })

          const expectedSubtotal = services.reduce((sum, s) => sum + s.price, 0)
          return result.subtotal === expectedSubtotal
        }
      ),
      { numRuns: 100 }
    )
  })

  test('discountPercent matches the pre-defined bundle discountPercent', () => {
    fc.assert(
      fc.property(
        arbServices(),
        arbPredefinedBundle(),
        (services, predefinedBundle) => {
          const result = calculateBundlePrice({
            services,
            predefinedBundle,
            bundleSettings: null,
          })

          return result.discountPercent === predefinedBundle.discountPercent
        }
      ),
      { numRuns: 100 }
    )
  })

  test('pre-defined bundle discount takes precedence over bundleSettings tier discounts', () => {
    fc.assert(
      fc.property(
        arbServices(),
        arbPredefinedBundle(),
        fc.record({
          discount2Services: fc.integer({ min: 0, max: 100 }),
          discount3Services: fc.integer({ min: 0, max: 100 }),
          discount4PlusServices: fc.integer({ min: 0, max: 100 }),
        }),
        (services, predefinedBundle, bundleSettings) => {
          const result = calculateBundlePrice({
            services,
            predefinedBundle,
            bundleSettings,
          })

          // Pre-defined bundle discount should always take precedence
          return result.discountPercent === predefinedBundle.discountPercent
        }
      ),
      { numRuns: 100 }
    )
  })

  test('discountAmount equals subtotal × discountPercent / 100 (rounded to cents)', () => {
    fc.assert(
      fc.property(
        arbServices(),
        arbPredefinedBundle(),
        (services, predefinedBundle) => {
          const result = calculateBundlePrice({
            services,
            predefinedBundle,
            bundleSettings: null,
          })

          const expectedDiscountAmount = roundCents(result.subtotal * predefinedBundle.discountPercent / 100)
          return result.discountAmount === expectedDiscountAmount
        }
      ),
      { numRuns: 100 }
    )
  })

  test('total equals subtotal minus discountAmount', () => {
    fc.assert(
      fc.property(
        arbServices(),
        arbPredefinedBundle(),
        (services, predefinedBundle) => {
          const result = calculateBundlePrice({
            services,
            predefinedBundle,
            bundleSettings: null,
          })

          const expectedTotal = roundCents(result.subtotal - result.discountAmount)
          return result.total === expectedTotal
        }
      ),
      { numRuns: 100 }
    )
  })
})
