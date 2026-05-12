/**
 * Property-Based Tests for Bundle Service Availability Validation
 *
 * Uses fast-check to validate that pre-defined bundles with inactive services
 * are correctly marked as unavailable.
 * Feature: multi-vendor-bundle-booking
 *
 * Properties tested:
 * - Property 5: Bundle Service Availability Validation
 *
 * **Validates: Requirements 2.4, 2.5**
 */

import fc from 'fast-check'
import { validateBundleServices } from '../../app/utils/bundleDiscount.js'

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a service object with specified vendorId and isActive flag.
 */
function arbServiceWith({ vendorId, isActive }) {
  return fc.record({
    serviceId: fc.uuid(),
    vendorId: fc.constant(vendorId),
    name: fc.string({ minLength: 1, maxLength: 20 }),
    price: fc.integer({ min: 10, max: 500 }),
    duration: fc.integer({ min: 15, max: 180 }),
    isActive: fc.constant(isActive),
  })
}

/**
 * Generates a valid set of services simulating a pre-defined bundle:
 * 2-10 services, at least 2 distinct vendors, ALL active.
 * This represents a bundle where all services are available.
 */
function arbBundleAllActive() {
  return fc
    .integer({ min: 2, max: 10 })
    .chain((totalCount) => {
      const numVendors = Math.min(totalCount, Math.max(2, Math.ceil(totalCount / 3)))
      return fc
        .array(fc.uuid(), { minLength: numVendors, maxLength: numVendors })
        .chain((vendorIds) => {
          const uniqueVendors = vendorIds.map((id, i) => `${id}-${i}`)
          // Ensure each vendor gets at least 1 service
          const baseServices = uniqueVendors.map((vid) =>
            arbServiceWith({ vendorId: vid, isActive: true })
          )
          const remaining = totalCount - uniqueVendors.length
          const extraServices = Array.from({ length: remaining }, () =>
            fc.integer({ min: 0, max: uniqueVendors.length - 1 }).chain((idx) =>
              arbServiceWith({ vendorId: uniqueVendors[idx], isActive: true })
            )
          )
          return fc.tuple(...baseServices, ...extraServices).map((servicesArr) =>
            [...servicesArr].sort(() => Math.random() - 0.5)
          )
        })
    })
}

/**
 * Generates a set of services simulating a pre-defined bundle where at least
 * one service has isActive=false. The bundle still has 2-10 services and 2+ vendors.
 * This represents a bundle that should be marked as unavailable.
 */
function arbBundleWithInactiveService() {
  return fc
    .integer({ min: 2, max: 10 })
    .chain((totalCount) => {
      return fc
        .tuple(fc.uuid(), fc.uuid())
        .chain(([v1, v2]) => {
          const vendorId1 = `${v1}-0`
          const vendorId2 = `${v2}-1`
          // Pick at least one index to be inactive
          return fc
            .integer({ min: 1, max: Math.max(1, totalCount - 1) })
            .chain((numInactive) => {
              // Generate indices that will be inactive
              return fc
                .shuffledSubarray(
                  Array.from({ length: totalCount }, (_, i) => i),
                  { minLength: numInactive, maxLength: numInactive }
                )
                .chain((inactiveIndices) => {
                  const inactiveSet = new Set(inactiveIndices)
                  const services = Array.from({ length: totalCount }, (_, i) => {
                    // Alternate vendors to ensure 2+ distinct vendors
                    const vendorId = i % 2 === 0 ? vendorId1 : vendorId2
                    const isActive = !inactiveSet.has(i)
                    return arbServiceWith({ vendorId, isActive })
                  })
                  return fc.tuple(...services)
                })
            })
        })
    })
}

/**
 * Generates a set of services where exactly one service is inactive.
 * Ensures 2+ vendors and 2-10 services total.
 * This is the minimal case: a single inactive service should make the bundle unavailable.
 */
function arbBundleWithSingleInactiveService() {
  return fc
    .integer({ min: 2, max: 10 })
    .chain((totalCount) => {
      return fc
        .tuple(fc.uuid(), fc.uuid())
        .chain(([v1, v2]) => {
          const vendorId1 = `${v1}-0`
          const vendorId2 = `${v2}-1`
          // Pick exactly one index to be inactive
          return fc.integer({ min: 0, max: totalCount - 1 }).chain((inactiveIdx) => {
            const services = Array.from({ length: totalCount }, (_, i) => {
              const vendorId = i % 2 === 0 ? vendorId1 : vendorId2
              const isActive = i !== inactiveIdx
              return arbServiceWith({ vendorId, isActive })
            })
            return fc.tuple(...services)
          })
        })
    })
}

// ── Property 5: Bundle Service Availability Validation ────────

describe('Feature: multi-vendor-bundle-booking, Property 5: Bundle Service Availability Validation', () => {
  test('bundle with all active services (2+ vendors, 2-10 services) → valid: true', () => {
    fc.assert(
      fc.property(
        arbBundleAllActive(),
        (services) => {
          const result = validateBundleServices(services)
          return result.valid === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('bundle with at least one inactive service → valid: false (bundle unavailable)', () => {
    fc.assert(
      fc.property(
        arbBundleWithInactiveService(),
        (services) => {
          const result = validateBundleServices(services)
          return result.valid === false
        }
      ),
      { numRuns: 100 }
    )
  })

  test('bundle with exactly one inactive service → valid: false (single inactive makes bundle unavailable)', () => {
    fc.assert(
      fc.property(
        arbBundleWithSingleInactiveService(),
        (services) => {
          const result = validateBundleServices(services)
          return result.valid === false
        }
      ),
      { numRuns: 100 }
    )
  })

  test('inactive service error message references the unavailable service', () => {
    fc.assert(
      fc.property(
        arbBundleWithSingleInactiveService(),
        (services) => {
          const result = validateBundleServices(services)
          // Should be invalid
          if (result.valid !== false) return false
          // Error message should mention the service is no longer available
          return result.error !== null && result.error.includes('no longer available')
        }
      ),
      { numRuns: 100 }
    )
  })
})
