/**
 * Property-Based Tests for Slot Start Time Equals First Service Start
 *
 * Uses fast-check to validate correctness properties for sequential
 * slot availability in multi-vendor bundle bookings.
 * Feature: multi-vendor-bundle-booking
 *
 * Properties tested:
 * - Property 7: Slot Start Time Equals First Service Start
 *
 * **Validates: Requirements 4.6**
 */

import fc from 'fast-check'
import {
  getSequentialBundleSlots,
  findSlotsForOrder,
} from '../../app/utils/sequentialAvailability.js'

// ── Helpers ───────────────────────────────────────────────────

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
 * Generates working hours for a staff member on a given day.
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
 */
function arbService(serviceIndex, staffPoolSize) {
  return fc.record({
    duration: fc.integer({ min: 15, max: 90 }),
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
        const next = (uniqueIndices[uniqueIndices.length - 1] + 1) % staffPoolSize
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
 * Generates a staff schedule for a specific staff member.
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

    return fc.integer({ min: 2, max: 4 }).chain(numServices => {
      const serviceArbs = Array.from({ length: numServices }, (_, i) =>
        arbService(i, staffPoolSize)
      )

      const staffArbs = Array.from({ length: staffPoolSize }, (_, i) =>
        arbStaffSchedule(i, dayOfWeek)
      )

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
          bufferMinutes,
        }
      })
    })
  })
}

// ── Property 7: Slot Start Time Equals First Service Start ────

describe('Feature: multi-vendor-bundle-booking, Property 7: Slot Start Time Equals First Service Start', () => {
  test('for every slot from getSequentialBundleSlots, slot.startTime equals the first service startTime in the schedule', () => {
    fc.assert(
      fc.property(
        arbScenario(),
        ({ services, staffSchedulesByService, appointments, date, bufferMinutes }) => {
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

          for (const slot of result.slots) {
            // The slot must have a schedule with at least one entry
            if (!slot.schedule || slot.schedule.length === 0) return false

            // Property: slot.startTime === schedule[0].startTime
            if (slot.startTime !== slot.schedule[0].startTime) {
              return false
            }
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('for every slot from findSlotsForOrder, slot.startTime equals the first service startTime in the schedule', () => {
    fc.assert(
      fc.property(
        arbScenario(),
        ({ services, staffSchedulesByService, appointments, date, bufferMinutes }) => {
          const slots = findSlotsForOrder({
            orderedServices: services,
            staffSchedulesByService,
            appointments,
            date,
            bufferMinutes,
          })

          for (const slot of slots) {
            if (!slot.schedule || slot.schedule.length === 0) return false

            // Property: slot.startTime === schedule[0].startTime
            if (slot.startTime !== slot.schedule[0].startTime) {
              return false
            }
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('for every slot from getSequentialBundleSlots with customer-specified order, slot.startTime equals the first service startTime', () => {
    fc.assert(
      fc.property(
        arbScenario(),
        ({ services, staffSchedulesByService, appointments, date, bufferMinutes }) => {
          // Use a specific service order (reversed)
          const serviceOrder = [...services].reverse().map(s => s.serviceId)

          const result = getSequentialBundleSlots({
            services,
            staffSchedulesByService,
            appointments,
            startDate: date,
            bufferMinutes,
            serviceOrder,
            multiDay: false,
            maxDays: 1,
          })

          for (const slot of result.slots) {
            if (!slot.schedule || slot.schedule.length === 0) return false

            // Property: slot.startTime === schedule[0].startTime
            if (slot.startTime !== slot.schedule[0].startTime) {
              return false
            }
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
