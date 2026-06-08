/**
 * Property-Based Tests for Auto-Assignment Algorithm
 *
 * Uses fast-check to validate correctness properties for the auto-assignment
 * algorithm that selects staff with fewest bookings.
 * Feature: unified-business-model
 *
 * Properties tested:
 * - Property 9: Auto-assignment selects staff with fewest bookings
 *
 * **Validates: Requirements 5.5, 5.6**
 */

import fc from 'fast-check'
import { assignStaff } from '../../app/utils/staffAssigner.js'

// ── Helpers ───────────────────────────────────────────────────

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/**
 * Converts minutes since midnight to "HH:MM" format.
 */
function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a valid auto-assignment scenario where:
 * - Multiple staff are eligible (active, in allowedStaff, working at time, no conflict)
 * - Each staff has a different number of non-cancelled bookings on the date
 * - The requested time slot does NOT overlap with any existing appointment
 *
 * This focuses on testing the booking-count selection logic.
 */
function arbAutoAssignScenario() {
  return fc.record({
    // Number of eligible staff (2-6)
    staffCount: fc.integer({ min: 2, max: 6 }),
    // How many providers are required (1 to staffCount will be clamped)
    providersRequired: fc.integer({ min: 1, max: 3 }),
    // Service duration in minutes
    serviceDuration: fc.integer({ min: 30, max: 90 }),
    // Buffer minutes
    bufferMinutes: fc.integer({ min: 0, max: 15 }),
    // Date index (pick a weekday)
    dateIndex: fc.integer({ min: 0, max: 4 }),
    // Booking counts per staff (will be sliced to staffCount)
    bookingCounts: fc.array(fc.integer({ min: 0, max: 10 }), { minLength: 6, maxLength: 6 }),
  }).chain(({ staffCount, providersRequired, serviceDuration, bufferMinutes, dateIndex, bookingCounts }) => {
    // Clamp providersRequired to not exceed staffCount
    const actualProvidersRequired = Math.min(providersRequired, staffCount)

    const weekdayDates = [
      '2024-03-11', // Monday (index 1)
      '2024-03-12', // Tuesday (index 2)
      '2024-03-13', // Wednesday (index 3)
      '2024-03-14', // Thursday (index 4)
      '2024-03-15', // Friday (index 5)
    ]
    const date = weekdayDates[dateIndex]
    const requestedDate = new Date(date + 'T00:00:00')
    const dayOfWeek = DAY_NAMES[requestedDate.getDay()]

    // Request time is 10:00 — comfortably within working hours
    const requestTime = '10:00'
    const requestTimeMin = 10 * 60

    // Working hours: 08:00 - 18:00 (covers the request time + duration)
    const workStart = '08:00'
    const workEnd = '18:00'

    // Build staff schedules — all eligible, active, and working at the time
    const staffSchedules = []
    const staffIds = []
    for (let i = 0; i < staffCount; i++) {
      const staffId = `staff-${i}`
      staffIds.push(staffId)
      staffSchedules.push({
        visibleId: staffId,
        vendorId: `vendor-${i % 2}`,
        name: `Staff Member ${i}`,
        isActive: true,
        schedule: {
          [dayOfWeek]: { start: workStart, end: workEnd },
        },
      })
    }

    // Build appointments for the date — each staff has bookingCounts[i] non-cancelled
    // appointments that DON'T conflict with the requested time slot.
    // Place them in early morning (06:00-07:30) to avoid overlap with 10:00 request.
    const appointments = []
    for (let i = 0; i < staffCount; i++) {
      const count = bookingCounts[i]
      for (let j = 0; j < count; j++) {
        // Place each appointment at a non-conflicting time (early morning, well before 10:00)
        const aptHour = 6
        const aptMin = j * 15 // 06:00, 06:15, 06:30, etc.
        const aptTime = minutesToTime(aptHour * 60 + aptMin)
        appointments.push({
          appointmentId: `apt-${i}-${j}`,
          staffId: staffIds[i],
          dateTime: `${date}T${aptTime}`,
          status: 'confirmed',
          customer: JSON.stringify({ name: `Client ${j}`, duration: 15 }),
        })
      }
    }

    const service = {
      serviceId: 'svc-test',
      duration: serviceDuration,
      providersRequired: actualProvidersRequired,
      allowedStaff: staffIds, // all generated staff are allowed
    }

    return fc.constant({
      service,
      staffSchedules,
      appointments,
      date,
      time: requestTime,
      bufferMinutes,
      staffIds,
      bookingCounts: bookingCounts.slice(0, staffCount),
      actualProvidersRequired,
    })
  })
}

