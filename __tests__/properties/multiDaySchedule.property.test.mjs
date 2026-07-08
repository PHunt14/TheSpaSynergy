/**
 * Property-Based Tests for Multi-Day Schedule Validity
 *
 * Uses fast-check to validate correctness properties for multi-day
 * sequential bundle scheduling in multi-vendor bundle bookings.
 * Feature: multi-vendor-bundle-booking
 *
 * Properties tested:
 * - Property 8: Multi-Day Schedule Validity
 *
 * **Validates: Requirements 4.10**
 */

import fc from 'fast-check'
import {
  getSequentialBundleSlots,
} from '../../app/utils/sequentialAvailability.js'

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
 * Adds days to a date string and returns a new date string.
 */
function addDays(dateStr, days) {
  const date = new Date(dateStr + 'T00:00:00')
  date.setDate(date.getDate() + days)
  return date.toISOString().split('T')[0]
}

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a staff ID.
 */
function arbStaffId(index) {
  return `staff-${index}`
}

/**
 * Generates working hours for a staff member on a given day.
 * Returns { start: "HH:MM", end: "HH:MM" } with a minimum window of 3 hours.
 */
function arbWorkingHours() {
  return fc.record({
    startHour: fc.integer({ min: 7, max: 12 }),
    durationHours: fc.integer({ min: 3, max: 8 }),
  }).map(({ startHour, durationHours }) => {
    const endHour = Math.min(startHour + durationHours, 21)
    return {
      start: minutesToTime(startHour * 60),
      end: minutesToTime(endHour * 60),
    }
  })
}

/**
 * Generates a service with serviceId, duration, allowedStaff, providersRequired, vendorId.
 * Staff IDs are drawn from a known pool to ensure consistency with generated schedules.
 */
function arbService(serviceIndex, staffPoolSize) {
  return fc.record({
    duration: fc.integer({ min: 30, max: 90 }),
    providersRequired: fc.constantFrom(1),
    vendorId: fc.constantFrom('vendor-a', 'vendor-b'),
  }).chain(({ duration, providersRequired, vendorId }) => {
    const maxStaff = Math.min(staffPoolSize, 3)
    return fc.array(
      fc.integer({ min: 0, max: staffPoolSize - 1 }),
      { minLength: Math.max(1, providersRequired), maxLength: maxStaff }
    ).map(staffIndices => {
      const uniqueIndices = [...new Set(staffIndices)]
      while (uniqueIndices.length < providersRequired) {
        const next = (uniqueIndices.at(-1) + 1) % staffPoolSize
        if (!uniqueIndices.includes(next)) uniqueIndices.push(next)
        else break
      }
      return {
        serviceId: `svc-${serviceIndex}`,
        duration,
        providersRequired,
        vendorId,
        allowedStaff: uniqueIndices.map(i => arbStaffId(i)),
      }
    })
  })
}

/**
 * Generates a staff schedule for a specific staff member that is active
 * and has working hours on multiple consecutive days (to support multi-day scheduling).
 */
function arbMultiDayStaffSchedule(staffIndex, daysOfWeek) {
  return arbWorkingHours().map(hours => {
    const schedule = {}
    for (const day of daysOfWeek) {
      schedule[day] = { start: hours.start, end: hours.end }
    }
    return {
      visibleId: arbStaffId(staffIndex),
      vendorId: staffIndex < 2 ? 'vendor-a' : 'vendor-b',
      isActive: true,
      schedule,
    }
  })
}

/**
 * Generates a complete multi-day test scenario with services, staff schedules,
 * and no conflicting appointments (to maximize chance of finding valid multi-day slots).
 */
