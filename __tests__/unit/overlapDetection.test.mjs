/**
 * Comprehensive tests for the overlap detection utility.
 *
 * Validates that:
 * - Buffer time is enforced on both sides of appointments
 * - Blocked time cannot be overlapped by customer bookings
 * - Adjacent appointments separated by exactly the buffer are NOT considered overlapping
 * - Adjacent appointments within the buffer ARE considered overlapping
 * - Edge cases (zero buffer, zero duration) are handled correctly
 * - The detectConflict function correctly filters by staff, status, and exclusions
 */

import { describe, test, expect } from '@jest/globals'
import {
  intervalsOverlap,
  detectConflict,
  extractTimeFromDateTime,
  timeToMinutes,
  extractDateFromDateTime,
  getEffectiveAppointmentDuration,
} from '../../app/utils/overlapDetection.ts'

describe('overlapDetection - intervalsOverlap', () => {
  describe('basic overlap detection', () => {
    test('identical intervals overlap', () => {
      expect(intervalsOverlap({
        newStart: 540, newDuration: 60, newBuffer: 15,
        existingStart: 540, existingDuration: 60, existingBuffer: 15,
      })).toBe(true)
    })

    test('completely separate intervals do not overlap', () => {
      // New: 9:00-10:15 (60 min + 15 buffer), Existing: 11:00-12:15
      expect(intervalsOverlap({
        newStart: 540, newDuration: 60, newBuffer: 15,
        existingStart: 660, existingDuration: 60, existingBuffer: 15,
      })).toBe(false)
    })

    test('new appointment starts during existing appointment', () => {
      // Existing: 9:00-10:00 (+15 buffer = 10:15), New starts at 9:30
      expect(intervalsOverlap({
        newStart: 570, newDuration: 60, newBuffer: 15,
        existingStart: 540, existingDuration: 60, existingBuffer: 15,
      })).toBe(true)
    })

    test('new appointment ends during existing appointment', () => {
      // New: 8:30-9:45 (60 + 15 buffer), Existing starts at 9:00
      expect(intervalsOverlap({
        newStart: 510, newDuration: 60, newBuffer: 15,
        existingStart: 540, existingDuration: 60, existingBuffer: 15,
      })).toBe(true)
    })

    test('new appointment fully contains existing appointment', () => {
      // New: 8:00-11:15 (180 + 15), Existing: 9:00-10:15 (60 + 15)
      expect(intervalsOverlap({
        newStart: 480, newDuration: 180, newBuffer: 15,
        existingStart: 540, existingDuration: 60, existingBuffer: 15,
      })).toBe(true)
    })

    test('existing appointment fully contains new appointment', () => {
      // Existing: 8:00-11:15 (180 + 15), New: 9:00-10:15 (60 + 15)
      expect(intervalsOverlap({
        newStart: 540, newDuration: 60, newBuffer: 15,
        existingStart: 480, existingDuration: 180, existingBuffer: 15,
      })).toBe(true)
    })
  })

  describe('buffer time enforcement', () => {
    test('new appointment starts during existing buffer time → overlap', () => {
      // Existing: 9:00-10:00, buffer=15 → effective end at 10:15
      // New starts at 10:00 — within the buffer zone
      expect(intervalsOverlap({
        newStart: 600, newDuration: 60, newBuffer: 15,
        existingStart: 540, existingDuration: 60, existingBuffer: 15,
      })).toBe(true)
    })

    test('new appointment starts at exactly end of existing buffer → NO overlap', () => {
      // Existing: 9:00-10:00, buffer=15 → effective end at 10:15
      // New starts at 10:15 — exactly at the boundary (exclusive)
      expect(intervalsOverlap({
        newStart: 615, newDuration: 60, newBuffer: 15,
        existingStart: 540, existingDuration: 60, existingBuffer: 15,
      })).toBe(false)
    })

    test('new appointment buffer encroaches on existing start → overlap', () => {
      // New: 8:00-9:15 (60 + 15 buffer), Existing starts at 9:00
      // New effective end is 9:15, which is > existing start 9:00
      expect(intervalsOverlap({
        newStart: 480, newDuration: 60, newBuffer: 15,
        existingStart: 540, existingDuration: 60, existingBuffer: 15,
      })).toBe(true)
    })

    test('new appointment ends exactly at existing start (buffer touches) → overlap', () => {
      // New: 8:00-9:00, buffer=15 → effective end 9:15, Existing starts at 9:00
      expect(intervalsOverlap({
        newStart: 480, newDuration: 60, newBuffer: 15,
        existingStart: 540, existingDuration: 60, existingBuffer: 15,
      })).toBe(true)
    })

    test('new appointment buffer ends exactly at existing start → NO overlap', () => {
      // New: 7:45-8:45, buffer=15 → effective end 9:00, Existing starts at 9:00
      // 9:00 is NOT < 9:00, so no overlap
      expect(intervalsOverlap({
        newStart: 465, newDuration: 60, newBuffer: 15,
        existingStart: 540, existingDuration: 60, existingBuffer: 15,
      })).toBe(false)
    })

    test('zero buffer means back-to-back is allowed', () => {
      // Existing: 9:00-10:00, buffer=0, New starts at 10:00, buffer=0
      expect(intervalsOverlap({
        newStart: 600, newDuration: 60, newBuffer: 0,
        existingStart: 540, existingDuration: 60, existingBuffer: 0,
      })).toBe(false)
    })

    test('large buffer (30 min) blocks more time', () => {
      // Existing: 9:00-10:00, buffer=30 → effective end 10:30
      // New at 10:15 — within the 30-min buffer
      expect(intervalsOverlap({
        newStart: 615, newDuration: 60, newBuffer: 30,
        existingStart: 540, existingDuration: 60, existingBuffer: 30,
      })).toBe(true)
    })

    test('asymmetric buffers: new has larger buffer than existing', () => {
      // Existing: 10:00-11:00, buffer=0 → effective end 11:00
      // New: 9:00-10:00, buffer=30 → effective end 10:30, starts before existing end? No.
      // newStart(540) < existingEnd(660) = true, newEnd(540+60+30=630) > existingStart(600) = true → OVERLAP
      expect(intervalsOverlap({
        newStart: 540, newDuration: 60, newBuffer: 30,
        existingStart: 600, existingDuration: 60, existingBuffer: 0,
      })).toBe(true)
    })
  })

  describe('symmetry property', () => {
    test('overlap is symmetric when buffers are the same', () => {
      const params1 = { newStart: 540, newDuration: 60, newBuffer: 15, existingStart: 570, existingDuration: 45, existingBuffer: 15 }
      const params2 = { newStart: 570, newDuration: 45, newBuffer: 15, existingStart: 540, existingDuration: 60, existingBuffer: 15 }
      expect(intervalsOverlap(params1)).toBe(intervalsOverlap(params2))
    })
  })
})

