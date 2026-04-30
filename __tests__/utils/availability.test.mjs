/**
 * Availability Utility Tests
 *
 * Unit tests for shared availability functions:
 * - getRecurrenceHours (every-other-week, 2nd-of-month, standard)
 * - resolveStaffSync (auto-assign rules, schedule-based, allowed staff filtering)
 * - getDayHoursSync (sauna hours, staff hours, vendor fallback)
 * - hasAnySlot (slot existence with conflicts, buffer, today filtering)
 * - timeOverlaps (overlap detection with buffer)
 * - generateTimeSlots (full slot generation)
 * - formatTime (12-hour display)
 */

import {
  getRecurrenceHours,
  resolveStaffSync,
  getDayHoursSync,
  hasAnySlot,
  timeOverlaps,
  generateTimeSlots,
  formatTime,
  DAY_NAMES,
} from '../../app/utils/availability.js'

// ── getRecurrenceHours ────────────────────────────────────────

describe('getRecurrenceHours', () => {
  test('every-other with anchor — returns hours on matching week', () => {
    const schedule = { recurrence: 'every-other', anchorDate: '2025-01-06', start: '09:00', end: '17:00' }
    // Same week as anchor (0 weeks diff)
    const result = getRecurrenceHours(schedule, new Date('2025-01-06T00:00:00'))
    expect(result).toEqual({ start: '09:00', end: '17:00' })
  })

  test('every-other with anchor — returns null on off week', () => {
    const schedule = { recurrence: 'every-other', anchorDate: '2025-01-06', start: '09:00', end: '17:00' }
    // 1 week after anchor
    const result = getRecurrenceHours(schedule, new Date('2025-01-13T00:00:00'))
    expect(result).toBeNull()
  })

  test('every-other with anchor — returns hours 2 weeks after anchor', () => {
    const schedule = { recurrence: 'every-other', anchorDate: '2025-01-06', start: '09:00', end: '17:00' }
    const result = getRecurrenceHours(schedule, new Date('2025-01-20T00:00:00'))
    expect(result).toEqual({ start: '09:00', end: '17:00' })
  })

  test('every-other without anchor — uses epoch-based week number', () => {
    const schedule = { recurrence: 'every-other', start: '10:00', end: '16:00' }
    const date = new Date('2025-06-15T00:00:00')
    const weekNum = Math.floor(date.getTime() / (7 * 24 * 60 * 60 * 1000))
    const result = getRecurrenceHours(schedule, date)
    if (weekNum % 2 === 0) {
      expect(result).toEqual({ start: '10:00', end: '16:00' })
    } else {
      expect(result).toBeNull()
    }
  })

  test('2nd-of-month — returns hours for day 8-14', () => {
    const schedule = { recurrence: '2nd-of-month', recurrenceStart: '11:00', recurrenceEnd: '15:00' }
    const result = getRecurrenceHours(schedule, new Date('2025-06-10T00:00:00'))
    expect(result).toEqual({ start: '11:00', end: '15:00' })
  })

  test('2nd-of-month — returns null for day outside 8-14', () => {
    const schedule = { recurrence: '2nd-of-month', recurrenceStart: '11:00', recurrenceEnd: '15:00' }
    expect(getRecurrenceHours(schedule, new Date('2025-06-07T00:00:00'))).toBeNull()
    expect(getRecurrenceHours(schedule, new Date('2025-06-15T00:00:00'))).toBeNull()
    expect(getRecurrenceHours(schedule, new Date('2025-06-01T00:00:00'))).toBeNull()
  })

  test('no recurrence — returns hours if start exists', () => {
    const schedule = { start: '08:00', end: '12:00' }
    expect(getRecurrenceHours(schedule, new Date())).toEqual({ start: '08:00', end: '12:00' })
  })

  test('no recurrence — returns null if no start', () => {
    expect(getRecurrenceHours({}, new Date())).toBeNull()
  })
})

// ── resolveStaffSync ──────────────────────────────────────────

