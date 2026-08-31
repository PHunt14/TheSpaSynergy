/**
 * Staff Assigner Utility Tests
 *
 * Unit tests for the assignStaff function:
 * - Cross-vendor staff assignment
 * - Fewest bookings preference logic
 * - Error when insufficient staff available
 * - All staff from same vendor (no cross-vendor split)
 * - Conflict detection
 */

import { assignStaff, rankEligibleStaff } from '../../app/utils/staffAssigner.js'

const makeStaff = (id, vendorId, schedule, autoAssignRules = null) => ({
  visibleId: id,
  vendorId,
  isActive: true,
  name: `Staff ${id}`,
  schedule: JSON.stringify(schedule),
  autoAssignRules: autoAssignRules ? JSON.stringify(autoAssignRules) : null,
})

const mondaySchedule = { monday: { start: '09:00', end: '17:00' } }

const baseService = {
  duration: 60,
  providersRequired: 2,
  allowedStaff: ['staff-1', 'staff-2', 'staff-3'],
}

describe('assignStaff', () => {
  test('assigns exactly providersRequired staff when available', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-2', 'vendor-b', mondaySchedule),
      makeStaff('staff-3', 'vendor-c', mondaySchedule),
    ]
    const result = assignStaff({
      service: baseService,
      staffSchedules,
      appointments: [],
      date: '2025-01-06',
      time: '10:00',
      bufferMinutes: 15,
    })
    expect(result).toHaveLength(2)
    expect(result[0]).toHaveProperty('staffId')
    expect(result[0]).toHaveProperty('vendorId')
    expect(result[0]).toHaveProperty('staffName')
  })

  test('cross-vendor staff assignment returns staff from different vendors', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-2', 'vendor-b', mondaySchedule),
    ]
    const result = assignStaff({
      service: baseService,
      staffSchedules,
      appointments: [],
      date: '2025-01-06',
      time: '10:00',
      bufferMinutes: 15,
    })
    expect(result).toHaveLength(2)
    const vendorIds = result.map(r => r.vendorId)
    expect(vendorIds).toContain('vendor-a')
    expect(vendorIds).toContain('vendor-b')
  })

  test('all staff from same vendor works', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-2', 'vendor-a', mondaySchedule),
    ]
    const result = assignStaff({
      service: baseService,
      staffSchedules,
      appointments: [],
      date: '2025-01-06',
      time: '10:00',
      bufferMinutes: 15,
    })
    expect(result).toHaveLength(2)
    expect(result.every(r => r.vendorId === 'vendor-a')).toBe(true)
  })

  test('fewest bookings preference: prefers staff with fewer non-cancelled bookings', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-2', 'vendor-b', mondaySchedule),
      makeStaff('staff-3', 'vendor-c', mondaySchedule),
    ]
    // staff-1 has 2 existing bookings, staff-2 has 1, staff-3 has 0
    const appointments = [
      { dateTime: '2025-01-06T08:00', staffId: 'staff-1', status: 'confirmed', customer: JSON.stringify({ name: 'Test' }) },
      { dateTime: '2025-01-06T12:00', staffId: 'staff-1', status: 'confirmed', customer: JSON.stringify({ name: 'Test' }) },
      { dateTime: '2025-01-06T08:00', staffId: 'staff-2', status: 'confirmed', customer: JSON.stringify({ name: 'Test' }) },
    ]
    const result = assignStaff({
      service: baseService,
      staffSchedules,
      appointments,
      date: '2025-01-06', // Monday
      time: '10:00',
      bufferMinutes: 15,
    })
    expect(result).toHaveLength(2)
    // staff-3 (0 bookings) and staff-2 (1 booking) should be preferred over staff-1 (2 bookings)
    const assignedIds = result.map(r => r.staffId)
    expect(assignedIds).toContain('staff-3')
    expect(assignedIds).toContain('staff-2')
  })

  test('throws error when insufficient staff available', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
    ]
    expect(() => {
      assignStaff({
        service: baseService,
        staffSchedules,
        appointments: [],
        date: '2025-01-06',
        time: '10:00',
        bufferMinutes: 15,
      })
    }).toThrow('Insufficient staff available')
  })

  test('excludes staff with conflicting appointments', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-2', 'vendor-b', mondaySchedule),
      makeStaff('staff-3', 'vendor-c', mondaySchedule),
    ]
    // staff-1 is busy at 10:00
    const appointments = [
      { dateTime: '2025-01-06T10:00', staffId: 'staff-1', status: 'confirmed', customer: JSON.stringify({ name: 'Test' }) },
    ]
    const result = assignStaff({
      service: baseService,
      staffSchedules,
      appointments,
      date: '2025-01-06',
      time: '10:00',
      bufferMinutes: 15,
    })
    expect(result).toHaveLength(2)
    const assignedIds = result.map(r => r.staffId)
    expect(assignedIds).not.toContain('staff-1')
  })

  test('cancelled appointments do not block staff', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-2', 'vendor-b', mondaySchedule),
    ]
    const appointments = [
      { dateTime: '2025-01-06T10:00', staffId: 'staff-1', status: 'cancelled', customer: JSON.stringify({ name: 'Test' }) },
    ]
    const result = assignStaff({
      service: baseService,
      staffSchedules,
      appointments,
      date: '2025-01-06',
      time: '10:00',
      bufferMinutes: 15,
    })
    expect(result).toHaveLength(2)
    const assignedIds = result.map(r => r.staffId)
    expect(assignedIds).toContain('staff-1')
  })

  test('only assigns staff in allowedStaff', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-99', 'vendor-b', mondaySchedule), // not in allowedStaff
    ]
    expect(() => {
      assignStaff({
        service: baseService,
        staffSchedules,
        appointments: [],
        date: '2025-01-06',
        time: '10:00',
        bufferMinutes: 15,
      })
    }).toThrow('Insufficient staff available')
  })

  test('excludes staff not working on the requested day', () => {
    const tuesdaySchedule = { tuesday: { start: '09:00', end: '17:00' } }
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-2', 'vendor-b', tuesdaySchedule), // not working Monday
      makeStaff('staff-3', 'vendor-c', mondaySchedule),
    ]
    const result = assignStaff({
      service: baseService,
      staffSchedules,
      appointments: [],
      date: '2025-01-06', // Monday
      time: '10:00',
      bufferMinutes: 15,
    })
    expect(result).toHaveLength(2)
    const assignedIds = result.map(r => r.staffId)
    expect(assignedIds).not.toContain('staff-2')
  })

  test('excludes staff when time is outside working hours', () => {
    const shortSchedule = { monday: { start: '09:00', end: '11:00' } }
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-2', 'vendor-b', shortSchedule), // ends at 11, can't fit 60min at 10:00+buffer
      makeStaff('staff-3', 'vendor-c', mondaySchedule),
    ]
    const result = assignStaff({
      service: baseService,
      staffSchedules,
      appointments: [],
      date: '2025-01-06',
      time: '10:30',
      bufferMinutes: 15,
    })
    expect(result).toHaveLength(2)
    const assignedIds = result.map(r => r.staffId)
    expect(assignedIds).not.toContain('staff-2')
  })
})

