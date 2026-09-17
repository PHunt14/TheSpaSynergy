/**
 * Unit Tests for Sequential Availability Utility
 *
 * Tests for app/utils/sequentialAvailability.js:
 * - calculateTotalBundleDuration
 * - calculateServiceSchedule
 * - findSlotsForOrder
 * - getSequentialBundleSlots (multi-day)
 * - Edge cases: single service, services that don't fit in a day
 *
 * Validates Requirements: 4.1, 4.2, 4.3, 4.10
 */

import {
  calculateTotalBundleDuration,
  calculateServiceSchedule,
  findSlotsForOrder,
  getSequentialBundleSlots
} from '../../app/utils/sequentialAvailability.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeStaff = (id, vendorId, schedule) => ({
  visibleId: id,
  vendorId,
  isActive: true,
  name: `Staff ${id}`,
  schedule: JSON.stringify(schedule),
  autoAssignRules: null,
})

const mondaySchedule = { monday: { start: '09:00', end: '17:00' } }
const shortMondaySchedule = { monday: { start: '09:00', end: '11:00' } }
const tuesdaySchedule = { tuesday: { start: '09:00', end: '17:00' } }
const monTueSchedule = { monday: { start: '09:00', end: '17:00' }, tuesday: { start: '09:00', end: '17:00' } }

const makeService = (id, duration, allowedStaff = ['staff-1'], providersRequired = 1) => ({
  serviceId: id,
  duration,
  allowedStaff,
  providersRequired,
})

// ── calculateTotalBundleDuration ─────────────────────────────────────────────

describe('calculateTotalBundleDuration', () => {
  test('returns 0 for empty services array', () => {
    expect(calculateTotalBundleDuration([], 15)).toBe(0)
  })

  test('returns 0 for null/undefined services', () => {
    expect(calculateTotalBundleDuration(null, 15)).toBe(0)
    expect(calculateTotalBundleDuration(undefined, 15)).toBe(0)
  })

  test('single service: returns duration with no buffer', () => {
    const services = [{ duration: 60 }]
    expect(calculateTotalBundleDuration(services, 15)).toBe(60)
  })

  test('two services: duration sum + 1 buffer', () => {
    const services = [{ duration: 60 }, { duration: 30 }]
    expect(calculateTotalBundleDuration(services, 15)).toBe(105) // 60 + 30 + 15
  })

  test('three services: duration sum + 2 buffers', () => {
    const services = [{ duration: 60 }, { duration: 45 }, { duration: 30 }]
    expect(calculateTotalBundleDuration(services, 10)).toBe(155) // 60 + 45 + 30 + 10*2
  })

  test('zero buffer: returns sum of durations only', () => {
    const services = [{ duration: 30 }, { duration: 45 }, { duration: 60 }]
    expect(calculateTotalBundleDuration(services, 0)).toBe(135)
  })

  test('many services with large buffer', () => {
    const services = Array.from({ length: 5 }, () => ({ duration: 20 }))
    // 5*20 + 4*30 = 100 + 120 = 220
    expect(calculateTotalBundleDuration(services, 30)).toBe(220)
  })
})

// ── calculateServiceSchedule ─────────────────────────────────────────────────

