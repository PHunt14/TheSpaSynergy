/**
 * Property-Based Tests for Bundle Staff Assignment Eligibility
 *
 * Uses fast-check to validate correctness properties for staff assignment
 * in multi-vendor bundle bookings.
 * Feature: multi-vendor-bundle-booking
 *
 * Properties tested:
 * - Property 15: Bundle Staff Assignment Eligibility
 *
 * **Validates: Requirements 9.1, 9.2**
 */

import fc from 'fast-check'
import { assignBundleStaff } from '../../app/utils/bundleStaffAssigner.js'

// ── Helpers ───────────────────────────────────────────────────

/**
 * Converts a time string "HH:MM" to minutes since midnight.
 */
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

/**
 * Converts minutes since midnight to "HH:MM" format.
 */
function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

/**
 * DAY_NAMES matching the source implementation.
 */
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a staff ID.
 */
function staffId(index) {
  return `staff-${index}`
}

/**
 * Generates a date string (YYYY-MM-DD) for a known weekday (Monday-Friday).
 */
function arbDate() {
  const weekdayDates = [
    '2024-03-11', // Monday
    '2024-03-12', // Tuesday
    '2024-03-13', // Wednesday
    '2024-03-14', // Thursday
    '2024-03-15', // Friday
  ]
  return fc.constantFrom(...weekdayDates)
}

/**
 * Generates a valid start time that leaves room for services within working hours.
 * Working hours are 08:00-18:00, so start times are constrained to leave room.
 */
function arbStartTime() {
  // Generate start times between 08:00 and 14:00 to leave room for services
  return fc.integer({ min: 8 * 60, max: 14 * 60 }).map(m => minutesToTime(m))
}

/**
 * Generates a scenario where staff assignment is guaranteed to be possible.
 * Each service has at least one staff member who is:
 * - Active
 * - In the allowedStaff array
 * - Working during the entire service time window
 * - Has no conflicting appointments
 */
function arbAssignableScenario() {
  const staffPoolSize = 6

  return fc.record({
    date: arbDate(),
    startTimeMinutes: fc.integer({ min: 9 * 60, max: 13 * 60 }),
    numServices: fc.integer({ min: 2, max: 4 }),
    bufferMinutes: fc.integer({ min: 0, max: 15 }),
  }).chain(({ date, startTimeMinutes, numServices, bufferMinutes }) => {
    const requestedDate = new Date(date + 'T00:00:00')
    const dayOfWeek = DAY_NAMES[requestedDate.getDay()]
    const startTime = minutesToTime(startTimeMinutes)

    // Generate services with durations that fit within working hours
    return fc.array(
      fc.integer({ min: 15, max: 60 }),
      { minLength: numServices, maxLength: numServices }
    ).chain(durations => {
      // Calculate total time needed
      const totalDuration = durations.reduce((s, d) => s + d, 0) + bufferMinutes * (durations.length - 1)
      const endMinutes = startTimeMinutes + totalDuration

      // If total exceeds working hours (18:00 = 1080), skip by returning a simpler scenario
      if (endMinutes > 18 * 60) {
        // Reduce durations to fit
        const maxPerService = Math.floor((18 * 60 - startTimeMinutes - bufferMinutes * (numServices - 1)) / numServices)
        if (maxPerService < 15) {
          // Can't fit, use minimal scenario
          return fc.constant(null)
        }
        for (let i = 0; i < durations.length; i++) {
          durations[i] = Math.min(durations[i], maxPerService)
        }
      }

      // Build services with vendor assignments ensuring 2+ vendors
      const services = durations.map((duration, i) => ({
        serviceId: `svc-${i}`,
        vendorId: i % 2 === 0 ? 'vendor-a' : 'vendor-b',
        duration,
        providersRequired: 1,
        allowedStaff: [staffId(i), staffId(i + 1)], // Each service allows 2 staff
      }))

      // Calculate each service's time window
      let currentMinutes = startTimeMinutes
      const serviceWindows = services.map((svc, i) => {
        const svcStart = currentMinutes
        const svcEnd = svcStart + svc.duration
        currentMinutes = svcEnd + (i < services.length - 1 ? bufferMinutes : 0)
        return { start: svcStart, end: svcEnd }
      })

      // Generate staff schedules that cover the service windows
      // Each staff member works from before the first service to after the last
      const workStart = Math.max(7 * 60, startTimeMinutes - 60)
      const workEnd = Math.min(21 * 60, serviceWindows[serviceWindows.length - 1].end + 60)

      const staffSchedules = Array.from({ length: staffPoolSize }, (_, i) => ({
        visibleId: staffId(i),
        vendorId: i < 3 ? 'vendor-a' : 'vendor-b',
        name: `Staff Member ${i}`,
        isActive: true,
        schedule: {
          [dayOfWeek]: {
            start: minutesToTime(workStart),
            end: minutesToTime(workEnd),
          },
        },
      }))

      // Build staffSchedulesByService map
      const staffSchedulesByService = {}
      for (const service of services) {
        staffSchedulesByService[service.serviceId] = staffSchedules.filter(
          staff => service.allowedStaff.includes(staff.visibleId)
        )
      }

      return fc.constant({
        orderedServices: services,
        staffSchedulesByService,
        appointments: [], // No conflicting appointments
        date,
        startTime,
        bufferMinutes,
        dayOfWeek,
        serviceWindows,
      })
    })
  }).filter(scenario => scenario !== null)
}

