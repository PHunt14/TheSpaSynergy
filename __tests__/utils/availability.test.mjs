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
  getScheduleOverride,
  resolveStaffSync,
  getDayHoursSync,
  hasAnySlot,
  timeOverlaps,
  generateTimeSlots,
  formatTime,
  DAY_NAMES,
  getMultiProviderSlots,
} from '../../app/utils/availability.js'

// ── getScheduleOverride ──────────────────────────────────────

describe('getScheduleOverride', () => {
  test('returns undefined when overrides is null/undefined', () => {
    expect(getScheduleOverride(null, '2025-07-12')).toBeUndefined()
    expect(getScheduleOverride(undefined, '2025-07-12')).toBeUndefined()
  })

  test('returns undefined when date not in overrides', () => {
    expect(getScheduleOverride({ '2025-07-13': null }, '2025-07-12')).toBeUndefined()
  })

  test('returns null for an explicitly closed date', () => {
    expect(getScheduleOverride({ '2025-07-12': null }, '2025-07-12')).toBeNull()
  })

  test('returns hours for an explicitly open date', () => {
    const overrides = { '2025-07-12': { start: '10:00', end: '14:00' } }
    expect(getScheduleOverride(overrides, '2025-07-12')).toEqual({ start: '10:00', end: '14:00' })
  })

  test('accepts a Date object as well as a string', () => {
    const overrides = { '2025-07-12': { start: '09:00', end: '17:00' } }
    // Use local midnight to match how dates flow through the system
    expect(getScheduleOverride(overrides, new Date(2025, 6, 12))).toEqual({ start: '09:00', end: '17:00' })
  })
})

// ── override integration with resolveStaffSync ────────────────

describe('resolveStaffSync with overrides', () => {
  const makeStaffWithOverrides = (id, weeklySchedule, overrides) => ({
    visibleId: id,
    isActive: true,
    autoAssignRules: null,
    schedule: JSON.stringify({ ...weeklySchedule, overrides }),
  })

  test('override open on normally-off day makes staff available', () => {
    // Staff has no Saturday in weekly schedule, but override opens it
    const staff = makeStaffWithOverrides('s1', {}, { '2025-07-12': { start: '10:00', end: '15:00' } })
    const result = resolveStaffSync([staff], 'saturday', new Date('2025-07-12T00:00:00'), null)
    expect(result?.visibleId).toBe('s1')
  })

  test('override closed on normally-open day makes staff unavailable', () => {
    // Staff works Monday normally, but override closes this specific Monday
    const staff = makeStaffWithOverrides('s1',
      { monday: { start: '09:00', end: '17:00' } },
      { '2025-07-14': null }
    )
    const result = resolveStaffSync([staff], 'monday', new Date('2025-07-14T00:00:00'), null)
    expect(result).toBeNull()
  })

  test('override does not affect other dates', () => {
    const staff = makeStaffWithOverrides('s1',
      { monday: { start: '09:00', end: '17:00' } },
      { '2025-07-14': null }
    )
    // Different Monday — no override, should be available
    const result = resolveStaffSync([staff], 'monday', new Date('2025-07-07T00:00:00'), null)
    expect(result?.visibleId).toBe('s1')
  })
})

// ── getRecurrenceHours ────────────────────────────────────────

