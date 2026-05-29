/**
 * Service Buffer Time Tests
 *
 * Tests that per-service buffer time is correctly used in availability calculations,
 * falling back to vendor-level buffer when not set on the service.
 */

import { describe, test, expect } from '@jest/globals'
import { generateTimeSlots, hasAnySlot, timeOverlaps } from '../../app/utils/availability.js'

describe('Per-service buffer time in availability', () => {
  describe('timeOverlaps', () => {
    test('uses provided buffer to determine overlap', () => {
      // 10:00 appointment, 60 min duration, 15 min buffer → blocks until 11:15
      expect(timeOverlaps('11:00', '10:00', 60, 15, 60)).toBe(true)
      expect(timeOverlaps('11:15', '10:00', 60, 15, 60)).toBe(false)
    })

    test('zero buffer means no gap between appointments', () => {
      // 10:00 appointment, 60 min duration, 0 buffer → blocks until 11:00
      expect(timeOverlaps('10:30', '10:00', 60, 0, 60)).toBe(true)
      expect(timeOverlaps('11:00', '10:00', 60, 0, 60)).toBe(false)
    })

    test('larger buffer creates bigger gap', () => {
      // 10:00 appointment, 60 min duration, 30 min buffer → blocks until 11:30
      expect(timeOverlaps('11:15', '10:00', 60, 30, 60)).toBe(true)
      expect(timeOverlaps('11:30', '10:00', 60, 30, 60)).toBe(false)
    })
  })

  describe('generateTimeSlots with different buffer values', () => {
    const bookedSlots = [
      { dateTime: '2025-07-15T10:00:00Z', customer: JSON.stringify({ name: 'Test' }) }
    ]

    test('15 min buffer blocks fewer slots than 30 min buffer', () => {
      const slots15 = generateTimeSlots('09:00', '12:00', 60, 15, bookedSlots, '2025-07-15')
      const slots30 = generateTimeSlots('09:00', '12:00', 60, 30, bookedSlots, '2025-07-15')
      // More buffer = fewer available slots
      expect(slots30.length).toBeLessThanOrEqual(slots15.length)
    })

    test('0 buffer allows back-to-back appointments', () => {
      const slots = generateTimeSlots('09:00', '12:00', 60, 0, bookedSlots, '2025-07-15')
      // With 0 buffer, 11:00 should be available (appointment ends at 11:00)
      const has11 = slots.some(s => s.time === '11:00')
      expect(has11).toBe(true)
    })

    test('15 min buffer blocks the slot right after appointment', () => {
      const slots = generateTimeSlots('09:00', '12:00', 60, 15, bookedSlots, '2025-07-15')
      // With 15 min buffer, 11:00 should NOT be available (appointment ends at 11:00 + 15 min buffer)
      const has11 = slots.some(s => s.time === '11:00')
      expect(has11).toBe(false)
    })
  })

  describe('hasAnySlot respects buffer', () => {
    const appointments = [
      { dateTime: '2025-07-15T09:00:00Z', staffId: 'staff-1', status: 'confirmed', customer: JSON.stringify({ name: 'Test' }) }
    ]

    test('with large buffer, fewer slots available', () => {
      // 09:00-10:00 booked, 60 min service, 60 min buffer → next available at 11:00
      // Working hours 09:00-12:00 → only 11:00 fits (11:00-12:00)
      const hasSlot = hasAnySlot('09:00', '12:00', 60, 60, {
        appointments,
        dateStr: '2025-07-15',
        date: new Date('2025-07-15'),
        staff: { visibleId: 'staff-1' }
      })
      expect(hasSlot).toBe(true)
    })

    test('with zero buffer, more slots available', () => {
      const hasSlot = hasAnySlot('09:00', '11:00', 60, 0, {
        appointments,
        dateStr: '2025-07-15',
        date: new Date('2025-07-15'),
        staff: { visibleId: 'staff-1' }
      })
      // 10:00 should be available with 0 buffer
      expect(hasSlot).toBe(true)
    })
  })
})