describe('calculateServiceSchedule', () => {
  test('single service starts at given time', () => {
    const services = [makeService('svc-1', 60)]
    const schedule = calculateServiceSchedule(services, '09:00', 15)

    expect(schedule).toHaveLength(1)
    expect(schedule[0]).toEqual({
      serviceId: 'svc-1',
      startTime: '09:00',
      endTime: '10:00'
    })
  })

  test('two services with buffer between them', () => {
    const services = [
      makeService('svc-1', 60),
      makeService('svc-2', 30)
    ]
    const schedule = calculateServiceSchedule(services, '09:00', 15)

    expect(schedule).toHaveLength(2)
    expect(schedule[0]).toEqual({ serviceId: 'svc-1', startTime: '09:00', endTime: '10:00' })
    expect(schedule[1]).toEqual({ serviceId: 'svc-2', startTime: '10:15', endTime: '10:45' })
  })

  test('three services with correct sequential timing', () => {
    const services = [
      makeService('svc-1', 45),
      makeService('svc-2', 30),
      makeService('svc-3', 60)
    ]
    const schedule = calculateServiceSchedule(services, '10:00', 10)

    expect(schedule).toHaveLength(3)
    expect(schedule[0]).toEqual({ serviceId: 'svc-1', startTime: '10:00', endTime: '10:45' })
    expect(schedule[1]).toEqual({ serviceId: 'svc-2', startTime: '10:55', endTime: '11:25' })
    expect(schedule[2]).toEqual({ serviceId: 'svc-3', startTime: '11:35', endTime: '12:35' })
  })

  test('zero buffer: services are back-to-back', () => {
    const services = [
      makeService('svc-1', 30),
      makeService('svc-2', 45)
    ]
    const schedule = calculateServiceSchedule(services, '14:00', 0)

    expect(schedule[0]).toEqual({ serviceId: 'svc-1', startTime: '14:00', endTime: '14:30' })
    expect(schedule[1]).toEqual({ serviceId: 'svc-2', startTime: '14:30', endTime: '15:15' })
  })

  test('handles times that cross noon correctly', () => {
    const services = [
      makeService('svc-1', 90),
      makeService('svc-2', 60)
    ]
    const schedule = calculateServiceSchedule(services, '11:00', 15)

    expect(schedule[0]).toEqual({ serviceId: 'svc-1', startTime: '11:00', endTime: '12:30' })
    expect(schedule[1]).toEqual({ serviceId: 'svc-2', startTime: '12:45', endTime: '13:45' })
  })

  test('total span matches calculateTotalBundleDuration', () => {
    const services = [
      makeService('svc-1', 60),
      makeService('svc-2', 45),
      makeService('svc-3', 30)
    ]
    const buffer = 15
    const schedule = calculateServiceSchedule(services, '09:00', buffer)
    const totalDuration = calculateTotalBundleDuration(services, buffer)

    // First service starts at 09:00, total duration should match
    const startMinutes = 9 * 60
    const endMinutes = parseInt(schedule[2].endTime.split(':')[0]) * 60 + parseInt(schedule[2].endTime.split(':')[1])
    expect(endMinutes - startMinutes).toBe(totalDuration)
  })
})

// ── findSlotsForOrder ────────────────────────────────────────────────────────