describe('overlapDetection - detectConflict', () => {
  const makeAppointment = (overrides = {}) => ({
    appointmentId: 'apt-1',
    staffId: 'staff-1',
    dateTime: '2025-07-15T10:00:00',
    status: 'confirmed',
    serviceId: 'svc-1',
    customer: JSON.stringify({ name: 'Test Customer' }),
    ...overrides,
  })

  const serviceDurationMap = { 'svc-1': 60 }

  test('detects conflict with overlapping appointment', () => {
    const existing = [makeAppointment()]
    const result = detectConflict('staff-1', '2025-07-15T10:30:00', 60, 15, existing, serviceDurationMap)
    expect(result).not.toBeNull()
    expect(result.appointmentId).toBe('apt-1')
  })

  test('no conflict when appointment is on different staff', () => {
    const existing = [makeAppointment({ staffId: 'staff-2' })]
    const result = detectConflict('staff-1', '2025-07-15T10:30:00', 60, 15, existing, serviceDurationMap)
    expect(result).toBeNull()
  })

  test('no conflict when appointment is cancelled', () => {
    const existing = [makeAppointment({ status: 'cancelled' })]
    const result = detectConflict('staff-1', '2025-07-15T10:30:00', 60, 15, existing, serviceDurationMap)
    expect(result).toBeNull()
  })

  test('excludes specified appointment (edit scenario)', () => {
    const existing = [makeAppointment()]
    const result = detectConflict('staff-1', '2025-07-15T10:30:00', 60, 15, existing, serviceDurationMap, 'apt-1')
    expect(result).toBeNull()
  })

  test('BLOCKED time IS treated as a conflict for customer bookings', () => {
    const blockedAppt = makeAppointment({
      appointmentId: 'blocked-1',
      status: 'blocked',
      serviceId: 'blocked',
      customer: JSON.stringify({ name: 'Blocked Time', isBlockedTime: true, duration: 120 }),
    })
    const result = detectConflict('staff-1', '2025-07-15T10:30:00', 60, 15, [blockedAppt], serviceDurationMap)
    expect(result).not.toBeNull()
    expect(result.appointmentId).toBe('blocked-1')
  })

  test('BLOCKED time with duration from customer JSON is respected', () => {
    // Blocked: 10:00-12:00 (120 min) + 15 buffer = until 12:15
    const blockedAppt = makeAppointment({
      appointmentId: 'blocked-1',
      status: 'blocked',
      serviceId: 'blocked',
      customer: JSON.stringify({ name: 'Blocked Time', isBlockedTime: true, duration: 120 }),
    })
    // Try to book at 11:30 — within the 2-hour block
    const result = detectConflict('staff-1', '2025-07-15T11:30:00', 60, 15, [blockedAppt], serviceDurationMap)
    expect(result).not.toBeNull()
  })

  test('BLOCKED time does not block time after its duration + buffer', () => {
    // Blocked: 10:00-12:00 (120 min) + 15 buffer = until 12:15
    const blockedAppt = makeAppointment({
      appointmentId: 'blocked-1',
      status: 'blocked',
      serviceId: 'blocked',
      customer: JSON.stringify({ name: 'Blocked Time', isBlockedTime: true, duration: 120 }),
    })
    // Booking at 12:15 should be fine (exactly at the boundary)
    const result = detectConflict('staff-1', '2025-07-15T12:15:00', 60, 15, [blockedAppt], serviceDurationMap)
    expect(result).toBeNull()
  })

  test('buffer time prevents booking immediately after an appointment', () => {
    // Existing: 10:00-11:00 (60 min) + 15 buffer = until 11:15
    const existing = [makeAppointment()]
    // Booking at 11:00 — appointment ended but buffer hasn't
    const result = detectConflict('staff-1', '2025-07-15T11:00:00', 60, 15, existing, serviceDurationMap)
    expect(result).not.toBeNull()
  })

  test('buffer time prevents booking immediately before an appointment', () => {
    // If new appointment is 9:00-10:00 with 15 buffer = effective end 10:15
    // Existing starts at 10:00 — new appointment's buffer runs into it
    const existing = [makeAppointment()]
    const result = detectConflict('staff-1', '2025-07-15T09:00:00', 60, 15, existing, serviceDurationMap)
    expect(result).not.toBeNull()
  })

  test('booking is allowed exactly after buffer expires', () => {
    // Existing: 10:00-11:00 + 15 buffer = 11:15
    const existing = [makeAppointment()]
    // Booking at 11:15 should be fine
    const result = detectConflict('staff-1', '2025-07-15T11:15:00', 60, 15, existing, serviceDurationMap)
    expect(result).toBeNull()
  })

  test('multiple appointments: detects first conflict', () => {
    const existing = [
      makeAppointment({ appointmentId: 'apt-1', dateTime: '2025-07-15T09:00:00' }),
      makeAppointment({ appointmentId: 'apt-2', dateTime: '2025-07-15T11:00:00' }),
    ]
    // Try to book at 11:30 — conflicts with apt-2
    const result = detectConflict('staff-1', '2025-07-15T11:30:00', 60, 15, existing, serviceDurationMap)
    expect(result).not.toBeNull()
    expect(result.appointmentId).toBe('apt-2')
  })

  test('no conflict when time is completely clear', () => {
    const existing = [
      makeAppointment({ appointmentId: 'apt-1', dateTime: '2025-07-15T09:00:00' }),
      makeAppointment({ appointmentId: 'apt-2', dateTime: '2025-07-15T13:00:00' }),
    ]
    // 11:15 is clear (apt-1 ends at 10:00+15=10:15, apt-2 starts at 13:00)
    const result = detectConflict('staff-1', '2025-07-15T11:15:00', 60, 15, existing, serviceDurationMap)
    expect(result).toBeNull()
  })

  test('manual appointment duration from customer JSON is used', () => {
    const manualAppt = makeAppointment({
      appointmentId: 'manual-1',
      serviceId: 'manual',
      customer: JSON.stringify({ name: 'Manual Entry', duration: 90 }),
    })
    // Manual: 10:00-11:30 (90 min) + 15 buffer = until 11:45
    // Try at 11:30 — within the manual appointment's effective range
    const result = detectConflict('staff-1', '2025-07-15T11:30:00', 60, 15, [manualAppt], {})
    expect(result).not.toBeNull()
  })

  test('falls back to default 60 min when no duration info available', () => {
    const unknownAppt = makeAppointment({
      serviceId: 'unknown-svc',
      customer: JSON.stringify({ name: 'Test' }),
    })
    // Default 60 min: 10:00-11:00 + 15 buffer = 11:15
    // Booking at 11:00 should conflict
    const result = detectConflict('staff-1', '2025-07-15T11:00:00', 60, 15, [unknownAppt], {})
    expect(result).not.toBeNull()
  })
})

