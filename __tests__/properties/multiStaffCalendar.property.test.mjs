/**
 * @jest-environment jest-environment-jsdom
 */

/**
 * Property-Based Tests for Multi-Staff Calendar Utilities
 *
 * Uses fast-check to validate correctness properties for multi-staff
 * calendar utility functions.
 *
 * Feature: multi-staff-calendar
 *
 * Properties tested:
 * - Property 1: Staff column ordering preserves all active staff
 * - Property 2: Appointment grouping correctness
 * - Property 3: Working hours extraction round-trip
 * - Property 4: Slot click enrichment with staff identity
 * - Property 5: Staff column header contains staff name
 *
 * **Validates: Requirements 1.2, 2.1, 2.2, 2.5, 3.1, 3.4, 5.2, 4.1, 4.3, 6.1, 6.2**
 */

import fc from 'fast-check'
import { groupAppointmentsByStaff, getWorkingHoursForStaff, orderStaffColumns } from '../../app/utils/calendar.js'
import { createElement } from 'react'
import { render, cleanup } from '@testing-library/react'
import StaffColumn from '../../app/dashboard/calendar/StaffColumn.jsx'

// ── Generators for Property 2 ─────────────────────────────────

/**
 * Generates a staff member with a unique visibleId.
 */
function arbStaffMember() {
  return fc.record({
    visibleId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
    staffName: fc.string({ minLength: 1, maxLength: 30 }),
    vendorId: fc.string({ minLength: 1, maxLength: 10 }),
  })
}

/**
 * Generates a list of staff members with unique visibleIds.
 */
function arbStaffList() {
  return fc.uniqueArray(arbStaffMember(), {
    minLength: 1,
    maxLength: 10,
    selector: (s) => s.visibleId,
  })
}

/**
 * Generates an appointment status — includes 'cancelled' plus other valid statuses.
 */
function arbStatus() {
  return fc.oneof(
    fc.constant('confirmed'),
    fc.constant('pending'),
    fc.constant('paid'),
    fc.constant('cancelled')
  )
}

/**
 * Generates an appointment with a staffId drawn from a provided set of valid IDs,
 * or occasionally an unrecognized staffId.
 */
function arbAppointment(staffIds) {
  const validStaffId = fc.constantFrom(...staffIds)
  const unknownStaffId = fc.string({ minLength: 1, maxLength: 20 }).filter(
    id => !staffIds.includes(id)
  )
  return fc.record({
    appointmentId: fc.uuid(),
    staffId: fc.oneof(validStaffId, unknownStaffId),
    status: arbStatus(),
    dateTime: fc.date().map(d => d.toISOString()),
    serviceId: fc.string({ minLength: 1, maxLength: 10 }),
  })
}

/**
 * Generates a list of appointments with staffIds that may or may not match the staff list.
 */
function arbAppointments(staffIds) {
  return fc.array(arbAppointment(staffIds), { minLength: 0, maxLength: 30 })
}

// ── Property 2: Appointment Grouping Correctness ───────────────────

