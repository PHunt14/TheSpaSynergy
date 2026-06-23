/**
 * Property-Based Tests for Multi-Staff Week View Utilities
 *
 * Uses fast-check to validate correctness properties across random inputs.
 * Feature: multi-staff-week-view
 *
 * Properties tested:
 * - Property 1: Week date computation produces exactly 7 days Sunday–Saturday
 * - Property 4: Staff color assignment is deterministic and complete
 * - Property 6: Appointment grouping by date and staff is a correct partition
 * - Property 7: Week header label format correctness
 * - Property 8: Aggregate working hours spans min-start to max-end
 *
 * **Validates: Requirements 2.1, 3.4, 5.3, 6.3, 7.1, 9.3**
 */

import fc from 'fast-check'
import {
  getWeekDates,
  assignStaffColors,
  groupAppointmentsByDateAndStaff,
  formatWeekHeaderLabel,
  getAggregateWorkingHours,
  STAFF_COLORS,
} from '../../app/utils/calendar.js'

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a valid Date within a reasonable range (2000–2099).
 */
function arbDate() {
  return fc.date({
    min: new Date(2000, 0, 1),
    max: new Date(2099, 11, 31),
  })
}

/**
 * Generates a valid week dates array (7 dates Sun-Sat) by picking a random date
 * and computing getWeekDates from it.
 */
function arbWeekDates() {
  return arbDate().map(d => getWeekDates(d))
}

/**
 * Generates a staff member object with a unique visibleId.
 */
function arbStaffMember(index) {
  return fc.record({
    visibleId: fc.constant(`staff-${index}`),
    staffName: fc.constant(`Staff Member ${index}`),
    vendorId: fc.constant(`vendor-${(index % 3) + 1}`),
    isActive: fc.constant(true),
  })
}

/**
 * Generates an ordered list of staff members (1–20).
 */
function arbOrderedStaff() {
  return fc.integer({ min: 1, max: 20 }).chain(count => {
    const staffArbs = Array.from({ length: count }, (_, i) => arbStaffMember(i + 1))
    return fc.tuple(...staffArbs)
  }).map(tuple => Array.isArray(tuple) ? tuple : [tuple])
}

/**
 * Generates a time string in HH:MM format.
 */