describe('overlapDetection - utility functions', () => {
  describe('extractTimeFromDateTime', () => {
    test('extracts time from ISO format with T', () => {
      expect(extractTimeFromDateTime('2025-07-15T09:30:00')).toBe('09:30')
    })

    test('extracts time from space-separated format', () => {
      expect(extractTimeFromDateTime('2025-07-15 14:00')).toBe('14:00')
    })

    test('handles ISO with timezone', () => {
      expect(extractTimeFromDateTime('2025-07-15T09:30:00Z')).toBe('09:30')
    })
  })

  describe('timeToMinutes', () => {
    test('converts midnight', () => {
      expect(timeToMinutes('00:00')).toBe(0)
    })

    test('converts 9:30 AM', () => {
      expect(timeToMinutes('09:30')).toBe(570)
    })

    test('converts noon', () => {
      expect(timeToMinutes('12:00')).toBe(720)
    })

    test('converts 11:59 PM', () => {
      expect(timeToMinutes('23:59')).toBe(1439)
    })
  })

  describe('extractDateFromDateTime', () => {
    test('extracts date from ISO format', () => {
      expect(extractDateFromDateTime('2025-07-15T09:00:00')).toBe('2025-07-15')
    })

    test('extracts date from space-separated format', () => {
      expect(extractDateFromDateTime('2025-07-15 09:00')).toBe('2025-07-15')
    })
  })

  describe('getEffectiveAppointmentDuration', () => {
    test('returns blocked time duration from customer JSON', () => {
      const apt = {
        serviceId: 'blocked',
        customer: JSON.stringify({ isBlockedTime: true, duration: 120 }),
      }
      expect(getEffectiveAppointmentDuration(apt, {})).toBe(120)
    })

    test('returns service duration from map', () => {
      const apt = { serviceId: 'svc-1', customer: '{}' }
      expect(getEffectiveAppointmentDuration(apt, { 'svc-1': 45 })).toBe(45)
    })

    test('returns customer duration for manual appointments', () => {
      const apt = { serviceId: 'manual', customer: JSON.stringify({ duration: 90 }) }
      expect(getEffectiveAppointmentDuration(apt, {})).toBe(90)
    })

    test('falls back to default when no info available', () => {
      const apt = { serviceId: 'unknown', customer: '{}' }
      expect(getEffectiveAppointmentDuration(apt, {})).toBe(60)
    })

    test('handles customer as object (not string)', () => {
      const apt = { serviceId: 'blocked', customer: { isBlockedTime: true, duration: 90 } }
      expect(getEffectiveAppointmentDuration(apt, {})).toBe(90)
    })

    test('handles malformed customer JSON gracefully', () => {
      const apt = { serviceId: 'svc-1', customer: 'not-json{' }
      expect(getEffectiveAppointmentDuration(apt, { 'svc-1': 30 })).toBe(30)
    })
  })
})

