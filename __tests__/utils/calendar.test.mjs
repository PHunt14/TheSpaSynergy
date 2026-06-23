/**
 * Calendar Utility Tests
 *
 * Unit tests for the time-block calendar helper functions:
 * - getWeekStart — finds Sunday of the week
 * - getWeekDates — returns 7 dates for the week
 * - getMonthDates — returns all dates in a month
 * - isSameDay — date comparison ignoring time
 * - parseAppointmentDate — safe date parsing
 * - generateTimeSlots — time grid generation
 * - getBlockPosition — CSS positioning for appointment blocks
 * - getDateRangeForView — date range calculation for API queries
 */

import {
  getWeekStart,
  getWeekDates,
  getMonthDates,
  isSameDay,
  parseAppointmentDate,
  generateTimeSlots,
  getBlockPosition,
  getDateRangeForView,
  SLOT_MINUTES,
  DEFAULT_START_HOUR,
  DEFAULT_END_HOUR,
} from '../../app/utils/calendar.js'

// ─── getWeekStart ─────────────────────────────────────────────

describe('getWeekStart', () => {
  test('returns Sunday for a Wednesday input', () => {
    // May 7, 2025 is a Wednesday
    const wed = new Date(2025, 4, 7, 14, 30)
    const result = getWeekStart(wed)
    expect(result.getDay()).toBe(0) // Sunday
    expect(result.getDate()).toBe(4)
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
  })

  test('returns same day when input is Sunday', () => {
    const sun = new Date(2025, 4, 4, 10, 0)
    const result = getWeekStart(sun)
    expect(result.getDay()).toBe(0)
    expect(result.getDate()).toBe(4)
  })

  test('returns previous Sunday for Saturday', () => {
    // May 10, 2025 is a Saturday
    const sat = new Date(2025, 4, 10, 23, 59)
    const result = getWeekStart(sat)
    expect(result.getDay()).toBe(0)
    expect(result.getDate()).toBe(4)
  })

  test('does not mutate the input date', () => {
    const original = new Date(2025, 4, 7, 14, 30)
    const originalTime = original.getTime()
    getWeekStart(original)
    expect(original.getTime()).toBe(originalTime)
  })
})

// ─── getWeekDates ─────────────────────────────────────────────

describe('getWeekDates', () => {
  test('returns 7 dates', () => {
    const dates = getWeekDates(new Date(2025, 4, 7))
    expect(dates).toHaveLength(7)
  })

  test('first date is Sunday, last is Saturday', () => {
    const dates = getWeekDates(new Date(2025, 4, 7))
    expect(dates[0].getDay()).toBe(0)
    expect(dates[6].getDay()).toBe(6)
  })

  test('dates are consecutive', () => {
    const dates = getWeekDates(new Date(2025, 4, 7))
    for (let i = 1; i < dates.length; i++) {
      const diff = dates[i].getDate() - dates[i - 1].getDate()
      // Handle month boundary
      expect(diff === 1 || diff < 0).toBe(true)
    }
  })

  test('handles month boundary', () => {
    // May 31, 2025 is a Saturday — week starts May 25
    const dates = getWeekDates(new Date(2025, 4, 31))
    expect(dates[0].getMonth()).toBe(4) // May
    expect(dates[6].getMonth()).toBe(4) // Still May (May 31)
  })
})

// ─── getMonthDates ────────────────────────────────────────────

describe('getMonthDates', () => {
  test('returns 31 dates for May', () => {
    const dates = getMonthDates(new Date(2025, 4, 15))
    expect(dates).toHaveLength(31)
  })

  test('returns 28 dates for February 2025 (non-leap)', () => {
    const dates = getMonthDates(new Date(2025, 1, 10))
    expect(dates).toHaveLength(28)
  })

  test('returns 29 dates for February 2024 (leap year)', () => {
    const dates = getMonthDates(new Date(2024, 1, 10))
    expect(dates).toHaveLength(29)
  })

  test('first date is the 1st, last is end of month', () => {
    const dates = getMonthDates(new Date(2025, 4, 15))
    expect(dates[0].getDate()).toBe(1)
    expect(dates[dates.length - 1].getDate()).toBe(31)
  })
})

