/**
 * Property-Based Tests for RBAC Matrix
 *
 * Uses fast-check to validate correctness properties for role-based access control.
 * Feature: unified-business-model
 *
 * Properties tested:
 * - Property 14: Role-based access control matrix
 *
 * **Validates: Requirements 8.2, 8.3, 8.4**
 */

import fc from 'fast-check'
import { isAuthorized } from '../../app/utils/accessControl.ts'

// ── Constants ─────────────────────────────────────────────────

/**
 * All defined actions in the system.
 */
const ALL_ACTIONS = [
  'create_service',
  'edit_service',
  'delete_service',
  'edit_price',
  'manage_staff',
  'manage_settings',
  'view_calendar',
  'edit_calendar',
  'book_appointment',
  'manage_clients',
  'view_reports',
]

/**
 * Actions denied for the Staff role.
 */
const STAFF_DENIED_ACTIONS = [
  'create_service',
  'delete_service',
  'manage_staff',
  'manage_settings',
]

/**
 * Actions permitted for the Staff role.
 */
const STAFF_ALLOWED_ACTIONS = [
  'edit_service',
  'edit_price',
  'view_calendar',
  'edit_calendar',
  'book_appointment',
  'manage_clients',
  'view_reports',
]

// ── Generators ────────────────────────────────────────────────

/**
 * Generates any action from the full action set.
 */
function arbAction() {
  return fc.constantFrom(...ALL_ACTIONS)
}

/**
 * Generates an action from the staff-denied set.
 */
function arbStaffDeniedAction() {
  return fc.constantFrom(...STAFF_DENIED_ACTIONS)
}

/**
 * Generates an action from the staff-allowed set.
 */
function arbStaffAllowedAction() {
  return fc.constantFrom(...STAFF_ALLOWED_ACTIONS)
}

// ── Property 14: Role-based access control matrix ─────────────

describe('Feature: unified-business-model, Property 14: Role-based access control matrix', () => {
  test('Admin is always permitted: for any action, isAuthorized("admin", action) === true', () => {
    fc.assert(
      fc.property(
        arbAction(),
        (action) => {
          return isAuthorized('admin', action) === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('Staff denied restricted set: for any action from {create_service, delete_service, manage_staff, manage_settings}, isAuthorized("staff", action) === false', () => {
    fc.assert(
      fc.property(
        arbStaffDeniedAction(),
        (action) => {
          return isAuthorized('staff', action) === false
        }
      ),
      { numRuns: 100 }
    )
  })

  test('Staff allowed permitted set: for any action from {edit_service, edit_price, view_calendar, edit_calendar, book_appointment, manage_clients, view_reports}, isAuthorized("staff", action) === true', () => {
    fc.assert(
      fc.property(
        arbStaffAllowedAction(),
        (action) => {
          return isAuthorized('staff', action) === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('Completeness: the denied + allowed sets for staff cover all defined actions', () => {
    fc.assert(
      fc.property(
        arbAction(),
        (action) => {
          const isDenied = STAFF_DENIED_ACTIONS.includes(action)
          const isAllowed = STAFF_ALLOWED_ACTIONS.includes(action)

          // Every action must be in exactly one set (denied XOR allowed)
          if (isDenied === isAllowed) {
            return false
          }

          // Verify the authorization result matches the categorization
          if (isDenied) {
            return isAuthorized('staff', action) === false
          }
          return isAuthorized('staff', action) === true
        }
      ),
      { numRuns: 100 }
    )
  })
})
