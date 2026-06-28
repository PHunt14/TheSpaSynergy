/**
 * Property-Based Tests for Staff Eligibility Resolver
 *
 * Uses fast-check to validate correctness properties for staff eligibility
 * resolution logic (allowedStaff filtering and service bookability).
 * Feature: unified-business-model
 *
 * Properties tested:
 * - Property 4: Staff eligibility resolution
 *
 * **Validates: Requirements 3.3, 3.4, 3.7, 5.1**
 */

import fc from 'fast-check'
import { getEligibleStaff, isServiceBookable } from '../../app/utils/staffEligibility.ts'

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a staff member with a unique visibleId and random active status.
 */
function arbStaffMember(id) {
  return fc.record({
    visibleId: fc.constant(id),
    staffName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    vendorId: fc.string({ minLength: 1, maxLength: 10 }),
    isActive: fc.boolean(),
  })
}

/**
 * Generates an array of staff members with unique visibleIds.
 */
function arbStaffList() {
  return fc.integer({ min: 0, max: 10 }).chain((count) => {
    if (count === 0) return fc.constant([])
    const ids = Array.from({ length: count }, (_, i) => `staff-${i}`)
    return fc.tuple(...ids.map((id) => arbStaffMember(id)))
  })
}

/**
 * Generates a service with allowedStaff set to null or empty array (dynamic "All").
 */
function arbServiceWithNullOrEmptyAllowed() {
  return fc.record({
    serviceId: fc.string({ minLength: 1, maxLength: 10 }),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    allowedStaff: fc.oneof(fc.constant(null), fc.constant([])),
  })
}

/**
 * Generates a service with specific allowedStaff IDs drawn from a given staff list.
 */
function arbServiceWithSpecificAllowed(staffIds) {
  return fc.record({
    serviceId: fc.string({ minLength: 1, maxLength: 10 }),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    allowedStaff: fc.subarray(staffIds, { minLength: 1 }),
  })
}

/**
 * Generates a service with allowedStaff containing IDs that don't match any staff.
 */
function arbServiceWithNonMatchingAllowed() {
  return fc.record({
    serviceId: fc.string({ minLength: 1, maxLength: 10 }),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    allowedStaff: fc.array(
      fc.string({ minLength: 5, maxLength: 15 }).map((s) => `nonexistent-${s}`),
      { minLength: 1, maxLength: 5 }
    ),
  })
}

// ── Property 4: Staff Eligibility Resolution ──────────────────

describe('Feature: unified-business-model, Property 4: Staff eligibility resolution', () => {
  test('null/empty allowedStaff → all active staff eligible', () => {
    fc.assert(
      fc.property(
        arbServiceWithNullOrEmptyAllowed(),
        arbStaffList(),
        (service, allStaff) => {
          const eligible = getEligibleStaff(service, allStaff)
          const activeStaff = allStaff.filter((s) => s.isActive)

          // All active staff should be eligible
          if (eligible.length !== activeStaff.length) return false

          // Every eligible member should be active
          const allEligibleAreActive = eligible.every((s) => s.isActive)
          // Every active staff member should be in the eligible list
          const allActiveAreEligible = activeStaff.every((s) =>
            eligible.some((e) => e.visibleId === s.visibleId)
          )

          return allEligibleAreActive && allActiveAreEligible
        }
      ),
      { numRuns: 100 }
    )
  })

  test('specific allowedStaff → only active staff with matching IDs eligible', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }).chain((count) => {
          const ids = Array.from({ length: count }, (_, i) => `staff-${i}`)
          return fc.tuple(
            arbServiceWithSpecificAllowed(ids),
            fc.tuple(...ids.map((id) => arbStaffMember(id)))
          )
        }),
        ([service, allStaff]) => {
          const eligible = getEligibleStaff(service, allStaff)
          const allowedSet = new Set(service.allowedStaff)

          // Every eligible member must be active AND in allowedStaff
          const allEligibleAreValid = eligible.every(
            (s) => s.isActive && allowedSet.has(s.visibleId)
          )

          // Every active staff in allowedStaff must be in eligible
          const allMatchingActiveIncluded = allStaff
            .filter((s) => s.isActive && allowedSet.has(s.visibleId))
            .every((s) => eligible.some((e) => e.visibleId === s.visibleId))

          return allEligibleAreValid && allMatchingActiveIncluded
        }
      ),
      { numRuns: 100 }
    )
  })

  test('inactive staff never eligible regardless of allowedStaff', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }).chain((count) => {
          const ids = Array.from({ length: count }, (_, i) => `staff-${i}`)
          return fc.tuple(
            fc.oneof(
              arbServiceWithNullOrEmptyAllowed(),
              arbServiceWithSpecificAllowed(ids)
            ),
            fc.tuple(...ids.map((id) => arbStaffMember(id)))
          )
        }),
        ([service, allStaff]) => {
          const eligible = getEligibleStaff(service, allStaff)

          // No inactive staff member should ever appear in eligible list
          return eligible.every((s) => s.isActive === true)
        }
      ),
      { numRuns: 100 }
    )
  })

  test('isServiceBookable returns true iff getEligibleStaff returns non-empty array', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 }).chain((count) => {
          const ids = Array.from({ length: count }, (_, i) => `staff-${i}`)
          return fc.tuple(
            fc.oneof(
              arbServiceWithNullOrEmptyAllowed(),
              ...(ids.length > 0 ? [arbServiceWithSpecificAllowed(ids)] : [arbServiceWithNullOrEmptyAllowed()])
            ),
            count > 0
              ? fc.tuple(...ids.map((id) => arbStaffMember(id)))
              : fc.constant([])
          )
        }),
        ([service, allStaff]) => {
          const eligible = getEligibleStaff(service, allStaff)
          const bookable = isServiceBookable(service, allStaff)

          return bookable === (eligible.length > 0)
        }
      ),
      { numRuns: 100 }
    )
  })

  test('no active staff match → service not bookable', () => {
    fc.assert(
      fc.property(
        arbServiceWithNonMatchingAllowed(),
        arbStaffList(),
        (service, allStaff) => {
          // Service has allowedStaff with IDs that don't match any staff visibleId
          // Verify none of the staff match
          const allowedSet = new Set(service.allowedStaff)
          const hasMatch = allStaff.some(
            (s) => s.isActive && allowedSet.has(s.visibleId)
          )

          if (hasMatch) return true // skip edge case where random collision occurs

          const bookable = isServiceBookable(service, allStaff)
          return bookable === false
        }
      ),
      { numRuns: 100 }
    )
  })
})