// ─── isSameDay ────────────────────────────────────────────────

describe('isSameDay', () => {
  test('returns true for same date different times', () => {
    const a = new Date(2025, 4, 7, 8, 0)
    const b = new Date(2025, 4, 7, 22, 30)
    expect(isSameDay(a, b)).toBe(true)
  })

  test('returns false for different dates', () => {
    const a = new Date(2025, 4, 7)
    const b = new Date(2025, 4, 8)
    expect(isSameDay(a, b)).toBe(false)
  })

  test('returns false for same day different month', () => {
    const a = new Date(2025, 4, 7)
    const b = new Date(2025, 5, 7)
    expect(isSameDay(a, b)).toBe(false)
  })

  test('returns false for same day different year', () => {
    const a = new Date(2025, 4, 7)
    const b = new Date(2024, 4, 7)
    expect(isSameDay(a, b)).toBe(false)
  })
})

// ─── parseAppointmentDate ─────────────────────────────────────

describe('parseAppointmentDate', () => {
  test('parses valid ISO string', () => {
    const result = parseAppointmentDate('2025-05-07T10:00:00.000Z')
    expect(result).toBeInstanceOf(Date)
    expect(result.getFullYear()).toBe(2025)
  })

  test('parses ISO string without timezone', () => {
    const result = parseAppointmentDate('2025-05-07T10:00:00')
    expect(result).toBeInstanceOf(Date)
  })

  test('returns null for null input', () => {
    expect(parseAppointmentDate(null)).toBeNull()
  })

  test('returns null for undefined input', () => {
    expect(parseAppointmentDate(undefined)).toBeNull()
  })

  test('returns null for empty string', () => {
    expect(parseAppointmentDate('')).toBeNull()
  })

  test('returns null for invalid date string', () => {
    expect(parseAppointmentDate('not-a-date')).toBeNull()
  })
})

// ─── generateTimeSlots ────────────────────────────────────────

describe('generateTimeSlots', () => {
  test('generates correct number of slots for default range (6AM-6PM)', () => {
    const slots = generateTimeSlots(6, 18)
    // 12 hours × 2 slots per hour = 24 slots
    expect(slots).toHaveLength(24)
  })

  test('first slot starts at startHour', () => {
    const slots = generateTimeSlots(8, 18)
    expect(slots[0]).toEqual({ hour: 8, minute: 0 })
  })

  test('last slot is before endHour', () => {
    const slots = generateTimeSlots(6, 18)
    const last = slots[slots.length - 1]
    expect(last).toEqual({ hour: 17, minute: 30 })
  })

  test('handles single hour range', () => {
    const slots = generateTimeSlots(10, 11)
    expect(slots).toHaveLength(2)
    expect(slots[0]).toEqual({ hour: 10, minute: 0 })
    expect(slots[1]).toEqual({ hour: 10, minute: 30 })
  })

  test('returns empty array when start equals end', () => {
    const slots = generateTimeSlots(10, 10)
    expect(slots).toHaveLength(0)
  })
})

// ─── getBlockPosition ─────────────────────────────────────────