describe('resolveStaffSync', () => {
  const makeStaff = (id, opts = {}) => ({
    visibleId: id,
    isActive: true,
    autoAssignRules: null,
    schedule: null,
    ...opts,
  })

  test('returns staff matching auto-assign rule for the day', () => {
    const staff = makeStaff('staff-1', {
      autoAssignRules: JSON.stringify([{ action: 'auto-assign', days: ['monday', 'wednesday'] }]),
    })
    const result = resolveStaffSync([staff], 'monday', new Date('2025-06-09T00:00:00'), null)
    expect(result.visibleId).toBe('staff-1')
  })

  test('skips auto-assign rule for non-matching day', () => {
    const staff = makeStaff('staff-1', {
      autoAssignRules: JSON.stringify([{ action: 'auto-assign', days: ['monday'] }]),
    })
    const result = resolveStaffSync([staff], 'tuesday', new Date('2025-06-10T00:00:00'), null)
    expect(result).toBeNull()
  })

  test('falls back to schedule-based resolution', () => {
    const staff = makeStaff('staff-1', {
      schedule: JSON.stringify({ wednesday: { start: '09:00', end: '17:00' } }),
    })
    const result = resolveStaffSync([staff], 'wednesday', new Date('2025-06-11T00:00:00'), null)
    expect(result.visibleId).toBe('staff-1')
  })

  test('respects allowedStaffIds filter', () => {
    const staff1 = makeStaff('staff-1', {
      schedule: JSON.stringify({ monday: { start: '09:00', end: '17:00' } }),
    })
    const staff2 = makeStaff('staff-2', {
      schedule: JSON.stringify({ monday: { start: '09:00', end: '17:00' } }),
    })
    const result = resolveStaffSync([staff1, staff2], 'monday', new Date('2025-06-09T00:00:00'), ['staff-2'])
    expect(result.visibleId).toBe('staff-2')
  })

  test('returns null when no staff is active', () => {
    const staff = makeStaff('staff-1', { isActive: false, schedule: JSON.stringify({ monday: { start: '09:00', end: '17:00' } }) })
    expect(resolveStaffSync([staff], 'monday', new Date('2025-06-09T00:00:00'), null)).toBeNull()
  })

  test('returns null for empty staff list', () => {
    expect(resolveStaffSync([], 'monday', new Date(), null)).toBeNull()
  })

  test('handles recurrence in staff schedule', () => {
    const staff = makeStaff('staff-1', {
      schedule: JSON.stringify({
        monday: { recurrence: 'every-other', anchorDate: '2025-06-09', start: '09:00', end: '17:00' }
      }),
    })
    // Anchor week — should match
    expect(resolveStaffSync([staff], 'monday', new Date('2025-06-09T00:00:00'), null)?.visibleId).toBe('staff-1')
    // Off week — should not match
    expect(resolveStaffSync([staff], 'monday', new Date('2025-06-16T00:00:00'), null)).toBeNull()
  })
})

// ── getDayHoursSync ───────────────────────────────────────────

describe('getDayHoursSync', () => {
  const vendor = { workingHours: '{}' }
  const workingHours = { monday: { start: '08:00', end: '18:00' } }

  test('returns sauna hours for sauna service', () => {
    const saunaHours = { monday: { start: '10:00', end: '20:00' } }
    const service = { resourceType: 'sauna' }
    const result = getDayHoursSync(vendor, service, 'monday', new Date(), { staffList: [], workingHours, saunaHours, allowedStaffIds: null })
    expect(result).toEqual({ start: '10:00', end: '20:00' })
  })

  test('returns vendor working hours as fallback', () => {
    const service = { resourceType: 'staff' }
    const result = getDayHoursSync(vendor, service, 'monday', new Date(), { staffList: [], workingHours, saunaHours: null, allowedStaffIds: null })
    expect(result).toEqual({ start: '08:00', end: '18:00' })
  })

  test('returns null for day with no hours', () => {
    const service = { resourceType: 'staff' }
    const result = getDayHoursSync(vendor, service, 'sunday', new Date(), { staffList: [], workingHours, saunaHours: null, allowedStaffIds: null })
    expect(result).toBeNull()
  })

  test('uses staff schedule over vendor hours', () => {
    const service = { resourceType: 'staff' }
    const staffList = [{
      visibleId: 's1', isActive: true, autoAssignRules: null,
      schedule: JSON.stringify({ monday: { start: '10:00', end: '14:00' } }),
    }]
    const result = getDayHoursSync(vendor, service, 'monday', new Date(), { staffList, workingHours, saunaHours: null, allowedStaffIds: null })
    expect(result).toEqual({ start: '10:00', end: '14:00' })
  })
})

// ── timeOverlaps ──────────────────────────────────────────────

describe('timeOverlaps', () => {
  test('overlapping slots return true', () => {
    // 60-min service + 15-min buffer: 09:00-10:15 vs 10:00-11:15
    expect(timeOverlaps('09:00', '10:00', 60, 15)).toBe(true)
  })

  test('adjacent slots with buffer return true', () => {
    // 30-min service + 15-min buffer: 09:00-09:45 vs 09:30-10:15
    expect(timeOverlaps('09:00', '09:30', 30, 15)).toBe(true)
  })

  test('non-overlapping slots return false', () => {
    // 30-min service + 15-min buffer: 09:00-09:45 vs 10:00-10:45
    expect(timeOverlaps('09:00', '10:00', 30, 15)).toBe(false)
  })

  test('identical times overlap', () => {
    expect(timeOverlaps('09:00', '09:00', 60, 15)).toBe(true)
  })

  test('zero buffer — back-to-back slots do not overlap', () => {
    // 60-min service + 0 buffer: 09:00-10:00 vs 10:00-11:00
    expect(timeOverlaps('09:00', '10:00', 60, 0)).toBe(false)
  })
})

