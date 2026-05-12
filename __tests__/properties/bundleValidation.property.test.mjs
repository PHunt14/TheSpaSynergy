/**
 * Property-Based Tests for Bundle Validation Constraints
 *
 * Uses fast-check to validate correctness properties for bundle service
 * validation logic.
 * Feature: multi-vendor-bundle-booking
 *
 * Properties tested:
 * - Property 3: Bundle Validation Constraints
 *
 * **Validates: Requirements 1.4, 3.2**
 */

import fc from 'fast-check'
import { validateBundleServices } from '../../app/utils/bundleDiscount.js'

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a service object with a given vendorId and isActive flag.
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
 * Generates a valid set of services: 2-10 services, at least 2 distinct vendors, all active.
 * Strategy: generate 2+ vendor IDs, then distribute services across them ensuring each vendor has at least 1.
 */
function arbValidServices() {
  return fc
    .integer({ min: 2, max: 10 })
    .chain((totalCount) => {
      const numVendors = Math.min(totalCount, Math.max(2, Math.ceil(totalCount / 3)))
      return fc
        .array(fc.uuid(), { minLength: numVendors, maxLength: numVendors })
        .chain((vendorIds) => {
          // Ensure unique vendor IDs by appending index suffix
          const uniqueVendors = vendorIds.map((id, i) => `${id}-${i}`)
          // Distribute services: first ensure each vendor gets at least 1
          const baseServices = uniqueVendors.map((vid) => arbServiceWith({ vendorId: vid, isActive: true }))
          const remaining = totalCount - uniqueVendors.length
          // Remaining services assigned to random vendors from the pool
          const extraServices = Array.from({ length: remaining }, () =>
            fc.integer({ min: 0, max: uniqueVendors.length - 1 }).chain((idx) =>
              arbServiceWith({ vendorId: uniqueVendors[idx], isActive: true })
            )
          )
          return fc.tuple(...baseServices, ...extraServices).map((servicesArr) =>
            // Shuffle to avoid predictable ordering
            [...servicesArr].sort(() => Math.random() - 0.5)
          )
        })
    })
}

/**
 * Generates a set of services with only 1 distinct vendor (all same vendorId), 2-10 services, all active.
 */
function arbSingleVendorServices() {
  return fc.uuid().chain((vendorId) =>
    fc
      .array(arbServiceWith({ vendorId, isActive: true }), { minLength: 2, maxLength: 10 })
  )
}

/**
 * Generates a set of services with fewer than 2 services (0 or 1).
 */
function arbTooFewServices() {
  return fc.oneof(
    fc.constant([]),
    fc.uuid().chain((vendorId) =>
      arbServiceWith({ vendorId, isActive: true }).map((s) => [s])
    )
  )
}

/**
 * Generates a set of services with more than 10 services, 2+ vendors, all active.
 */
function arbTooManyServices() {
  return fc
    .integer({ min: 11, max: 15 })
    .chain((totalCount) =>
      fc.tuple(fc.uuid(), fc.uuid()).chain(([v1, v2]) => {
        const vendorId1 = `${v1}-0`
        const vendorId2 = `${v2}-1`
        // First service from vendor1, second from vendor2, rest random
        const services = [
          arbServiceWith({ vendorId: vendorId1, isActive: true }),
          arbServiceWith({ vendorId: vendorId2, isActive: true }),
          ...Array.from({ length: totalCount - 2 }, () =>
            fc.oneof(
              arbServiceWith({ vendorId: vendorId1, isActive: true }),
              arbServiceWith({ vendorId: vendorId2, isActive: true })
            )
          ),
        ]
        return fc.tuple(...services)
      })
    )
}

/**
 * Generates a set of 2-10 services from 2+ vendors where at least one service is inactive.
 */
function arbServicesWithInactive() {
  return fc
    .tuple(fc.uuid(), fc.uuid())
    .chain(([v1, v2]) => {
      const vendorId1 = `${v1}-0`
      const vendorId2 = `${v2}-1`
      return fc
        .integer({ min: 2, max: 10 })
        .chain((totalCount) => {
          // Pick a random index to be inactive
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

// ── Property 3: Bundle Validation Constraints ─────────────────

describe('Feature: multi-vendor-bundle-booking, Property 3: Bundle Validation Constraints', () => {
  test('valid bundle: 2-10 services, 2+ vendors, all active → returns { valid: true }', () => {
    fc.assert(
      fc.property(
        arbValidServices(),
        (services) => {
          const result = validateBundleServices(services)
          return result.valid === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('invalid: only 1 vendor → returns { valid: false }', () => {
    fc.assert(
      fc.property(
        arbSingleVendorServices(),
        (services) => {
          const result = validateBundleServices(services)
          return result.valid === false
        }
      ),
      { numRuns: 100 }
    )
  })

  test('invalid: fewer than 2 services → returns { valid: false }', () => {
    fc.assert(
      fc.property(
        arbTooFewServices(),
        (services) => {
          const result = validateBundleServices(services)
          return result.valid === false
        }
      ),
      { numRuns: 100 }
    )
  })

  test('invalid: more than 10 services → returns { valid: false }', () => {
    fc.assert(
      fc.property(
        arbTooManyServices(),
        (services) => {
          const result = validateBundleServices(services)
          return result.valid === false
        }
      ),
      { numRuns: 100 }
    )
  })

  test('invalid: at least one inactive service → returns { valid: false }', () => {
    fc.assert(
      fc.property(
        arbServicesWithInactive(),
        (services) => {
          const result = validateBundleServices(services)
          return result.valid === false
        }
      ),
      { numRuns: 100 }
    )
  })
})