describe('getBlockPosition', () => {
  test('appointment at start hour has top = 0', () => {
    const date = new Date(2025, 4, 7, 6, 0) // 6:00 AM
    const { top } = getBlockPosition(date, 60, 6)
    expect(top).toBe(0)
  })

  test('appointment 1 hour after start has correct top', () => {
    const date = new Date(2025, 4, 7, 7, 0) // 7:00 AM, start = 6
    const { top } = getBlockPosition(date, 60, 6)
    // 60 minutes from start / 30 min per slot * 40px = 80px
    expect(top).toBe(80)
  })

  test('30-min appointment has height of 40px (one slot)', () => {
    const date = new Date(2025, 4, 7, 10, 0)
    const { height } = getBlockPosition(date, 30, 6)
    expect(height).toBe(40)
  })

  test('60-min appointment has height of 80px (two slots)', () => {
    const date = new Date(2025, 4, 7, 10, 0)
    const { height } = getBlockPosition(date, 60, 6)
    expect(height).toBe(80)
  })

  test('90-min appointment has height of 120px (three slots)', () => {
    const date = new Date(2025, 4, 7, 10, 0)
    const { height } = getBlockPosition(date, 90, 6)
    expect(height).toBe(120)
  })

  test('very short appointment has minimum height of 20px', () => {
    const date = new Date(2025, 4, 7, 10, 0)
    const { height } = getBlockPosition(date, 5, 6)
    expect(height).toBe(20)
  })

  test('appointment at half-hour has correct offset', () => {
    const date = new Date(2025, 4, 7, 6, 30) // 6:30 AM, start = 6
    const { top } = getBlockPosition(date, 30, 6)
    // 30 minutes from start / 30 * 40 = 40px
    expect(top).toBe(40)
  })

  test('handles appointment before start hour (negative top)', () => {
    const date = new Date(2025, 4, 7, 5, 0) // 5 AM, start = 6
    const { top } = getBlockPosition(date, 30, 6)
    expect(top).toBe(-80) // -60 min / 30 * 40 = -80
  })
})

// ─── getDateRangeForView ──────────────────────────────────────

describe('getDateRangeForView', () => {
  const testDate = new Date(2025, 4, 7, 14, 30) // Wed May 7, 2025 2:30 PM

  test('day view: start is midnight, end is end of day', () => {
    const { start, end } = getDateRangeForView('day', testDate)
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(end.getHours()).toBe(23)
    expect(end.getMinutes()).toBe(59)
    expect(isSameDay(start, testDate)).toBe(true)
    expect(isSameDay(end, testDate)).toBe(true)
  })

  test('week view: start is Sunday, end is 7 days later', () => {
    const { start, end } = getDateRangeForView('week', testDate)
    expect(start.getDay()).toBe(0) // Sunday
    const diffDays = (end - start) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBe(7)
  })

  test('month view: start is 1st of month, end is last day', () => {
    const { start, end } = getDateRangeForView('month', testDate)
    expect(start.getDate()).toBe(1)
    expect(start.getMonth()).toBe(4) // May
    expect(end.getDate()).toBe(31) // May has 31 days
    expect(end.getMonth()).toBe(4)
  })

  test('month view for February', () => {
    const feb = new Date(2025, 1, 15)
    const { start, end } = getDateRangeForView('month', feb)
    expect(start.getDate()).toBe(1)
    expect(end.getDate()).toBe(28)
  })
})

// ─── Constants ────────────────────────────────────────────────

describe('calendar constants', () => {
  test('SLOT_MINUTES is 30', () => {
    expect(SLOT_MINUTES).toBe(30)
  })

  test('DEFAULT_START_HOUR is 6', () => {
    expect(DEFAULT_START_HOUR).toBe(6)
  })

  test('DEFAULT_END_HOUR is 18', () => {
    expect(DEFAULT_END_HOUR).toBe(18)
  })
})


// ─── computeOverlapLayout ─────────────────────────────────────

import { computeOverlapLayout } from '../../app/utils/calendar.js'