// ── hasAnySlot ────────────────────────────────────────────────

describe('hasAnySlot', () => {
  // Use a future date to avoid "today" filtering
  const futureDate = '2099-01-15'
  const date = new Date('2099-01-15T00:00:00')

  test('returns true when no appointments', () => {
    expect(hasAnySlot('09:00', '17:00', 60, 15, { appointments: [], dateStr: futureDate, date, staff: null })).toBe(true)
  })

  test('returns false when fully booked', () => {
    // 2-hour window, 60-min service + 15-min buffer = only 2 possible slots (09:00, 09:30)
    // Book both
    const appointments = [
      { dateTime: `${futureDate}T09:00:00`, staffId: null },
      { dateTime: `${futureDate}T09:30:00`, staffId: null },
    ]
    expect(hasAnySlot('09:00', '10:30', 60, 15, { appointments, dateStr: futureDate, date, staff: null })).toBe(false)
  })

  test('returns true when one slot remains', () => {
    const appointments = [
      { dateTime: `${futureDate}T09:00:00`, staffId: null },
    ]
    // 09:00 blocked, but 10:00 should be open (09:00 + 60 + 15 = 10:15, so 10:30 is free)
    expect(hasAnySlot('09:00', '12:00', 60, 15, { appointments: [], dateStr: futureDate, date, staff: null })).toBe(true)
  })

  test('filters appointments by staff', () => {
    const staff = { visibleId: 'staff-1' }
    const appointments = [
      { dateTime: `${futureDate}T09:00:00`, staffId: 'staff-2' }, // different staff
    ]
    expect(hasAnySlot('09:00', '10:00', 60, 0, { appointments, dateStr: futureDate, date, staff })).toBe(true)
  })

  test('returns false when window too small for service', () => {
    expect(hasAnySlot('09:00', '09:30', 60, 15, { appointments: [], dateStr: futureDate, date, staff: null })).toBe(false)
  })
})

// ── generateTimeSlots ─────────────────────────────────────────

describe('generateTimeSlots', () => {
  const futureDate = '2099-01-15'

  test('generates correct slots for a simple window', () => {
    const slots = generateTimeSlots('09:00', '11:00', 60, 0, [], futureDate)
    expect(slots).toEqual([
      { time: '09:00', display: '9:00 AM' },
      { time: '09:30', display: '9:30 AM' },
      { time: '10:00', display: '10:00 AM' },
    ])
  })

  test('excludes booked slots', () => {
    const booked = [{ dateTime: `${futureDate}T09:00:00` }]
    const slots = generateTimeSlots('09:00', '11:00', 60, 15, booked, futureDate)
    const times = slots.map(s => s.time)
    expect(times).not.toContain('09:00')
  })

  test('returns empty when window is too small', () => {
    const slots = generateTimeSlots('09:00', '09:15', 30, 0, [], futureDate)
    expect(slots).toEqual([])
  })

  test('handles space-separated dateTime format', () => {
    const booked = [{ dateTime: `${futureDate} 10:00:00` }]
    const slots = generateTimeSlots('09:00', '12:00', 60, 15, booked, futureDate)
    const times = slots.map(s => s.time)
    expect(times).not.toContain('10:00')
  })
})

// ── formatTime ────────────────────────────────────────────────

describe('formatTime', () => {
  test('morning time', () => expect(formatTime(9, 30)).toBe('9:30 AM'))
  test('noon', () => expect(formatTime(12, 0)).toBe('12:00 PM'))
  test('afternoon', () => expect(formatTime(14, 15)).toBe('2:15 PM'))
  test('midnight', () => expect(formatTime(0, 0)).toBe('12:00 AM'))
  test('11 PM', () => expect(formatTime(23, 45)).toBe('11:45 PM'))
})

// ── DAY_NAMES ─────────────────────────────────────────────────

describe('DAY_NAMES', () => {
  test('has 7 days starting with sunday', () => {
    expect(DAY_NAMES).toHaveLength(7)
    expect(DAY_NAMES[0]).toBe('sunday')
    expect(DAY_NAMES[6]).toBe('saturday')
  })
})