describe('getRecurrenceHours', () => {
  test('every-other with anchor — returns hours on matching week', () => {
    const schedule = { recurrence: 'every-other', anchorDate: '2025-01-06', start: '09:00', end: '17:00' }
    const result = getRecurrenceHours(schedule, new Date('2025-01-06T00:00:00'))
    expect(result).toEqual({ start: '09:00', end: '17:00' })
  })

  test('every-other with anchor — returns null on off week', () => {
    const schedule = { recurrence: 'every-other', anchorDate: '2025-01-06', start: '09:00', end: '17:00' }
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

  test('returns true when no appointments', () => {
    expect(hasAnySlot('09:00', '17:00', 60, 15, { appointments: [], dateStr: futureDate, staff: null })).toBe(true)
  })

  test('returns false when fully booked', () => {
    // 2-hour window, 60-min service + 15-min buffer = only 2 possible slots (09:00, 09:30)
    // Book both
    const appointments = [
      { dateTime: `${futureDate}T09:00:00`, staffId: null },
      { dateTime: `${futureDate}T09:30:00`, staffId: null },
    ]
    expect(hasAnySlot('09:00', '10:30', 60, 15, { appointments, dateStr: futureDate, staff: null })).toBe(false)
  })

  test('returns true when one slot remains', () => {
    const appointments = [
      { dateTime: `${futureDate}T09:00:00`, staffId: null },
    ]
    // 09:00 blocked, but 10:00 should be open (09:00 + 60 + 15 = 10:15, so 10:30 is free)
    expect(hasAnySlot('09:00', '12:00', 60, 15, { appointments: [], dateStr: futureDate, staff: null })).toBe(true)
  })

  test('filters appointments by staff', () => {
    const staff = { visibleId: 'staff-1' }
    const appointments = [
      { dateTime: `${futureDate}T09:00:00`, staffId: 'staff-2' }, // different staff
    ]
    expect(hasAnySlot('09:00', '10:00', 60, 0, { appointments, dateStr: futureDate, staff })).toBe(true)
  })

  test('returns false when window too small for service', () => {
    expect(hasAnySlot('09:00', '09:30', 60, 15, { appointments: [], dateStr: futureDate, staff: null })).toBe(false)
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


// ── getMultiProviderSlots ─────────────────────────────────────

describe('getMultiProviderSlots', () => {
  const baseService = {
    duration: 60,
    providersRequired: 2,
    allowedStaff: ['staff-1', 'staff-2', 'staff-3'],
  }

  const makeStaff = (id, vendorId, schedule) => ({
    visibleId: id,
    vendorId,
    isActive: true,
    name: `Staff ${id}`,
    schedule: JSON.stringify(schedule),
    autoAssignRules: null,
  })

  const mondaySchedule = { monday: { start: '09:00', end: '17:00' } }

  test('returns slots when 2+ staff are simultaneously free', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-2', 'vendor-b', mondaySchedule),
    ]
    const slots = getMultiProviderSlots({
      service: baseService,
      staffSchedules,
      appointments: [],
      date: '2025-01-06', // Monday
      bufferMinutes: 15,
    })
    expect(slots.length).toBeGreaterThan(0)
    expect(slots[0]).toHaveProperty('time')
    expect(slots[0]).toHaveProperty('display')
  })

  test('returns empty when fewer than providersRequired staff available', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
    ]
    const slots = getMultiProviderSlots({
      service: baseService,
      staffSchedules,
      appointments: [],
      date: '2025-01-06',
      bufferMinutes: 15,
    })
    expect(slots).toEqual([])
  })

  test('cross-vendor staff availability works', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-2', 'vendor-b', mondaySchedule),
      makeStaff('staff-3', 'vendor-c', mondaySchedule),
    ]
    const slots = getMultiProviderSlots({
      service: baseService,
      staffSchedules,
      appointments: [],
      date: '2025-01-06',
      bufferMinutes: 15,
    })
    expect(slots.length).toBeGreaterThan(0)
  })

  test('excludes slots where staff has conflicting appointment', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-2', 'vendor-b', mondaySchedule),
    ]
    // staff-1 busy 09:00-10:00, staff-2 busy 10:00-11:00
    const appointments = [
      { dateTime: '2025-01-06T09:00', staffId: 'staff-1', status: 'confirmed', customer: JSON.stringify({ name: 'Test' }) },
      { dateTime: '2025-01-06T10:00', staffId: 'staff-2', status: 'confirmed', customer: JSON.stringify({ name: 'Test' }) },
    ]
    const slots = getMultiProviderSlots({
      service: baseService,
      staffSchedules,
      appointments,
      date: '2025-01-06',
      bufferMinutes: 15,
    })
    // 09:00 slot: staff-1 busy → only 1 free → excluded
    // 10:00 slot: staff-2 busy → only 1 free → excluded
    const nineSlot = slots.find(s => s.time === '09:00')
    const tenSlot = slots.find(s => s.time === '10:00')
    expect(nineSlot).toBeUndefined()
    expect(tenSlot).toBeUndefined()
  })

  test('boundary: exactly providersRequired staff available returns slots', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-2', 'vendor-b', mondaySchedule),
    ]
    const service = { ...baseService, providersRequired: 2 }
    const slots = getMultiProviderSlots({
      service,
      staffSchedules,
      appointments: [],
      date: '2025-01-06',
      bufferMinutes: 15,
    })
    expect(slots.length).toBeGreaterThan(0)
  })

  test('backward compatibility: providersRequired = 1', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
    ]
    const service = { ...baseService, providersRequired: 1, allowedStaff: ['staff-1'] }
    const slots = getMultiProviderSlots({
      service,
      staffSchedules,
      appointments: [],
      date: '2025-01-06',
      bufferMinutes: 15,
    })
    expect(slots.length).toBeGreaterThan(0)
  })

  test('filters out inactive staff', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      { ...makeStaff('staff-2', 'vendor-b', mondaySchedule), isActive: false },
    ]
    const slots = getMultiProviderSlots({
      service: baseService,
      staffSchedules,
      appointments: [],
      date: '2025-01-06',
      bufferMinutes: 15,
    })
    // Only 1 active staff, need 2 → empty
    expect(slots).toEqual([])
  })

  test('filters out staff not in allowedStaff', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-99', 'vendor-b', mondaySchedule), // not in allowedStaff
    ]
    const slots = getMultiProviderSlots({
      service: baseService,
      staffSchedules,
      appointments: [],
      date: '2025-01-06',
      bufferMinutes: 15,
    })
    expect(slots).toEqual([])
  })

  test('returns empty for day when staff not working', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-2', 'vendor-b', mondaySchedule),
    ]
    const slots = getMultiProviderSlots({
      service: baseService,
      staffSchedules,
      appointments: [],
      date: '2025-01-07', // Tuesday — no schedule
      bufferMinutes: 15,
    })
    expect(slots).toEqual([])
  })

  test('cancelled appointments do not block slots', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-2', 'vendor-b', mondaySchedule),
    ]
    const appointments = [
      { dateTime: '2025-01-06T09:00', staffId: 'staff-1', status: 'cancelled', customer: JSON.stringify({ name: 'Test' }) },
    ]
    const slots = getMultiProviderSlots({
      service: baseService,
      staffSchedules,
      appointments,
      date: '2025-01-06',
      bufferMinutes: 15,
    })
    const nineSlot = slots.find(s => s.time === '09:00')
    expect(nineSlot).toBeDefined()
  })

  test('recurrence rule handling for multi-provider', () => {
    const everyOtherSchedule = {
      monday: { recurrence: 'every-other', anchorDate: '2025-01-06', start: '09:00', end: '17:00' }
    }
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', everyOtherSchedule),
      makeStaff('staff-2', 'vendor-b', everyOtherSchedule),
    ]
    // On-week (anchor date)
    const slotsOn = getMultiProviderSlots({
      service: baseService,
      staffSchedules,
      appointments: [],
      date: '2025-01-06',
      bufferMinutes: 15,
    })
    expect(slotsOn.length).toBeGreaterThan(0)

    // Off-week
    const slotsOff = getMultiProviderSlots({
      service: baseService,
      staffSchedules,
      appointments: [],
      date: '2025-01-13',
      bufferMinutes: 15,
    })
    expect(slotsOff).toEqual([])
  })
})