describe('computeOverlapLayout', () => {
  const makeApt = (id, hour, minute, duration) => ({
    appointmentId: id,
    rawDateTime: new Date(2025, 4, 7, hour, minute).toISOString(),
    service: { name: 'Test', duration },
    customer: { name: 'Client' },
    status: 'confirmed',
  })

  test('returns empty array for empty input', () => {
    expect(computeOverlapLayout([], 6)).toEqual([])
    expect(computeOverlapLayout(null, 6)).toEqual([])
  })

  test('single appointment gets column 0, totalColumns 1', () => {
    const apts = [makeApt('a1', 10, 0, 60)]
    const result = computeOverlapLayout(apts, 6)
    expect(result).toHaveLength(1)
    expect(result[0].column).toBe(0)
    expect(result[0].totalColumns).toBe(1)
  })

  test('non-overlapping appointments each get column 0', () => {
    const apts = [
      makeApt('a1', 10, 0, 30), // 10:00-10:30
      makeApt('a2', 11, 0, 30), // 11:00-11:30
    ]
    const result = computeOverlapLayout(apts, 6)
    expect(result).toHaveLength(2)
    expect(result[0].column).toBe(0)
    expect(result[0].totalColumns).toBe(1)
    expect(result[1].column).toBe(0)
    expect(result[1].totalColumns).toBe(1)
  })

  test('two overlapping appointments get columns 0 and 1', () => {
    const apts = [
      makeApt('a1', 10, 0, 60), // 10:00-11:00
      makeApt('a2', 10, 30, 30), // 10:30-11:00 (overlaps with a1)
    ]
    const result = computeOverlapLayout(apts, 6)
    expect(result).toHaveLength(2)
    expect(result[0].column).toBe(0)
    expect(result[0].totalColumns).toBe(2)
    expect(result[1].column).toBe(1)
    expect(result[1].totalColumns).toBe(2)
  })

  test('three overlapping appointments get columns 0, 1, 2', () => {
    const apts = [
      makeApt('a1', 10, 0, 60),  // 10:00-11:00
      makeApt('a2', 10, 0, 60),  // 10:00-11:00
      makeApt('a3', 10, 30, 30), // 10:30-11:00
    ]
    const result = computeOverlapLayout(apts, 6)
    expect(result).toHaveLength(3)
    const columns = result.map(r => r.column).sort()
    expect(columns).toEqual([0, 1, 2])
    result.forEach(r => expect(r.totalColumns).toBe(3))
  })

  test('adjacent (non-overlapping) appointments share column 0', () => {
    const apts = [
      makeApt('a1', 10, 0, 30), // 10:00-10:30
      makeApt('a2', 10, 30, 30), // 10:30-11:00 (starts exactly when a1 ends)
    ]
    const result = computeOverlapLayout(apts, 6)
    expect(result[0].column).toBe(0)
    expect(result[1].column).toBe(0)
    expect(result[0].totalColumns).toBe(1)
    expect(result[1].totalColumns).toBe(1)
  })

  test('partial overlap: one overlaps two non-overlapping ones', () => {
    const apts = [
      makeApt('a1', 10, 0, 30),  // 10:00-10:30
      makeApt('a2', 10, 0, 90),  // 10:00-11:30 (overlaps both a1 and a3)
      makeApt('a3', 11, 0, 30),  // 11:00-11:30
    ]
    const result = computeOverlapLayout(apts, 6)
    expect(result).toHaveLength(3)
    // a1 and a2 overlap → a1 col 0, a2 col 1
    // a3 doesn't overlap a1 (10:30 end < 11:00 start) so a3 can reuse col 0
    // But a3 overlaps a2, so a3 totalColumns should be 2
    const a1 = result.find(r => r.appointment.appointmentId === 'a1')
    const a2 = result.find(r => r.appointment.appointmentId === 'a2')
    const a3 = result.find(r => r.appointment.appointmentId === 'a3')
    expect(a1.column).toBe(0)
    expect(a2.column).toBe(1)
    expect(a3.column).toBe(0) // reuses col 0 since a1 ended
    expect(a2.totalColumns).toBe(2)
    expect(a3.totalColumns).toBe(2)
  })

  test('handles appointments with null rawDateTime gracefully', () => {
    const apts = [
      { appointmentId: 'bad', rawDateTime: null, service: { duration: 30 } },
      makeApt('a1', 10, 0, 30),
    ]
    const result = computeOverlapLayout(apts, 6)
    expect(result).toHaveLength(1)
    expect(result[0].appointment.appointmentId).toBe('a1')
  })
})


// ─── orderStaffColumns ────────────────────────────────────────

import { orderStaffColumns } from '../../app/utils/calendar.js'

