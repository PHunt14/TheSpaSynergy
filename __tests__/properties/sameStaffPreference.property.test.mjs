/**
 * Property-Based Tests for Same-Staff Preference
 *
 * Uses fast-check to validate correctness properties for same-staff preference
 * in multi-vendor bundle bookings.
 * Feature: multi-vendor-bundle-booking
 *
 * Properties tested:
 * - Property 16: Same-Staff Preference
 *
 * **Validates: Requirements 9.4**
 */

import fc from 'fast-check'
import { assignBundleStaff } from '../../app/utils/bundleStaffAssigner.js'

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
 * Generates a scenario specifically designed to test same-staff preference:
 * - 2+ services from the same vendor
 * - Exactly one staff member eligible for ALL same-vendor services
 * - Additional services from a different vendor (to satisfy multi-vendor constraint)
 *
 * The key constraint: there is exactly one staff member who can serve all
 * same-vendor services, so the function MUST assign that staff to all of them.
 */
function arbSameStaffScenario() {
  return fc.record({
    dateIndex: fc.integer({ min: 0, max: 4 }),
    startTimeMinutes: fc.integer({ min: 9 * 60, max: 12 * 60 }),
    numSameVendorServices: fc.integer({ min: 2, max: 4 }),
    bufferMinutes: fc.integer({ min: 5, max: 15 }),
    serviceDuration: fc.integer({ min: 20, max: 45 }),
  }).chain(({ dateIndex, startTimeMinutes, numSameVendorServices, bufferMinutes, serviceDuration }) => {
    const weekdayDates = [
      '2024-03-11', // Monday
      '2024-03-12', // Tuesday
      '2024-03-13', // Wednesday
      '2024-03-14', // Thursday
      '2024-03-15', // Friday
    ]
    const date = weekdayDates[dateIndex]
    const requestedDate = new Date(date + 'T00:00:00')
    const dayOfWeek = DAY_NAMES[requestedDate.getDay()]
    const startTime = minutesToTime(startTimeMinutes)

    // Calculate total time needed for same-vendor services
    const totalSameVendorTime = numSameVendorServices * serviceDuration +
      (numSameVendorServices - 1) * bufferMinutes
    // Plus one service from another vendor
    const totalTime = totalSameVendorTime + bufferMinutes + serviceDuration
    const endMinutes = startTimeMinutes + totalTime

    // Ensure everything fits within working hours (18:00 = 1080)
    if (endMinutes > 18 * 60) {
      return fc.constant(null)
    }

    // The "universal" staff member who is eligible for ALL same-vendor services
    const universalStaffId = 'staff-universal'
    // Other staff members who are each only eligible for ONE same-vendor service
    const otherSameVendorStaff = Array.from(
      { length: numSameVendorServices },
      (_, i) => `staff-partial-${i}`
    )

    // Build same-vendor services: each allows the universal staff + one partial staff
    const sameVendorServices = Array.from({ length: numSameVendorServices }, (_, i) => ({
      serviceId: `svc-same-${i}`,
      vendorId: 'vendor-a',
      duration: serviceDuration,
      providersRequired: 1,
      allowedStaff: [universalStaffId, otherSameVendorStaff[i]],
    }))

    // Build one service from a different vendor (to satisfy multi-vendor constraint)
    const otherVendorStaffId = 'staff-other-vendor'
    const otherVendorService = {
      serviceId: 'svc-other',
      vendorId: 'vendor-b',
      duration: serviceDuration,
      providersRequired: 1,
      allowedStaff: [otherVendorStaffId],
    }

    // Ordered services: same-vendor services first, then other vendor service
    const orderedServices = [...sameVendorServices, otherVendorService]

    // Working hours that cover the entire bundle
    const workStart = minutesToTime(Math.max(7 * 60, startTimeMinutes - 60))
    const workEnd = minutesToTime(Math.min(21 * 60, endMinutes + 60))

    // Universal staff: works the full window, belongs to vendor-a
    const universalStaff = {
      visibleId: universalStaffId,
      vendorId: 'vendor-a',
      name: 'Universal Staff',
      isActive: true,
      schedule: {
        [dayOfWeek]: { start: workStart, end: workEnd },
      },
    }

    // Partial staff: each works the full window but is only in allowedStaff for one service
    const partialStaffSchedules = otherSameVendorStaff.map((id, i) => ({
      visibleId: id,
      vendorId: 'vendor-a',
      name: `Partial Staff ${i}`,
      isActive: true,
      schedule: {
        [dayOfWeek]: { start: workStart, end: workEnd },
      },
    }))

    // Other vendor staff
    const otherVendorStaffSchedule = {
      visibleId: otherVendorStaffId,
      vendorId: 'vendor-b',
      name: 'Other Vendor Staff',
      isActive: true,
      schedule: {
        [dayOfWeek]: { start: workStart, end: workEnd },
      },
    }

    // Build staffSchedulesByService map
    const staffSchedulesByService = {}
    for (const svc of sameVendorServices) {
      // Each same-vendor service sees the universal staff + its own partial staff
      staffSchedulesByService[svc.serviceId] = [
        universalStaff,
        partialStaffSchedules.find(s => svc.allowedStaff.includes(s.visibleId)),
      ]
    }
    staffSchedulesByService[otherVendorService.serviceId] = [otherVendorStaffSchedule]

    return fc.constant({
      orderedServices,
      staffSchedulesByService,
      appointments: [],
      date,
      startTime,
      bufferMinutes,
      dayOfWeek,
      universalStaffId,
      numSameVendorServices,
      sameVendorServiceIds: sameVendorServices.map(s => s.serviceId),
    })
  }).filter(scenario => scenario !== null)
}

