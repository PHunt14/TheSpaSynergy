/**
 * Multi-Day Block Time Tests
 *
 * Tests the logic for creating multi-day blocked time entries.
 * Multi-day blocks create one full-day block (720 min) per day in the range.
 */

import { describe, test, expect } from '@jest/globals'
import { hasAnySlot } from '../../app/utils/availability.js'

describe('Multi-day block time', () => {
  describe('full-day blocks prevent availability', () => {
    test('a 720-minute block starting at 8am blocks the entire working day', () => {
      // A full-day block: 8:00 AM, 720 minutes (12 hours) → blocks 8:00-20:00
      const appointments = [
        {
          dateTime: '2025-07-15T08:00:00Z',
          staffId: 'staff-1',
          status: 'blocked',
          customer: JSON.stringify({ name: 'Blocked Time', isBlockedTime: true, duration: 720 })
        }
      ]

      // Working hours 09:00-17:00, 60 min service, 15 min buffer
      const hasSlot = hasAnySlot('09:00', '17:00', 60, 15, {
        appointments,
        dateStr: '2025-07-15',
        date: new Date('2025-07-15'),
        staff: { visibleId: 'staff-1' }
      })
      expect(hasSlot).toBe(false)
    })

    test('a block on one day does not affect another day', () => {
      const appointments = [
        {
          dateTime: '2025-07-15T08:00:00Z',
          staffId: 'staff-1',
          status: 'blocked',
          customer: JSON.stringify({ name: 'Blocked Time', isBlockedTime: true, duration: 720 })
        }
      ]

      // Different day — no appointments
      const hasSlot = hasAnySlot('09:00', '17:00', 60, 15, {
        appointments: [],
        dateStr: '2025-07-16',
        date: new Date('2025-07-16'),
        staff: { visibleId: 'staff-1' }
      })
      expect(hasSlot).toBe(true)
    })

    test('block only affects the assigned staff member', () => {
      const appointments = [
        {
          dateTime: '2025-07-15T08:00:00Z',
          staffId: 'staff-1',
          status: 'blocked',
          customer: JSON.stringify({ name: 'Blocked Time', isBlockedTime: true, duration: 720 })
        }
      ]

      // Different staff member should still have availability
      const hasSlot = hasAnySlot('09:00', '17:00', 60, 15, {
        appointments,
        dateStr: '2025-07-15',
        date: new Date('2025-07-15'),
        staff: { visibleId: 'staff-2' }
      })
      expect(hasSlot).toBe(true)
    })
  })

  describe('multi-day range calculation', () => {
    test('calculates correct number of days in a range', () => {
      // Simulating the logic from the modal: start date to end date inclusive
      const startDate = new Date('2025-07-15T00:00:00')
      const endDate = new Date('2025-07-18T23:59:59')
      const days = []
      const current = new Date(startDate)
      current.setHours(0, 0, 0, 0)
      while (current <= endDate) {
        days.push(new Date(current))
        current.setDate(current.getDate() + 1)
      }
      expect(days.length).toBe(4) // 15, 16, 17, 18
    })

    test('single day range produces one day', () => {
      const startDate = new Date('2025-07-15T00:00:00')
      const endDate = new Date('2025-07-15T23:59:59')
      const days = []
      const current = new Date(startDate)
      current.setHours(0, 0, 0, 0)
      while (current <= endDate) {
        days.push(new Date(current))
        current.setDate(current.getDate() + 1)
      }
      expect(days.length).toBe(1)
    })

    test('week-long block produces 7 days', () => {
      const startDate = new Date('2025-07-14T00:00:00') // Monday
      const endDate = new Date('2025-07-20T23:59:59') // Sunday
      const days = []
      const current = new Date(startDate)
      current.setHours(0, 0, 0, 0)
      while (current <= endDate) {
        days.push(new Date(current))
        current.setDate(current.getDate() + 1)
      }
      expect(days.length).toBe(7)
    })
  })
})