describe('Feature: multi-staff-calendar, Property 2: Appointment grouping correctness', () => {
  test('every non-cancelled appointment with a matching staffId is placed in the correct bucket', () => {
    fc.assert(
      fc.property(
        arbStaffList().chain(staffList => {
          const staffIds = staffList.map(s => s.visibleId)
          return arbAppointments(staffIds).map(appointments => ({ staffList, appointments }))
        }),
        ({ staffList, appointments }) => {
          const staffIds = staffList.map(s => s.visibleId)
          const grouped = groupAppointmentsByStaff(appointments, staffList)

          for (const apt of appointments) {
            if (apt.status === 'cancelled') continue
            if (!staffIds.includes(apt.staffId)) continue

            // This appointment should be in the correct bucket
            const bucket = grouped.get(apt.staffId)
            const found = bucket.some(a => a.appointmentId === apt.appointmentId)
            if (!found) return false
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('cancelled appointments are excluded from every bucket', () => {
    fc.assert(
      fc.property(
        arbStaffList().chain(staffList => {
          const staffIds = staffList.map(s => s.visibleId)
          return arbAppointments(staffIds).map(appointments => ({ staffList, appointments }))
        }),
        ({ staffList, appointments }) => {
          const grouped = groupAppointmentsByStaff(appointments, staffList)

          // Check that no cancelled appointment appears in any bucket
          for (const [, bucket] of grouped) {
            for (const apt of bucket) {
              if (apt.status === 'cancelled') return false
            }
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('staff with no matching non-cancelled appointments have empty buckets', () => {
    fc.assert(
      fc.property(
        arbStaffList().chain(staffList => {
          const staffIds = staffList.map(s => s.visibleId)
          return arbAppointments(staffIds).map(appointments => ({ staffList, appointments }))
        }),
        ({ staffList, appointments }) => {
          const grouped = groupAppointmentsByStaff(appointments, staffList)

          for (const staff of staffList) {
            const bucket = grouped.get(staff.visibleId)
            // If there are no non-cancelled appointments for this staff, bucket should be empty
            const expectedNonCancelled = appointments.filter(
              a => a.staffId === staff.visibleId && a.status !== 'cancelled'
            )
            if (expectedNonCancelled.length === 0 && bucket.length !== 0) {
              return false
            }
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('the result map has exactly one key per staff member', () => {
    fc.assert(
      fc.property(
        arbStaffList().chain(staffList => {
          const staffIds = staffList.map(s => s.visibleId)
          return arbAppointments(staffIds).map(appointments => ({ staffList, appointments }))
        }),
        ({ staffList, appointments }) => {
          const grouped = groupAppointmentsByStaff(appointments, staffList)

          // Map should have exactly as many keys as staff members
          if (grouped.size !== staffList.length) return false

          // Every staff visibleId should be a key
          for (const staff of staffList) {
            if (!grouped.has(staff.visibleId)) return false
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('total non-cancelled appointments with valid staffId equals sum of all bucket sizes', () => {
    fc.assert(
      fc.property(
        arbStaffList().chain(staffList => {
          const staffIds = staffList.map(s => s.visibleId)
          return arbAppointments(staffIds).map(appointments => ({ staffList, appointments }))
        }),
        ({ staffList, appointments }) => {
          const grouped = groupAppointmentsByStaff(appointments, staffList)
          const staffIds = new Set(staffList.map(s => s.visibleId))

          const expectedCount = appointments.filter(
            a => a.status !== 'cancelled' && staffIds.has(a.staffId)
          ).length

          let actualCount = 0
          for (const [, bucket] of grouped) {
            actualCount += bucket.length
          }

          return expectedCount === actualCount
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Generators for Property 3 ─────────────────────────────────

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/**
 * Generates a working hours entry { start, end } with valid HH:MM strings
 * where start is before end.
 */
function arbWorkingEntry() {
  return fc.record({
    startHour: fc.integer({ min: 0, max: 22 }),
    startMinute: fc.integer({ min: 0, max: 59 }),
    endHour: fc.integer({ min: 1, max: 23 }),
    endMinute: fc.integer({ min: 0, max: 59 })
  }).filter(({ startHour, startMinute, endHour, endMinute }) => {
    // Ensure start < end in minutes
    return (startHour * 60 + startMinute) < (endHour * 60 + endMinute)
  }).map(({ startHour, startMinute, endHour, endMinute }) => ({
    start: `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`,
    end: `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`
  }))
}

/**
 * Generates a day entry that is either a valid working hours entry or null (day off).
 */
function arbDayEntry() {
  return fc.oneof(
    { weight: 3, arbitrary: arbWorkingEntry() },
    { weight: 1, arbitrary: fc.constant(null) }
  )
}

/**
 * Generates a valid staff schedule JSON with all 7 days mapped to
 * either a working hours entry or null.
 */
function arbSchedule() {
  return fc.record({
    sunday: arbDayEntry(),
    monday: arbDayEntry(),
    tuesday: arbDayEntry(),
    wednesday: arbDayEntry(),
    thursday: arbDayEntry(),
    friday: arbDayEntry(),
    saturday: arbDayEntry()
  })
}

/**
 * Generates a Date object for any day of the week.
 * Uses a known base date (2024-01-07 is a Sunday) + offset 0-6 to cover all days.
 */
function arbDate() {
  return fc.integer({ min: 0, max: 6 }).map(dayOffset => {
    // 2024-01-07 is a Sunday (getDay() === 0)
    return new Date(2024, 0, 7 + dayOffset, 12, 0, 0)
  })
}

// ── Property 3: Working Hours Extraction Round-Trip ──────────────────────

describe('Feature: multi-staff-calendar, Property 3: Working hours extraction round-trip', () => {
  test('extracted minutes match HH:MM input for working days', () => {
    fc.assert(
      fc.property(
        arbSchedule(),
        arbDate(),
        (schedule, date) => {
          const dayName = DAYS[date.getDay()]
          const entry = schedule[dayName]
          const result = getWorkingHoursForStaff(schedule, date)

          if (entry === null) {
            // Day off: should return nulls
            return result.start === null && result.end === null
          }

          // Working day: parsed minutes should match HH:MM values
          const [startHour, startMinute] = entry.start.split(':').map(Number)
          const [endHour, endMinute] = entry.end.split(':').map(Number)
          const expectedStart = startHour * 60 + startMinute
          const expectedEnd = endHour * 60 + endMinute

          return result.start === expectedStart && result.end === expectedEnd
        }
      ),
      { numRuns: 100 }
    )
  })

  test('null schedule returns null working hours', () => {
    fc.assert(
      fc.property(
        arbDate(),
        (date) => {
          const result = getWorkingHoursForStaff(null, date)
          return result.start === null && result.end === null
        }
      ),
      { numRuns: 100 }
    )
  })

  test('missing day entry in schedule returns null working hours', () => {
    fc.assert(
      fc.property(
        arbDate(),
        (date) => {
          // Schedule that doesn't include the tested day
          const dayName = DAYS[date.getDay()]
          const partialSchedule = {}
          for (const d of DAYS) {
            if (d !== dayName) {
              partialSchedule[d] = { start: '09:00', end: '17:00' }
            }
          }
          // dayName is not in the schedule (missing key)
          const result = getWorkingHoursForStaff(partialSchedule, date)
          return result.start === null && result.end === null
        }
      ),
      { numRuns: 100 }
    )
  })

  test('round-trip: minutes convert back to original hours and minutes', () => {
    fc.assert(
      fc.property(
        arbWorkingEntry(),
        arbDate(),
        (entry, date) => {
          const dayName = DAYS[date.getDay()]
          const schedule = { [dayName]: entry }
          const result = getWorkingHoursForStaff(schedule, date)

          // Verify round-trip: extracted minutes decompose back to original H:M
          const [startH, startM] = entry.start.split(':').map(Number)
          const [endH, endM] = entry.end.split(':').map(Number)

          const startHourFromResult = Math.floor(result.start / 60)
          const startMinuteFromResult = result.start % 60
          const endHourFromResult = Math.floor(result.end / 60)
          const endMinuteFromResult = result.end % 60

          return (
            startHourFromResult === startH &&
            startMinuteFromResult === startM &&
            endHourFromResult === endH &&
            endMinuteFromResult === endM
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})


// ── Generators for Property 1 ─────────────────────────────────

/**
 * Generates a list of vendors with unique vendorIds.
 */
function arbVendors() {
  return fc.uniqueArray(
    fc.record({
      vendorId: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 20 }),
    }),
    { minLength: 1, maxLength: 5, selector: (v) => v.vendorId }
  )
}

/**
 * Generates a non-resource staff member with a vendorId from the provided set.
 */
function arbNonResourceStaff(vendorIds) {
  return fc.record({
    visibleId: fc.uuid().map(id => `staff-${id}`),
    staffName: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
    vendorId: fc.constantFrom(...vendorIds),
    isActive: fc.constant(true),
  })
}

/**
 * Generates a resource entry (visibleId starts with 'resource-').
 */
function arbResourceStaff(vendorIds) {
  return fc.record({
    visibleId: fc.uuid().map(id => `resource-${id}`),
    staffName: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
    vendorId: fc.constantFrom(...vendorIds),
    isActive: fc.constant(true),
  })
}

/**
 * Generates a full test scenario with vendors, non-resource staff, and resources.
 */
function arbStaffScenario() {
  return arbVendors().chain(vendors => {
    const vendorIds = vendors.map(v => v.vendorId)
    return fc.tuple(
      fc.constant(vendors),
      fc.array(arbNonResourceStaff(vendorIds), { minLength: 0, maxLength: 10 }),
      fc.array(arbResourceStaff(vendorIds), { minLength: 0, maxLength: 3 })
    )
  })
}

// ── Property 1: Staff Column Ordering Preserves All Active Staff ──────────

describe('Feature: multi-staff-calendar, Property 1: Staff column ordering preserves all active staff', () => {
  test('result has the same length as input (no duplicates, no omissions)', () => {
    fc.assert(
      fc.property(
        arbStaffScenario(),
        ([vendors, staffMembers, resources]) => {
          const allStaff = [...staffMembers, ...resources]
          const result = orderStaffColumns(allStaff, vendors)
          return result.length === allStaff.length
        }
      ),
      { numRuns: 100 }
    )
  })

  test('result contains exactly the same staff entries as input (no omissions)', () => {
    fc.assert(
      fc.property(
        arbStaffScenario(),
        ([vendors, staffMembers, resources]) => {
          const allStaff = [...staffMembers, ...resources]
          const result = orderStaffColumns(allStaff, vendors)

          const inputIds = allStaff.map(s => s.visibleId).sort()
          const resultIds = result.map(s => s.visibleId).sort()
          return JSON.stringify(inputIds) === JSON.stringify(resultIds)
        }
      ),
      { numRuns: 100 }
    )
  })

  test('all non-resource staff appear before resource entries', () => {
    fc.assert(
      fc.property(
        arbStaffScenario(),
        ([vendors, staffMembers, resources]) => {
          const allStaff = [...staffMembers, ...resources]
          const result = orderStaffColumns(allStaff, vendors)

          const isResource = (s) => s.visibleId.startsWith('resource-')
          let seenResource = false
          for (const staff of result) {
            if (isResource(staff)) {
              seenResource = true
            } else if (seenResource) {
              // Non-resource after a resource → violation
              return false
            }
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('non-resource staff are grouped by vendor in the vendor ordering', () => {
    fc.assert(
      fc.property(
        arbStaffScenario(),
        ([vendors, staffMembers, resources]) => {
          const allStaff = [...staffMembers, ...resources]
          const result = orderStaffColumns(allStaff, vendors)

          const vendorOrder = vendors.map(v => v.vendorId)
          const isResource = (s) => s.visibleId.startsWith('resource-')

          // Extract non-resource staff from result
          const nonResourceResult = result.filter(s => !isResource(s))

          // Check that vendor indices are non-decreasing (grouped by vendor order)
          let lastVendorIdx = -1
          for (const staff of nonResourceResult) {
            const vendorIdx = vendorOrder.indexOf(staff.vendorId)
            if (vendorIdx < lastVendorIdx) {
              return false
            }
            lastVendorIdx = vendorIdx
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('result contains no duplicate entries', () => {
    fc.assert(
      fc.property(
        arbStaffScenario(),
        ([vendors, staffMembers, resources]) => {
          const allStaff = [...staffMembers, ...resources]
          const result = orderStaffColumns(allStaff, vendors)

          const ids = result.map(s => s.visibleId)
          return new Set(ids).size === ids.length
        }
      ),
      { numRuns: 100 }
    )
  })
})


// ── Property 4: Slot Click Enrichment with Staff Identity ──────────────────

describe('Feature: multi-staff-calendar, Property 4: Slot click enrichment with staff identity', () => {
  afterEach(() => {
    cleanup()
  })

  /**
   * **Validates: Requirements 4.1, 4.3**
   *
   * For any staff visibleId and any valid time slot (hour, minute) within the grid range,
   * the StaffColumn's slot click handler SHALL produce a callback with a Date object whose
   * hours and minutes match the clicked slot AND the staff's visibleId as the associated
   * staff identifier.
   */
  test('callback receives correct Date (hours/minutes match slot) and correct staffId', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary staff visibleId (non-empty)
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
        // Generate staff name
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
        // Generate valid hour (0-23) and minute (0-59) for slot click
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        (visibleId, staffName, hour, minute) => {
          // Create a Date from the generated hour/minute
          const clickedDate = new Date(2024, 5, 15, hour, minute, 0, 0)

          // Track what the onSlotClick callback receives
          let receivedDateTime = null
          let receivedStaffId = null
          const mockOnSlotClick = (dateTime, staffId) => {
            receivedDateTime = dateTime
            receivedStaffId = staffId
          }

          // Create a mock TimeBlockColumn that captures and invokes onSlotClick
          let capturedSlotClickHandler = null
          function MockTimeBlockColumn(props) {
            capturedSlotClickHandler = props.onSlotClick
            return createElement('div', { 'data-testid': 'mock-time-block' })
          }

          const staff = {
            visibleId,
            staffName,
            schedule: null, // No schedule needed for this test
          }

          // Render StaffColumn with the mock TimeBlockColumn
          render(
            createElement(StaffColumn, {
              staff,
              date: new Date(2024, 5, 15),
              appointments: [],
              startHour: 0,
              endHour: 24,
              onAppointmentClick: () => {},
              onSlotClick: mockOnSlotClick,
              TimeBlockColumn: MockTimeBlockColumn,
            })
          )

          // Simulate TimeBlockColumn invoking the slot click with the date
          if (capturedSlotClickHandler) {
            capturedSlotClickHandler(clickedDate)
          }

          // Clean up DOM for next iteration
          cleanup()

          // Verify the parent onSlotClick received the correct Date and staffId
          if (!receivedDateTime) return false
          if (receivedDateTime.getHours() !== hour) return false
          if (receivedDateTime.getMinutes() !== minute) return false
          if (receivedStaffId !== visibleId) return false

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})


// ── Property 5: Staff Column Header Contains Staff Name ──────────────────────

/**
 * A minimal mock TimeBlockColumn that renders nothing.
 * StaffColumn requires this prop but Property 5 only cares about the header.
 */
function NullTimeBlockColumn() {
  return createElement('div', null)
}

/**
 * Generates a non-empty staff name string (trimmed length > 0).
 */
function arbStaffName() {
  return fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
}

describe('Feature: multi-staff-calendar, Property 5: Staff column header contains staff name', () => {
  afterEach(() => {
    cleanup()
  })

  /**
   * **Validates: Requirements 2.2**
   *
   * For any staff member with a non-empty staffName, the rendered StaffColumn
   * header SHALL contain the full staffName string.
   */
  test('rendered header contains full staffName for any non-empty name', () => {
    fc.assert(
      fc.property(
        arbStaffName(),
        (staffName) => {
          const staff = {
            visibleId: 'staff-test-1',
            staffName,
            schedule: null,
          }

          const { container } = render(
            createElement(StaffColumn, {
              staff,
              date: new Date(2024, 0, 8),
              appointments: [],
              startHour: 8,
              endHour: 18,
              onAppointmentClick: () => {},
              onSlotClick: () => {},
              TimeBlockColumn: NullTimeBlockColumn,
            })
          )

          // Find the header element and verify it contains the full staffName
          const header = container.querySelector('.staff-column-header')
          if (!header) return false

          const containsName = header.textContent.includes(staffName)

          // Clean up DOM for next iteration
          cleanup()

          return containsName
        }
      ),
      { numRuns: 100 }
    )
  })
})