describe('orderStaffColumns', () => {
  const makeStaff = (visibleId, staffName, vendorId) => ({ visibleId, staffName, vendorId })

  const vendors = [
    { vendorId: 'vendor-1', name: 'Vendor One' },
    { vendorId: 'vendor-2', name: 'Vendor Two' },
  ]

  test('returns empty array for empty staff list', () => {
    expect(orderStaffColumns([], vendors)).toEqual([])
  })

  test('places resources after non-resource staff', () => {
    const staff = [
      makeStaff('resource-sauna', 'Sauna', 'vendor-1'),
      makeStaff('staff-1', 'Alice', 'vendor-1'),
    ]
    const result = orderStaffColumns(staff, vendors)
    expect(result[0].visibleId).toBe('staff-1')
    expect(result[1].visibleId).toBe('resource-sauna')
  })

  test('groups staff by vendor order', () => {
    const staff = [
      makeStaff('staff-a', 'Alice', 'vendor-2'),
      makeStaff('staff-b', 'Bob', 'vendor-1'),
    ]
    const result = orderStaffColumns(staff, vendors)
    expect(result[0].visibleId).toBe('staff-b') // vendor-1 comes first
    expect(result[1].visibleId).toBe('staff-a') // vendor-2 comes second
  })

  test('sorts alphabetically within same vendor', () => {
    const staff = [
      makeStaff('staff-c', 'Charlie', 'vendor-1'),
      makeStaff('staff-a', 'Alice', 'vendor-1'),
      makeStaff('staff-b', 'Bob', 'vendor-1'),
    ]
    const result = orderStaffColumns(staff, vendors)
    expect(result.map(s => s.staffName)).toEqual(['Alice', 'Bob', 'Charlie'])
  })

  test('preserves all entries (no duplicates, no omissions)', () => {
    const staff = [
      makeStaff('resource-sauna', 'Sauna', 'vendor-1'),
      makeStaff('staff-a', 'Alice', 'vendor-2'),
      makeStaff('staff-b', 'Bob', 'vendor-1'),
      makeStaff('resource-room', 'Room', 'vendor-2'),
    ]
    const result = orderStaffColumns(staff, vendors)
    expect(result).toHaveLength(4)
    expect(new Set(result.map(s => s.visibleId)).size).toBe(4)
  })

  test('handles staff with null staffName', () => {
    const staff = [
      makeStaff('staff-a', null, 'vendor-1'),
      makeStaff('staff-b', 'Bob', 'vendor-1'),
    ]
    const result = orderStaffColumns(staff, vendors)
    // null comes before 'Bob' in localeCompare (empty string vs 'Bob')
    expect(result).toHaveLength(2)
    expect(result[1].staffName).toBe('Bob')
  })

  test('handles staff with vendorId not in vendors list', () => {
    const staff = [
      makeStaff('staff-a', 'Alice', 'vendor-unknown'),
      makeStaff('staff-b', 'Bob', 'vendor-1'),
    ]
    const result = orderStaffColumns(staff, vendors)
    // vendor-unknown gets indexOf -1, vendor-1 gets 0
    // -1 < 0, so unknown vendor sorts first
    expect(result[0].staffName).toBe('Alice')
    expect(result[1].staffName).toBe('Bob')
  })

  test('multiple resources are placed at the end', () => {
    const staff = [
      makeStaff('resource-sauna', 'Sauna', 'vendor-1'),
      makeStaff('staff-a', 'Alice', 'vendor-1'),
      makeStaff('resource-room', 'Room', 'vendor-1'),
      makeStaff('staff-b', 'Bob', 'vendor-2'),
    ]
    const result = orderStaffColumns(staff, vendors)
    expect(result[0].visibleId).toBe('staff-a')
    expect(result[1].visibleId).toBe('staff-b')
    // Resources at the end
    expect(result[2].visibleId.startsWith('resource-')).toBe(true)
    expect(result[3].visibleId.startsWith('resource-')).toBe(true)
  })
})


// ─── groupAppointmentsByStaff ─────────────────────────────────

import { groupAppointmentsByStaff } from '../../app/utils/calendar.js'

