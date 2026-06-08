/**
 * Access Control Module Tests
 *
 * Unit tests for isAuthorized and getServiceAuthorization functions:
 * - Admin role has full access to all actions
 * - Staff role is denied restricted actions (create/delete service, manage staff, manage settings)
 * - Staff role is allowed permitted actions (calendar, booking, clients, price editing, reports)
 * - Service authorization: admin can update/delete any service
 * - Service authorization: staff can update services they are assigned to
 * - Service authorization: staff can update services with null/empty allowedStaff
 * - Service authorization: staff cannot delete any service
 * - Service authorization: staff cannot update services they are not assigned to
 */

import { isAuthorized, getServiceAuthorization } from '../../app/utils/accessControl.ts'

describe('isAuthorized', () => {
  const allActions = [
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

  describe('Admin role', () => {
    test('permits all actions', () => {
      for (const action of allActions) {
        expect(isAuthorized('admin', action)).toBe(true)
      }
    })
  })

  describe('Staff role', () => {
    const deniedActions = ['create_service', 'delete_service', 'manage_staff', 'manage_settings']
    const allowedActions = [
      'edit_service',
      'edit_price',
      'view_calendar',
      'edit_calendar',
      'book_appointment',
      'manage_clients',
      'view_reports',
    ]

    test('denies restricted actions', () => {
      for (const action of deniedActions) {
        expect(isAuthorized('staff', action)).toBe(false)
      }
    })

    test('allows permitted actions', () => {
      for (const action of allowedActions) {
        expect(isAuthorized('staff', action)).toBe(true)
      }
    })
  })
})

describe('getServiceAuthorization', () => {
  const makeService = (allowedStaff) => ({
    serviceId: 'svc-1',
    name: 'Test Service',
    allowedStaff,
  })

  describe('Admin role', () => {
    test('can update and delete any service regardless of allowedStaff', () => {
      const result = getServiceAuthorization('admin', 'staff-1', makeService(['staff-2']))
      expect(result.canUpdate).toBe(true)
      expect(result.canDelete).toBe(true)
    })

    test('can update and delete service with null allowedStaff', () => {
      const result = getServiceAuthorization('admin', 'staff-1', makeService(null))
      expect(result.canUpdate).toBe(true)
      expect(result.canDelete).toBe(true)
    })
  })

  describe('Staff role', () => {
    test('can update service when staffId is in allowedStaff', () => {
      const result = getServiceAuthorization('staff', 'staff-1', makeService(['staff-1', 'staff-2']))
      expect(result.canUpdate).toBe(true)
      expect(result.canDelete).toBe(false)
    })

    test('can update service when allowedStaff is null (all staff)', () => {
      const result = getServiceAuthorization('staff', 'staff-1', makeService(null))
      expect(result.canUpdate).toBe(true)
      expect(result.canDelete).toBe(false)
    })

    test('can update service when allowedStaff is empty array (all staff)', () => {
      const result = getServiceAuthorization('staff', 'staff-1', makeService([]))
      expect(result.canUpdate).toBe(true)
      expect(result.canDelete).toBe(false)
    })

    test('cannot update service when staffId is not in allowedStaff', () => {
      const result = getServiceAuthorization('staff', 'staff-1', makeService(['staff-2', 'staff-3']))
      expect(result.canUpdate).toBe(false)
      expect(result.canDelete).toBe(false)
    })

    test('cannot delete any service', () => {
      const result = getServiceAuthorization('staff', 'staff-1', makeService(['staff-1']))
      expect(result.canDelete).toBe(false)
    })
  })
})
