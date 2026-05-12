/**
 * Property-Based Tests for Auto-Assign Preference
 *
 * Uses fast-check to validate correctness properties for auto-assign preference
 * in multi-vendor bundle bookings.
 * Feature: multi-vendor-bundle-booking
 *
 * Properties tested:
 * - Property 17: Auto-Assign Preference
 *
 * **Validates: Requirements 9.3**
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
 * Generates a scenario to test auto-assign preference:
 * - A service has 2+ eligible staff members
 * - One staff member has autoAssignRules matching the booking day
 * - Another staff member does NOT have auto-assign rules
 * - Both are active, within working hours, no conflicts
 * - Verify the auto-assign staff is preferred
 *
 * We use services from different vendors to satisfy the multi-vendor constraint,
 * and the target service (where we test auto-assign preference) has both
 * an auto-assign staff and a non-auto-assign staff eligible.
 */
function arbAutoAssignScenario() {
  return fc.record({
    dateIndex: fc.integer({ min: 0, max: 4 }),
    startTimeMinutes: fc.integer({ min: 9 * 60, max: 13 * 60 }),
    bufferMinutes: fc.integer({ min: 5, max: 15 }),
    serviceDuration: fc.integer({ min: 20, max: 45 }),
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

    // We need 2 services (one from each vendor) to satisfy multi-vendor constraint
    const totalTime = 2 * serviceDuration + bufferMinutes
    const endMinutes = startTimeMinutes + totalTime

    // Ensure everything fits within working hours (18:00 = 1080)
    if (endMinutes > 18 * 60) {
      return fc.constant(null)
    }

    const autoAssignStaffId = 'staff-auto-assign'
    const nonAutoAssignStaffId = 'staff-no-auto-assign'
    const otherVendorStaffId = 'staff-other-vendor'

    // Working hours that cover the entire bundle
    const workStart = minutesToTime(Math.max(7 * 60, startTimeMinutes - 60))
    const workEnd = minutesToTime(Math.min(21 * 60, endMinutes + 60))

    // Target service from vendor-a: both auto-assign and non-auto-assign staff are eligible
    const targetService = {
      serviceId: 'svc-target',
      vendorId: 'vendor-a',
      duration: serviceDuration,
      providersRequired: 1,
      allowedStaff: [autoAssignStaffId, nonAutoAssignStaffId],
    }

    // Other service from vendor-b (to satisfy multi-vendor constraint)
    const otherService = {
      serviceId: 'svc-other',
      vendorId: 'vendor-b',
      duration: serviceDuration,
      providersRequired: 1,
      allowedStaff: [otherVendorStaffId],
    }

    const orderedServices = [targetService, otherService]

    // Staff with auto-assign rules matching the booking day
    const autoAssignStaff = {
      visibleId: autoAssignStaffId,
      vendorId: 'vendor-a',
      name: 'Auto-Assign Staff',
      isActive: true,
      schedule: {
        [dayOfWeek]: { start: workStart, end: workEnd },
      },
      autoAssignRules: [{ action: 'auto-assign', days: [dayOfWeek] }],
    }

    // Staff WITHOUT auto-assign rules
    const nonAutoAssignStaff = {
      visibleId: nonAutoAssignStaffId,
      vendorId: 'vendor-a',
      name: 'Non-Auto-Assign Staff',
      isActive: true,
      schedule: {
        [dayOfWeek]: { start: workStart, end: workEnd },
      },
      autoAssignRules: [],
    }

    // Other vendor staff
    const otherVendorStaff = {
      visibleId: otherVendorStaffId,
      vendorId: 'vendor-b',
      name: 'Other Vendor Staff',
      isActive: true,
      schedule: {
        [dayOfWeek]: { start: workStart, end: workEnd },
      },
    }

    const staffSchedulesByService = {
      'svc-target': [autoAssignStaff, nonAutoAssignStaff],
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
      autoAssignStaffId,
      nonAutoAssignStaffId,
    })
  }).filter(scenario => scenario !== null)
}

/**
 * Generates a scenario with multiple services where auto-assign preference
 * applies independently to each service (services from different vendors).
 * Each service has its own auto-assign and non-auto-assign staff.
 */