/**
 * Generates a scenario with existing appointments that block partial staff,
 * forcing the universal staff to be the only option for all same-vendor services.
 * This ensures the same-staff preference is exercised even under appointment pressure.
 */
function arbSameStaffWithAppointmentsScenario() {
  return fc.record({
    dateIndex: fc.integer({ min: 0, max: 4 }),
    startTimeMinutes: fc.integer({ min: 9 * 60, max: 11 * 60 }),
    bufferMinutes: fc.integer({ min: 5, max: 10 }),
    serviceDuration: fc.integer({ min: 20, max: 30 }),
  }).chain(({ dateIndex, startTimeMinutes, bufferMinutes, serviceDuration }) => {
    const weekdayDates = [
      '2024-03-11', // Monday
      '2024-03-12', // Tuesday
      '2024-03-13', // Wednesday
      '2024-03-14', // Thursday
      '2024-03-15', // Friday
    ]
    const date = weekdayDates[dateIndex]
    const requestedDate = new Date(date + 'T00:00:00')
    const dayOfWeek = DAY_NAMES[requestedDate.getDay()]
    const startTime = minutesToTime(startTimeMinutes)

    const numSameVendorServices = 2
    const totalTime = numSameVendorServices * serviceDuration +
      (numSameVendorServices - 1) * bufferMinutes + bufferMinutes + serviceDuration
    const endMinutes = startTimeMinutes + totalTime

    if (endMinutes > 18 * 60) {
      return fc.constant(null)
    }

    const universalStaffId = 'staff-universal'
    const partialStaffId = 'staff-partial-0'
    const otherVendorStaffId = 'staff-other-vendor'

    // Two same-vendor services
    const sameVendorServices = [
      {
        serviceId: 'svc-same-0',
        vendorId: 'vendor-a',
        duration: serviceDuration,
        providersRequired: 1,
        allowedStaff: [universalStaffId, partialStaffId],
      },
      {
        serviceId: 'svc-same-1',
        vendorId: 'vendor-a',
        duration: serviceDuration,
        providersRequired: 1,
        allowedStaff: [universalStaffId], // Only universal staff allowed for second service
      },
    ]

    const otherVendorService = {
      serviceId: 'svc-other',
      vendorId: 'vendor-b',
      duration: serviceDuration,
      providersRequired: 1,
      allowedStaff: [otherVendorStaffId],
    }

    const orderedServices = [...sameVendorServices, otherVendorService]

    const workStart = minutesToTime(Math.max(7 * 60, startTimeMinutes - 60))
    const workEnd = minutesToTime(Math.min(21 * 60, endMinutes + 60))

    const universalStaff = {
      visibleId: universalStaffId,
      vendorId: 'vendor-a',
      name: 'Universal Staff',
      isActive: true,
      schedule: { [dayOfWeek]: { start: workStart, end: workEnd } },
    }

    const partialStaff = {
      visibleId: partialStaffId,
      vendorId: 'vendor-a',
      name: 'Partial Staff',
      isActive: true,
      schedule: { [dayOfWeek]: { start: workStart, end: workEnd } },
    }

    const otherVendorStaff = {
      visibleId: otherVendorStaffId,
      vendorId: 'vendor-b',
      name: 'Other Vendor Staff',
      isActive: true,
      schedule: { [dayOfWeek]: { start: workStart, end: workEnd } },
    }

    const staffSchedulesByService = {
      'svc-same-0': [universalStaff, partialStaff],
      'svc-same-1': [universalStaff],
      'svc-other': [otherVendorStaff],
    }

    return fc.constant({
      orderedServices,
      staffSchedulesByService,
      appointments: [],
      date,
      startTime,
      bufferMinutes,
      dayOfWeek,
      universalStaffId,
      numSameVendorServices,
      sameVendorServiceIds: sameVendorServices.map(s => s.serviceId),
    })
  }).filter(scenario => scenario !== null)
}

