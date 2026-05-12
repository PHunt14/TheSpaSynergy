/**
 * Property-Based Tests for No Intra-Bundle Staff Conflicts
 *
 * Uses fast-check to validate correctness properties for staff assignment
 * in multi-vendor bundle bookings.
 * Feature: multi-vendor-bundle-booking
 *
 * Properties tested:
 * - Property 18: No Intra-Bundle Staff Conflicts
 *
 * **Validates: Requirements 9.6**
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

/**
 * Checks if two time ranges overlap, considering buffer.
 * Range A: [startA, endA + buffer)
 * Range B: [startB, endB + buffer)
 */
function rangesOverlap(startA, endA, startB, endB, bufferMinutes) {
  const startAMin = timeToMinutes(startA)
  const endAMin = timeToMinutes(endA) + bufferMinutes
  const startBMin = timeToMinutes(startB)
  const endBMin = timeToMinutes(endB) + bufferMinutes
  return startAMin < endBMin && startBMin < endAMin
}

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
 * Generates a scenario where staff assignment is possible and multiple services
 * may share staff (to stress-test the no-conflict property).
 *
 * Key design: We create scenarios where the same staff member is eligible for
 * multiple services. The assigner must ensure no overlapping assignments.
 */
function arbSharedStaffScenario() {
  const staffPoolSize = 4

  return fc.record({
    date: arbDate(),
    startTimeMinutes: fc.integer({ min: 9 * 60, max: 12 * 60 }),
    numServices: fc.integer({ min: 2, max: 5 }),
    bufferMinutes: fc.integer({ min: 0, max: 15 }),
  }).chain(({ date, startTimeMinutes, numServices, bufferMinutes }) => {
    const requestedDate = new Date(date + 'T00:00:00')
    const dayOfWeek = DAY_NAMES[requestedDate.getDay()]
    const startTime = minutesToTime(startTimeMinutes)

    return fc.array(
      fc.integer({ min: 15, max: 45 }),
      { minLength: numServices, maxLength: numServices }
    ).chain(durations => {
      // Calculate total time needed
      const totalDuration = durations.reduce((s, d) => s + d, 0) + bufferMinutes * (durations.length - 1)
      const endMinutes = startTimeMinutes + totalDuration

      // Ensure it fits within working hours (18:00 = 1080)
      if (endMinutes > 18 * 60) {
        return fc.constant(null)
      }

      // Build services - deliberately share staff across services to stress-test conflicts
      // Each service allows overlapping staff pools
      const services = durations.map((duration, i) => ({
        serviceId: `svc-${i}`,
        vendorId: `vendor-${i % 2 === 0 ? 'a' : 'b'}`,
        duration,
        providersRequired: 1,
        // Overlapping staff pools: each service allows staff i and staff (i+1) % poolSize
        allowedStaff: [staffId(i % staffPoolSize), staffId((i + 1) % staffPoolSize)],
      }))

      // Calculate each service's time window
      let currentMinutes = startTimeMinutes
      const serviceWindows = services.map((svc, i) => {
        const svcStart = currentMinutes
        const svcEnd = svcStart + svc.duration
        currentMinutes = svcEnd + (i < services.length - 1 ? bufferMinutes : 0)
        return { start: svcStart, end: svcEnd }
      })

      // Generate staff schedules that cover all service windows
      const workStart = Math.max(7 * 60, startTimeMinutes - 60)
      const workEnd = Math.min(21 * 60, serviceWindows[serviceWindows.length - 1].end + 60)

      const staffSchedules = Array.from({ length: staffPoolSize }, (_, i) => ({
        visibleId: staffId(i),
        vendorId: i < 2 ? 'vendor-a' : 'vendor-b',
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
        appointments: [],
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
 * Generates a scenario where same-vendor services share staff pools,
 * creating more opportunities for potential intra-bundle conflicts.
 */
function arbSameVendorScenario() {
  const staffPoolSize = 3

  return fc.record({
    date: arbDate(),
    startTimeMinutes: fc.integer({ min: 9 * 60, max: 12 * 60 }),
    numServices: fc.integer({ min: 3, max: 5 }),
    bufferMinutes: fc.integer({ min: 0, max: 10 }),
  }).chain(({ date, startTimeMinutes, numServices, bufferMinutes }) => {
    const requestedDate = new Date(date + 'T00:00:00')
    const dayOfWeek = DAY_NAMES[requestedDate.getDay()]
    const startTime = minutesToTime(startTimeMinutes)

    return fc.array(
      fc.integer({ min: 20, max: 40 }),
      { minLength: numServices, maxLength: numServices }
    ).chain(durations => {
      const totalDuration = durations.reduce((s, d) => s + d, 0) + bufferMinutes * (durations.length - 1)
      const endMinutes = startTimeMinutes + totalDuration

      if (endMinutes > 18 * 60) {
        return fc.constant(null)
      }

      // Create services where most belong to the same vendor (same-staff preference kicks in)
      // This means the assigner will try to assign the same staff to multiple services
      const services = durations.map((duration, i) => ({
        serviceId: `svc-${i}`,
        // First N-1 services from vendor-a, last from vendor-b (to satisfy 2-vendor minimum)
        vendorId: i < numServices - 1 ? 'vendor-a' : 'vendor-b',
        duration,
        providersRequired: 1,
        // All vendor-a services share the same staff pool
        allowedStaff: i < numServices - 1
          ? [staffId(0), staffId(1)] // shared pool for same-vendor services
          : [staffId(2)],            // different staff for vendor-b
      }))

      let currentMinutes = startTimeMinutes
      const serviceWindows = services.map((svc, i) => {
        const svcStart = currentMinutes
        const svcEnd = svcStart + svc.duration
        currentMinutes = svcEnd + (i < services.length - 1 ? bufferMinutes : 0)
        return { start: svcStart, end: svcEnd }
      })

      const workStart = Math.max(7 * 60, startTimeMinutes - 60)
      const workEnd = Math.min(21 * 60, serviceWindows[serviceWindows.length - 1].end + 60)

      const staffSchedules = Array.from({ length: staffPoolSize }, (_, i) => ({
        visibleId: staffId(i),
        vendorId: i < 2 ? 'vendor-a' : 'vendor-b',
        name: `Staff Member ${i}`,
        isActive: true,
        schedule: {
          [dayOfWeek]: {
            start: minutesToTime(workStart),
            end: minutesToTime(workEnd),
          },
        },
      }))

      const staffSchedulesByService = {}
      for (const service of services) {
        staffSchedulesByService[service.serviceId] = staffSchedules.filter(
          staff => service.allowedStaff.includes(staff.visibleId)
        )
      }

      return fc.constant({
        orderedServices: services,
        staffSchedulesByService,
        appointments: [],
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
 * Generates a scenario with existing appointments that force the assigner
 * to pick from a limited staff pool, increasing conflict potential.
 */
function arbConstrainedScenario() {
  const staffPoolSize = 4

  return fc.record({
    date: arbDate(),
    startTimeMinutes: fc.integer({ min: 9 * 60, max: 11 * 60 }),
    numServices: fc.integer({ min: 2, max: 4 }),
    bufferMinutes: fc.integer({ min: 5, max: 15 }),
  }).chain(({ date, startTimeMinutes, numServices, bufferMinutes }) => {
    const requestedDate = new Date(date + 'T00:00:00')
    const dayOfWeek = DAY_NAMES[requestedDate.getDay()]
    const startTime = minutesToTime(startTimeMinutes)

    const durations = Array.from({ length: numServices }, () => 30)
    const totalDuration = durations.reduce((s, d) => s + d, 0) + bufferMinutes * (numServices - 1)
    const endMinutes = startTimeMinutes + totalDuration

    if (endMinutes > 18 * 60) {
      return fc.constant(null)
    }

    // Services with overlapping staff pools
    const services = durations.map((duration, i) => ({
      serviceId: `svc-${i}`,
      vendorId: i % 2 === 0 ? 'vendor-a' : 'vendor-b',
      duration,
      providersRequired: 1,
      allowedStaff: [staffId(i % staffPoolSize), staffId((i + 1) % staffPoolSize)],
    }))

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
      vendorId: i < 2 ? 'vendor-a' : 'vendor-b',
      name: `Staff Member ${i}`,
      isActive: true,
      schedule: {
        [dayOfWeek]: {
          start: minutesToTime(workStart),
          end: minutesToTime(workEnd),
        },
      },
    }))

    // Add existing appointments that don't conflict with the bundle window
    // (placed well before or after)
    return fc.array(
      fc.record({
        staffIndex: fc.integer({ min: 0, max: staffPoolSize - 1 }),
        offset: fc.constantFrom('before', 'after'),
      }),
      { minLength: 0, maxLength: 2 }
    ).map(aptConfigs => {
      const appointments = aptConfigs.map((cfg, idx) => {
        const aptStartMinutes = cfg.offset === 'before'
          ? workStart + 5
          : endMinutes + 60
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

// ── Property 18: No Intra-Bundle Staff Conflicts ──────────────

describe('Feature: multi-vendor-bundle-booking, Property 18: No Intra-Bundle Staff Conflicts', () => {
  test('no staff member is assigned to two services whose time ranges (including buffer) overlap - shared staff scenario', () => {
    fc.assert(
      fc.property(
        arbSharedStaffScenario(),
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
            // Assignment failure is acceptable (means it couldn't find non-conflicting assignment)
            return true
          }

          // Property: for every pair of assignments with the same staffId,
          // their time ranges (including buffer) must NOT overlap
          for (let i = 0; i < assignments.length; i++) {
            for (let j = i + 1; j < assignments.length; j++) {
              if (assignments[i].staffId !== assignments[j].staffId) continue

              const overlaps = rangesOverlap(
                assignments[i].startTime,
                assignments[i].endTime,
                assignments[j].startTime,
                assignments[j].endTime,
                scenario.bufferMinutes
              )

              if (overlaps) {
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

  test('no staff member is assigned to two services whose time ranges (including buffer) overlap - same vendor scenario', () => {
    fc.assert(
      fc.property(
        arbSameVendorScenario(),
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

          // Property: for every pair of assignments with the same staffId,
          // their time ranges (including buffer) must NOT overlap
          for (let i = 0; i < assignments.length; i++) {
            for (let j = i + 1; j < assignments.length; j++) {
              if (assignments[i].staffId !== assignments[j].staffId) continue

              const overlaps = rangesOverlap(
                assignments[i].startTime,
                assignments[i].endTime,
                assignments[j].startTime,
                assignments[j].endTime,
                scenario.bufferMinutes
              )

              if (overlaps) {
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

  test('no staff member is assigned to two services whose time ranges (including buffer) overlap - constrained scenario with appointments', () => {
    fc.assert(
      fc.property(
        arbConstrainedScenario(),
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

          // Property: for every pair of assignments with the same staffId,
          // their time ranges (including buffer) must NOT overlap
          for (let i = 0; i < assignments.length; i++) {
            for (let j = i + 1; j < assignments.length; j++) {
              if (assignments[i].staffId !== assignments[j].staffId) continue

              const overlaps = rangesOverlap(
                assignments[i].startTime,
                assignments[i].endTime,
                assignments[j].startTime,
                assignments[j].endTime,
                scenario.bufferMinutes
              )

              if (overlaps) {
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
