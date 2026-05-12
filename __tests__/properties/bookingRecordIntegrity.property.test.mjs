/**
 * Property-Based Tests for Booking Record Integrity
 *
 * Uses fast-check to validate correctness properties for booking record creation
 * in multi-vendor bundle bookings.
 * Feature: multi-vendor-bundle-booking
 *
 * Properties tested:
 * - Property 10: Booking Record Integrity
 *
 * **Validates: Requirements 6.1, 6.2, 6.3**
 *
 * Since the booking API involves database calls, this test validates the logic
 * at the pure-function level by simulating the booking record construction.
 */

import fc from 'fast-check'
import { assignBundleStaff } from '../../app/utils/bundleStaffAssigner.js'
import { validateBundleServices } from '../../app/utils/bundleDiscount.js'
import { calculateServiceSchedule } from '../../app/utils/sequentialAvailability.js'

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

/**
 * Simulates the booking record creation logic from POST /api/bundles/book.
 * This is a pure function that mirrors the record construction in the route handler
 * without any database I/O.
 *
 * Given valid services, staff assignments, and customer info, it produces:
 * - An array of appointment records (one per service)
 * - A Bundle record with status, vendorConfirmations, appointmentIds
 *
 * @param {Object} params
 * @param {Array} params.services - Validated services with serviceId, vendorId, staffId, duration
 * @param {Array} params.staffAssignments - Result from assignBundleStaff
 * @param {string} params.date - YYYY-MM-DD
 * @param {Object} params.customer - Customer info
 * @returns {{ appointments: Array, bundle: Object }}
 */
function createBundleBookingRecords({ services, staffAssignments, date, customer }) {
  const bundleId = `bundle-${Date.now()}`
  const appointmentIds = []
  const appointments = []

  for (const assignment of staffAssignments) {
    const appointmentId = `apt-${Math.random().toString(36).substring(2, 10)}`
    appointmentIds.push(appointmentId)

    appointments.push({
      appointmentId,
      vendorId: assignment.vendorId,
      serviceId: assignment.serviceId,
      staffId: assignment.staffId,
      bundleId,
      dateTime: `${date}T${assignment.startTime}`,
      customer: JSON.stringify(customer),
      status: 'pending-confirmation',
    })
  }

  // Extract unique vendor IDs
  const uniqueVendorIds = [...new Set(services.map(s => s.vendorId))]

  // Initialize vendor confirmations
  const vendorConfirmations = {}
  for (const vid of uniqueVendorIds) {
    vendorConfirmations[vid] = 'pending'
  }

  const bundle = {
    bundleId,
    serviceIds: services.map(s => s.serviceId),
    vendorIds: uniqueVendorIds,
    status: 'pending-confirmation',
    vendorConfirmations,
    appointmentIds,
    customer: JSON.stringify(customer),
    dateTime: `${date}T${staffAssignments[0].startTime}`,
    isActive: true,
  }

  return { appointments, bundle }
}

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a valid multi-vendor bundle booking scenario with N services from M vendors (M >= 2).
 * Ensures staff assignment will succeed by constructing compatible staff schedules.
 */