describe('rankEligibleStaff', () => {
  const svc = { duration: 60, providersRequired: 1, allowedStaff: ['staff-1', 'staff-2', 'staff-3'] }

  test('returns ALL eligible staff (not just providersRequired), fewest-booked first', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-2', 'vendor-b', mondaySchedule),
      makeStaff('staff-3', 'vendor-c', mondaySchedule),
    ]
    // staff-1 has 2 bookings, staff-2 has 1, staff-3 has 0
    const appointments = [
      { dateTime: '2025-01-06T08:00', staffId: 'staff-1', status: 'confirmed', customer: JSON.stringify({ name: 'T' }) },
      { dateTime: '2025-01-06T12:00', staffId: 'staff-1', status: 'confirmed', customer: JSON.stringify({ name: 'T' }) },
      { dateTime: '2025-01-06T08:00', staffId: 'staff-2', status: 'confirmed', customer: JSON.stringify({ name: 'T' }) },
    ]
    const ranked = rankEligibleStaff({ service: svc, staffSchedules, appointments, date: '2025-01-06', time: '10:00', bufferMinutes: 15 })

    // All three are eligible at 10:00 and returned (not sliced to 1)
    expect(ranked.map(r => r.staffId)).toEqual(['staff-3', 'staff-2', 'staff-1'])
  })

  test('does NOT throw when no staff are eligible — returns empty array', () => {
    const staffSchedules = [makeStaff('staff-1', 'vendor-a', mondaySchedule)]
    // Requesting a Tuesday (no schedule) → nobody eligible
    const ranked = rankEligibleStaff({ service: svc, staffSchedules, appointments: [], date: '2025-01-07', time: '10:00', bufferMinutes: 15 })
    expect(ranked).toEqual([])
  })

  test('excludes staff with a conflicting appointment', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-2', 'vendor-b', mondaySchedule),
    ]
    const appointments = [
      { dateTime: '2025-01-06T10:00', staffId: 'staff-1', status: 'confirmed', customer: JSON.stringify({ name: 'T' }) },
    ]
    const ranked = rankEligibleStaff({ service: svc, staffSchedules, appointments, date: '2025-01-06', time: '10:00', bufferMinutes: 15 })
    expect(ranked.map(r => r.staffId)).toEqual(['staff-2'])
  })
})