/**
 * Generates a scenario where multiple staff are tied for fewest bookings.
 * Verifies the assigned staff is one of the tied candidates.
 */
function arbTiedBookingsScenario() {
  return fc.record({
    // Number of tied staff (2-5)
    tiedCount: fc.integer({ min: 2, max: 5 }),
    // Number of staff with more bookings (0-3)
    moreCount: fc.integer({ min: 0, max: 3 }),
    // The tied booking count (0-3)
    tiedBookingCount: fc.integer({ min: 0, max: 3 }),
    // Additional bookings for the "more" group
    additionalBookings: fc.integer({ min: 1, max: 5 }),
    // Service duration
    serviceDuration: fc.integer({ min: 30, max: 60 }),
    // Buffer
    bufferMinutes: fc.integer({ min: 0, max: 10 }),
    // Date index
    dateIndex: fc.integer({ min: 0, max: 4 }),
  }).map(({ tiedCount, moreCount, tiedBookingCount, additionalBookings, serviceDuration, bufferMinutes, dateIndex }) => {
    const totalStaff = tiedCount + moreCount

    const weekdayDates = [
      '2024-03-11', '2024-03-12', '2024-03-13', '2024-03-14', '2024-03-15',
    ]
    const date = weekdayDates[dateIndex]
    const requestedDate = new Date(date + 'T00:00:00')
    const dayOfWeek = DAY_NAMES[requestedDate.getDay()]

    const requestTime = '10:00'
    const workStart = '08:00'
    const workEnd = '18:00'

    const staffSchedules = []
    const staffIds = []
    const tiedStaffIds = []

    for (let i = 0; i < totalStaff; i++) {
      const staffId = `staff-${i}`
      staffIds.push(staffId)
      if (i < tiedCount) {
        tiedStaffIds.push(staffId)
      }
      staffSchedules.push({
        visibleId: staffId,
        vendorId: `vendor-${i % 2}`,
        name: `Staff ${i}`,
        isActive: true,
        schedule: {
          [dayOfWeek]: { start: workStart, end: workEnd },
        },
      })
    }

    // Build appointments: tied staff get `tiedBookingCount`, others get more
    const appointments = []
    for (let i = 0; i < totalStaff; i++) {
      const count = i < tiedCount ? tiedBookingCount : tiedBookingCount + additionalBookings
      for (let j = 0; j < count; j++) {
        const aptMin = j * 15
        const aptTime = minutesToTime(6 * 60 + aptMin)
        appointments.push({
          appointmentId: `apt-${i}-${j}`,
          staffId: staffIds[i],
          dateTime: `${date}T${aptTime}`,
          status: 'confirmed',
          customer: JSON.stringify({ name: `Client ${j}`, duration: 15 }),
        })
      }
    }

    const service = {
      serviceId: 'svc-tied',
      duration: serviceDuration,
      providersRequired: 1,
      allowedStaff: staffIds,
    }

    return {
      service,
      staffSchedules,
      appointments,
      date,
      time: requestTime,
      bufferMinutes,
      tiedStaffIds,
      staffIds,
    }
  })
}

/**
 * Generates a scenario to test that exactly providersRequired staff are returned
 * and all returned staff are from the eligible set.
 */