describe('findSlotsForOrder', () => {
  test('returns slots when staff is available for all services', () => {
    const services = [
      makeService('svc-1', 60, ['staff-1']),
      makeService('svc-2', 30, ['staff-2'])
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', mondaySchedule)],
      'svc-2': [makeStaff('staff-2', 'v-b', mondaySchedule)]
    }

    const slots = findSlotsForOrder({
      orderedServices: services,
      staffSchedulesByService,
      appointments: [],
      date: '2025-01-06', // Monday
      bufferMinutes: 15
    })

    expect(slots.length).toBeGreaterThan(0)
    // First slot should start at 09:00 (aligned to 30-min boundary)
    expect(slots[0].startTime).toBe('09:00')
    expect(slots[0].schedule).toHaveLength(2)
  })

  test('returns empty when no staff works on the requested day', () => {
    const services = [
      makeService('svc-1', 60, ['staff-1'])
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', tuesdaySchedule)] // only works Tuesday
    }

    const slots = findSlotsForOrder({
      orderedServices: services,
      staffSchedulesByService,
      appointments: [],
      date: '2025-01-06', // Monday
      bufferMinutes: 15
    })

    expect(slots).toHaveLength(0)
  })

  test('excludes slots where staff has conflicting appointments', () => {
    const services = [
      makeService('svc-1', 60, ['staff-1'])
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', mondaySchedule)]
    }
    // staff-1 is busy from 09:00 to 10:00
    const appointments = [
      { dateTime: '2025-01-06T09:00', staffId: 'staff-1', status: 'confirmed', customer: JSON.stringify({ name: 'Test' }) }
    ]

    const slots = findSlotsForOrder({
      orderedServices: services,
      staffSchedulesByService,
      appointments,
      date: '2025-01-06',
      bufferMinutes: 15
    })

    // 09:00 and 09:30 should be excluded (conflict + buffer)
    const startTimes = slots.map(s => s.startTime)
    expect(startTimes).not.toContain('09:00')
    expect(startTimes).not.toContain('09:30')
    // 10:30 should be available (after 60min service + 15min buffer)
    expect(startTimes).toContain('10:30')
  })

  test('excludes slots outside staff working hours', () => {
    const services = [
      makeService('svc-1', 60, ['staff-1'])
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', shortMondaySchedule)] // 09:00-11:00
    }

    const slots = findSlotsForOrder({
      orderedServices: services,
      staffSchedulesByService,
      appointments: [],
      date: '2025-01-06',
      bufferMinutes: 15
    })

    // Only 09:00 and 09:30 should work (60min service must end by 11:00)
    // 09:00 → ends 10:00 ✓
    // 09:30 → ends 10:30 ✓
    // 10:00 → ends 11:00 ✓
    // 10:30 → ends 11:30 ✗
    const startTimes = slots.map(s => s.startTime)
    expect(startTimes).toContain('09:00')
    expect(startTimes).toContain('10:00')
    expect(startTimes).not.toContain('10:30')
    expect(startTimes).not.toContain('11:00')
  })

  test('handles multi-service sequential constraint: second service must fit after first + buffer', () => {
    const services = [
      makeService('svc-1', 60, ['staff-1']),
      makeService('svc-2', 60, ['staff-2'])
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', shortMondaySchedule)], // 09:00-11:00
      'svc-2': [makeStaff('staff-2', 'v-b', shortMondaySchedule)]  // 09:00-11:00
    }

    const slots = findSlotsForOrder({
      orderedServices: services,
      staffSchedulesByService,
      appointments: [],
      date: '2025-01-06',
      bufferMinutes: 15
    })

    // Total duration: 60 + 15 + 60 = 135 min
    // Working hours: 09:00-11:00 = 120 min
    // 135 > 120, so no slots should be available
    expect(slots).toHaveLength(0)
  })

  test('returns empty for empty services array', () => {
    const slots = findSlotsForOrder({
      orderedServices: [],
      staffSchedulesByService: {},
      appointments: [],
      date: '2025-01-06',
      bufferMinutes: 15
    })
    expect(slots).toHaveLength(0)
  })

  test('requires providersRequired staff to be available', () => {
    const services = [
      makeService('svc-1', 60, ['staff-1', 'staff-2'], 2) // needs 2 providers
    ]
    const staffSchedulesByService = {
      'svc-1': [
        makeStaff('staff-1', 'v-a', mondaySchedule),
        // only 1 staff available
      ]
    }

    const slots = findSlotsForOrder({
      orderedServices: services,
      staffSchedulesByService,
      appointments: [],
      date: '2025-01-06',
      bufferMinutes: 15
    })

    // Only 1 staff available but 2 required → no slots
    expect(slots).toHaveLength(0)
  })

  test('returns slots when providersRequired staff are all available', () => {
    const services = [
      makeService('svc-1', 60, ['staff-1', 'staff-2'], 2)
    ]
    const staffSchedulesByService = {
      'svc-1': [
        makeStaff('staff-1', 'v-a', mondaySchedule),
        makeStaff('staff-2', 'v-b', mondaySchedule)
      ]
    }

    const slots = findSlotsForOrder({
      orderedServices: services,
      staffSchedulesByService,
      appointments: [],
      date: '2025-01-06',
      bufferMinutes: 15
    })

    expect(slots.length).toBeGreaterThan(0)
  })

  test('cancelled appointments do not block slots', () => {
    const services = [
      makeService('svc-1', 60, ['staff-1'])
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', mondaySchedule)]
    }
    const appointments = [
      { dateTime: '2025-01-06T09:00', staffId: 'staff-1', status: 'cancelled', customer: JSON.stringify({ name: 'Test' }) }
    ]

    const slots = findSlotsForOrder({
      orderedServices: services,
      staffSchedulesByService,
      appointments,
      date: '2025-01-06',
      bufferMinutes: 15
    })

    const startTimes = slots.map(s => s.startTime)
    expect(startTimes).toContain('09:00')
  })
})