function arbMultiDayScenario() {
  const staffPoolSize = 4

  return fc.record({
    maxDays: fc.integer({ min: 2, max: 3 }),
  }).chain(({ maxDays }) => {
    // Use a Monday start date so consecutive days are all weekdays
    const startDate = '2024-03-11' // Monday
    const requestedDate = new Date(startDate + 'T00:00:00')
    const startDayIndex = requestedDate.getDay()

    // Get day names for all consecutive days
    const daysOfWeek = []
    for (let d = 0; d < maxDays; d++) {
      daysOfWeek.push(DAY_NAMES[(startDayIndex + d) % 7])
    }

    // Generate 2-4 services (enough to potentially span multiple days)
    return fc.integer({ min: 2, max: 4 }).chain(numServices => {
      const serviceArbs = Array.from({ length: numServices }, (_, i) =>
        arbService(i, staffPoolSize)
      )

      // Generate staff schedules that cover all consecutive days
      const staffArbs = Array.from({ length: staffPoolSize }, (_, i) =>
        arbMultiDayStaffSchedule(i, daysOfWeek)
      )

      const bufferArb = fc.integer({ min: 0, max: 15 })

      return fc.tuple(
        fc.tuple(...serviceArbs),
        fc.tuple(...staffArbs),
        bufferArb
      ).map(([services, staffSchedules, bufferMinutes]) => {
        // Build staffSchedulesByService map
        const staffSchedulesByService = {}
        for (const service of services) {
          staffSchedulesByService[service.serviceId] = staffSchedules.filter(
            staff => service.allowedStaff.includes(staff.visibleId)
          )
        }

        return {
          services,
          staffSchedulesByService,
          appointments: [], // No conflicts to maximize multi-day slot generation
          startDate,
          maxDays,
          bufferMinutes,
          daysOfWeek,
        }
      })
    })
  })
}

/**
 * Generates a multi-day scenario with some existing appointments to test conflict handling.
 */
function arbMultiDayScenarioWithAppointments() {
  const staffPoolSize = 4

  return fc.record({
    maxDays: fc.integer({ min: 2, max: 3 }),
  }).chain(({ maxDays }) => {
    const startDate = '2024-03-11' // Monday
    const requestedDate = new Date(startDate + 'T00:00:00')
    const startDayIndex = requestedDate.getDay()

    const daysOfWeek = []
    for (let d = 0; d < maxDays; d++) {
      daysOfWeek.push(DAY_NAMES[(startDayIndex + d) % 7])
    }

    return fc.integer({ min: 2, max: 3 }).chain(numServices => {
      const serviceArbs = Array.from({ length: numServices }, (_, i) =>
        arbService(i, staffPoolSize)
      )

      const staffArbs = Array.from({ length: staffPoolSize }, (_, i) =>
        arbMultiDayStaffSchedule(i, daysOfWeek)
      )

      // Generate appointments on specific days
      const appointmentArb = fc.array(
        fc.record({
          staffIndex: fc.integer({ min: 0, max: staffPoolSize - 1 }),
          dayOffset: fc.integer({ min: 0, max: maxDays - 1 }),
          startHour: fc.integer({ min: 8, max: 16 }),
          startMinute: fc.constantFrom(0, 30),
          durationMinutes: fc.integer({ min: 30, max: 90 }),
        }).map(({ staffIndex, dayOffset, startHour, startMinute, durationMinutes }) => {
          const aptDate = addDays(startDate, dayOffset)
          return {
            appointmentId: `apt-${staffIndex}-${dayOffset}-${startHour}${startMinute}`,
            staffId: arbStaffId(staffIndex),
            dateTime: `${aptDate}T${minutesToTime(startHour * 60 + startMinute)}`,
            status: 'confirmed',
            customer: JSON.stringify({ name: 'Test', duration: durationMinutes }),
          }
        }),
        { minLength: 0, maxLength: 3 }
      )

      const bufferArb = fc.integer({ min: 0, max: 15 })

      return fc.tuple(
        fc.tuple(...serviceArbs),
        fc.tuple(...staffArbs),
        appointmentArb,
        bufferArb
      ).map(([services, staffSchedules, appointments, bufferMinutes]) => {
        const staffSchedulesByService = {}
        for (const service of services) {
          staffSchedulesByService[service.serviceId] = staffSchedules.filter(
            staff => service.allowedStaff.includes(staff.visibleId)
          )
        }

        return {
          services,
          staffSchedulesByService,
          appointments,
          startDate,
          maxDays,
          bufferMinutes,
          daysOfWeek,
        }
      })
    })
  })
}

