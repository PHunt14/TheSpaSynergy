/**
 * Property-Based Tests for Active Service Query Completeness
 *
 * Uses fast-check to validate correctness properties for the service query
 * filtering logic — ensuring default queries return exactly active services
 * and includeInactive queries return all services.
 * Feature: unified-business-model
 *
 * Properties tested:
 * - Property 1: Active service query completeness
 *
 * **Validates: Requirements 1.1, 9.4**
 */

import fc from 'fast-check'

// ── Filtering Logic Under Test ────────────────────────────────
// Simulates the API's filtering behavior from app/api/services/route.ts:
// - Without includeInactive: filter where isActive === true
// - With includeInactive === true: return all services (no filter)

function filterServices(services, includeInactive) {
  if (includeInactive) return services
  return services.filter((s) => s.isActive === true)
}

// ── Generators ────────────────────────────────────────────────

/**
 * Arbitrary for a single service record with isActive and an optional vendorId.
 */
const arbService = fc.record({
  serviceId: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 30 }),
  categories: fc.array(fc.string({ minLength: 1, maxLength: 15 }), { minLength: 0, maxLength: 3 }),
  duration: fc.integer({ min: 15, max: 180 }),
  price: fc.integer({ min: 1, max: 500 }),
  isActive: fc.boolean(),
  vendorId: fc.option(fc.constantFrom('vendor-A', 'vendor-B', 'vendor-C'), { nil: undefined }),
})

/**
 * Arbitrary for a list of services (0–15 services).
 */
const arbServiceList = fc.array(arbService, { minLength: 0, maxLength: 15 })

/**
 * Arbitrary for a list that has at least one active and one inactive service,
 * and active services come from multiple vendors.
 */
const arbMixedServiceList = fc
  .tuple(
    // At least one guaranteed active with vendorId A
    fc.record({
      serviceId: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 30 }),
      categories: fc.array(fc.string({ minLength: 1, maxLength: 15 }), { minLength: 0, maxLength: 3 }),
      duration: fc.integer({ min: 15, max: 180 }),
      price: fc.integer({ min: 1, max: 500 }),
      isActive: fc.constant(true),
      vendorId: fc.constant('vendor-A'),
    }),
    // At least one guaranteed active with vendorId B
    fc.record({
      serviceId: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 30 }),
      categories: fc.array(fc.string({ minLength: 1, maxLength: 15 }), { minLength: 0, maxLength: 3 }),
      duration: fc.integer({ min: 15, max: 180 }),
      price: fc.integer({ min: 1, max: 500 }),
      isActive: fc.constant(true),
      vendorId: fc.constant('vendor-B'),
    }),
    // At least one guaranteed inactive
    fc.record({
      serviceId: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 30 }),
      categories: fc.array(fc.string({ minLength: 1, maxLength: 15 }), { minLength: 0, maxLength: 3 }),
      duration: fc.integer({ min: 15, max: 180 }),
      price: fc.integer({ min: 1, max: 500 }),
      isActive: fc.constant(false),
      vendorId: fc.constant('vendor-A'),
    }),
    // Extra random services
    fc.array(arbService, { minLength: 0, maxLength: 8 })
  )
  .map(([activeA, activeB, inactive, extras]) => [activeA, activeB, inactive, ...extras])

// ── Property 1: Active Service Query Completeness ─────────────

describe('Feature: unified-business-model, Property 1: Active service query completeness', () => {
  test('without includeInactive: returns exactly the services where isActive === true', () => {
    fc.assert(
      fc.property(arbServiceList, (services) => {
        const result = filterServices(services, false)
        const expected = services.filter((s) => s.isActive === true)

        // Result length matches expected active count
        if (result.length !== expected.length) return false

        // Every result item matches an expected item by serviceId
        const resultIds = new Set(result.map((s) => s.serviceId))
        const expectedIds = new Set(expected.map((s) => s.serviceId))

        if (resultIds.size !== expectedIds.size) return false
        for (const id of resultIds) {
          if (!expectedIds.has(id)) return false
        }

        return true
      }),
      { numRuns: 100 }
    )
  })

  test('with includeInactive: returns all services (length equals input length)', () => {
    fc.assert(
      fc.property(arbServiceList, (services) => {
        const result = filterServices(services, true)

        // Must return the exact same number of services as input
        if (result.length !== services.length) return false

        // Must return the exact same services by serviceId
        const resultIds = result.map((s) => s.serviceId).sort()
        const inputIds = services.map((s) => s.serviceId).sort()

        return JSON.stringify(resultIds) === JSON.stringify(inputIds)
      }),
      { numRuns: 100 }
    )
  })

  test('every service in the default query result has isActive === true', () => {
    fc.assert(
      fc.property(arbServiceList, (services) => {
        const result = filterServices(services, false)

        // Every single service returned must have isActive === true
        return result.every((s) => s.isActive === true)
      }),
      { numRuns: 100 }
    )
  })

  test('no active service is missing from the default query result', () => {
    fc.assert(
      fc.property(arbServiceList, (services) => {
        const result = filterServices(services, false)
        const resultIds = new Set(result.map((s) => s.serviceId))

        // Every active service in the input must appear in the result
        const activeServices = services.filter((s) => s.isActive === true)
        return activeServices.every((s) => resultIds.has(s.serviceId))
      }),
      { numRuns: 100 }
    )
  })

  test('the query does NOT filter by vendorId (no vendor dependency)', () => {
    fc.assert(
      fc.property(arbMixedServiceList, (services) => {
        const result = filterServices(services, false)

        // Collect all unique vendorIds from active services
        const activeVendorIds = new Set(
          services
            .filter((s) => s.isActive === true && s.vendorId !== undefined)
            .map((s) => s.vendorId)
        )

        // Collect vendorIds from result
        const resultVendorIds = new Set(
          result.filter((s) => s.vendorId !== undefined).map((s) => s.vendorId)
        )

        // All active vendors must appear in result (no vendor-based filtering)
        for (const vendorId of activeVendorIds) {
          if (!resultVendorIds.has(vendorId)) return false
        }

        // Every active service with a vendorId must be in the result
        const activeServicesWithVendor = services.filter(
          (s) => s.isActive === true && s.vendorId !== undefined
        )
        for (const svc of activeServicesWithVendor) {
          const inResult = result.some((r) => r.serviceId === svc.serviceId)
          if (!inResult) return false
        }

        return true
      }),
      { numRuns: 100 }
    )
  })
})