function arbTimeString() {
  return fc.tuple(
    fc.integer({ min: 0, max: 23 }),
    fc.integer({ min: 0, max: 59 })
  ).map(([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
}

/**
 * Generates a valid working schedule for a staff member with at least one scheduled day.
 */
function arbScheduleWithHours() {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  return fc.tuple(
    fc.integer({ min: 0, max: 14 }), // start hour (0-14)
    fc.integer({ min: 1, max: 9 }),   // hours to add for end
  ).chain(([startHour, hoursToAdd]) => {
    const endHour = startHour + hoursToAdd
    const start = `${String(startHour).padStart(2, '0')}:00`
    const end = `${String(endHour).padStart(2, '0')}:00`
    // Generate a schedule where at least some days are scheduled
    return fc.tuple(
      ...days.map(() => fc.boolean())
    ).map(dayFlags => {
      const schedule = {}
      days.forEach((day, i) => {
        if (dayFlags[i]) {
          schedule[day] = { start, end }
        } else {
          schedule[day] = null
        }
      })
      return schedule
    })
  })
}

/**
 * Generates a staff member with a working schedule.
 */
function arbStaffWithSchedule(index) {
  return arbScheduleWithHours().map(schedule => ({
    visibleId: `staff-${index}`,
    staffName: `Staff ${index}`,
    vendorId: `vendor-${(index % 3) + 1}`,
    isActive: true,
    schedule,
  }))
}

/**
 * Generates a non-empty list of staff with schedules (1–8 staff).
 */
function arbStaffListWithSchedules() {
  return fc.integer({ min: 1, max: 8 }).chain(count => {
    const arbs = Array.from({ length: count }, (_, i) => arbStaffWithSchedule(i + 1))
    return fc.tuple(...arbs)
  }).map(tuple => Array.isArray(tuple) ? tuple : [tuple])
}

/**
 * Generates a non-cancelled appointment for a specific date and staffId.
 */
function arbAppointment(dateStr, staffId) {
  return fc.tuple(
    fc.integer({ min: 6, max: 20 }),
    fc.integer({ min: 0, max: 59 })
  ).map(([hour, minute]) => ({
    dateTime: `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`,
    rawDateTime: `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`,
    staffId,
    status: 'confirmed',
    customer: { name: 'Test Customer' },
    service: { duration: 30 },
  }))
}

// ── Property 1: Week date computation produces exactly 7 days Sunday–Saturday ──

describe('Feature: multi-staff-week-view, Property 1: Week date computation produces exactly 7 days Sunday–Saturday', () => {
  test('produces exactly 7 dates', () => {
    fc.assert(
      fc.property(arbDate(), (date) => {
        const result = getWeekDates(date)
        return result.length === 7
      }),
      { numRuns: 100 }
    )
  })

  test('first element is a Sunday (day 0)', () => {
    fc.assert(
      fc.property(arbDate(), (date) => {
        const result = getWeekDates(date)
        return result[0].getDay() === 0
      }),
      { numRuns: 100 }
    )
  })

  test('last element is a Saturday (day 6)', () => {
    fc.assert(
      fc.property(arbDate(), (date) => {
        const result = getWeekDates(date)
        return result[6].getDay() === 6
      }),
      { numRuns: 100 }
    )
  })

  test('each consecutive date is exactly 1 calendar day apart', () => {
    fc.assert(
      fc.property(arbDate(), (date) => {
        const result = getWeekDates(date)
        for (let i = 0; i < result.length - 1; i++) {
          const current = result[i]
          const next = result[i + 1]
          // Check calendar day difference (handles DST transitions correctly)
          const expectedNextDate = current.getDate() + 1
          const actualNext = new Date(current.getFullYear(), current.getMonth(), expectedNextDate)
          if (next.getFullYear() !== actualNext.getFullYear()) return false
          if (next.getMonth() !== actualNext.getMonth()) return false
          if (next.getDate() !== actualNext.getDate()) return false
        }
        return true
      }),
      { numRuns: 100 }
    )
  })

  test('input date falls within the returned range (inclusive)', () => {
    fc.assert(
      fc.property(arbDate(), (date) => {
        const result = getWeekDates(date)
        const inputDay = new Date(date)
        inputDay.setHours(0, 0, 0, 0)
        const firstDay = result[0].getTime()
        const lastDay = result[6].getTime()
        return inputDay.getTime() >= firstDay && inputDay.getTime() <= lastDay
      }),
      { numRuns: 100 }
    )
  })
})

// ── Property 4: Staff color assignment is deterministic and complete ──

describe('Feature: multi-staff-week-view, Property 4: Staff color assignment is deterministic and complete', () => {
  test('returns a Map with exactly one entry for every staff member', () => {
    fc.assert(
      fc.property(arbOrderedStaff(), (staff) => {
        const result = assignStaffColors(staff)
        if (result.size !== staff.length) return false
        return staff.every(s => result.has(s.visibleId))
      }),
      { numRuns: 100 }
    )
  })

  test('calling the function again with the same input produces identical mapping', () => {
    fc.assert(
      fc.property(arbOrderedStaff(), (staff) => {
        const result1 = assignStaffColors(staff)
        const result2 = assignStaffColors(staff)
        if (result1.size !== result2.size) return false
        for (const [key, value] of result1) {
          if (result2.get(key) !== value) return false
        }
        return true
      }),
      { numRuns: 100 }
    )
  })

  test('every assigned color is from the STAFF_COLORS palette', () => {
    fc.assert(
      fc.property(arbOrderedStaff(), (staff) => {
        const result = assignStaffColors(staff)
        for (const color of result.values()) {
          if (!STAFF_COLORS.includes(color)) return false
        }
        return true
      }),
      { numRuns: 100 }
    )
  })
})

// ── Property 6: Appointment grouping by date and staff is a correct partition ──

describe('Feature: multi-staff-week-view, Property 6: Appointment grouping by date and staff is a correct partition', () => {
  test('every valid appointment appears in exactly one bucket (no duplicates, no losses)', () => {
    fc.assert(
      fc.property(
        arbWeekDates(),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 0, max: 15 }),
        (weekDates, staffCount, appointmentCount) => {
          // Build staff list
          const staffList = Array.from({ length: staffCount }, (_, i) => ({
            visibleId: `staff-${i + 1}`,
            staffName: `Staff ${i + 1}`,
            vendorId: `vendor-1`,
          }))

          // Build appointments randomly assigned to valid days and staff
          const appointments = []
          for (let i = 0; i < appointmentCount; i++) {
            const dayIdx = i % 7
            const staffIdx = i % staffCount
            const dateStr = formatDateKeyLocal(weekDates[dayIdx])
            const hour = 9 + (i % 8)
            appointments.push({
              dateTime: `${dateStr}T${String(hour).padStart(2, '0')}:00:00`,
              rawDateTime: `${dateStr}T${String(hour).padStart(2, '0')}:00:00`,
              staffId: `staff-${staffIdx + 1}`,
              status: 'confirmed',
              customer: { name: `Customer ${i}` },
            })
          }

          const grouped = groupAppointmentsByDateAndStaff(appointments, weekDates, staffList)

          // Count total appointments in all buckets
          let totalInBuckets = 0
          for (const [, staffMap] of grouped) {
            for (const [, aptList] of staffMap) {
              totalInBuckets += aptList.length
            }
          }

          // All valid appointments should be placed
          return totalInBuckets === appointmentCount
        }
      ),
      { numRuns: 100 }
    )
  })

  test('each appointment appears in the bucket matching its date and staffId', () => {
    fc.assert(
      fc.property(
        arbWeekDates(),
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 1, max: 10 }),
        (weekDates, staffCount, appointmentCount) => {
          const staffList = Array.from({ length: staffCount }, (_, i) => ({
            visibleId: `staff-${i + 1}`,
            staffName: `Staff ${i + 1}`,
            vendorId: `vendor-1`,
          }))

          const appointments = []
          for (let i = 0; i < appointmentCount; i++) {
            const dayIdx = i % 7
            const staffIdx = i % staffCount
            const dateStr = formatDateKeyLocal(weekDates[dayIdx])
            const hour = 9 + (i % 8)
            appointments.push({
              dateTime: `${dateStr}T${String(hour).padStart(2, '0')}:00:00`,
              rawDateTime: `${dateStr}T${String(hour).padStart(2, '0')}:00:00`,
              staffId: `staff-${staffIdx + 1}`,
              status: 'confirmed',
              customer: { name: `Customer ${i}` },
            })
          }

          const grouped = groupAppointmentsByDateAndStaff(appointments, weekDates, staffList)

          // Verify each appointment lands in its correct bucket
          for (const apt of appointments) {
            const aptDate = new Date(apt.rawDateTime)
            const dateKey = formatDateKeyLocal(aptDate)
            const staffMap = grouped.get(dateKey)
            if (!staffMap) return false
            const aptList = staffMap.get(apt.staffId)
            if (!aptList) return false
            const found = aptList.some(a =>
              a.rawDateTime === apt.rawDateTime && a.staffId === apt.staffId
            )
            if (!found) return false
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('cancelled appointments are excluded from all buckets', () => {
    fc.assert(
      fc.property(
        arbWeekDates(),
        fc.integer({ min: 1, max: 3 }),
        (weekDates, staffCount) => {
          const staffList = Array.from({ length: staffCount }, (_, i) => ({
            visibleId: `staff-${i + 1}`,
            staffName: `Staff ${i + 1}`,
            vendorId: `vendor-1`,
          }))

          const dateStr = formatDateKeyLocal(weekDates[0])
          const appointments = [
            {
              dateTime: `${dateStr}T10:00:00`,
              rawDateTime: `${dateStr}T10:00:00`,
              staffId: 'staff-1',
              status: 'cancelled',
              customer: { name: 'Cancelled' },
            },
            {
              dateTime: `${dateStr}T11:00:00`,
              rawDateTime: `${dateStr}T11:00:00`,
              staffId: 'staff-1',
              status: 'confirmed',
              customer: { name: 'Active' },
            },
          ]

          const grouped = groupAppointmentsByDateAndStaff(appointments, weekDates, staffList)

          let totalInBuckets = 0
          for (const [, staffMap] of grouped) {
            for (const [, aptList] of staffMap) {
              totalInBuckets += aptList.length
            }
          }

          // Only the non-cancelled appointment should be included
          return totalInBuckets === 1
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 7: Week header label format correctness ──

describe('Feature: multi-staff-week-view, Property 7: Week header label format correctness', () => {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  test('produces a string matching "Mon D – Mon D, YYYY" pattern', () => {
    fc.assert(
      fc.property(arbWeekDates(), (weekDates) => {
        const result = formatWeekHeaderLabel(weekDates)
        // Pattern: abbreviated month, space, day number, space, en-dash, space, abbreviated month, space, day number, comma, space, 4-digit year
        const pattern = /^[A-Z][a-z]{2} \d{1,2} \u2013 [A-Z][a-z]{2} \d{1,2}, \d{4}$/
        return pattern.test(result)
      }),
      { numRuns: 100 }
    )
  })

  test('first date/month corresponds to the week Sunday', () => {
    fc.assert(
      fc.property(arbWeekDates(), (weekDates) => {
        const result = formatWeekHeaderLabel(weekDates)
        const sunday = weekDates[0]
        const expectedMonth = MONTHS[sunday.getMonth()]
        const expectedDay = sunday.getDate()
        return result.startsWith(`${expectedMonth} ${expectedDay}`)
      }),
      { numRuns: 100 }
    )
  })

  test('last date/month corresponds to the week Saturday', () => {
    fc.assert(
      fc.property(arbWeekDates(), (weekDates) => {
        const result = formatWeekHeaderLabel(weekDates)
        const saturday = weekDates[6]
        const expectedMonth = MONTHS[saturday.getMonth()]
        const expectedDay = saturday.getDate()
        const expectedYear = saturday.getFullYear()
        return result.endsWith(`${expectedMonth} ${expectedDay}, ${expectedYear}`)
      }),
      { numRuns: 100 }
    )
  })

  test('year shown is from the end date (Saturday)', () => {
    fc.assert(
      fc.property(arbWeekDates(), (weekDates) => {
        const result = formatWeekHeaderLabel(weekDates)
        const saturdayYear = weekDates[6].getFullYear()
        return result.endsWith(String(saturdayYear))
      }),
      { numRuns: 100 }
    )
  })
})

// ── Property 8: Aggregate working hours spans min-start to max-end ──

describe('Feature: multi-staff-week-view, Property 8: Aggregate working hours spans min-start to max-end', () => {
  test('start equals minimum of all staff start times for that day', () => {
    fc.assert(
      fc.property(
        arbStaffListWithSchedules(),
        fc.integer({ min: 0, max: 6 }),
        (staffList, dayIndex) => {
          // Use a fixed date matching the dayIndex
          const date = new Date(2025, 0, 5 + dayIndex) // Jan 5, 2025 is a Sunday

          const result = getAggregateWorkingHours(staffList, date)

          // Compute expected minimum start manually
          const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
          const dayName = days[dayIndex]

          let expectedMinStart = null
          for (const staff of staffList) {
            const schedule = staff.schedule
            if (schedule && schedule[dayName] && schedule[dayName].start) {
              const [h, m] = schedule[dayName].start.split(':').map(Number)
              const startMin = h * 60 + m
              if (expectedMinStart === null || startMin < expectedMinStart) {
                expectedMinStart = startMin
              }
            }
          }

          if (expectedMinStart === null) {
            return result.start === null
          }
          return result.start === expectedMinStart
        }
      ),
      { numRuns: 100 }
    )
  })

  test('end equals maximum of all staff end times for that day', () => {
    fc.assert(
      fc.property(
        arbStaffListWithSchedules(),
        fc.integer({ min: 0, max: 6 }),
        (staffList, dayIndex) => {
          const date = new Date(2025, 0, 5 + dayIndex) // Jan 5, 2025 is a Sunday

          const result = getAggregateWorkingHours(staffList, date)

          const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
          const dayName = days[dayIndex]

          let expectedMaxEnd = null
          for (const staff of staffList) {
            const schedule = staff.schedule
            if (schedule && schedule[dayName] && schedule[dayName].end) {
              const [h, m] = schedule[dayName].end.split(':').map(Number)
              const endMin = h * 60 + m
              if (expectedMaxEnd === null || endMin > expectedMaxEnd) {
                expectedMaxEnd = endMin
              }
            }
          }

          if (expectedMaxEnd === null) {
            return result.end === null
          }
          return result.end === expectedMaxEnd
        }
      ),
      { numRuns: 100 }
    )
  })

  test('when no staff have hours, both start and end are null', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 0, max: 6 }),
        (staffCount, dayIndex) => {
          // Create staff with no schedule for the target day
          const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
          const dayName = days[dayIndex]

          const staffList = Array.from({ length: staffCount }, (_, i) => {
            const schedule = {}
            days.forEach(d => {
              schedule[d] = d === dayName ? null : { start: '09:00', end: '17:00' }
            })
            return {
              visibleId: `staff-${i + 1}`,
              staffName: `Staff ${i + 1}`,
              schedule,
            }
          })

          const date = new Date(2025, 0, 5 + dayIndex)
          const result = getAggregateWorkingHours(staffList, date)

          return result.start === null && result.end === null
        }
      ),
      { numRuns: 100 }
    )
  })

  test('handles JSON string schedules correctly', () => {
    fc.assert(
      fc.property(
        arbStaffListWithSchedules(),
        fc.integer({ min: 0, max: 6 }),
        (staffList, dayIndex) => {
          // Convert schedules to JSON strings (simulating DB storage)
          const staffWithJsonSchedules = staffList.map(s => ({
            ...s,
            schedule: JSON.stringify(s.schedule),
          }))

          const date = new Date(2025, 0, 5 + dayIndex)
          const resultObj = getAggregateWorkingHours(staffList, date)
          const resultJson = getAggregateWorkingHours(staffWithJsonSchedules, date)

          return resultObj.start === resultJson.start && resultObj.end === resultJson.end
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Helper ────────────────────────────────────────────────────

/**
 * Format a Date as YYYY-MM-DD string (local helper matching calendar.js logic).
 */
function formatDateKeyLocal(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
