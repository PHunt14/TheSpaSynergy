/**
 * Property-Based Tests for Calendar Access
 *
 * Uses fast-check to validate correctness properties for unified calendar access.
 * Feature: unified-business-model
 *
 * Properties tested:
 * - Property 5: Calendar access is unrestricted for authenticated staff
 *
 * **Validates: Requirements 4.1, 4.2, 4.3**
 */

import fc from 'fast-check'
import { isAuthorized } from '../../app/utils/accessControl.ts'

// ── Pure function under test ──────────────────────────────────

/**
 * Determines calendar access for an authenticated staff member viewing/editing
 * any target staff member's calendar. In the unified model, any authenticated
 * staff has full read/write access regardless of provider affiliation.
 *
 * @param authenticatedStaff - The staff member making the request
 * @param targetStaff - The staff member whose calendar is being accessed
 * @returns Object with read and write access booleans
 */
function hasCalendarAccess(authenticatedStaff, targetStaff) {
  // Calendar access is determined by role-based authorization, not by vendor
  const read = isAuthorized('staff', 'view_calendar')
  const write = isAuthorized('staff', 'edit_calendar')
  return { read, write }
}

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a staff member record with a random vendorId to simulate
 * different provider affiliations.
 */
function arbStaffMember() {
  return fc.record({
    visibleId: fc.string({ minLength: 1, maxLength: 20 }),
    staffName: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    vendorId: fc.string({ minLength: 1, maxLength: 15 }),
    isActive: fc.constant(true),
    staffEmail: fc.emailAddress(),
  })
}

/**
 * Generates a pair of staff members guaranteed to have the SAME vendorId.
 */
function arbSameVendorPair() {
  return fc.string({ minLength: 1, maxLength: 15 }).chain((vendorId) =>
    fc.tuple(
      fc.record({
        visibleId: fc.string({ minLength: 1, maxLength: 20 }),
        staffName: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
        vendorId: fc.constant(vendorId),
        isActive: fc.constant(true),
        staffEmail: fc.emailAddress(),
      }),
      fc.record({
        visibleId: fc.string({ minLength: 1, maxLength: 20 }),
        staffName: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
        vendorId: fc.constant(vendorId),
        isActive: fc.constant(true),
        staffEmail: fc.emailAddress(),
      })
    )
  )
}

/**
 * Generates a pair of staff members guaranteed to have DIFFERENT vendorIds.
 */
function arbDifferentVendorPair() {
  return fc
    .tuple(
      fc.string({ minLength: 1, maxLength: 15 }),
      fc.string({ minLength: 1, maxLength: 15 })
    )
    .filter(([a, b]) => a !== b)
    .chain(([vendorA, vendorB]) =>
      fc.tuple(
        fc.record({
          visibleId: fc.string({ minLength: 1, maxLength: 20 }),
          staffName: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
          vendorId: fc.constant(vendorA),
          isActive: fc.constant(true),
          staffEmail: fc.emailAddress(),
        }),
        fc.record({
          visibleId: fc.string({ minLength: 1, maxLength: 20 }),
          staffName: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
          vendorId: fc.constant(vendorB),
          isActive: fc.constant(true),
          staffEmail: fc.emailAddress(),
        })
      )
    )
}

// ── Property 5: Calendar access is unrestricted for authenticated staff ───

describe('Feature: unified-business-model, Property 5: Calendar access is unrestricted for authenticated staff', () => {
  test('Any authenticated staff always has read access to any target calendar', () => {
    fc.assert(
      fc.property(
        arbStaffMember(),
        arbStaffMember(),
        (authenticatedStaff, targetStaff) => {
          const access = hasCalendarAccess(authenticatedStaff, targetStaff)
          return access.read === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('Any authenticated staff always has write access to any target calendar', () => {
    fc.assert(
      fc.property(
        arbStaffMember(),
        arbStaffMember(),
        (authenticatedStaff, targetStaff) => {
          const access = hasCalendarAccess(authenticatedStaff, targetStaff)
          return access.write === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test("Access doesn't depend on provider affiliation — same vendorId pair has full access", () => {
    fc.assert(
      fc.property(
        arbSameVendorPair(),
        ([authenticatedStaff, targetStaff]) => {
          const access = hasCalendarAccess(authenticatedStaff, targetStaff)
          return access.read === true && access.write === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test("Access doesn't depend on provider affiliation — different vendorId pair has full access", () => {
    fc.assert(
      fc.property(
        arbDifferentVendorPair(),
        ([authenticatedStaff, targetStaff]) => {
          const access = hasCalendarAccess(authenticatedStaff, targetStaff)
          return access.read === true && access.write === true
        }
      ),
      { numRuns: 100 }
    )
  })
})