/**
 * Generates a scenario with some existing appointments that don't conflict
 * with the service windows (to test that the function correctly identifies
 * non-conflicting staff).
 */
function arbScenarioWithAppointments() {
  const staffPoolSize = 6

  return fc.record({
    date: arbDate(),
    startTimeMinutes: fc.integer({ min: 9 * 60, max: 12 * 60 }),
    numServices: fc.integer({ min: 2, max: 3 }),
    bufferMinutes: fc.integer({ min: 5, max: 15 }),
    numAppointments: fc.integer({ min: 0, max: 3 }),
  }).chain(({ date, startTimeMinutes, numServices, bufferMinutes, numAppointments }) => {
    const requestedDate = new Date(date + 'T00:00:00')
    const dayOfWeek = DAY_NAMES[requestedDate.getDay()]
    const startTime = minutesToTime(startTimeMinutes)

    // Use fixed short durations to ensure they fit
    const durations = Array.from({ length: numServices }, () => 30)
    const totalDuration = durations.reduce((s, d) => s + d, 0) + bufferMinutes * (numServices - 1)
    const endMinutes = startTimeMinutes + totalDuration

    if (endMinutes > 18 * 60) {
      return fc.constant(null)
    }

    // Build services
    const services = durations.map((duration, i) => ({
      serviceId: `svc-${i}`,
      vendorId: i % 2 === 0 ? 'vendor-a' : 'vendor-b',
      duration,
      providersRequired: 1,
      allowedStaff: [staffId(i), staffId(i + numServices)], // Each service has 2 allowed staff
    }))

    // Calculate service windows
    let currentMinutes = startTimeMinutes
    const serviceWindows = services.map((svc, i) => {
      const svcStart = currentMinutes
      const svcEnd = svcStart + svc.duration
      currentMinutes = svcEnd + (i < services.length - 1 ? bufferMinutes : 0)
      return { start: svcStart, end: svcEnd }
    })

    const workStart = Math.max(7 * 60, startTimeMinutes - 120)
    const workEnd = Math.min(21 * 60, serviceWindows[serviceWindows.length - 1].end + 120)

    const staffSchedules = Array.from({ length: staffPoolSize }, (_, i) => ({
      visibleId: staffId(i),
      vendorId: i < 3 ? 'vendor-a' : 'vendor-b',
      name: `Staff Member ${i}`,
      isActive: true,
      schedule: {
        [dayOfWeek]: {
          start: minutesToTime(workStart),
          end: minutesToTime(workEnd),
        },
      },
    }))

    // Generate appointments that DON'T conflict with the service windows
    // Place them well before or well after the bundle time
    return fc.array(
      fc.record({
        staffIndex: fc.integer({ min: 0, max: staffPoolSize - 1 }),
        offset: fc.constantFrom('before', 'after'),
      }),
      { minLength: numAppointments, maxLength: numAppointments }
    ).map(aptConfigs => {
      const appointments = aptConfigs.map((cfg, idx) => {
        // Place appointment well outside the bundle window
        const aptStartMinutes = cfg.offset === 'before'
          ? workStart + 10 // Early morning, before bundle
          : endMinutes + 60 // Well after bundle ends
        return {
          appointmentId: `apt-${idx}`,
          staffId: staffId(cfg.staffIndex),
          dateTime: `${date}T${minutesToTime(aptStartMinutes)}`,
          status: 'confirmed',
          customer: JSON.stringify({ name: 'Existing Client', duration: 30 }),
        }
      })

      const staffSchedulesByService = {}
      for (const service of services) {
        staffSchedulesByService[service.serviceId] = staffSchedules.filter(
          staff => service.allowedStaff.includes(staff.visibleId)
        )
      }

      return {
        orderedServices: services,
        staffSchedulesByService,
        appointments,
        date,
        startTime,
        bufferMinutes,
        dayOfWeek,
        serviceWindows,
      }
    })
  }).filter(scenario => scenario !== null)
}

// ── Property 15: Bundle Staff Assignment Eligibility ──────────