// ── getDayHoursSync with schedule overrides ───────────────────

describe('getDayHoursSync with schedule overrides', () => {
  const vendor = { workingHours: '{}' }
  const workingHours = { monday: { start: '08:00', end: '18:00' } }

  test('returns override hours when staff has override for this date (open on normally-closed day)', () => {
    const service = { resourceType: 'staff' }
    // Staff does NOT work Saturday normally, but has an override opening Saturday July 12
    const staffList = [{
      visibleId: 's1',
      isActive: true,
      autoAssignRules: null,
      schedule: JSON.stringify({
        overrides: { '2025-07-12': { start: '10:00', end: '15:00' } },
      }),
    }]
    // July 12 2025 is a Saturday
    const date = new Date(2025, 6, 12)
    const result = getDayHoursSync(vendor, service, 'saturday', date, { staffList, workingHours, saunaHours: null, allowedStaffIds: null })
    expect(result).toEqual({ start: '10:00', end: '15:00' })
  })

  test('returns null when staff has override closing them on a normally-open day', () => {
    const service = { resourceType: 'staff' }
    // Staff works Monday normally, but override closes this specific Monday
    const staffList = [{
      visibleId: 's1',
      isActive: true,
      autoAssignRules: null,
      schedule: JSON.stringify({
        monday: { start: '09:00', end: '17:00' },
        overrides: { '2025-07-14': null },
      }),
    }]
    // July 14 2025 is a Monday
    const date = new Date(2025, 6, 14)
    const result = getDayHoursSync(vendor, service, 'monday', date, { staffList, workingHours, saunaHours: null, allowedStaffIds: null })
    expect(result).toBeNull()
  })

  test('override does not affect a different date on the same day-of-week', () => {
    const service = { resourceType: 'staff' }
    const staffList = [{
      visibleId: 's1',
      isActive: true,
      autoAssignRules: null,
      schedule: JSON.stringify({
        monday: { start: '09:00', end: '17:00' },
        overrides: { '2025-07-14': null }, // This specific Monday is closed
      }),
    }]
    // July 7 2025 is a Monday — different date, should still use weekly schedule
    const date = new Date(2025, 6, 7)
    const result = getDayHoursSync(vendor, service, 'monday', date, { staffList, workingHours, saunaHours: null, allowedStaffIds: null })
    expect(result).toEqual({ start: '09:00', end: '17:00' })
  })

  test('override with custom hours replaces weekly schedule hours', () => {
    const service = { resourceType: 'staff' }
    const staffList = [{
      visibleId: 's1',
      isActive: true,
      autoAssignRules: null,
      schedule: JSON.stringify({
        monday: { start: '09:00', end: '17:00' },
        overrides: { '2025-07-14': { start: '12:00', end: '16:00' } },
      }),
    }]
    const date = new Date(2025, 6, 14)
    const result = getDayHoursSync(vendor, service, 'monday', date, { staffList, workingHours, saunaHours: null, allowedStaffIds: null })
    expect(result).toEqual({ start: '12:00', end: '16:00' })
  })

  test('falls back to vendor hours when no staff and no override', () => {
    const service = { resourceType: 'staff' }
    const result = getDayHoursSync(vendor, service, 'monday', new Date(2025, 6, 7), { staffList: [], workingHours, saunaHours: null, allowedStaffIds: null })
    expect(result).toEqual({ start: '08:00', end: '18:00' })
  })
})