describe('overlapDetection - real-world scenarios', () => {
  test('client reported bug: blocked time at 2pm for 2 hours should prevent 3pm booking', () => {
    const blockedTime = {
      appointmentId: 'block-lunch',
      staffId: 'staff-jane',
      dateTime: '2025-07-15T14:00:00',
      status: 'blocked',
      serviceId: 'blocked',
      customer: JSON.stringify({ name: 'Blocked Time', isBlockedTime: true, duration: 120 }),
    }

    // Customer tries to book at 3pm (within the 2-hour block)
    const result = detectConflict(
      'staff-jane',
      '2025-07-15T15:00:00',
      60,
      15,
      [blockedTime],
      {}
    )
    expect(result).not.toBeNull()
    expect(result.appointmentId).toBe('block-lunch')
  })

  test('client reported bug: blocked time should respect buffer', () => {
    const blockedTime = {
      appointmentId: 'block-break',
      staffId: 'staff-jane',
      dateTime: '2025-07-15T12:00:00',
      status: 'blocked',
      serviceId: 'blocked',
      customer: JSON.stringify({ name: 'Lunch Break', isBlockedTime: true, duration: 60 }),
    }

    // Block: 12:00-1:00 + 15 min buffer = 1:15
    // Booking at 1:00 should be blocked (within buffer)
    const result = detectConflict(
      'staff-jane',
      '2025-07-15T13:00:00',
      60,
      15,
      [blockedTime],
      {}
    )
    expect(result).not.toBeNull()
  })

  test('booking immediately after blocked time + buffer should succeed', () => {
    const blockedTime = {
      appointmentId: 'block-break',
      staffId: 'staff-jane',
      dateTime: '2025-07-15T12:00:00',
      status: 'blocked',
      serviceId: 'blocked',
      customer: JSON.stringify({ name: 'Lunch Break', isBlockedTime: true, duration: 60 }),
    }

    // Block: 12:00-1:00 + 15 buffer = 1:15
    // Booking at 1:15 should be allowed
    const result = detectConflict(
      'staff-jane',
      '2025-07-15T13:15:00',
      60,
      15,
      [blockedTime],
      {}
    )
    expect(result).toBeNull()
  })

  test('back-to-back appointments with buffer should not be double-booked', () => {
    const existingAppt = {
      appointmentId: 'apt-existing',
      staffId: 'staff-jane',
      dateTime: '2025-07-15T10:00:00',
      status: 'confirmed',
      serviceId: 'svc-haircut',
      customer: JSON.stringify({ name: 'Alice' }),
    }

    // Haircut: 10:00-10:45 (45 min) + 15 buffer = 11:00
    // Try to book at 10:45 — within the buffer
    const result = detectConflict(
      'staff-jane',
      '2025-07-15T10:45:00',
      60,
      15,
      [existingAppt],
      { 'svc-haircut': 45 }
    )
    expect(result).not.toBeNull()
  })

  test('scheduling between two appointments respects both buffers', () => {
    const appointments = [
      {
        appointmentId: 'apt-1',
        staffId: 'staff-jane',
        dateTime: '2025-07-15T09:00:00',
        status: 'confirmed',
        serviceId: 'svc-1',
        customer: JSON.stringify({ name: 'Alice' }),
      },
      {
        appointmentId: 'apt-2',
        staffId: 'staff-jane',
        dateTime: '2025-07-15T11:30:00',
        status: 'confirmed',
        serviceId: 'svc-1',
        customer: JSON.stringify({ name: 'Bob' }),
      },
    ]

    // svc-1 is 60 min. apt-1: 9:00-10:00 + 15 = 10:15. apt-2: 11:30-12:30 + 15 = 12:45
    // Try to book at 10:15 with 60 min + 15 buffer = 10:15-11:30 → ends exactly at apt-2 start
    // newEnd = 10:15 + 60 + 15 = 11:30. existingStart (apt-2) = 11:30.
    // 11:30 > 11:30 is FALSE → no overlap with apt-2. ✓
    const result = detectConflict(
      'staff-jane',
      '2025-07-15T10:15:00',
      60,
      15,
      appointments,
      { 'svc-1': 60 }
    )
    expect(result).toBeNull()
  })

  test('scheduling between two appointments: too tight → conflict', () => {
    const appointments = [
      {
        appointmentId: 'apt-1',
        staffId: 'staff-jane',
        dateTime: '2025-07-15T09:00:00',
        status: 'confirmed',
        serviceId: 'svc-1',
        customer: JSON.stringify({ name: 'Alice' }),
      },
      {
        appointmentId: 'apt-2',
        staffId: 'staff-jane',
        dateTime: '2025-07-15T11:00:00',
        status: 'confirmed',
        serviceId: 'svc-1',
        customer: JSON.stringify({ name: 'Bob' }),
      },
    ]

    // apt-1: 9:00-10:00 + 15 = 10:15. apt-2: 11:00 start.
    // Try at 10:15 with 60 min + 15 buffer = ends at 11:30
    // newEnd(11:30) > existingStart(11:00) → CONFLICT with apt-2
    const result = detectConflict(
      'staff-jane',
      '2025-07-15T10:15:00',
      60,
      15,
      appointments,
      { 'svc-1': 60 }
    )
    expect(result).not.toBeNull()
    expect(result.appointmentId).toBe('apt-2')
  })
})