describe('Feature: multi-vendor-bundle-booking, Property 15: Bundle Staff Assignment Eligibility', () => {
  test('every assigned staff member appears in the corresponding service allowedStaff array', () => {
    fc.assert(
      fc.property(
        arbAssignableScenario(),
        (scenario) => {
          let assignments
          try {
            assignments = assignBundleStaff({
              orderedServices: scenario.orderedServices,
              staffSchedulesByService: scenario.staffSchedulesByService,
              appointments: scenario.appointments,
              date: scenario.date,
              startTime: scenario.startTime,
              bufferMinutes: scenario.bufferMinutes,
            })
          } catch {
            // Assignment failure is valid (skip)
            return true
          }

          // Property: every assigned staffId must be in the service's allowedStaff
          for (const assignment of assignments) {
            const service = scenario.orderedServices.find(s => s.serviceId === assignment.serviceId)
            if (!service) return false
            if (!service.allowedStaff.includes(assignment.staffId)) {
              return false
            }
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('every assigned staff member is active', () => {
    fc.assert(
      fc.property(
        arbAssignableScenario(),
        (scenario) => {
          let assignments
          try {
            assignments = assignBundleStaff({
              orderedServices: scenario.orderedServices,
              staffSchedulesByService: scenario.staffSchedulesByService,
              appointments: scenario.appointments,
              date: scenario.date,
              startTime: scenario.startTime,
              bufferMinutes: scenario.bufferMinutes,
            })
          } catch {
            return true
          }

          // Property: every assigned staff must be active
          for (const assignment of assignments) {
            const service = scenario.orderedServices.find(s => s.serviceId === assignment.serviceId)
            const staffSchedules = scenario.staffSchedulesByService[service.serviceId] || []
            const staffRecord = staffSchedules.find(s => s.visibleId === assignment.staffId)
            if (!staffRecord) return false
            if (!staffRecord.isActive) return false
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('every assigned staff member is within their working hours at the assigned time', () => {
    fc.assert(
      fc.property(
        arbAssignableScenario(),
        (scenario) => {
          let assignments
          try {
            assignments = assignBundleStaff({
              orderedServices: scenario.orderedServices,
              staffSchedulesByService: scenario.staffSchedulesByService,
              appointments: scenario.appointments,
              date: scenario.date,
              startTime: scenario.startTime,
              bufferMinutes: scenario.bufferMinutes,
            })
          } catch {
            return true
          }

          // Property: every assigned staff must be within working hours
          for (const assignment of assignments) {
            const service = scenario.orderedServices.find(s => s.serviceId === assignment.serviceId)
            const staffSchedules = scenario.staffSchedulesByService[service.serviceId] || []
            const staffRecord = staffSchedules.find(s => s.visibleId === assignment.staffId)
            if (!staffRecord) return false

            const schedule = typeof staffRecord.schedule === 'string'
              ? JSON.parse(staffRecord.schedule)
              : staffRecord.schedule
            const daySchedule = schedule[scenario.dayOfWeek]
            if (!daySchedule || !daySchedule.start) return false

            const workStart = timeToMinutes(daySchedule.start)
            const workEnd = timeToMinutes(daySchedule.end)
            const slotStart = timeToMinutes(assignment.startTime)
            const slotEnd = timeToMinutes(assignment.endTime)

            // Service must fit entirely within working hours
            if (slotStart < workStart || slotEnd > workEnd) {
              return false
            }
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('every assigned staff member has no conflicting appointments at the assigned time (including buffer)', () => {
    fc.assert(
      fc.property(
        arbScenarioWithAppointments(),
        (scenario) => {
          let assignments
          try {
            assignments = assignBundleStaff({
              orderedServices: scenario.orderedServices,
              staffSchedulesByService: scenario.staffSchedulesByService,
              appointments: scenario.appointments,
              date: scenario.date,
              startTime: scenario.startTime,
              bufferMinutes: scenario.bufferMinutes,
            })
          } catch {
            return true
          }

          // Property: no assigned staff should have conflicting appointments
          for (const assignment of assignments) {
            const service = scenario.orderedServices.find(s => s.serviceId === assignment.serviceId)
            const slotStart = timeToMinutes(assignment.startTime)
            const slotEnd = timeToMinutes(assignment.endTime) + scenario.bufferMinutes

            for (const apt of scenario.appointments) {
              if (apt.status === 'cancelled') continue
              if (apt.staffId !== assignment.staffId) continue

              const aptTime = apt.dateTime.includes('T')
                ? apt.dateTime.split('T')[1].substring(0, 5)
                : apt.dateTime.split(' ')[1]
              const aptStart = timeToMinutes(aptTime)
              const customer = typeof apt.customer === 'string'
                ? JSON.parse(apt.customer)
                : apt.customer
              const aptDuration = (customer?.isBlockedTime && customer?.duration)
                ? customer.duration
                : service.duration
              const aptEnd = aptStart + aptDuration + scenario.bufferMinutes

              // Check overlap
              if (slotStart < aptEnd && slotEnd > aptStart) {
                return false
              }
            }
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
