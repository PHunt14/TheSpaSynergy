/**
 * Property-Based Tests for Vendor ID Extraction from Services
 *
 * Uses fast-check to validate that extractVendorIds correctly extracts
 * the unique set of vendorId values from any set of services.
 * Feature: multi-vendor-bundle-booking
 *
 * Properties tested:
 * - Property 19: Vendor ID Extraction from Services
 *
 * **Validates: Requirements 2.1**
 */

import fc from 'fast-check'
import { extractVendorIds } from '../../app/utils/extractVendorIds.js'

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a service object with a vendorId.
 */
function arbService(vendorId) {
  return fc.record({
    serviceId: fc.uuid(),
    vendorId: fc.constant(vendorId),
    name: fc.string({ minLength: 1, maxLength: 20 }),
    duration: fc.integer({ min: 15, max: 180 }),
    price: fc.integer({ min: 10, max: 500 }),
    isActive: fc.constant(true),
  })
}

/**
 * Generates a set of services from multiple vendors (2-6 distinct vendors, 2-10 services total).
 * Returns both the services array and the expected set of unique vendor IDs.
 */
function arbMultiVendorServices() {
  return fc.array(fc.uuid(), { minLength: 2, maxLength: 6 })
    .filter(ids => new Set(ids).size === ids.length) // ensure unique vendor IDs
    .chain(vendorIds => {
      // Generate at least 1 service per vendor
      const serviceArbs = vendorIds.map(vid =>
        fc.array(arbService(vid), { minLength: 1, maxLength: 3 })
      )
      return fc.tuple(...serviceArbs).map(serviceArrays => ({
        services: serviceArrays.flat(),
        expectedVendorIds: vendorIds,
      }))
    })
}

/**
 * Generates services where some vendors have multiple services (duplicates in vendorId).
 */
function arbServicesWithDuplicateVendors() {
  return fc.tuple(fc.uuid(), fc.uuid())
    .filter(([a, b]) => a !== b)
    .chain(([vendorA, vendorB]) => {
      return fc.tuple(
        fc.array(arbService(vendorA), { minLength: 2, maxLength: 5 }),
        fc.array(arbService(vendorB), { minLength: 2, maxLength: 5 })
      ).map(([servicesA, servicesB]) => ({
        services: [...servicesA, ...servicesB],
        expectedVendorIds: [vendorA, vendorB],
      }))
    })
}

/**
 * Generates services all from a single vendor.
 */
function arbSingleVendorServices() {
  return fc.uuid().chain(vendorId =>
    fc.array(arbService(vendorId), { minLength: 1, maxLength: 5 }).map(services => ({
      services,
      expectedVendorIds: [vendorId],
    }))
  )
}

// ── Property 19: Vendor ID Extraction from Services ───────────

describe('Feature: multi-vendor-bundle-booking, Property 19: Vendor ID Extraction from Services', () => {
  test('extracted vendorIds contains exactly the set of unique vendorId values from services', () => {
    fc.assert(
      fc.property(
        arbMultiVendorServices(),
        ({ services, expectedVendorIds }) => {
          const result = extractVendorIds(services)

          // Result should contain exactly the unique vendor IDs
          const resultSet = new Set(result)
          const expectedSet = new Set(expectedVendorIds)

          // Same size (no duplicates in result)
          if (resultSet.size !== expectedSet.size) return false

          // Every expected vendor ID is present
          for (const vid of expectedSet) {
            if (!resultSet.has(vid)) return false
          }

          // No extra vendor IDs in result
          for (const vid of resultSet) {
            if (!expectedSet.has(vid)) return false
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('result contains no duplicate vendor IDs even when services have repeated vendorIds', () => {
    fc.assert(
      fc.property(
        arbServicesWithDuplicateVendors(),
        ({ services }) => {
          const result = extractVendorIds(services)

          // No duplicates: result length equals unique set size
          const resultSet = new Set(result)
          return result.length === resultSet.size
        }
      ),
      { numRuns: 100 }
    )
  })

  test('result length equals the number of distinct vendors in the input services', () => {
    fc.assert(
      fc.property(
        arbMultiVendorServices(),
        ({ services, expectedVendorIds }) => {
          const result = extractVendorIds(services)
          const distinctVendorCount = new Set(services.map(s => s.vendorId)).size

          return result.length === distinctVendorCount &&
                 result.length === expectedVendorIds.length
        }
      ),
      { numRuns: 100 }
    )
  })

  test('every vendorId in the result appears in at least one service', () => {
    fc.assert(
      fc.property(
        arbMultiVendorServices(),
        ({ services }) => {
          const result = extractVendorIds(services)
          const serviceVendorIds = services.map(s => s.vendorId)

          // Every vendor ID in result must exist in at least one service
          return result.every(vid => serviceVendorIds.includes(vid))
        }
      ),
      { numRuns: 100 }
    )
  })

  test('every vendorId from services appears in the result', () => {
    fc.assert(
      fc.property(
        arbMultiVendorServices(),
        ({ services }) => {
          const result = extractVendorIds(services)
          const resultSet = new Set(result)

          // Every vendor ID from any service must be in the result
          return services.every(s => resultSet.has(s.vendorId))
        }
      ),
      { numRuns: 100 }
    )
  })

  test('single vendor services produce exactly one vendor ID', () => {
    fc.assert(
      fc.property(
        arbSingleVendorServices(),
        ({ services, expectedVendorIds }) => {
          const result = extractVendorIds(services)

          return result.length === 1 && result[0] === expectedVendorIds[0]
        }
      ),
      { numRuns: 100 }
    )
  })

  test('empty services array produces empty vendorIds array', () => {
    const result = extractVendorIds([])
    expect(result).toEqual([])
  })
})
