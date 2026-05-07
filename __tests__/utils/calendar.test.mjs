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