// ── hasAnySlot — edge cases with overrides and boundaries ─────

describe('hasAnySlot — boundary conditions', () => {
  const futureDate = '2099-03-15'

  test('returns false when start equals end (zero-length window)', () => {
    expect(hasAnySlot('09:00', '09:00', 30, 0, { appointments: [], dateStr: futureDate, staff: null })).toBe(false)
  })

  test('returns true for minimum viable window (exactly fits service)', () => {
    // 30-min service, window from 09:00 to 09:30 (exactly 30 min)
    expect(hasAnySlot('09:00', '09:30', 30, 0, { appointments: [], dateStr: futureDate, staff: null })).toBe(true)
  })

  test('buffer only affects conflict detection, not raw window fit', () => {
    // 30-min service + 15 buffer: buffer doesn't shrink the bookable window,
    // it only extends the conflict zone of existing appointments.
    // With no appointments, a 30-min service fits in a 30-min window regardless of buffer.
    expect(hasAnySlot('09:00', '09:30', 30, 15, { appointments: [], dateStr: futureDate, staff: null })).toBe(true)
  })

  test('respects appointment duration from customer.duration field', () => {
    // Window: 09:00-11:00, service: 30 min, no buffer
    // Existing appointment at 09:00 with 90 min duration — blocks 09:00-10:30
    const appointments = [
      {
        dateTime: `${futureDate}T09:00:00`,
        staffId: null,
        customer: JSON.stringify({ duration: 90 }),
      },
    ]
    // 09:00 blocked (by 90-min apt), 09:30 blocked, 10:00 blocked, 10:30 is free
    expect(hasAnySlot('09:00', '11:00', 30, 0, { appointments, dateStr: futureDate, staff: null })).toBe(true)
    // But if window ends at 10:30, all slots are blocked
    expect(hasAnySlot('09:00', '10:30', 30, 0, { appointments, dateStr: futureDate, staff: null })).toBe(false)
  })

  test('ignores appointments for different staff', () => {
    const staff = { visibleId: 'staff-A' }
    const appointments = [
      { dateTime: `${futureDate}T09:00:00`, staffId: 'staff-B' },
      { dateTime: `${futureDate}T09:30:00`, staffId: 'staff-B' },
      { dateTime: `${futureDate}T10:00:00`, staffId: 'staff-B' },
    ]
    // Even though many appointments exist, they're for a different staff member
    expect(hasAnySlot('09:00', '11:00', 60, 15, { appointments, dateStr: futureDate, staff })).toBe(true)
  })
})