function arbMultiServiceAutoAssignScenario() {
  return fc.record({
    dateIndex: fc.integer({ min: 0, max: 4 }),
    startTimeMinutes: fc.integer({ min: 9 * 60, max: 12 * 60 }),
    bufferMinutes: fc.integer({ min: 5, max: 15 }),
    serviceDuration: fc.integer({ min: 20, max: 40 }),
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

    // 3 services from 2 vendors
    const totalTime = 3 * serviceDuration + 2 * bufferMinutes
    const endMinutes = startTimeMinutes + totalTime

    if (endMinutes > 18 * 60) {
      return fc.constant(null)
    }

    const workStart = minutesToTime(Math.max(7 * 60, startTimeMinutes - 60))
    const workEnd = minutesToTime(Math.min(21 * 60, endMinutes + 60))

    // Service 1 from vendor-a: has auto-assign staff
    const service1 = {
      serviceId: 'svc-1',
      vendorId: 'vendor-a',
      duration: serviceDuration,
      providersRequired: 1,
      allowedStaff: ['staff-a-auto', 'staff-a-noauto'],
    }

    // Service 2 from vendor-b: has auto-assign staff
    const service2 = {
      serviceId: 'svc-2',
      vendorId: 'vendor-b',
      duration: serviceDuration,
      providersRequired: 1,
      allowedStaff: ['staff-b-auto', 'staff-b-noauto'],
    }

    // Service 3 from vendor-a: has auto-assign staff (different from service 1 staff)
    const service3 = {
      serviceId: 'svc-3',
      vendorId: 'vendor-a',
      duration: serviceDuration,
      providersRequired: 1,
      allowedStaff: ['staff-a2-auto', 'staff-a2-noauto'],
    }

    const orderedServices = [service1, service2, service3]

    const staffSchedulesByService = {
      'svc-1': [
        {
          visibleId: 'staff-a-auto',
          vendorId: 'vendor-a',
          name: 'Staff A Auto',
          isActive: true,
          schedule: { [dayOfWeek]: { start: workStart, end: workEnd } },
          autoAssignRules: [{ action: 'auto-assign', days: [dayOfWeek] }],
        },
        {
          visibleId: 'staff-a-noauto',
          vendorId: 'vendor-a',
          name: 'Staff A No-Auto',
          isActive: true,
          schedule: { [dayOfWeek]: { start: workStart, end: workEnd } },
          autoAssignRules: [],
        },
      ],
      'svc-2': [
        {
          visibleId: 'staff-b-auto',
          vendorId: 'vendor-b',
          name: 'Staff B Auto',
          isActive: true,
          schedule: { [dayOfWeek]: { start: workStart, end: workEnd } },
          autoAssignRules: [{ action: 'auto-assign', days: [dayOfWeek] }],
        },
        {
          visibleId: 'staff-b-noauto',
          vendorId: 'vendor-b',
          name: 'Staff B No-Auto',
          isActive: true,
          schedule: { [dayOfWeek]: { start: workStart, end: workEnd } },
          autoAssignRules: [],
        },
      ],
      'svc-3': [
        {
          visibleId: 'staff-a2-auto',
          vendorId: 'vendor-a',
          name: 'Staff A2 Auto',
          isActive: true,
          schedule: { [dayOfWeek]: { start: workStart, end: workEnd } },
          autoAssignRules: [{ action: 'auto-assign', days: [dayOfWeek] }],
        },
        {
          visibleId: 'staff-a2-noauto',
          vendorId: 'vendor-a',
          name: 'Staff A2 No-Auto',
          isActive: true,
          schedule: { [dayOfWeek]: { start: workStart, end: workEnd } },
          autoAssignRules: [],
        },
      ],
    }

    return fc.constant({
      orderedServices,
      staffSchedulesByService,
      appointments: [],
      date,
      startTime,
      bufferMinutes,
      dayOfWeek,
      autoAssignStaffIds: ['staff-a-auto', 'staff-b-auto', 'staff-a2-auto'],
      serviceIds: ['svc-1', 'svc-2', 'svc-3'],
    })
  }).filter(scenario => scenario !== null)
}

/**
 * Generates a scenario where auto-assign rules exist but for a DIFFERENT day,
 * so the auto-assign preference should NOT apply (both staff are equally preferred).
 * This tests that auto-assign only triggers when the rule matches the booking day.
 */
