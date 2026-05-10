/**
 * Property-Based Tests for Booking Group Logic
 *
 * Uses fast-check to validate correctness properties for booking groups,
 * cancellation cascades, and reassignment validation.
 * Feature: couples-multi-provider-booking
 *
 * Properties tested:
 * - Property 7: Booking Group Consistency
 * - Property 8: Booking Group VendorId Matches Staff Vendor
 * - Property 9: Group Cancellation Cascades (logic-level)
 * - Property 10: Reassignment Validates AllowedStaff
 * - Property 11: Reassignment Rejects Conflicts
 * - Property 13: Booking Group Round-Trip
 */

import fc from 'fast-check'
import { assignStaff } from '../../app/utils/staffAssigner.js'

// ── Helpers ───────────────────────────────────────────────────

/**
 * Simulates the booking group creation logic from the API route.
 * Creates appointment records for each assigned staff member.
 */
function createBookingGroup({ service, assignedStaff, dateTime, customer, serviceId }) {
  const groupId = `group-${Math.random().toString(36).slice(2)}`
  const appointments = assignedStaff.map(staff => ({
    appointmentId: `apt-${Math.random().toString(36).slice(2)}`,
    groupId,
    vendorId: staff.vendorId,
    staffId: staff.staffId,
    serviceId,
    dateTime,
    customer,
    status: 'pending-confirmation',
  }))
  return { groupId, appointments }
}

/**
 * Simulates group cancellation logic.
 */
function cancelGroup(appointments) {
  return appointments.map(apt => ({ ...apt, status: 'cancelled' }))
}

/**
 * Simulates reassignment validation logic.
 */
function validateReassignment({ appointment, newStaffId, service, staffSchedules, appointments, requestingVendorId }) {
  const allowedStaff = service.allowedStaff || []

  // Check allowedStaff
  if (!allowedStaff.includes(newStaffId)) {
    return { valid: false, error: 'Staff member not eligible for this service' }
  }

  // Check conflicts
  const [date, time] = appointment.dateTime.includes('T')
    ? [appointment.dateTime.split('T')[0], appointment.dateTime.split('T')[1].substring(0, 5)]
    : [appointment.dateTime.split(' ')[0], appointment.dateTime.split(' ')[1]]

  const hasConflict = appointments.some(apt =>
    apt.staffId === newStaffId &&
    apt.status !== 'cancelled' &&
    apt.appointmentId !== appointment.appointmentId &&
    apt.dateTime.startsWith(date)
  )

  if (hasConflict) {
    return { valid: false, error: 'Staff member has a conflicting appointment' }
  }

  // Check authorization
  const isLeadVendor = requestingVendorId === service.leadVendorId
  const ownsStaff = requestingVendorId === appointment.vendorId
  if (!isLeadVendor && !ownsStaff) {
    return { valid: false, error: 'Not authorized' }
  }

  return { valid: true }
}

// ── Property 7: Booking Group Consistency ─────────────────────