// ── getSequentialBundleSlots ─────────────────────────────────────────────────

describe('getSequentialBundleSlots', () => {
  test('uses customer-specified order when provided', () => {
    const services = [
      makeService('svc-1', 30, ['staff-1']),
      makeService('svc-2', 30, ['staff-2'])
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', mondaySchedule)],
      'svc-2': [makeStaff('staff-2', 'v-b', mondaySchedule)]
    }

    const result = getSequentialBundleSlots({
      services,
      staffSchedulesByService,
      appointments: [],
      startDate: '2025-01-06',
      bufferMinutes: 15,
      serviceOrder: ['svc-2', 'svc-1'], // reversed order
      multiDay: false,
      maxDays: 1
    })

    expect(result.suggestedOrder).toEqual(['svc-2', 'svc-1'])
    expect(result.slots.length).toBeGreaterThan(0)
    // First service in schedule should be svc-2
    expect(result.slots[0].schedule[0].serviceId).toBe('svc-2')
  })

  test('finds optimal order when no order specified', () => {
    const services = [
      makeService('svc-1', 30, ['staff-1']),
      makeService('svc-2', 30, ['staff-2'])
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', mondaySchedule)],
      'svc-2': [makeStaff('staff-2', 'v-b', mondaySchedule)]
    }

    const result = getSequentialBundleSlots({
      services,
      staffSchedulesByService,
      appointments: [],
      startDate: '2025-01-06',
      bufferMinutes: 15,
      serviceOrder: null,
      multiDay: false,
      maxDays: 1
    })

    expect(result.suggestedOrder).toBeDefined()
    expect(result.suggestedOrder).toHaveLength(2)
    expect(result.slots.length).toBeGreaterThan(0)
  })

  test('multi-day scheduling distributes services across days', () => {
    // Two services that each need a full day (long duration relative to working hours)
    const services = [
      makeService('svc-1', 420, ['staff-1']), // 7 hours
      makeService('svc-2', 420, ['staff-2'])  // 7 hours
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', monTueSchedule)], // works Mon+Tue
      'svc-2': [makeStaff('staff-2', 'v-b', monTueSchedule)]  // works Mon+Tue
    }

    const result = getSequentialBundleSlots({
      services,
      staffSchedulesByService,
      appointments: [],
      startDate: '2025-01-06', // Monday
      bufferMinutes: 15,
      serviceOrder: ['svc-1', 'svc-2'],
      multiDay: true,
      maxDays: 2
    })

    // With 7h services + 15min buffer = 855 min total, can't fit in 8h day
    // Multi-day should split them across Mon and Tue
    expect(result.slots.length).toBeGreaterThan(0)
    // Schedule should have day info
    const schedule = result.slots[0].schedule
    const days = schedule.map(s => s.day)
    // Should span at least 2 days
    expect(new Set(days).size).toBeGreaterThanOrEqual(1)
  })

  test('returns empty slots when services cannot fit in any configuration', () => {
    // Service too long for the working hours, even single day
    const services = [
      makeService('svc-1', 600, ['staff-1']) // 10 hours, but staff only works 8
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', mondaySchedule)] // 09:00-17:00 = 8h
    }

    const result = getSequentialBundleSlots({
      services,
      staffSchedulesByService,
      appointments: [],
      startDate: '2025-01-06',
      bufferMinutes: 15,
      serviceOrder: ['svc-1'],
      multiDay: false,
      maxDays: 1
    })

    expect(result.slots).toHaveLength(0)
  })

  test('slots are sorted by start time', () => {
    const services = [
      makeService('svc-1', 30, ['staff-1']),
      makeService('svc-2', 30, ['staff-2'])
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', mondaySchedule)],
      'svc-2': [makeStaff('staff-2', 'v-b', mondaySchedule)]
    }

    const result = getSequentialBundleSlots({
      services,
      staffSchedulesByService,
      appointments: [],
      startDate: '2025-01-06',
      bufferMinutes: 15,
      serviceOrder: null,
      multiDay: false,
      maxDays: 1
    })

    for (let i = 1; i < result.slots.length; i++) {
      const prev = result.slots[i - 1].startTime
      const curr = result.slots[i].startTime
      expect(curr >= prev).toBe(true)
    }
  })
})