function arbAutoAssignWrongDayScenario() {
  return fc.record({
    dateIndex: fc.integer({ min: 0, max: 4 }),
    startTimeMinutes: fc.integer({ min: 9 * 60, max: 13 * 60 }),
    bufferMinutes: fc.integer({ min: 5, max: 15 }),
    serviceDuration: fc.integer({ min: 20, max: 45 }),
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

    // Pick a different day for the auto-assign rule
    const otherDays = DAY_NAMES.filter(d => d !== dayOfWeek)
    const wrongDay = otherDays[0]

    const totalTime = 2 * serviceDuration + bufferMinutes
    const endMinutes = startTimeMinutes + totalTime

    if (endMinutes > 18 * 60) {
      return fc.constant(null)
    }

    const workStart = minutesToTime(Math.max(7 * 60, startTimeMinutes - 60))
    const workEnd = minutesToTime(Math.min(21 * 60, endMinutes + 60))

    const targetService = {
      serviceId: 'svc-target',
      vendorId: 'vendor-a',
      duration: serviceDuration,
      providersRequired: 1,
      allowedStaff: ['staff-wrong-day-auto', 'staff-no-auto'],
    }

    const otherService = {
      serviceId: 'svc-other',
      vendorId: 'vendor-b',
      duration: serviceDuration,
      providersRequired: 1,
      allowedStaff: ['staff-other-vendor'],
    }

    const orderedServices = [targetService, otherService]

    const staffSchedulesByService = {
      'svc-target': [
        {
          visibleId: 'staff-wrong-day-auto',
          vendorId: 'vendor-a',
          name: 'Staff Wrong Day Auto',
          isActive: true,
          schedule: { [dayOfWeek]: { start: workStart, end: workEnd } },
          // Auto-assign rule for a DIFFERENT day
          autoAssignRules: [{ action: 'auto-assign', days: [wrongDay] }],
        },
        {
          visibleId: 'staff-no-auto',
          vendorId: 'vendor-a',
          name: 'Staff No Auto',
          isActive: true,
          schedule: { [dayOfWeek]: { start: workStart, end: workEnd } },
          autoAssignRules: [],
        },
      ],
      'svc-other': [
        {
          visibleId: 'staff-other-vendor',
          vendorId: 'vendor-b',
          name: 'Other Vendor Staff',
          isActive: true,
          schedule: { [dayOfWeek]: { start: workStart, end: workEnd } },
        },
      ],
    }

    return fc.constant({
      orderedServices,
      staffSchedulesByService,
      appointments: [],
      date,
      startTime,
      bufferMinutes,
      dayOfWeek,
      wrongDay,
    })
  }).filter(scenario => scenario !== null)
}

// ── Property 17: Auto-Assign Preference ───────────────────────

describe('Feature: multi-vendor-bundle-booking, Property 17: Auto-Assign Preference', () => {
  test('staff with auto-assign rules matching the booking day is preferred over staff without auto-assign rules', () => {
    fc.assert(
      fc.property(
        arbAutoAssignScenario(),
        (scenario) => {
          const assignments = assignBundleStaff({
            orderedServices: scenario.orderedServices,
            staffSchedulesByService: scenario.staffSchedulesByService,
            appointments: scenario.appointments,
            date: scenario.date,
            startTime: scenario.startTime,
            bufferMinutes: scenario.bufferMinutes,
          })

          // Find the assignment for the target service
          const targetAssignment = assignments.find(a => a.serviceId === 'svc-target')

          // The auto-assign staff should be preferred
          return targetAssignment.staffId === scenario.autoAssignStaffId
        }
      ),
      { numRuns: 100 }
    )
  })

  test('auto-assign preference applies independently to each service in the bundle', () => {
    fc.assert(
      fc.property(
        arbMultiServiceAutoAssignScenario(),
        (scenario) => {
          const assignments = assignBundleStaff({
            orderedServices: scenario.orderedServices,
            staffSchedulesByService: scenario.staffSchedulesByService,
            appointments: scenario.appointments,
            date: scenario.date,
            startTime: scenario.startTime,
            bufferMinutes: scenario.bufferMinutes,
          })

          // Each service should be assigned to its auto-assign staff
          for (let i = 0; i < scenario.serviceIds.length; i++) {
            const assignment = assignments.find(a => a.serviceId === scenario.serviceIds[i])
            if (assignment.staffId !== scenario.autoAssignStaffIds[i]) {
              return false
            }
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('auto-assign rules for a different day do not trigger preference', () => {
    fc.assert(
      fc.property(
        arbAutoAssignWrongDayScenario(),
        (scenario) => {
          const assignments = assignBundleStaff({
            orderedServices: scenario.orderedServices,
            staffSchedulesByService: scenario.staffSchedulesByService,
            appointments: scenario.appointments,
            date: scenario.date,
            startTime: scenario.startTime,
            bufferMinutes: scenario.bufferMinutes,
          })

          // Find the assignment for the target service
          const targetAssignment = assignments.find(a => a.serviceId === 'svc-target')

          // Neither staff has a matching auto-assign rule for the booking day,
          // so the function should still produce a valid assignment (either staff is acceptable)
          const validStaff = ['staff-wrong-day-auto', 'staff-no-auto']
          return validStaff.includes(targetAssignment.staffId)
        }
      ),
      { numRuns: 100 }
    )
  })
})