describe('groupAppointmentsByStaff', () => {
  const makeStaff = (visibleId) => ({ visibleId })
  const makeAppointment = (id, staffId, status = 'confirmed') => ({
    appointmentId: id,
    staffId,
    status,
  })

  test('empty appointments list returns empty buckets for all staff', () => {
    const staff = [makeStaff('staff-1'), makeStaff('staff-2')]
    const result = groupAppointmentsByStaff([], staff)
    expect(result.get('staff-1')).toEqual([])
    expect(result.get('staff-2')).toEqual([])
    expect(result.size).toBe(2)
  })

  test('all cancelled appointments results in all empty buckets', () => {
    const staff = [makeStaff('staff-1'), makeStaff('staff-2')]
    const appointments = [
      makeAppointment('a1', 'staff-1', 'cancelled'),
      makeAppointment('a2', 'staff-2', 'cancelled'),
      makeAppointment('a3', 'staff-1', 'cancelled'),
    ]
    const result = groupAppointmentsByStaff(appointments, staff)
    expect(result.get('staff-1')).toEqual([])
    expect(result.get('staff-2')).toEqual([])
  })

  test('appointments with unrecognized staffIds are not placed in any bucket', () => {
    const staff = [makeStaff('staff-1')]
    const appointments = [
      makeAppointment('a1', 'staff-unknown', 'confirmed'),
      makeAppointment('a2', 'staff-nonexistent', 'confirmed'),
    ]
    const result = groupAppointmentsByStaff(appointments, staff)
    expect(result.get('staff-1')).toEqual([])
    // Unrecognized staffIds should not create new buckets
    expect(result.has('staff-unknown')).toBe(false)
    expect(result.has('staff-nonexistent')).toBe(false)
  })

  test('normal case: appointments distributed correctly by staffId', () => {
    const staff = [makeStaff('staff-1'), makeStaff('staff-2'), makeStaff('staff-3')]
    const appointments = [
      makeAppointment('a1', 'staff-1', 'confirmed'),
      makeAppointment('a2', 'staff-2', 'confirmed'),
      makeAppointment('a3', 'staff-1', 'paid'),
      makeAppointment('a4', 'staff-3', 'pending'),
    ]
    const result = groupAppointmentsByStaff(appointments, staff)
    expect(result.get('staff-1')).toHaveLength(2)
    expect(result.get('staff-1').map(a => a.appointmentId)).toEqual(['a1', 'a3'])
    expect(result.get('staff-2')).toHaveLength(1)
    expect(result.get('staff-2')[0].appointmentId).toBe('a2')
    expect(result.get('staff-3')).toHaveLength(1)
    expect(result.get('staff-3')[0].appointmentId).toBe('a4')
  })

  test('mixed cancelled and valid: only valid in buckets', () => {
    const staff = [makeStaff('staff-1'), makeStaff('staff-2')]
    const appointments = [
      makeAppointment('a1', 'staff-1', 'confirmed'),
      makeAppointment('a2', 'staff-1', 'cancelled'),
      makeAppointment('a3', 'staff-2', 'paid'),
      makeAppointment('a4', 'staff-2', 'cancelled'),
      makeAppointment('a5', 'staff-1', 'pending'),
    ]
    const result = groupAppointmentsByStaff(appointments, staff)
    expect(result.get('staff-1')).toHaveLength(2)
    expect(result.get('staff-1').map(a => a.appointmentId)).toEqual(['a1', 'a5'])
    expect(result.get('staff-2')).toHaveLength(1)
    expect(result.get('staff-2')[0].appointmentId).toBe('a3')
  })

  test('appointments with null staffId are not placed in any bucket', () => {
    const staff = [makeStaff('staff-1')]
    const appointments = [
      makeAppointment('a1', null, 'confirmed'),
      makeAppointment('a2', undefined, 'confirmed'),
    ]
    const result = groupAppointmentsByStaff(appointments, staff)
    expect(result.get('staff-1')).toEqual([])
  })

  test('empty staff list returns empty map', () => {
    const appointments = [
      makeAppointment('a1', 'staff-1', 'confirmed'),
    ]
    const result = groupAppointmentsByStaff(appointments, [])
    expect(result.size).toBe(0)
  })
})


