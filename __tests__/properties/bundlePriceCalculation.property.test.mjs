/**
 * Property-Based Tests for Bundle Price Calculation with Tier Discounts
 *
 * Uses fast-check to validate correctness properties for bundle price
 * calculation using tier-based discounts from BundleSettings.
 * Feature: multi-vendor-bundle-booking
 *
 * Properties tested:
 * - Property 2: Bundle Price Calculation with Tier Discounts
 *
 * **Validates: Requirements 1.3, 3.3, 3.4, 3.5, 3.6**
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
 * Generates an array of 2-10 services (valid bundle size).
 */
function arbServices() {
  return fc.array(arbService(), { minLength: 2, maxLength: 10 })
}

/**
 * Generates BundleSettings with discount percentages between 0 and 100 for each tier.
 */
function arbBundleSettings() {
  return fc.record({
    discount2Services: fc.integer({ min: 0, max: 100 }),
    discount3Services: fc.integer({ min: 0, max: 100 }),
    discount4PlusServices: fc.integer({ min: 0, max: 100 }),
  })
}

// ── Property 2: Bundle Price Calculation with Tier Discounts ──

describe('Feature: multi-vendor-bundle-booking, Property 2: Bundle Price Calculation with Tier Discounts', () => {
  test('subtotal equals the sum of all service prices', () => {
    fc.assert(
      fc.property(
        arbServices(),
        arbBundleSettings(),
        (services, bundleSettings) => {
          const result = calculateBundlePrice({
            services,
            predefinedBundle: null,
            bundleSettings,
          })

          const expectedSubtotal = services.reduce((sum, s) => sum + s.price, 0)
          return result.subtotal === expectedSubtotal
        }
      ),
      { numRuns: 100 }
    )
  })

  test('discountPercent matches the tier for the service count (2 services → discount2Services)', () => {
    fc.assert(
      fc.property(
        fc.array(arbService(), { minLength: 2, maxLength: 2 }),
        arbBundleSettings(),
        (services, bundleSettings) => {
          const result = calculateBundlePrice({
            services,
            predefinedBundle: null,
            bundleSettings,
          })

          return result.discountPercent === bundleSettings.discount2Services
        }
      ),
      { numRuns: 100 }
    )
  })

  test('discountPercent matches the tier for the service count (3 services → discount3Services)', () => {
    fc.assert(
      fc.property(
        fc.array(arbService(), { minLength: 3, maxLength: 3 }),
        arbBundleSettings(),
        (services, bundleSettings) => {
          const result = calculateBundlePrice({
            services,
            predefinedBundle: null,
            bundleSettings,
          })

          return result.discountPercent === bundleSettings.discount3Services
        }
      ),
      { numRuns: 100 }
    )
  })

  test('discountPercent matches the tier for the service count (4+ services → discount4PlusServices)', () => {
    fc.assert(
      fc.property(
        fc.array(arbService(), { minLength: 4, maxLength: 10 }),
        arbBundleSettings(),
        (services, bundleSettings) => {
          const result = calculateBundlePrice({
            services,
            predefinedBundle: null,
            bundleSettings,
          })

          return result.discountPercent === bundleSettings.discount4PlusServices
        }
      ),
      { numRuns: 100 }
    )
  })

  test('discountAmount equals subtotal × discountPercent / 100 (rounded to cents)', () => {
    fc.assert(
      fc.property(
        arbServices(),
        arbBundleSettings(),
        (services, bundleSettings) => {
          const result = calculateBundlePrice({
            services,
            predefinedBundle: null,
            bundleSettings,
          })

          const expectedDiscountAmount = roundCents(result.subtotal * result.discountPercent / 100)
          return result.discountAmount === expectedDiscountAmount
        }
      ),
      { numRuns: 100 }
    )
  })

  test('total equals subtotal - discountAmount', () => {
    fc.assert(
      fc.property(
        arbServices(),
        arbBundleSettings(),
        (services, bundleSettings) => {
          const result = calculateBundlePrice({
            services,
            predefinedBundle: null,
            bundleSettings,
          })

          const expectedTotal = roundCents(result.subtotal - result.discountAmount)
          return result.total === expectedTotal
        }
      ),
      { numRuns: 100 }
    )
  })
})
