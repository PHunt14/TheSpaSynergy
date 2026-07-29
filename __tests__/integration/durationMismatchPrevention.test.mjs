/**
 * Tests for the duration-mismatch double-booking fix.
 *
 * Validates that conflict detection uses the EXISTING appointment's actual duration
 * (from customer.duration) rather than falling back to the NEW service's duration.
 *
 * This was the root cause of double-bookings: a 30-minute service booking would
 * treat an existing 90-minute appointment as only 30 minutes long during conflict checks.
 */

import { describe, test, expect } from '@jest/globals'
import { detectConflict } from '../../app/utils/overlapDetection.ts'
import { assignStaff } from '../../app/utils/staffAssigner.js'

// ── detectConflict: Duration Mismatch Tests ─────────────────────────────────

describe('detectConflict respects existing appointment duration', () => {
  test('detects conflict when new short service overlaps tail of longer existing appointment', () => {
    // Existing: 90-minute massage at 9:00 (ends 10:30)
    // New: 30-minute service at 10:00 — should CONFLICT (existing runs until 10:30)
    const existingAppointments = [{
      appointmentId: 'apt-1',
      staffId: 'staff-jane',
      dateTime: '2025-07-15T09:00:00',
      status: 'confirmed',
      serviceId: 'svc-long-massage',
      customer: JSON.stringify({ name: 'Client A', duration: 90 }),
    }]

    const result = detectConflict(
      'staff-jane',
      '2025-07-15T10:00:00',
      30, // new appointment is only 30 min
      15, // buffer
      existingAppointments,
      { 'svc-long-massage': 90 }
    )

    expect(result).not.toBeNull()
    expect(result.appointmentId).toBe('apt-1')
  })

  test('detects conflict when new short service lands in buffer zone of longer appointment', () => {
    // Existing: 90-minute appointment at 9:00 (ends 10:30 + 15 buffer = 10:45)
    // New: 30-minute service at 10:35 — within the buffer zone
    const existingAppointments = [{
      appointmentId: 'apt-1',
      staffId: 'staff-jane',
      dateTime: '2025-07-15T09:00:00',
      status: 'confirmed',
      serviceId: 'svc-long',
      customer: JSON.stringify({ name: 'Client A', duration: 90 }),
    }]

    const result = detectConflict(
      'staff-jane',
      '2025-07-15T10:35:00',
      30,
      15,
      existingAppointments,
      { 'svc-long': 90 }
    )

    expect(result).not.toBeNull()
  })

  test('allows booking after long appointment + buffer ends', () => {
    // Existing: 90-minute at 9:00 (ends 10:30 + 15 buffer = 10:45)
    // New: 30-minute at 10:45 — exactly after buffer, should be ALLOWED
    const existingAppointments = [{
      appointmentId: 'apt-1',
      staffId: 'staff-jane',
      dateTime: '2025-07-15T09:00:00',
      status: 'confirmed',
      serviceId: 'svc-long',
      customer: JSON.stringify({ name: 'Client A', duration: 90 }),
    }]

    const result = detectConflict(
      'staff-jane',
      '2025-07-15T10:45:00',
      30,
      15,
      existingAppointments,
      { 'svc-long': 90 }
    )

    expect(result).toBeNull()
  })

  test('uses customer.duration when serviceId lookup is missing', () => {
    // customer.duration is the final fallback when service isn't in the map
    const existingAppointments = [{
      appointmentId: 'apt-1',
      staffId: 'staff-jane',
      dateTime: '2025-07-15T09:00:00',
      status: 'confirmed',
      serviceId: 'svc-unknown',
      customer: JSON.stringify({ name: 'Client A', duration: 120 }),
    }]

    // Should conflict: 120-min appointment at 9:00 runs until 11:00 + 15 = 11:15
    const result = detectConflict(
      'staff-jane',
      '2025-07-15T10:30:00',
      30,
      15,
      existingAppointments,
      {} // empty map — falls back to customer.duration
    )

    expect(result).not.toBeNull()
  })

  test('falls back to serviceDurationMap when customer.duration is absent', () => {
    // Old appointments that don't have duration in customer JSON
    const existingAppointments = [{
      appointmentId: 'apt-1',
      staffId: 'staff-jane',
      dateTime: '2025-07-15T09:00:00',
      status: 'confirmed',
      serviceId: 'svc-long-massage',
      customer: JSON.stringify({ name: 'Client A' }), // no duration!
    }]

    // serviceDurationMap provides the correct duration
    const result = detectConflict(
      'staff-jane',
      '2025-07-15T10:00:00',
      30,
      15,
      existingAppointments,
      { 'svc-long-massage': 90 }
    )

    expect(result).not.toBeNull()
  })
})

// ── assignStaff: Duration Mismatch Tests ────────────────────────────────────