// ─── orderStaffColumns (additional edge cases) ────────────────

describe('orderStaffColumns - additional edge cases', () => {
  const makeStaff = (visibleId, staffName, vendorId) => ({ visibleId, staffName, vendorId })

  test('empty vendor list: staff still sorted (all get indexOf -1)', () => {
    const staff = [
      makeStaff('staff-c', 'Charlie', 'vendor-1'),
      makeStaff('staff-a', 'Alice', 'vendor-2'),
      makeStaff('staff-b', 'Bob', 'vendor-1'),
    ]
    const result = orderStaffColumns(staff, [])
    // All vendors have index -1, so they tie on vendor order → alphabetical sort
    expect(result.map(s => s.staffName)).toEqual(['Alice', 'Bob', 'Charlie'])
  })

  test('single vendor, multiple staff: alphabetical sort', () => {
    const vendors = [{ vendorId: 'vendor-1', name: 'Only Vendor' }]
    const staff = [
      makeStaff('staff-z', 'Zara', 'vendor-1'),
      makeStaff('staff-m', 'Mika', 'vendor-1'),
      makeStaff('staff-a', 'Anna', 'vendor-1'),
    ]
    const result = orderStaffColumns(staff, vendors)
    expect(result.map(s => s.staffName)).toEqual(['Anna', 'Mika', 'Zara'])
  })

  test('resources grouped separately at end regardless of vendor', () => {
    const vendors = [
      { vendorId: 'vendor-1', name: 'V1' },
      { vendorId: 'vendor-2', name: 'V2' },
    ]
    const staff = [
      makeStaff('resource-pool', 'Pool', 'vendor-2'),
      makeStaff('staff-a', 'Alice', 'vendor-2'),
      makeStaff('resource-sauna', 'Sauna', 'vendor-1'),
      makeStaff('staff-b', 'Bob', 'vendor-1'),
    ]
    const result = orderStaffColumns(staff, vendors)
    // Staff first: Bob (vendor-1) then Alice (vendor-2)
    expect(result[0].staffName).toBe('Bob')
    expect(result[1].staffName).toBe('Alice')
    // Resources at end
    expect(result[2].visibleId).toBe('resource-pool')
    expect(result[3].visibleId).toBe('resource-sauna')
  })

  test('only resources, no staff: all returned', () => {
    const vendors = [{ vendorId: 'vendor-1', name: 'V1' }]
    const staff = [
      makeStaff('resource-sauna', 'Sauna', 'vendor-1'),
      makeStaff('resource-room', 'Room', 'vendor-1'),
    ]
    const result = orderStaffColumns(staff, vendors)
    expect(result).toHaveLength(2)
    expect(result.every(s => s.visibleId.startsWith('resource-'))).toBe(true)
  })
})


// ─── getWorkingHoursForStaff ──────────────────────────────────

import { getWorkingHoursForStaff } from '../../app/utils/calendar.js'