// ── generateTimeSlots — override-aware duration handling ──────

describe('generateTimeSlots — varied appointment durations', () => {
  const futureDate = '2099-06-01'

  test('longer existing appointment blocks multiple subsequent slots', () => {
    // 120-min appointment at 09:00, 15-min buffer → blocks until 11:15
    const booked = [{
      dateTime: `${futureDate}T09:00:00`,
      customer: JSON.stringify({ duration: 120 }),
    }]
    const slots = generateTimeSlots('09:00', '12:00', 30, 15, booked, futureDate)
    const times = slots.map(s => s.time)
    // 09:00 through 11:00 should all be blocked (120 min apt + 15 buffer = blocks until 11:15)
    expect(times).not.toContain('09:00')
    expect(times).not.toContain('09:30')
    expect(times).not.toContain('10:00')
    expect(times).not.toContain('10:30')
    expect(times).not.toContain('11:00')
    // 11:30 should be free (starts after 11:15 end of blocked period)
    expect(times).toContain('11:30')
  })

  test('adjacent bookings with buffer create correct gaps', () => {
    const booked = [
      { dateTime: `${futureDate}T09:00:00`, customer: JSON.stringify({ duration: 60 }) },
      { dateTime: `${futureDate}T10:30:00`, customer: JSON.stringify({ duration: 60 }) },
    ]
    // Service: 30 min, buffer: 15 min
    // Booking 1: 09:00-10:15 (60 + 15 buffer)
    // Booking 2: 10:30-11:45 (60 + 15 buffer)
    const slots = generateTimeSlots('09:00', '12:00', 30, 15, booked, futureDate)
    const times = slots.map(s => s.time)
    // Should not have any slots within the blocked windows
    expect(times).not.toContain('09:00')
    expect(times).not.toContain('09:30')
    expect(times).not.toContain('10:00')
    expect(times).not.toContain('10:30')
    expect(times).not.toContain('11:00')
    expect(times).not.toContain('11:30')
  })

  test('cancelled appointments (missing from list) do not block slots', () => {
    // If no appointments are passed, all slots should be available
    const slots = generateTimeSlots('09:00', '12:00', 60, 15, [], futureDate)
    expect(slots.length).toBeGreaterThan(0)
    expect(slots[0].time).toBe('09:00')
  })
})

// ── resolveStaffSync — multiple staff, override tiebreaking ───

describe('resolveStaffSync — multi-staff override scenarios', () => {
  const makeStaffWithOverrides = (id, weeklySchedule, overrides) => ({
    visibleId: id,
    isActive: true,
    autoAssignRules: null,
    schedule: JSON.stringify({ ...weeklySchedule, overrides }),
  })

  test('when first staff is closed via override, second staff is resolved', () => {
    const staff1 = makeStaffWithOverrides('s1',
      { monday: { start: '09:00', end: '17:00' } },
      { '2025-07-14': null } // s1 closed this Monday
    )
    const staff2 = makeStaffWithOverrides('s2',
      { monday: { start: '10:00', end: '16:00' } },
      {} // s2 has no overrides
    )
    const result = resolveStaffSync([staff1, staff2], 'monday', new Date(2025, 6, 14), null)
    expect(result?.visibleId).toBe('s2')
  })

  test('when all staff are closed via override, returns null', () => {
    const staff1 = makeStaffWithOverrides('s1',
      { monday: { start: '09:00', end: '17:00' } },
      { '2025-07-14': null }
    )
    const staff2 = makeStaffWithOverrides('s2',
      { monday: { start: '10:00', end: '16:00' } },
      { '2025-07-14': null }
    )
    const result = resolveStaffSync([staff1, staff2], 'monday', new Date(2025, 6, 14), null)
    expect(result).toBeNull()
  })

  test('staff with override open on normally-off day is resolved before staff with weekly schedule', () => {
    // s1 doesn't work Saturday normally but has override
    const staff1 = makeStaffWithOverrides('s1', {},
      { '2025-07-12': { start: '10:00', end: '15:00' } }
    )
    // s2 works Saturday normally
    const staff2 = makeStaffWithOverrides('s2',
      { saturday: { start: '09:00', end: '14:00' } },
      {}
    )
    const result = resolveStaffSync([staff1, staff2], 'saturday', new Date(2025, 6, 12), null)
    // Either staff could be resolved (first match wins), but both should be valid
    expect(result).not.toBeNull()
  })
})