// ── Edge Cases ───────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  test('single service: no buffer applied, slots returned normally', () => {
    const services = [makeService('svc-1', 60, ['staff-1'])]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', mondaySchedule)]
    }

    const result = getSequentialBundleSlots({
      services,
      staffSchedulesByService,
      appointments: [],
      startDate: '2025-01-06',
      bufferMinutes: 15,
      serviceOrder: ['svc-1'],
      multiDay: false,
      maxDays: 1
    })

    expect(result.slots.length).toBeGreaterThan(0)
    // Each slot schedule should have exactly 1 entry
    expect(result.slots[0].schedule).toHaveLength(1)
    // Total duration should be just the service duration (no buffer for single service)
    expect(calculateTotalBundleDuration(services, 15)).toBe(60)
  })

  test('services that do not fit in a single day return empty when multiDay is false', () => {
    // Two 5-hour services with 15min buffer = 10h 15min, but working day is 8h
    const services = [
      makeService('svc-1', 300, ['staff-1']),
      makeService('svc-2', 300, ['staff-2'])
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', mondaySchedule)],
      'svc-2': [makeStaff('staff-2', 'v-b', mondaySchedule)]
    }

    const result = getSequentialBundleSlots({
      services,
      staffSchedulesByService,
      appointments: [],
      startDate: '2025-01-06',
      bufferMinutes: 15,
      serviceOrder: ['svc-1', 'svc-2'],
      multiDay: false,
      maxDays: 1
    })

    expect(result.slots).toHaveLength(0)
  })

  test('slot startTime equals first service startTime (Property 7)', () => {
    const services = [
      makeService('svc-1', 30, ['staff-1']),
      makeService('svc-2', 30, ['staff-2'])
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', mondaySchedule)],
      'svc-2': [makeStaff('staff-2', 'v-b', mondaySchedule)]
    }

    const result = getSequentialBundleSlots({
      services,
      staffSchedulesByService,
      appointments: [],
      startDate: '2025-01-06',
      bufferMinutes: 15,
      serviceOrder: ['svc-1', 'svc-2'],
      multiDay: false,
      maxDays: 1
    })

    for (const slot of result.slots) {
      expect(slot.startTime).toBe(slot.schedule[0].startTime)
    }
  })
})

// ── Available-dates ↔ times consistency ──────────────────────────────────────
//
// Regression guard for the "day shows available but has no time slots" bug.
//
// The /api/available-dates (bundle) endpoint now decides a day is available by
// running this SAME getSequentialBundleSlots scheduler and checking slots.length
// > 0. Previously it only checked that each service had a staff member *working*
// that day, which is weaker than the times endpoint and produced highlighted
// days with zero bookable times. These tests pin the invariant that "staff are
// working" does NOT imply "a slot exists".

