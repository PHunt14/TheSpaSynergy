/**
 * Property-Based Tests for Service Authorization
 *
 * Uses fast-check to validate correctness properties for service authorization
 * based on role and allowedStaff configuration.
 * Feature: unified-business-model
 *
 * Properties tested:
 * - Property 15: Service authorization based on role and allowedStaff
 *
 * **Validates: Requirements 9.6**
 */

import fc from 'fast-check'
import { getServiceAuthorization } from '../../app/utils/accessControl.ts'

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a valid staff ID string (non-empty alphanumeric with dashes).
 */
function arbStaffId() {
  return fc.stringMatching(/^[a-z0-9][a-z0-9\-]{2,20}$/)
}

/**
 * Generates a service with a specific allowedStaff configuration.
 */
function arbService(allowedStaff) {
  return fc.record({
    serviceId: fc.stringMatching(/^svc-[a-z0-9]{4,10}$/),
    name: fc.string({ minLength: 1, maxLength: 50 }),
  }).map(({ serviceId, name }) => ({
    serviceId,
    name,
    allowedStaff,
  }))
}

/**
 * Generates a service with null allowedStaff (meaning "all staff").
 */
function arbServiceWithNullAllowedStaff() {
  return arbService(null)
}

/**
 * Generates a service with an empty allowedStaff array (meaning "all staff").
 */
function arbServiceWithEmptyAllowedStaff() {
  return arbService([])
}

/**
 * Generates a service with specific staff IDs in allowedStaff,
 * ensuring the provided staffId IS included.
 */
function arbServiceWithStaffIncluded(staffId) {
  return fc.array(arbStaffId(), { minLength: 0, maxLength: 5 }).map(otherIds => {
    const allIds = [...new Set([staffId, ...otherIds])]
    return {
      serviceId: `svc-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Test Service',
      allowedStaff: allIds,
    }
  })
}

/**
 * Generates a service with specific staff IDs in allowedStaff,
 * ensuring the provided staffId is NOT included.
 */
function arbServiceWithStaffExcluded(staffId) {
  return fc.array(arbStaffId(), { minLength: 1, maxLength: 5 })
    .filter(ids => !ids.includes(staffId))
    .map(ids => ({
      serviceId: `svc-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Test Service',
      allowedStaff: [...new Set(ids)],
    }))
}

/**
 * Generates any valid service (with various allowedStaff configurations).
 */
function arbAnyService() {
  return fc.oneof(
    arbServiceWithNullAllowedStaff(),
    arbServiceWithEmptyAllowedStaff(),
    fc.array(arbStaffId(), { minLength: 1, maxLength: 5 }).map(ids => ({
      serviceId: `svc-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Test Service',
      allowedStaff: [...new Set(ids)],
    }))
  )
}

// ── Property 15: Service authorization based on role and allowedStaff ──

describe('Feature: unified-business-model, Property 15: Service authorization based on role and allowedStaff', () => {
  test('Admin full access: admin gets canUpdate=true and canDelete=true for any service', () => {
    fc.assert(
      fc.property(
        arbStaffId(),
        arbAnyService(),
        (staffId, service) => {
          const result = getServiceAuthorization('admin', staffId, service)
          return result.canUpdate === true && result.canDelete === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('Staff never deletes: staff gets canDelete=false for any service', () => {
    fc.assert(
      fc.property(
        arbStaffId(),
        arbAnyService(),
        (staffId, service) => {
          const result = getServiceAuthorization('staff', staffId, service)
          return result.canDelete === false
        }
      ),
      { numRuns: 100 }
    )
  })

  test('Staff updates with null/empty allowedStaff: staff gets canUpdate=true', () => {
    fc.assert(
      fc.property(
        arbStaffId(),
        fc.oneof(arbServiceWithNullAllowedStaff(), arbServiceWithEmptyAllowedStaff()),
        (staffId, service) => {
          const result = getServiceAuthorization('staff', staffId, service)
          return result.canUpdate === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('Staff updates when listed: if staffId is in allowedStaff, staff gets canUpdate=true', () => {
    fc.assert(
      fc.property(
        arbStaffId().chain(staffId =>
          arbServiceWithStaffIncluded(staffId).map(service => ({ staffId, service }))
        ),
        ({ staffId, service }) => {
          const result = getServiceAuthorization('staff', staffId, service)
          return result.canUpdate === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('Staff cannot update when not listed: if allowedStaff has items and staffId is not in it, staff gets canUpdate=false', () => {
    fc.assert(
      fc.property(
        arbStaffId().chain(staffId =>
          arbServiceWithStaffExcluded(staffId).map(service => ({ staffId, service }))
        ),
        ({ staffId, service }) => {
          const result = getServiceAuthorization('staff', staffId, service)
          return result.canUpdate === false
        }
      ),
      { numRuns: 100 }
    )
  })
})