describe('assignStaff respects existing appointment duration from customer.duration', () => {
  const mondaySchedule = { monday: { start: '09:00', end: '17:00' } }

  const makeStaff = (id) => ({
    visibleId: id,
    vendorId: 'vendor-a',
    isActive: true,
    name: `Staff ${id}`,
    schedule: JSON.stringify(mondaySchedule),
  })

  test('excludes staff with longer existing appointment even when new service is short', () => {
    const staffSchedules = [
      makeStaff('staff-1'),
      makeStaff('staff-2'),
    ]

    // staff-1 has a 90-minute appointment at 10:00 (ends 11:00 + 15 buffer = 11:15)
    const appointments = [{
      dateTime: '2025-01-06T10:00',
      staffId: 'staff-1',
      status: 'confirmed',
      customer: JSON.stringify({ name: 'Test', duration: 90 }),
    }]

    const service = {
      duration: 30, // new service is only 30 min
      providersRequired: 1,
      allowedStaff: ['staff-1', 'staff-2'],
    }

    const result = assignStaff({
      service,
      staffSchedules,
      appointments,
      date: '2025-01-06',
      time: '10:30', // within the 90-min appointment
      bufferMinutes: 15,
    })

    expect(result).toHaveLength(1)
    expect(result[0].staffId).toBe('staff-2') // staff-1 should be excluded
  })

  test('excludes staff when booking in buffer zone of longer appointment', () => {
    const staffSchedules = [
      makeStaff('staff-1'),
      makeStaff('staff-2'),
    ]

    // staff-1 has a 90-minute appointment at 9:00 (ends 10:30 + 15 buffer = 10:45)
    const appointments = [{
      dateTime: '2025-01-06T09:00',
      staffId: 'staff-1',
      status: 'confirmed',
      customer: JSON.stringify({ name: 'Test', duration: 90 }),
    }]

    const service = {
      duration: 30,
      providersRequired: 1,
      allowedStaff: ['staff-1', 'staff-2'],
    }

    const result = assignStaff({
      service,
      staffSchedules,
      appointments,
      date: '2025-01-06',
      time: '10:35', // within the buffer zone of the 90-min appointment
      bufferMinutes: 15,
    })

    expect(result).toHaveLength(1)
    expect(result[0].staffId).toBe('staff-2')
  })

  test('allows staff assignment after longer appointment + buffer ends', () => {
    const staffSchedules = [
      makeStaff('staff-1'),
      makeStaff('staff-2'),
    ]

    // staff-1 has a 90-minute appointment at 9:00 (ends 10:30 + 15 buffer = 10:45)
    const appointments = [{
      dateTime: '2025-01-06T09:00',
      staffId: 'staff-1',
      status: 'confirmed',
      customer: JSON.stringify({ name: 'Test', duration: 90 }),
    }]

    const service = {
      duration: 30,
      providersRequired: 1,
      allowedStaff: ['staff-1', 'staff-2'],
    }

    const result = assignStaff({
      service,
      staffSchedules,
      appointments,
      date: '2025-01-06',
      time: '10:45', // exactly after buffer ends
      bufferMinutes: 15,
    })

    expect(result).toHaveLength(1)
    // staff-1 is now free at this time (the conflict check passes)
    // But fewest-bookings prefers staff-2 (0 bookings vs staff-1's 1 booking)
    // The key thing is that staff-1 is ELIGIBLE — not excluded due to conflict
    // Test with only staff-1 to prove it's eligible:
  })

  test('staff with longer past appointment is eligible after buffer ends (isolated)', () => {
    const staffSchedules = [
      makeStaff('staff-1'),
    ]

    // staff-1 has a 90-minute appointment at 9:00 (ends 10:30 + 15 buffer = 10:45)
    const appointments = [{
      dateTime: '2025-01-06T09:00',
      staffId: 'staff-1',
      status: 'confirmed',
      customer: JSON.stringify({ name: 'Test', duration: 90 }),
    }]

    const service = {
      duration: 30,
      providersRequired: 1,
      allowedStaff: ['staff-1'],
    }

    // Should NOT throw — staff-1 is available at 10:45
    const result = assignStaff({
      service,
      staffSchedules,
      appointments,
      date: '2025-01-06',
      time: '10:45',
      bufferMinutes: 15,
    })

    expect(result).toHaveLength(1)
    expect(result[0].staffId).toBe('staff-1')
  })

  test('blocked time duration is respected regardless of new service duration', () => {
    const staffSchedules = [
      makeStaff('staff-1'),
      makeStaff('staff-2'),
    ]

    // staff-1 has a 2-hour blocked time at 12:00
    const appointments = [{
      dateTime: '2025-01-06T12:00',
      staffId: 'staff-1',
      status: 'blocked',
      customer: JSON.stringify({ name: 'Blocked Time', isBlockedTime: true, duration: 120 }),
    }]

    const service = {
      duration: 30,
      providersRequired: 1,
      allowedStaff: ['staff-1', 'staff-2'],
    }

    // Try to assign at 13:00 — within the 2-hour block
    const result = assignStaff({
      service,
      staffSchedules,
      appointments,
      date: '2025-01-06',
      time: '13:00',
      bufferMinutes: 15,
    })

    expect(result).toHaveLength(1)
    expect(result[0].staffId).toBe('staff-2') // staff-1 is blocked
  })
})