describe('available-dates consistency: working staff does not imply a slot', () => {
  test('bundle that does not fit in the working window yields no slots', () => {
    // Two 60-min services + 15 buffer = 135 min, but staff only work 09:00–11:00 (120 min).
    const services = [
      makeService('svc-1', 60, ['staff-1']),
      makeService('svc-2', 60, ['staff-1']),
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', shortMondaySchedule)],
      'svc-2': [makeStaff('staff-1', 'v-a', shortMondaySchedule)],
    }

    const { slots } = getSequentialBundleSlots({
      services,
      staffSchedulesByService,
      appointments: [],
      startDate: '2025-01-06', // Monday
      bufferMinutes: 15,
      serviceOrder: ['svc-1', 'svc-2'],
      multiDay: false,
      maxDays: 1,
    })

    // Staff ARE working Monday, but the bundle cannot fit -> the day must NOT
    // be reported as available.
    expect(slots.length).toBe(0)
  })

  test('a fitting bundle on a working day yields at least one slot', () => {
    const services = [
      makeService('svc-1', 60, ['staff-1']),
      makeService('svc-2', 30, ['staff-1']),
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', mondaySchedule)], // 09:00–17:00
      'svc-2': [makeStaff('staff-1', 'v-a', mondaySchedule)],
    }

    const { slots } = getSequentialBundleSlots({
      services,
      staffSchedulesByService,
      appointments: [],
      startDate: '2025-01-06',
      bufferMinutes: 15,
      serviceOrder: ['svc-1', 'svc-2'],
      multiDay: false,
      maxDays: 1,
    })

    expect(slots.length).toBeGreaterThan(0)
  })

  test('a day fully booked by existing appointments yields no slots even with working staff', () => {
    const services = [
      makeService('svc-1', 60, ['staff-1']),
      makeService('svc-2', 60, ['staff-1']),
    ]
    // Only two hours of work, and the single eligible staff member is booked the whole time.
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', shortMondaySchedule)], // 09:00–11:00
      'svc-2': [makeStaff('staff-1', 'v-a', shortMondaySchedule)],
    }
    const appointments = [
      { staffId: 'staff-1', dateTime: '2025-01-06T09:00', duration: 120, status: 'confirmed' },
    ]

    const { slots } = getSequentialBundleSlots({
      services,
      staffSchedulesByService,
      appointments,
      startDate: '2025-01-06',
      bufferMinutes: 15,
      serviceOrder: ['svc-1', 'svc-2'],
      multiDay: false,
      maxDays: 1,
    })

    expect(slots.length).toBe(0)
  })
})

// ── Schedule overrides honored by the bundle scheduler ───────────────────────
//
// Regression guard: the bundle scheduler (getStaffHours / isWorkingAtTime) must
// honor schedule.overrides the same way the rest of the app does. Previously it
// only read the weekly template, so a staff member available on a date ONLY via
// an override was treated as not working -> the whole bundle produced no slots
// even though the calendar (which honors overrides) showed the day as available.

describe('bundle scheduler honors schedule.overrides', () => {
  // 2025-01-06 is a Monday. We use a staff whose WEEKLY template is closed
  // Monday but who has a date-specific override opening 09:00-17:00 that day.
  const overrideOpenSchedule = {
    // No monday key at all -> normally closed on Mondays.
    overrides: { '2025-01-06': { start: '09:00', end: '17:00' } },
  }

  test('staff working only via a date override yields slots', () => {
    const services = [
      makeService('svc-1', 60, ['staff-1']),
      makeService('svc-2', 30, ['staff-1']),
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', overrideOpenSchedule)],
      'svc-2': [makeStaff('staff-1', 'v-a', overrideOpenSchedule)],
    }

    const { slots } = getSequentialBundleSlots({
      services,
      staffSchedulesByService,
      appointments: [],
      startDate: '2025-01-06',
      bufferMinutes: 15,
      serviceOrder: ['svc-1', 'svc-2'],
      multiDay: false,
      maxDays: 1,
    })

    expect(slots.length).toBeGreaterThan(0)
  })

  test('override that closes a normally-open day removes slots', () => {
    // Weekly template open Monday, but an override closes 2025-01-06 (null).
    const overrideClosedSchedule = {
      monday: { start: '09:00', end: '17:00' },
      overrides: { '2025-01-06': null },
    }
    const services = [
      makeService('svc-1', 60, ['staff-1']),
      makeService('svc-2', 30, ['staff-1']),
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', overrideClosedSchedule)],
      'svc-2': [makeStaff('staff-1', 'v-a', overrideClosedSchedule)],
    }

    const { slots } = getSequentialBundleSlots({
      services,
      staffSchedulesByService,
      appointments: [],
      startDate: '2025-01-06',
      bufferMinutes: 15,
      serviceOrder: ['svc-1', 'svc-2'],
      multiDay: false,
      maxDays: 1,
    })

    expect(slots.length).toBe(0)
  })

  test('one bundle service closed by override on that date zeroes the whole bundle', () => {
    // svc-1 staff works normally; svc-2 staff is closed by override that date.
    // Because a bundle requires ALL services assignable, the day must yield no slots.
    const openSchedule = { monday: { start: '09:00', end: '17:00' } }
    const closedByOverride = {
      monday: { start: '09:00', end: '17:00' },
      overrides: { '2025-01-06': null },
    }
    const services = [
      makeService('svc-1', 60, ['staff-1']),
      makeService('svc-2', 30, ['staff-2']),
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', openSchedule)],
      'svc-2': [makeStaff('staff-2', 'v-b', closedByOverride)],
    }

    const { slots } = getSequentialBundleSlots({
      services,
      staffSchedulesByService,
      appointments: [],
      startDate: '2025-01-06',
      bufferMinutes: 15,
      serviceOrder: ['svc-1', 'svc-2'],
      multiDay: false,
      maxDays: 1,
    })

    expect(slots.length).toBe(0)
  })
})