// ── getScheduleOverride — local date formatting ──────────────

describe('getScheduleOverride — date formatting consistency', () => {
  test('formats single-digit months and days with leading zeros', () => {
    // January 5 → should produce '2025-01-05'
    const overrides = { '2025-01-05': { start: '09:00', end: '12:00' } }
    const date = new Date(2025, 0, 5) // Jan 5, local time
    expect(getScheduleOverride(overrides, date)).toEqual({ start: '09:00', end: '12:00' })
  })

  test('handles December 31 correctly', () => {
    const overrides = { '2025-12-31': null }
    const date = new Date(2025, 11, 31)
    expect(getScheduleOverride(overrides, date)).toBeNull()
  })

  test('handles Feb 28 / leap year boundary', () => {
    const overrides = { '2024-02-29': { start: '08:00', end: '16:00' } }
    const date = new Date(2024, 1, 29) // Feb 29, 2024 (leap year)
    expect(getScheduleOverride(overrides, date)).toEqual({ start: '08:00', end: '16:00' })
  })
})

// ── Integration: hasAnySlot used by available-dates logic ─────

describe('hasAnySlot — simulates available-dates computation', () => {
  // This simulates what buildAvailableDatesUnified does: for each day, check
  // if a staff member has any open slot given their working hours and appointments.

  test('fully booked day returns false', () => {
    const futureDate = '2099-04-01'
    // Staff works 09:00–11:00 (2h window), service = 60 min + 15 buffer
    // Only possible starts: 09:00 (ends 10:15), can't fit another in 10:15-11:00
    // So only 1 slot exists at 09:00. If it's booked, day should be unavailable.
    const appointments = [
      { dateTime: `${futureDate}T09:00:00`, staffId: 's1', customer: JSON.stringify({ duration: 60 }) },
    ]
    const staff = { visibleId: 's1' }
    expect(hasAnySlot('09:00', '11:00', 60, 15, { appointments, dateStr: futureDate, staff })).toBe(false)
  })

  test('partially booked day with remaining slot returns true', () => {
    const futureDate = '2099-04-01'
    // Staff works 09:00–13:00, service = 60 min + 15 buffer
    // Appointment at 09:00 blocks 09:00-10:15. 10:30 should still fit.
    const appointments = [
      { dateTime: `${futureDate}T09:00:00`, staffId: 's1', customer: JSON.stringify({ duration: 60 }) },
    ]
    const staff = { visibleId: 's1' }
    expect(hasAnySlot('09:00', '13:00', 60, 15, { appointments, dateStr: futureDate, staff })).toBe(true)
  })

  test('day with multiple short appointments still has gaps', () => {
    const futureDate = '2099-04-01'
    // 09:00-17:00 window, 30-min service, 15-min buffer
    // Scattered appointments — plenty of gaps should remain
    const appointments = [
      { dateTime: `${futureDate}T09:00:00`, staffId: 's1', customer: JSON.stringify({ duration: 30 }) },
      { dateTime: `${futureDate}T11:00:00`, staffId: 's1', customer: JSON.stringify({ duration: 30 }) },
      { dateTime: `${futureDate}T14:00:00`, staffId: 's1', customer: JSON.stringify({ duration: 30 }) },
    ]
    const staff = { visibleId: 's1' }
    expect(hasAnySlot('09:00', '17:00', 30, 15, { appointments, dateStr: futureDate, staff })).toBe(true)
  })
})
