/**
 * Unit tests for Staff Eligibility Resolver
 *
 * Validates the getEligibleStaff and isServiceBookable functions
 * against acceptance criteria from Requirements 3.3, 3.4, 3.7, 5.1.
 */

import { getEligibleStaff, isServiceBookable } from '../../app/utils/staffEligibility.ts'

const staff = [
  { visibleId: 's1', staffName: 'Alice', vendorId: 'v1', isActive: true },
  { visibleId: 's2', staffName: 'Bob', vendorId: 'v1', isActive: false },
  { visibleId: 's3', staffName: 'Carol', vendorId: 'v2', isActive: true },
  { visibleId: 's4', staffName: 'Dave', vendorId: 'v2', isActive: true },
  { visibleId: 'resource-sauna', staffName: 'Sauna', vendorId: 'v1', isActive: true },
]

describe('Staff Eligibility Resolver', () => {
  describe('getEligibleStaff', () => {
    test('returns all active staff when allowedStaff is null', () => {
      const service = { serviceId: '1', name: 'Haircut', allowedStaff: null }
      const result = getEligibleStaff(service, staff)
      expect(result.map(s => s.visibleId)).toEqual(['s1', 's3', 's4'])
    })

    test('returns all active staff when allowedStaff is empty array', () => {
      const service = { serviceId: '2', name: 'Facial', allowedStaff: [] }
      const result = getEligibleStaff(service, staff)
      expect(result.map(s => s.visibleId)).toEqual(['s1', 's3', 's4'])
    })

    test('returns only active staff with matching IDs when allowedStaff has specific IDs', () => {
      const service = { serviceId: '3', name: 'Massage', allowedStaff: ['s1', 's3'] }
      const result = getEligibleStaff(service, staff)
      expect(result.map(s => s.visibleId)).toEqual(['s1', 's3'])
    })

    test('excludes inactive staff even if listed in allowedStaff', () => {
      const service = { serviceId: '4', name: 'Wax', allowedStaff: ['s1', 's2'] }
      const result = getEligibleStaff(service, staff)
      expect(result.map(s => s.visibleId)).toEqual(['s1'])
    })

    test('returns empty array when all allowed staff are inactive', () => {
      const service = { serviceId: '5', name: 'Sauna', allowedStaff: ['s2'] }
      const result = getEligibleStaff(service, staff)
      expect(result).toEqual([])
    })

    test('returns empty array when no staff exist', () => {
      const service = { serviceId: '6', name: 'Test', allowedStaff: null }
      const result = getEligibleStaff(service, [])
      expect(result).toEqual([])
    })

    test('returns empty array when all staff are inactive with null allowedStaff', () => {
      const inactiveStaff = [
        { visibleId: 's1', staffName: 'X', vendorId: 'v1', isActive: false },
      ]
      const service = { serviceId: '7', name: 'Test', allowedStaff: null }
      const result = getEligibleStaff(service, inactiveStaff)
      expect(result).toEqual([])
    })

    test('excludes resource calendars from "all staff" when allowedStaff is null', () => {
      const service = { serviceId: '8', name: 'Haircut', allowedStaff: null }
      const result = getEligibleStaff(service, staff)
      expect(result.map(s => s.visibleId)).not.toContain('resource-sauna')
      expect(result.map(s => s.visibleId)).toEqual(['s1', 's3', 's4'])
    })

    test('excludes resource calendars from "all staff" when allowedStaff is empty', () => {
      const service = { serviceId: '9', name: 'Facial', allowedStaff: [] }
      const result = getEligibleStaff(service, staff)
      expect(result.map(s => s.visibleId)).not.toContain('resource-sauna')
    })

    test('includes resource calendar when explicitly listed in allowedStaff', () => {
      const service = { serviceId: '10', name: 'Sauna Session', allowedStaff: ['resource-sauna'] }
      const result = getEligibleStaff(service, staff)
      expect(result.map(s => s.visibleId)).toEqual(['resource-sauna'])
    })
  })

  describe('isServiceBookable', () => {
    test('returns true when at least one active staff is eligible (null allowedStaff)', () => {
      const service = { serviceId: '1', name: 'Test', allowedStaff: null }
      expect(isServiceBookable(service, staff)).toBe(true)
    })

    test('returns true when at least one active staff matches allowedStaff', () => {
      const service = { serviceId: '2', name: 'Test', allowedStaff: ['s1'] }
      expect(isServiceBookable(service, staff)).toBe(true)
    })

    test('returns false when no active staff match allowedStaff', () => {
      const service = { serviceId: '3', name: 'Test', allowedStaff: ['s2'] }
      expect(isServiceBookable(service, staff)).toBe(false)
    })

    test('returns false when no staff exist', () => {
      const service = { serviceId: '4', name: 'Test', allowedStaff: null }
      expect(isServiceBookable(service, [])).toBe(false)
    })

    test('returns false when allowedStaff references non-existent IDs', () => {
      const service = { serviceId: '5', name: 'Test', allowedStaff: ['nonexistent'] }
      expect(isServiceBookable(service, staff)).toBe(false)
    })
  })
})