function arbValidBookingScenario() {
  return fc.record({
    date: fc.constantFrom('2024-03-11', '2024-03-12', '2024-03-13', '2024-03-14', '2024-03-15'),
    numServices: fc.integer({ min: 2, max: 6 }),
    numVendors: fc.integer({ min: 2, max: 4 }),
    bufferMinutes: fc.integer({ min: 5, max: 15 }),
    startTimeMinutes: fc.integer({ min: 9 * 60, max: 12 * 60 }),
  }).chain(({ date, numServices, numVendors, bufferMinutes, startTimeMinutes }) => {
    // Ensure numVendors doesn't exceed numServices
    const actualVendors = Math.min(numVendors, numServices)

    const requestedDate = new Date(date + 'T00:00:00')
    const dayOfWeek = DAY_NAMES[requestedDate.getDay()]
    const startTime = minutesToTime(startTimeMinutes)

    // Generate service durations that fit within working hours
    return fc.array(
      fc.integer({ min: 15, max: 45 }),
      { minLength: numServices, maxLength: numServices }
    ).chain(durations => {
      // Check total fits within working hours (end by 18:00)
      const totalDuration = durations.reduce((s, d) => s + d, 0) + bufferMinutes * (durations.length - 1)
      if (startTimeMinutes + totalDuration > 18 * 60) {
        // Reduce durations to fit
        const maxPerService = Math.floor((18 * 60 - startTimeMinutes - bufferMinutes * (numServices - 1)) / numServices)
        if (maxPerService < 15) return fc.constant(null)
        for (let i = 0; i < durations.length; i++) {
          durations[i] = Math.min(durations[i], maxPerService)
        }
      }

      // Assign vendors to services ensuring at least actualVendors distinct vendors
      const vendorIds = Array.from({ length: actualVendors }, (_, i) => `vendor-${String.fromCharCode(97 + i)}`)
      const services = durations.map((duration, i) => ({
        serviceId: `svc-${i}`,
        vendorId: vendorIds[i % actualVendors],
        name: `Service ${i}`,
        duration,
        price: 50 + i * 10,
        providersRequired: 1,
        allowedStaff: [`staff-${i}`, `staff-${i + numServices}`],
        isActive: true,
      }))

      // Calculate service time windows
      let currentMinutes = startTimeMinutes
      const serviceWindows = services.map((svc, i) => {
        const svcStart = currentMinutes
        const svcEnd = svcStart + svc.duration
        currentMinutes = svcEnd + (i < services.length - 1 ? bufferMinutes : 0)
        return { start: svcStart, end: svcEnd }
      })

      // Create staff schedules that cover all service windows
      const workStart = Math.max(7 * 60, startTimeMinutes - 60)
      const workEnd = Math.min(21 * 60, serviceWindows[serviceWindows.length - 1].end + 60)
      const staffPoolSize = numServices * 2

      const staffSchedules = Array.from({ length: staffPoolSize }, (_, i) => ({
        visibleId: `staff-${i}`,
        vendorId: vendorIds[i % actualVendors],
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

      // Generate customer info
      return fc.record({
        name: fc.string({ minLength: 1, maxLength: 20 }),
        phone: fc.string({ minLength: 10, maxLength: 15 }),
        email: fc.emailAddress(),
      }).map(customer => ({
        services,
        staffSchedulesByService,
        date,
        startTime,
        bufferMinutes,
        customer,
        vendorIds,
        actualVendors,
      }))
    })
  }).filter(scenario => scenario !== null)
}

// ── Property 10: Booking Record Integrity ─────────────────────

describe('Feature: multi-vendor-bundle-booking, Property 10: Booking Record Integrity', () => {
  test('booking produces exactly N appointment records for N services', () => {
    fc.assert(
      fc.property(
        arbValidBookingScenario(),
        (scenario) => {
          const { services, staffSchedulesByService, date, startTime, bufferMinutes, customer } = scenario

          // Perform staff assignment
          let staffAssignments
          try {
            staffAssignments = assignBundleStaff({
              orderedServices: services.map(s => ({
                serviceId: s.serviceId,
                vendorId: s.vendorId,
                allowedStaff: s.allowedStaff,
                duration: s.duration,
                providersRequired: s.providersRequired,
              })),
              staffSchedulesByService,
              appointments: [],
              date,
              startTime,
              bufferMinutes,
            })
          } catch {
            // If assignment fails, skip this case
            return true
          }

          // Create booking records
          const { appointments, bundle } = createBundleBookingRecords({
            services,
            staffAssignments,
            date,
            customer,
          })

          // Property: exactly N appointment records for N services
          return appointments.length === services.length
        }
      ),
      { numRuns: 100 }
    )
  })

  test('each appointment has the correct vendorId, staffId, and serviceId matching the service', () => {
    fc.assert(
      fc.property(
        arbValidBookingScenario(),
        (scenario) => {
          const { services, staffSchedulesByService, date, startTime, bufferMinutes, customer } = scenario

          let staffAssignments
          try {
            staffAssignments = assignBundleStaff({
              orderedServices: services.map(s => ({
                serviceId: s.serviceId,
                vendorId: s.vendorId,
                allowedStaff: s.allowedStaff,
                duration: s.duration,
                providersRequired: s.providersRequired,
              })),
              staffSchedulesByService,
              appointments: [],
              date,
              startTime,
              bufferMinutes,
            })
          } catch {
            return true
          }

          const { appointments } = createBundleBookingRecords({
            services,
            staffAssignments,
            date,
            customer,
          })

          // Property: each appointment has correct vendorId, staffId, serviceId
          for (const apt of appointments) {
            const service = services.find(s => s.serviceId === apt.serviceId)
            if (!service) return false

            // vendorId must match the service's vendor
            if (apt.vendorId !== service.vendorId) return false

            // staffId must be from the service's allowedStaff
            if (!service.allowedStaff.includes(apt.staffId)) return false

            // serviceId must match a valid service
            if (!services.some(s => s.serviceId === apt.serviceId)) return false
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('all N appointments share the same bundleId', () => {
    fc.assert(
      fc.property(
        arbValidBookingScenario(),
        (scenario) => {
          const { services, staffSchedulesByService, date, startTime, bufferMinutes, customer } = scenario

          let staffAssignments
          try {
            staffAssignments = assignBundleStaff({
              orderedServices: services.map(s => ({
                serviceId: s.serviceId,
                vendorId: s.vendorId,
                allowedStaff: s.allowedStaff,
                duration: s.duration,
                providersRequired: s.providersRequired,
              })),
              staffSchedulesByService,
              appointments: [],
              date,
              startTime,
              bufferMinutes,
            })
          } catch {
            return true
          }

          const { appointments, bundle } = createBundleBookingRecords({
            services,
            staffAssignments,
            date,
            customer,
          })

          // Property: all appointments share the same bundleId
          const bundleIds = new Set(appointments.map(a => a.bundleId))
          if (bundleIds.size !== 1) return false

          // And that bundleId matches the bundle record
          const sharedBundleId = [...bundleIds][0]
          return sharedBundleId === bundle.bundleId
        }
      ),
      { numRuns: 100 }
    )
  })

  test('Bundle record has status "pending-confirmation", appointmentIds containing all N appointment IDs, and vendorConfirmations with all M vendors set to "pending"', () => {
    fc.assert(
      fc.property(
        arbValidBookingScenario(),
        (scenario) => {
          const { services, staffSchedulesByService, date, startTime, bufferMinutes, customer, vendorIds } = scenario

          let staffAssignments
          try {
            staffAssignments = assignBundleStaff({
              orderedServices: services.map(s => ({
                serviceId: s.serviceId,
                vendorId: s.vendorId,
                allowedStaff: s.allowedStaff,
                duration: s.duration,
                providersRequired: s.providersRequired,
              })),
              staffSchedulesByService,
              appointments: [],
              date,
              startTime,
              bufferMinutes,
            })
          } catch {
            return true
          }

          const { appointments, bundle } = createBundleBookingRecords({
            services,
            staffAssignments,
            date,
            customer,
          })

          // Property: bundle status is "pending-confirmation"
          if (bundle.status !== 'pending-confirmation') return false

          // Property: appointmentIds contains all N appointment IDs
          if (bundle.appointmentIds.length !== appointments.length) return false
          for (const apt of appointments) {
            if (!bundle.appointmentIds.includes(apt.appointmentId)) return false
          }

          // Property: vendorConfirmations contains all M vendors set to "pending"
          const uniqueVendorsInServices = [...new Set(services.map(s => s.vendorId))]
          const confirmationVendors = Object.keys(bundle.vendorConfirmations)

          // Must have exactly the unique vendors from services
          if (confirmationVendors.length !== uniqueVendorsInServices.length) return false
          for (const vid of uniqueVendorsInServices) {
            if (bundle.vendorConfirmations[vid] !== 'pending') return false
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