function arbProvidersRequiredScenario() {
  return fc.record({
    staffCount: fc.integer({ min: 2, max: 6 }),
    providersRequired: fc.integer({ min: 1, max: 4 }),
    serviceDuration: fc.integer({ min: 30, max: 60 }),
    bufferMinutes: fc.integer({ min: 0, max: 10 }),
    dateIndex: fc.integer({ min: 0, max: 4 }),
  }).map(({ staffCount, providersRequired, serviceDuration, bufferMinutes, dateIndex }) => {
    // Ensure providersRequired doesn't exceed staffCount
    const actualProvidersRequired = Math.min(providersRequired, staffCount)

    const weekdayDates = [
      '2024-03-11', '2024-03-12', '2024-03-13', '2024-03-14', '2024-03-15',
    ]
    const date = weekdayDates[dateIndex]
    const requestedDate = new Date(date + 'T00:00:00')
    const dayOfWeek = DAY_NAMES[requestedDate.getDay()]

    const requestTime = '10:00'
    const workStart = '08:00'
    const workEnd = '18:00'

    const staffSchedules = []
    const staffIds = []
    for (let i = 0; i < staffCount; i++) {
      const staffId = `staff-${i}`
      staffIds.push(staffId)
      staffSchedules.push({
        visibleId: staffId,
        vendorId: `vendor-${i % 2}`,
        name: `Staff ${i}`,
        isActive: true,
        schedule: {
          [dayOfWeek]: { start: workStart, end: workEnd },
        },
      })
    }

    const service = {
      serviceId: 'svc-providers',
      duration: serviceDuration,
      providersRequired: actualProvidersRequired,
      allowedStaff: staffIds,
    }

    return {
      service,
      staffSchedules,
      appointments: [],
      date,
      time: requestTime,
      bufferMinutes,
      staffIds,
      actualProvidersRequired,
    }
  })
}

// ── Property 9: Auto-assignment selects staff with fewest bookings ────

describe('Feature: unified-business-model, Property 9: Auto-assignment selects staff with fewest bookings', () => {
  test('assigned staff has fewest non-cancelled bookings among eligible staff', () => {
    fc.assert(
      fc.property(
        arbAutoAssignScenario(),
        (scenario) => {
          const result = assignStaff({
            service: scenario.service,
            staffSchedules: scenario.staffSchedules,
            appointments: scenario.appointments,
            date: scenario.date,
            time: scenario.time,
            bufferMinutes: scenario.bufferMinutes,
          })

          // Determine the minimum booking count among eligible staff
          const minBookings = Math.min(...scenario.bookingCounts)

          // Each assigned staff member should have a booking count that is
          // among the lowest. Since we pick providersRequired staff sorted by
          // fewest bookings, the first assigned should have the minimum.
          // For providersRequired=1, the single result must have the minimum.
          // For providersRequired>1, the results are the top-N with fewest bookings.
          const sortedCounts = [...scenario.bookingCounts].sort((a, b) => a - b)
          const maxAllowedCount = sortedCounts[scenario.actualProvidersRequired - 1]

          for (const assignment of result) {
            const staffIndex = scenario.staffIds.indexOf(assignment.staffId)
            const staffBookings = scenario.bookingCounts[staffIndex]
            // Each assigned staff should have bookings <= the Nth lowest count
            if (staffBookings > maxAllowedCount) return false
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('if tied for fewest bookings, assigned staff is one of the tied candidates', () => {
    fc.assert(
      fc.property(
        arbTiedBookingsScenario(),
        (scenario) => {
          const result = assignStaff({
            service: scenario.service,
            staffSchedules: scenario.staffSchedules,
            appointments: scenario.appointments,
            date: scenario.date,
            time: scenario.time,
            bufferMinutes: scenario.bufferMinutes,
          })

          // With providersRequired=1, the single assigned staff must be from the tied set
          return scenario.tiedStaffIds.includes(result[0].staffId)
        }
      ),
      { numRuns: 100 }
    )
  })

  test('exactly providersRequired staff are returned', () => {
    fc.assert(
      fc.property(
        arbProvidersRequiredScenario(),
        (scenario) => {
          const result = assignStaff({
            service: scenario.service,
            staffSchedules: scenario.staffSchedules,
            appointments: scenario.appointments,
            date: scenario.date,
            time: scenario.time,
            bufferMinutes: scenario.bufferMinutes,
          })

          return result.length === scenario.actualProvidersRequired
        }
      ),
      { numRuns: 100 }
    )
  })

  test('all returned staff are from the eligible set', () => {
    fc.assert(
      fc.property(
        arbProvidersRequiredScenario(),
        (scenario) => {
          const result = assignStaff({
            service: scenario.service,
            staffSchedules: scenario.staffSchedules,
            appointments: scenario.appointments,
            date: scenario.date,
            time: scenario.time,
            bufferMinutes: scenario.bufferMinutes,
          })

          // All assigned staff should be in the eligible set (staffIds)
          for (const assignment of result) {
            if (!scenario.staffIds.includes(assignment.staffId)) return false
            // Verify the returned object has correct shape
            if (!assignment.vendorId) return false
            if (assignment.staffName === undefined) return false
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
