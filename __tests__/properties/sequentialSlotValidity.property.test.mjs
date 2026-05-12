/**
 * Property-Based Tests for Sequential Slot Validity
 *
 * Uses fast-check to validate correctness properties for sequential
 * slot availability in multi-vendor bundle bookings.
 * Feature: multi-vendor-bundle-booking
 *
 * Properties tested:
 * - Property 6: Sequential Slot Validity
 *
 * **Validates: Requirements 4.1, 4.3, 4.7, 4.8, 4.9**
 */

import fc from 'fast-check'
import {
  getSequentialBundleSlots,
  findSlotsForOrder,
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

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a staff ID.
 */
function arbStaffId(index) {
  return `staff-${index}`
}

/**
 * Generates a date string (YYYY-MM-DD) for a known weekday (Monday-Friday)
 * to ensure staff schedules align with the day of week.
 * We use a fixed set of dates to keep things deterministic.
 */
function arbDate() {
  // Use dates that are weekdays (Mon-Fri) in 2024
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
 * Generates working hours for a staff member on a given day.
 * Returns { start: "HH:MM", end: "HH:MM" } with end > start and
 * a minimum window of 2 hours.
 */
function arbWorkingHours() {
  return fc.record({
    startHour: fc.integer({ min: 7, max: 14 }),
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
    duration: fc.integer({ min: 15, max: 90 }),
    providersRequired: fc.constantFrom(1),
    vendorId: fc.constantFrom('vendor-a', 'vendor-b'),
  }).chain(({ duration, providersRequired, vendorId }) => {
    // Each service gets 1-3 allowed staff from the pool
    const maxStaff = Math.min(staffPoolSize, 3)
    return fc.array(
      fc.integer({ min: 0, max: staffPoolSize - 1 }),
      { minLength: Math.max(1, providersRequired), maxLength: maxStaff }
    ).map(staffIndices => {
      const uniqueIndices = [...new Set(staffIndices)]
      // Ensure we have at least providersRequired staff
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
 * and has working hours on the given day of week.
 */
function arbStaffSchedule(staffIndex, dayOfWeek) {
  return arbWorkingHours().map(hours => ({
    visibleId: arbStaffId(staffIndex),
    vendorId: staffIndex < 2 ? 'vendor-a' : 'vendor-b',
    isActive: true,
    schedule: {
      [dayOfWeek]: { start: hours.start, end: hours.end },
    },
  }))
}

/**
 * Generates an appointment that may conflict with a time slot.
 * Appointments are for specific staff at specific times.
 */
function arbAppointment(staffPoolSize) {
  return fc.record({
    staffIndex: fc.integer({ min: 0, max: staffPoolSize - 1 }),
    startHour: fc.integer({ min: 7, max: 18 }),
    startMinute: fc.constantFrom(0, 30),
    durationMinutes: fc.integer({ min: 30, max: 120 }),
  }).map(({ staffIndex, startHour, startMinute, durationMinutes }) => ({
    appointmentId: `apt-${staffIndex}-${startHour}${startMinute}`,
    staffId: arbStaffId(staffIndex),
    dateTime: `2024-03-13T${minutesToTime(startHour * 60 + startMinute)}`,
    status: 'confirmed',
    customer: JSON.stringify({ name: 'Test', duration: durationMinutes }),
  }))
}

/**
 * Generates a complete test scenario with services, staff schedules, and appointments.
 */
function arbScenario() {
  const staffPoolSize = 4

  return arbDate().chain(date => {
    const requestedDate = new Date(date + 'T00:00:00')
    const dayOfWeek = DAY_NAMES[requestedDate.getDay()]

    // Generate 2-4 services
    return fc.integer({ min: 2, max: 4 }).chain(numServices => {
      const serviceArbs = Array.from({ length: numServices }, (_, i) =>
        arbService(i, staffPoolSize)
      )

      // Generate staff schedules for all staff in the pool
      const staffArbs = Array.from({ length: staffPoolSize }, (_, i) =>
        arbStaffSchedule(i, dayOfWeek)
      )

      // Generate 0-3 existing appointments
      const appointmentArb = fc.array(
        arbAppointment(staffPoolSize),
        { minLength: 0, maxLength: 3 }
      )

      const bufferArb = fc.integer({ min: 0, max: 15 })

      return fc.tuple(
        fc.tuple(...serviceArbs),
        fc.tuple(...staffArbs),
        appointmentArb,
        bufferArb
      ).map(([services, staffSchedules, appointments, bufferMinutes]) => {
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
          appointments,
          date,
          dayOfWeek,
          bufferMinutes,
        }
      })
    })
  })
}

// ── Property 6: Sequential Slot Validity ──────────────────────

describe('Feature: multi-vendor-bundle-booking, Property 6: Sequential Slot Validity', () => {
  test('every slot returned by getSequentialBundleSlots has enough available staff for each service at its computed time', () => {
    fc.assert(
      fc.property(
        arbScenario(),
        ({ services, staffSchedulesByService, appointments, date, dayOfWeek, bufferMinutes }) => {
          const result = getSequentialBundleSlots({
            services,
            staffSchedulesByService,
            appointments,
            startDate: date,
            bufferMinutes,
            serviceOrder: null,
            multiDay: false,
            maxDays: 1,
          })

          // For every returned slot, verify validity
          for (const slot of result.slots) {
            const schedule = slot.schedule

            for (let i = 0; i < schedule.length; i++) {
              const entry = schedule[i]
              // Find the corresponding service
              const service = services.find(s => s.serviceId === entry.serviceId)
              if (!service) return false

              const providersRequired = service.providersRequired || 1
              const eligibleStaff = staffSchedulesByService[service.serviceId] || []

              // Count staff that are active, within working hours, and have no conflicts
              let availableCount = 0
              for (const staff of eligibleStaff) {
                if (!staff.isActive) continue

                // Check working hours
                const staffSchedule = typeof staff.schedule === 'string'
                  ? JSON.parse(staff.schedule)
                  : staff.schedule
                const daySchedule = staffSchedule[dayOfWeek]
                if (!daySchedule || !daySchedule.start) continue

                const workStart = timeToMinutes(daySchedule.start)
                const workEnd = timeToMinutes(daySchedule.end)
                const slotStart = timeToMinutes(entry.startTime)
                const slotEnd = timeToMinutes(entry.endTime)

                // Service must fit entirely within working hours
                if (slotStart < workStart || slotEnd > workEnd) continue

                // Check for conflicting appointments (including buffer)
                const hasConflict = appointments.some(apt => {
                  if (apt.status === 'cancelled') return false
                  if (apt.staffId !== staff.visibleId) return false

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
                  const aptEnd = aptStart + aptDuration + bufferMinutes

                  const serviceSlotStart = slotStart
                  const serviceSlotEnd = slotEnd + bufferMinutes

                  return serviceSlotStart < aptEnd && serviceSlotEnd > aptStart
                })

                if (!hasConflict) availableCount++
              }

              // Property: at least providersRequired staff must be available
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

  test('every slot returned by findSlotsForOrder has each service fitting within staff working hours', () => {
    fc.assert(
      fc.property(
        arbScenario(),
        ({ services, staffSchedulesByService, appointments, date, dayOfWeek, bufferMinutes }) => {
          const slots = findSlotsForOrder({
            orderedServices: services,
            staffSchedulesByService,
            appointments,
            date,
            bufferMinutes,
          })

          // For every returned slot, verify each service fits within at least one staff member's working hours
          for (const slot of slots) {
            const schedule = slot.schedule

            for (let i = 0; i < schedule.length; i++) {
              const entry = schedule[i]
              const service = services[i]
              const providersRequired = service.providersRequired || 1
              const eligibleStaff = staffSchedulesByService[service.serviceId] || []

              // Count staff whose working hours fully contain this service's time range
              let fitsCount = 0
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

                // Service fits entirely within working hours
                if (slotStart >= workStart && slotEnd <= workEnd) {
                  // Also check no conflicts
                  const hasConflict = appointments.some(apt => {
                    if (apt.status === 'cancelled') return false
                    if (apt.staffId !== staff.visibleId) return false

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
                    const aptEnd = aptStart + aptDuration + bufferMinutes

                    const serviceSlotStart = slotStart
                    const serviceSlotEnd = slotEnd + bufferMinutes

                    return serviceSlotStart < aptEnd && serviceSlotEnd > aptStart
                  })

                  if (!hasConflict) fitsCount++
                }
              }

              // Property: at least providersRequired staff available with service fitting in their hours
              if (fitsCount < providersRequired) {
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