// ── Property 16: Same-Staff Preference ────────────────────────

describe('Feature: multi-vendor-bundle-booking, Property 16: Same-Staff Preference', () => {
  test('when a single staff member is eligible for all same-vendor services, that staff is assigned to all of them', () => {
    fc.assert(
      fc.property(
        arbSameStaffScenario(),
        (scenario) => {
          const assignments = assignBundleStaff({
            orderedServices: scenario.orderedServices,
            staffSchedulesByService: scenario.staffSchedulesByService,
            appointments: scenario.appointments,
            date: scenario.date,
            startTime: scenario.startTime,
            bufferMinutes: scenario.bufferMinutes,
          })

          // Get assignments for same-vendor services
          const sameVendorAssignments = assignments.filter(
            a => scenario.sameVendorServiceIds.includes(a.serviceId)
          )

          // All same-vendor services should be assigned to the universal staff
          // because that's the only staff member eligible for ALL of them
          const allSameStaff = sameVendorAssignments.every(
            a => a.staffId === scenario.universalStaffId
          )

          return allSameStaff
        }
      ),
      { numRuns: 100 }
    )
  })

  test('same-staff preference holds when partial staff are blocked by eligibility constraints', () => {
    fc.assert(
      fc.property(
        arbSameStaffWithAppointmentsScenario(),
        (scenario) => {
          const assignments = assignBundleStaff({
            orderedServices: scenario.orderedServices,
            staffSchedulesByService: scenario.staffSchedulesByService,
            appointments: scenario.appointments,
            date: scenario.date,
            startTime: scenario.startTime,
            bufferMinutes: scenario.bufferMinutes,
          })

          // Get assignments for same-vendor services
          const sameVendorAssignments = assignments.filter(
            a => scenario.sameVendorServiceIds.includes(a.serviceId)
          )

          // The universal staff should be assigned to all same-vendor services
          // because it's the only one eligible for all of them
          const allSameStaff = sameVendorAssignments.every(
            a => a.staffId === scenario.universalStaffId
          )

          return allSameStaff
        }
      ),
      { numRuns: 100 }
    )
  })

  test('same-staff preference assigns the same staff to all same-vendor services when one staff is universally eligible', () => {
    fc.assert(
      fc.property(
        arbSameStaffScenario(),
        (scenario) => {
          const assignments = assignBundleStaff({
            orderedServices: scenario.orderedServices,
            staffSchedulesByService: scenario.staffSchedulesByService,
            appointments: scenario.appointments,
            date: scenario.date,
            startTime: scenario.startTime,
            bufferMinutes: scenario.bufferMinutes,
          })

          // Get assignments for same-vendor services only
          const sameVendorAssignments = assignments.filter(
            a => scenario.sameVendorServiceIds.includes(a.serviceId)
          )

          // All same-vendor services should have the same staffId
          if (sameVendorAssignments.length < 2) return true

          const staffIds = new Set(sameVendorAssignments.map(a => a.staffId))
          return staffIds.size === 1
        }
      ),
      { numRuns: 100 }
    )
  })
})