// ── Property 8: Multi-Day Schedule Validity ───────────────────

describe('Feature: multi-vendor-bundle-booking, Property 8: Multi-Day Schedule Validity', () => {
  test('all services in a multi-day schedule are on consecutive calendar days (day offsets 0, 1, 2, ...)', () => {
    fc.assert(
      fc.property(
        arbMultiDayScenario(),
        ({ services, staffSchedulesByService, appointments, startDate, maxDays, bufferMinutes }) => {
          const result = getSequentialBundleSlots({
            services,
            staffSchedulesByService,
            appointments,
            startDate,
            bufferMinutes,
            serviceOrder: services.map(s => s.serviceId),
            multiDay: true,
            maxDays,
          })

          for (const slot of result.slots) {
            const schedule = slot.schedule
            if (!schedule || schedule.length === 0) continue

            // Collect all day values from the schedule
            const days = schedule.map(entry => entry.day)

            // All day values must be non-negative integers
            for (const day of days) {
              if (typeof day !== 'number' || day < 0) return false
            }

            // Days must be within the maxDays range
            for (const day of days) {
              if (day >= maxDays) return false
            }

            // Days must be consecutive: unique sorted days should form a sequence 0, 1, 2, ...
            const uniqueDays = [...new Set(days)].sort((a, b) => a - b)
            for (let i = 0; i < uniqueDays.length; i++) {
              // Each day in the sequence should be consecutive from the first day
              if (uniqueDays[i] !== uniqueDays[0] + i) return false
            }
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('each service slot in a multi-day schedule is valid on its respective day (staff available, within working hours)', () => {
    fc.assert(
      fc.property(
        arbMultiDayScenario(),
        ({ services, staffSchedulesByService, appointments, startDate, maxDays, bufferMinutes, daysOfWeek }) => {
          const result = getSequentialBundleSlots({
            services,
            staffSchedulesByService,
            appointments,
            startDate,
            bufferMinutes,
            serviceOrder: services.map(s => s.serviceId),
            multiDay: true,
            maxDays,
          })

          for (const slot of result.slots) {
            const schedule = slot.schedule
            if (!schedule || schedule.length === 0) continue

            for (const entry of schedule) {
              // Find the corresponding service
              const service = services.find(s => s.serviceId === entry.serviceId)
              if (!service) return false

              const dayOffset = entry.day
              const dayOfWeek = daysOfWeek[dayOffset]
              if (!dayOfWeek) return false

              const providersRequired = service.providersRequired || 1
              const eligibleStaff = staffSchedulesByService[service.serviceId] || []

              // Count staff that are active, within working hours on the respective day
              let availableCount = 0
              for (const staff of eligibleStaff) {
                if (!staff.isActive) continue

                const staffSchedule = typeof staff.schedule === 'string'
                  ? JSON.parse(staff.schedule)
                  : staff.schedule
                const daySchedule = staffSchedule[dayOfWeek]
                if (!daySchedule || !daySchedule.start) continue

                const workStart = timeToMinutes(daySchedule.start)
                const workEnd = timeToMinutes(daySchedule.end)
                const slotStart = timeToMinutes(entry.startTime)
                const slotEnd = timeToMinutes(entry.endTime)

                // Service must fit entirely within working hours on its day
                if (slotStart < workStart || slotEnd > workEnd) continue

                // Check for conflicting appointments on the same day
                const dayDate = addDays(startDate, dayOffset)
                const hasConflict = appointments.some(apt => {
                  if (apt.status === 'cancelled') return false
                  if (apt.staffId !== staff.visibleId) return false

                  // Only check appointments on the same day
                  const aptDatePart = apt.dateTime.split('T')[0]
                  if (aptDatePart !== dayDate) return false

                  const aptTime = apt.dateTime.includes('T')
                    ? apt.dateTime.split('T')[1].substring(0, 5)
                    : apt.dateTime.split(' ')[1]
                  const aptStart = timeToMinutes(aptTime)
                  const customer = typeof apt.customer === 'string'
                    ? JSON.parse(apt.customer)
                    : apt.customer
                  const aptDuration = (customer?.isBlockedTime && customer?.duration)
                    ? customer.duration
                    : (customer?.duration || service.duration)
                  const aptEnd = aptStart + aptDuration + bufferMinutes

                  const serviceSlotStart = slotStart
                  const serviceSlotEnd = slotEnd + bufferMinutes

                  return serviceSlotStart < aptEnd && serviceSlotEnd > aptStart
                })

                if (!hasConflict) availableCount++
              }

              // Property: at least providersRequired staff must be available on the respective day
              if (availableCount < providersRequired) {
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

  test('multi-day schedule with appointments still produces valid slots on respective days', () => {
    fc.assert(
      fc.property(
        arbMultiDayScenarioWithAppointments(),
        ({ services, staffSchedulesByService, appointments, startDate, maxDays, bufferMinutes, daysOfWeek }) => {
          const result = getSequentialBundleSlots({
            services,
            staffSchedulesByService,
            appointments,
            startDate,
            bufferMinutes,
            serviceOrder: services.map(s => s.serviceId),
            multiDay: true,
            maxDays,
          })

          for (const slot of result.slots) {
            const schedule = slot.schedule
            if (!schedule || schedule.length === 0) continue

            // Verify consecutive days property
            const days = schedule.map(entry => entry.day)
            const uniqueDays = [...new Set(days)].sort((a, b) => a - b)
            for (let i = 0; i < uniqueDays.length; i++) {
              if (uniqueDays[i] !== uniqueDays[0] + i) return false
            }

            // Verify each service's slot is valid on its respective day
            for (const entry of schedule) {
              const service = services.find(s => s.serviceId === entry.serviceId)
              if (!service) return false

              const dayOffset = entry.day
              const dayOfWeek = daysOfWeek[dayOffset]
              if (!dayOfWeek) return false

              const providersRequired = service.providersRequired || 1
              const eligibleStaff = staffSchedulesByService[service.serviceId] || []

              let availableCount = 0
              for (const staff of eligibleStaff) {
                if (!staff.isActive) continue

                const staffSchedule = typeof staff.schedule === 'string'
                  ? JSON.parse(staff.schedule)
                  : staff.schedule
                const daySchedule = staffSchedule[dayOfWeek]
                if (!daySchedule || !daySchedule.start) continue

                const workStart = timeToMinutes(daySchedule.start)
                const workEnd = timeToMinutes(daySchedule.end)
                const slotStart = timeToMinutes(entry.startTime)
                const slotEnd = timeToMinutes(entry.endTime)

                if (slotStart < workStart || slotEnd > workEnd) continue

                const dayDate = addDays(startDate, dayOffset)
                const hasConflict = appointments.some(apt => {
                  if (apt.status === 'cancelled') return false
                  if (apt.staffId !== staff.visibleId) return false

                  const aptDatePart = apt.dateTime.split('T')[0]
                  if (aptDatePart !== dayDate) return false

                  const aptTime = apt.dateTime.includes('T')
                    ? apt.dateTime.split('T')[1].substring(0, 5)
                    : apt.dateTime.split(' ')[1]
                  const aptStart = timeToMinutes(aptTime)
                  const customer = typeof apt.customer === 'string'
                    ? JSON.parse(apt.customer)
                    : apt.customer
                  const aptDuration = (customer?.isBlockedTime && customer?.duration)
                    ? customer.duration
                    : (customer?.duration || service.duration)
                  const aptEnd = aptStart + aptDuration + bufferMinutes

                  const serviceSlotStart = slotStart
                  const serviceSlotEnd = slotEnd + bufferMinutes

                  return serviceSlotStart < aptEnd && serviceSlotEnd > aptStart
                })

                if (!hasConflict) availableCount++
              }

              if (availableCount < providersRequired) {
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