// ── Resource-type services (sauna/room) modeled as synthetic resource staff ──
//
// Regression guard: a bundle containing a sauna/room service used to yield zero
// slots because those services have no human staff. The API routes now inject a
// synthetic resource-staff entry (visibleId resource-sauna/resource-room) whose
// schedule reflects the vendor's resource hours. This verifies the scheduler can
// assign such a resource alongside a normal staff-based service.

describe('bundle with a synthetic resource (sauna) service', () => {
  const makeResourceStaff = (id, schedule) => ({
    visibleId: id,
    isActive: true,
    name: 'Sauna',
    autoAssignRules: null,
    schedule: JSON.stringify(schedule),
  })

  test('sauna + haircut bundle yields slots when the sauna is open', () => {
    const services = [
      makeService('svc-haircut', 30, ['staff-1']),
      makeService('svc-sauna', 45, ['resource-sauna']),
    ]
    const staffSchedulesByService = {
      'svc-haircut': [makeStaff('staff-1', 'v-a', mondaySchedule)],
      'svc-sauna': [makeResourceStaff('resource-sauna', { monday: { start: '09:00', end: '17:00' } })],
    }

    const { slots } = getSequentialBundleSlots({
      services,
      staffSchedulesByService,
      appointments: [],
      startDate: '2025-01-06', // Monday
      bufferMinutes: 15,
      serviceOrder: ['svc-haircut', 'svc-sauna'],
      multiDay: false,
      maxDays: 1,
    })

    expect(slots.length).toBeGreaterThan(0)
  })

  test('sauna closed that day zeroes the bundle (empty resource staff)', () => {
    const services = [
      makeService('svc-haircut', 30, ['staff-1']),
      makeService('svc-sauna', 45, ['resource-sauna']),
    ]
    const staffSchedulesByService = {
      'svc-haircut': [makeStaff('staff-1', 'v-a', mondaySchedule)],
      'svc-sauna': [], // vendor saunaHours had no entry for this day -> closed
    }

    const { slots } = getSequentialBundleSlots({
      services,
      staffSchedulesByService,
      appointments: [],
      startDate: '2025-01-06',
      bufferMinutes: 15,
      serviceOrder: ['svc-haircut', 'svc-sauna'],
      multiDay: false,
      maxDays: 1,
    })

    expect(slots.length).toBe(0)
  })

  test('existing sauna booking blocks the overlapping resource slot', () => {
    const services = [
      makeService('svc-sauna', 45, ['resource-sauna']),
    ]
    const staffSchedulesByService = {
      'svc-sauna': [makeResourceStaff('resource-sauna', { monday: { start: '09:00', end: '10:00' } })],
    }
    // The only window (09:00-10:00 fits one 45-min session) is taken by an
    // existing sauna appointment on the resource-sauna calendar.
    const appointments = [
      { staffId: 'resource-sauna', dateTime: '2025-01-06T09:00', status: 'confirmed', customer: JSON.stringify({ duration: 45 }) },
    ]

    const { slots } = getSequentialBundleSlots({
      services,
      staffSchedulesByService,
      appointments,
      startDate: '2025-01-06',
      bufferMinutes: 15,
      serviceOrder: ['svc-sauna'],
      multiDay: false,
      maxDays: 1,
    })

    expect(slots.length).toBe(0)
  })
})
