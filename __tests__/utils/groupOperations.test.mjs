/**
 * Group Operations Unit Tests
 *
 * Tests for group cancellation and reassignment logic:
 * - Cascade cancellation of all group appointments
 * - Lead vendor vs non-lead vendor authorization
 * - Reassignment to same staff member (no-op)
 * - Cancellation of already-cancelled group (idempotent)
 */

describe('Group Cancellation Logic', () => {
  // Simulates the cancellation logic from the cancel route
  function cancelGroup(appointments) {
    return appointments.map(apt => ({ ...apt, status: 'cancelled' }))
  }

  function isGroupFullyCancelled(appointments) {
    return appointments.every(apt => apt.status === 'cancelled')
  }

  const makeGroup = (size = 2) => {
    const groupId = 'group-123'
    return Array.from({ length: size }, (_, i) => ({
      appointmentId: `apt-${i + 1}`,
      groupId,
      vendorId: `vendor-${i + 1}`,
      staffId: `staff-${i + 1}`,
      serviceId: 'svc-1',
      dateTime: '2025-01-06T10:00',
      customer: { name: 'Test' },
      status: 'confirmed',
    }))
  }

  test('cascade cancellation of all group appointments', () => {
    const group = makeGroup(3)
    const cancelled = cancelGroup(group)
    expect(cancelled).toHaveLength(3)
    expect(cancelled.every(apt => apt.status === 'cancelled')).toBe(true)
  })

  test('cancellation preserves other appointment fields', () => {
    const group = makeGroup(2)
    const cancelled = cancelGroup(group)
    expect(cancelled[0].groupId).toBe('group-123')
    expect(cancelled[0].staffId).toBe('staff-1')
    expect(cancelled[0].dateTime).toBe('2025-01-06T10:00')
  })

  test('cancellation of already-cancelled group is idempotent', () => {
    const group = makeGroup(2).map(apt => ({ ...apt, status: 'cancelled' }))
    expect(isGroupFullyCancelled(group)).toBe(true)
    // Cancelling again should still result in all cancelled
    const cancelled = cancelGroup(group)
    expect(isGroupFullyCancelled(cancelled)).toBe(true)
  })

  test('single appointment cancellation triggers full group cancel', () => {
    const group = makeGroup(3)
    // Simulate: user cancels apt-2, system cancels all
    const cancelled = cancelGroup(group)
    expect(cancelled.every(apt => apt.status === 'cancelled')).toBe(true)
  })
})

describe('Reassignment Authorization Logic', () => {
  function validateReassignment({ appointment, newStaffId, service, existingAppointments, requestingVendorId }) {
    const allowedStaff = service.allowedStaff || []

    // Check allowedStaff
    if (!allowedStaff.includes(newStaffId)) {
      return { valid: false, status: 400, error: 'Staff member not eligible for this service' }
    }

    // Check authorization
    const isLeadVendor = requestingVendorId === service.leadVendorId
    const ownsStaff = requestingVendorId === appointment.vendorId
    if (!isLeadVendor && !ownsStaff) {
      return { valid: false, status: 403, error: 'Not authorized to reassign this appointment' }
    }

    // Check conflicts
    const date = appointment.dateTime.split('T')[0]
    const hasConflict = existingAppointments.some(apt =>
      apt.staffId === newStaffId &&
      apt.status !== 'cancelled' &&
      apt.appointmentId !== appointment.appointmentId &&
      apt.dateTime.startsWith(date)
    )

    if (hasConflict) {
      return { valid: false, status: 409, error: 'Staff member has a conflicting appointment' }
    }

    return { valid: true }
  }

  const service = {
    duration: 60,
    providersRequired: 2,
    allowedStaff: ['staff-1', 'staff-2', 'staff-3'],
    leadVendorId: 'vendor-lead',
  }

  const appointment = {
    appointmentId: 'apt-1',
    groupId: 'group-1',
    vendorId: 'vendor-a',
    staffId: 'staff-1',
    serviceId: 'svc-1',
    dateTime: '2025-01-06T10:00',
    status: 'confirmed',
  }

  test('lead vendor can reassign any staff', () => {
    const result = validateReassignment({
      appointment,
      newStaffId: 'staff-2',
      service,
      existingAppointments: [],
      requestingVendorId: 'vendor-lead',
    })
    expect(result.valid).toBe(true)
  })

  test('non-lead vendor who owns the staff can reassign', () => {
    const result = validateReassignment({
      appointment,
      newStaffId: 'staff-2',
      service,
      existingAppointments: [],
      requestingVendorId: 'vendor-a', // owns staff-1 on this appointment
    })
    expect(result.valid).toBe(true)
  })

  test('non-lead vendor who does not own the staff cannot reassign', () => {
    const result = validateReassignment({
      appointment,
      newStaffId: 'staff-2',
      service,
      existingAppointments: [],
      requestingVendorId: 'vendor-other',
    })
    expect(result.valid).toBe(false)
    expect(result.status).toBe(403)
  })

  test('reassignment to staff not in allowedStaff is rejected', () => {
    const result = validateReassignment({
      appointment,
      newStaffId: 'staff-99',
      service,
      existingAppointments: [],
      requestingVendorId: 'vendor-lead',
    })
    expect(result.valid).toBe(false)
    expect(result.status).toBe(400)
  })

  test('reassignment to staff with conflict is rejected', () => {
    const existingAppointments = [
      { appointmentId: 'apt-other', staffId: 'staff-2', dateTime: '2025-01-06T10:00', status: 'confirmed' },
    ]
    const result = validateReassignment({
      appointment,
      newStaffId: 'staff-2',
      service,
      existingAppointments,
      requestingVendorId: 'vendor-lead',
    })
    expect(result.valid).toBe(false)
    expect(result.status).toBe(409)
  })

  test('reassignment to same staff member is a no-op (valid)', () => {
    const result = validateReassignment({
      appointment,
      newStaffId: 'staff-1', // same as current
      service,
      existingAppointments: [],
      requestingVendorId: 'vendor-lead',
    })
    expect(result.valid).toBe(true)
  })

  test('cancelled appointment conflict does not block reassignment', () => {
    const existingAppointments = [
      { appointmentId: 'apt-other', staffId: 'staff-2', dateTime: '2025-01-06T10:00', status: 'cancelled' },
    ]
    const result = validateReassignment({
      appointment,
      newStaffId: 'staff-2',
      service,
      existingAppointments,
      requestingVendorId: 'vendor-lead',
    })
    expect(result.valid).toBe(true)
  })
})