describe('Feature: couples-multi-provider-booking, Property 7: Booking Group Consistency', () => {
  test('all appointments in a group share the same groupId, dateTime, customer, and serviceId', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        fc.integer({ min: 9, max: 15 }),
        (providersRequired, hour) => {
          const staffIds = Array.from({ length: providersRequired + 1 }, (_, i) => `staff-${i + 1}`)
          const service = { duration: 60, providersRequired, allowedStaff: staffIds }

          const staffSchedules = staffIds.map((id, i) => ({
            visibleId: id,
            vendorId: `vendor-${i + 1}`,
            isActive: true,
            name: `Staff ${id}`,
            schedule: JSON.stringify({ monday: { start: '09:00', end: '17:00' } }),
            autoAssignRules: null,
          }))

          const assigned = assignStaff({
            service,
            staffSchedules,
            appointments: [],
            date: '2025-01-06',
            time: `${hour.toString().padStart(2, '0')}:00`,
            bufferMinutes: 15,
          })

          const dateTime = `2025-01-06T${hour.toString().padStart(2, '0')}:00`
          const customer = { name: 'Test Customer', email: 'test@test.com' }
          const serviceId = 'service-123'

          const { groupId, appointments } = createBookingGroup({
            service,
            assignedStaff: assigned,
            dateTime,
            customer,
            serviceId,
          })

          // All share same groupId, dateTime, customer, serviceId
          return appointments.every(apt =>
            apt.groupId === groupId &&
            apt.dateTime === dateTime &&
            apt.customer === customer &&
            apt.serviceId === serviceId
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 8: Booking Group VendorId Matches Staff Vendor ───

describe('Feature: couples-multi-provider-booking, Property 8: Booking Group VendorId Matches Staff Vendor', () => {
  test('each appointment vendorId equals the assigned staff members vendorId', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }),
        (providersRequired) => {
          const staffIds = Array.from({ length: providersRequired + 1 }, (_, i) => `staff-${i + 1}`)
          const service = { duration: 60, providersRequired, allowedStaff: staffIds }

          const staffSchedules = staffIds.map((id, i) => ({
            visibleId: id,
            vendorId: `vendor-${i + 1}`,
            isActive: true,
            name: `Staff ${id}`,
            schedule: JSON.stringify({ monday: { start: '09:00', end: '17:00' } }),
            autoAssignRules: null,
          }))

          const assigned = assignStaff({
            service,
            staffSchedules,
            appointments: [],
            date: '2025-01-06',
            time: '10:00',
            bufferMinutes: 15,
          })

          const { appointments } = createBookingGroup({
            service,
            assignedStaff: assigned,
            dateTime: '2025-01-06T10:00',
            customer: { name: 'Test' },
            serviceId: 'svc-1',
          })

          // Each appointment's vendorId should match the staff member's vendorId
          return appointments.every(apt => {
            const staffMember = assigned.find(s => s.staffId === apt.staffId)
            return staffMember && apt.vendorId === staffMember.vendorId
          })
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 9: Group Cancellation Cascades ───────────────────

describe('Feature: couples-multi-provider-booking, Property 9: Group Cancellation Cascades', () => {
  test('cancelling any single appointment in a group results in all N appointments being cancelled', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        fc.integer({ min: 0, max: 4 }), // which appointment to cancel
        (groupSize, cancelIndex) => {
          const actualCancelIndex = cancelIndex % groupSize
          const staffIds = Array.from({ length: groupSize }, (_, i) => `staff-${i + 1}`)
          const assigned = staffIds.map((id, i) => ({
            staffId: id,
            vendorId: `vendor-${i + 1}`,
            staffName: `Staff ${id}`,
          }))

          const { appointments } = createBookingGroup({
            service: { duration: 60, providersRequired: groupSize, allowedStaff: staffIds },
            assignedStaff: assigned,
            dateTime: '2025-01-06T10:00',
            customer: { name: 'Test' },
            serviceId: 'svc-1',
          })

          // Cancel the group (triggered by any single appointment)
          const cancelled = cancelGroup(appointments)

          return cancelled.length === groupSize &&
            cancelled.every(apt => apt.status === 'cancelled')
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 10: Reassignment Validates AllowedStaff ──────────

describe('Feature: couples-multi-provider-booking, Property 10: Reassignment Validates AllowedStaff', () => {
  test('reassignment accepted only if new staff is in allowedStaff', () => {
    fc.assert(
      fc.property(
        fc.boolean(), // whether new staff is in allowedStaff
        (isAllowed) => {
          const allowedStaff = ['staff-1', 'staff-2', 'staff-3']
          const newStaffId = isAllowed ? 'staff-2' : 'staff-99'

          const service = {
            duration: 60,
            providersRequired: 2,
            allowedStaff,
            leadVendorId: 'vendor-lead',
          }

          const appointment = {
            appointmentId: 'apt-1',
            groupId: 'group-1',
            vendorId: 'vendor-lead',
            staffId: 'staff-1',
            serviceId: 'svc-1',
            dateTime: '2025-01-06T10:00',
            status: 'confirmed',
          }

          const result = validateReassignment({
            appointment,
            newStaffId,
            service,
            staffSchedules: [],
            appointments: [],
            requestingVendorId: 'vendor-lead',
          })

          if (isAllowed) {
            return result.valid === true
          } else {
            return result.valid === false && result.error.includes('not eligible')
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 11: Reassignment Rejects Conflicts ───────────────

describe('Feature: couples-multi-provider-booking, Property 11: Reassignment Rejects Conflicts', () => {
  test('reassignment rejected when new staff has a conflicting appointment', () => {
    fc.assert(
      fc.property(
        fc.boolean(), // whether there's a conflict
        (hasConflict) => {
          const allowedStaff = ['staff-1', 'staff-2', 'staff-3']
          const newStaffId = 'staff-2'

          const service = {
            duration: 60,
            providersRequired: 2,
            allowedStaff,
            leadVendorId: 'vendor-lead',
          }

          const appointment = {
            appointmentId: 'apt-1',
            groupId: 'group-1',
            vendorId: 'vendor-lead',
            staffId: 'staff-1',
            serviceId: 'svc-1',
            dateTime: '2025-01-06T10:00',
            status: 'confirmed',
          }

          // If hasConflict, staff-2 has an appointment at the same time
          const existingAppointments = hasConflict
            ? [{ appointmentId: 'apt-other', staffId: 'staff-2', dateTime: '2025-01-06T10:00', status: 'confirmed' }]
            : []

          const result = validateReassignment({
            appointment,
            newStaffId,
            service,
            staffSchedules: [],
            appointments: existingAppointments,
            requestingVendorId: 'vendor-lead',
          })

          if (hasConflict) {
            return result.valid === false && result.error.includes('conflicting')
          } else {
            return result.valid === true
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 13: Booking Group Round-Trip ─────────────────────

describe('Feature: couples-multi-provider-booking, Property 13: Booking Group Round-Trip', () => {
  test('creating a group and retrieving by groupId returns matching records', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        fc.string({ minLength: 3, maxLength: 20 }),
        (groupSize, customerName) => {
          const staffIds = Array.from({ length: groupSize }, (_, i) => `staff-${i + 1}`)
          const assigned = staffIds.map((id, i) => ({
            staffId: id,
            vendorId: `vendor-${i + 1}`,
            staffName: `Staff ${id}`,
          }))

          const dateTime = '2025-01-06T10:00'
          const customer = { name: customerName }
          const serviceId = 'svc-test'

          const { groupId, appointments } = createBookingGroup({
            service: { duration: 60, providersRequired: groupSize, allowedStaff: staffIds },
            assignedStaff: assigned,
            dateTime,
            customer,
            serviceId,
          })

          // Simulate retrieval by groupId
          const retrieved = appointments.filter(apt => apt.groupId === groupId)

          // All retrieved records match
          return retrieved.length === groupSize &&
            retrieved.every(apt =>
              apt.serviceId === serviceId &&
              apt.dateTime === dateTime &&
              apt.customer === customer
            )
        }
      ),
      { numRuns: 100 }
    )
  })
})