describe('getWorkingHoursForStaff', () => {
  const fullSchedule = {
    sunday: null,
    monday: { start: '09:00', end: '17:00' },
    tuesday: { start: '09:00', end: '17:00' },
    wednesday: null,
    thursday: { start: '10:00', end: '18:00' },
    friday: { start: '09:00', end: '17:00' },
    saturday: { start: '10:00', end: '14:00' },
  }

  test('normal schedule with valid hours returns correct minutes', () => {
    // Monday = day 1
    const monday = new Date(2025, 4, 5) // May 5, 2025 is a Monday
    const result = getWorkingHoursForStaff(fullSchedule, monday)
    expect(result).toEqual({ start: 540, end: 1020 }) // 9*60=540, 17*60=1020
  })

  test('thursday returns different hours', () => {
    // Thursday = day 4
    const thursday = new Date(2025, 4, 8) // May 8, 2025 is a Thursday
    const result = getWorkingHoursForStaff(fullSchedule, thursday)
    expect(result).toEqual({ start: 600, end: 1080 }) // 10*60=600, 18*60=1080
  })

  test('saturday returns half-day hours', () => {
    // Saturday = day 6
    const saturday = new Date(2025, 4, 10) // May 10, 2025 is a Saturday
    const result = getWorkingHoursForStaff(fullSchedule, saturday)
    expect(result).toEqual({ start: 600, end: 840 }) // 10*60=600, 14*60=840
  })

  test('null day entry returns { start: null, end: null }', () => {
    // Sunday = day 0, which is null in the schedule
    const sunday = new Date(2025, 4, 4) // May 4, 2025 is a Sunday
    const result = getWorkingHoursForStaff(fullSchedule, sunday)
    expect(result).toEqual({ start: null, end: null })
  })

  test('null wednesday entry returns { start: null, end: null }', () => {
    // Wednesday = day 3, which is null
    const wednesday = new Date(2025, 4, 7) // May 7, 2025 is a Wednesday
    const result = getWorkingHoursForStaff(fullSchedule, wednesday)
    expect(result).toEqual({ start: null, end: null })
  })

  test('missing day key returns { start: null, end: null }', () => {
    // Schedule that only has monday defined
    const partialSchedule = {
      monday: { start: '09:00', end: '17:00' },
    }
    const tuesday = new Date(2025, 4, 6) // May 6, 2025 is a Tuesday
    const result = getWorkingHoursForStaff(partialSchedule, tuesday)
    expect(result).toEqual({ start: null, end: null })
  })

  test('null schedule returns { start: null, end: null }', () => {
    const monday = new Date(2025, 4, 5)
    const result = getWorkingHoursForStaff(null, monday)
    expect(result).toEqual({ start: null, end: null })
  })

  test('undefined schedule returns { start: null, end: null }', () => {
    const monday = new Date(2025, 4, 5)
    const result = getWorkingHoursForStaff(undefined, monday)
    expect(result).toEqual({ start: null, end: null })
  })

  test('null date returns { start: null, end: null }', () => {
    const result = getWorkingHoursForStaff(fullSchedule, null)
    expect(result).toEqual({ start: null, end: null })
  })

  test('day-of-week mapping: Sunday=0', () => {
    const schedule = { sunday: { start: '08:00', end: '12:00' } }
    const sunday = new Date(2025, 4, 4) // Sunday
    expect(sunday.getDay()).toBe(0)
    const result = getWorkingHoursForStaff(schedule, sunday)
    expect(result).toEqual({ start: 480, end: 720 }) // 8*60=480, 12*60=720
  })

  test('day-of-week mapping: Monday=1', () => {
    const schedule = { monday: { start: '07:30', end: '15:45' } }
    const monday = new Date(2025, 4, 5) // Monday
    expect(monday.getDay()).toBe(1)
    const result = getWorkingHoursForStaff(schedule, monday)
    expect(result).toEqual({ start: 450, end: 945 }) // 7*60+30=450, 15*60+45=945
  })

  test('day-of-week mapping: Friday=5', () => {
    const schedule = { friday: { start: '06:00', end: '22:00' } }
    const friday = new Date(2025, 4, 9) // Friday
    expect(friday.getDay()).toBe(5)
    const result = getWorkingHoursForStaff(schedule, friday)
    expect(result).toEqual({ start: 360, end: 1320 }) // 6*60=360, 22*60=1320
  })

  test('day-of-week mapping: Saturday=6', () => {
    const schedule = { saturday: { start: '11:00', end: '16:30' } }
    const saturday = new Date(2025, 4, 10) // Saturday
    expect(saturday.getDay()).toBe(6)
    const result = getWorkingHoursForStaff(schedule, saturday)
    expect(result).toEqual({ start: 660, end: 990 }) // 11*60=660, 16*60+30=990
  })

  test('midnight start time (00:00) returns 0 minutes', () => {
    const schedule = { monday: { start: '00:00', end: '23:59' } }
    const monday = new Date(2025, 4, 5)
    const result = getWorkingHoursForStaff(schedule, monday)
    expect(result).toEqual({ start: 0, end: 1439 }) // 0, 23*60+59=1439
  })
})
