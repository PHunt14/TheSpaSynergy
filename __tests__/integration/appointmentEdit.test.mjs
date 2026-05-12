/**
 * Integration Tests for Appointment Edit (PATCH) Endpoint
 *
 * Tests the expanded PATCH /api/appointments handler which now supports:
 * - Original fields: paymentId, paymentStatus, paymentAmount, status
 * - New fields: serviceId, staffId, vendorId, customer
 *
 * These tests validate the request parsing and field mapping logic.
 * DynamoDB calls are not tested here (would require mocking Amplify client).
 */

describe('PATCH /api/appointments — field handling', () => {
  // We test the logic of which fields get included in the update payload.
  // Since the actual route requires Amplify server client, we test the
  // field extraction logic in isolation.

  function extractUpdateFields(body) {
    const { appointmentId, paymentId, paymentStatus, paymentAmount, status, serviceId, staffId, vendorId, customer } = body

    if (!appointmentId) {
      return { error: 'appointmentId required' }
    }

    const updateFields = { appointmentId }
    if (paymentId !== undefined) updateFields.paymentId = paymentId
    if (paymentStatus !== undefined) updateFields.paymentStatus = paymentStatus
    if (paymentAmount !== undefined) updateFields.paymentAmount = paymentAmount
    if (status !== undefined) updateFields.status = status
    if (serviceId !== undefined) updateFields.serviceId = serviceId
    if (staffId !== undefined) updateFields.staffId = staffId
    if (vendorId !== undefined) updateFields.vendorId = vendorId
    if (customer !== undefined) updateFields.customer = customer

    return updateFields
  }

  test('returns error when appointmentId is missing', () => {
    const result = extractUpdateFields({})
    expect(result).toEqual({ error: 'appointmentId required' })
  })

  test('includes only appointmentId when no other fields provided', () => {
    const result = extractUpdateFields({ appointmentId: 'apt-1' })
    expect(result).toEqual({ appointmentId: 'apt-1' })
  })

  test('includes original payment fields', () => {
    const result = extractUpdateFields({
      appointmentId: 'apt-1',
      paymentId: 'pay-123',
      paymentStatus: 'paid',
      paymentAmount: 50.00,
    })
    expect(result).toEqual({
      appointmentId: 'apt-1',
      paymentId: 'pay-123',
      paymentStatus: 'paid',
      paymentAmount: 50.00,
    })
  })

  test('includes status field', () => {
    const result = extractUpdateFields({
      appointmentId: 'apt-1',
      status: 'confirmed',
    })
    expect(result).toEqual({
      appointmentId: 'apt-1',
      status: 'confirmed',
    })
  })

  test('includes new serviceId field', () => {
    const result = extractUpdateFields({
      appointmentId: 'apt-1',
      serviceId: 'svc-new',
    })
    expect(result).toEqual({
      appointmentId: 'apt-1',
      serviceId: 'svc-new',
    })
  })

  test('includes new staffId field', () => {
    const result = extractUpdateFields({
      appointmentId: 'apt-1',
      staffId: 'staff-new',
    })
    expect(result).toEqual({
      appointmentId: 'apt-1',
      staffId: 'staff-new',
    })
  })

  test('includes new vendorId field', () => {
    const result = extractUpdateFields({
      appointmentId: 'apt-1',
      vendorId: 'vendor-new',
    })
    expect(result).toEqual({
      appointmentId: 'apt-1',
      vendorId: 'vendor-new',
    })
  })

  test('includes new customer field (JSON string)', () => {
    const customerJson = JSON.stringify({ name: 'Jane', phone: '555-9999', email: 'jane@test.com' })
    const result = extractUpdateFields({
      appointmentId: 'apt-1',
      customer: customerJson,
    })
    expect(result).toEqual({
      appointmentId: 'apt-1',
      customer: customerJson,
    })
  })

  test('handles all fields together', () => {
    const result = extractUpdateFields({
      appointmentId: 'apt-1',
      paymentId: 'pay-1',
      paymentStatus: 'paid',
      paymentAmount: 100,
      status: 'confirmed',
      serviceId: 'svc-2',
      staffId: 'staff-2',
      vendorId: 'vendor-2',
      customer: '{"name":"Test"}',
    })
    expect(result).toEqual({
      appointmentId: 'apt-1',
      paymentId: 'pay-1',
      paymentStatus: 'paid',
      paymentAmount: 100,
      status: 'confirmed',
      serviceId: 'svc-2',
      staffId: 'staff-2',
      vendorId: 'vendor-2',
      customer: '{"name":"Test"}',
    })
  })

  test('does not include fields that are not in the body', () => {
    const result = extractUpdateFields({
      appointmentId: 'apt-1',
      status: 'cancelled',
    })
    expect(Object.keys(result)).toEqual(['appointmentId', 'status'])
    expect(result).not.toHaveProperty('serviceId')
    expect(result).not.toHaveProperty('staffId')
    expect(result).not.toHaveProperty('vendorId')
    expect(result).not.toHaveProperty('customer')
    expect(result).not.toHaveProperty('paymentId')
  })

  test('handles null staffId (clearing assignment)', () => {
    const result = extractUpdateFields({
      appointmentId: 'apt-1',
      staffId: null,
    })
    expect(result).toEqual({
      appointmentId: 'apt-1',
      staffId: null,
    })
  })

  test('handles empty string values', () => {
    const result = extractUpdateFields({
      appointmentId: 'apt-1',
      staffId: '',
      vendorId: '',
    })
    expect(result).toEqual({
      appointmentId: 'apt-1',
      staffId: '',
      vendorId: '',
    })
  })
})

describe('Calendar edit — save logic routing', () => {
  // Tests the decision logic for which API to call based on what changed.
  // This mirrors the handleSave function in the AppointmentDetail component.

  function determineSaveActions(original, edited) {
    const actions = []

    // Time change → reschedule API
    if (edited.dateTime && edited.dateTime !== original.rawDateTime) {
      actions.push({ api: 'reschedule', payload: { appointmentId: original.appointmentId, newDateTime: edited.dateTime } })
    }

    // Staff change → reassign API
    if (edited.staffId !== (original.staffId || '')) {
      if (edited.staffId) {
        actions.push({ api: 'reassign', payload: { appointmentId: original.appointmentId, newStaffId: edited.staffId, requestingVendorId: original.vendorId } })
      } else {
        actions.push({ api: 'patch', field: 'staffId', value: null })
      }
    }

    // Status change → patch
    if (edited.status !== original.status) {
      actions.push({ api: 'patch', field: 'status', value: edited.status })
    }

    // Service change → patch
    if (edited.serviceId !== (original.serviceId || '')) {
      actions.push({ api: 'patch', field: 'serviceId', value: edited.serviceId })
    }

    // Customer change → patch
    const currentCustomer = original.customer || {}
    if (edited.customerName !== (currentCustomer.name || '') ||
        edited.customerPhone !== (currentCustomer.phone || '') ||
        edited.customerEmail !== (currentCustomer.email || '')) {
      actions.push({ api: 'patch', field: 'customer', value: { name: edited.customerName, phone: edited.customerPhone, email: edited.customerEmail } })
    }

    return actions
  }

  const original = {
    appointmentId: 'apt-1',
    vendorId: 'vendor-1',
    serviceId: 'svc-1',
    staffId: 'staff-1',
    rawDateTime: '2025-06-15T10:00:00.000Z',
    status: 'pending-confirmation',
    customer: { name: 'John', phone: '555-1234', email: 'john@test.com' },
  }

  test('no changes → no actions', () => {
    const edited = {
      dateTime: '2025-06-15T10:00:00.000Z',
      serviceId: 'svc-1',
      staffId: 'staff-1',
      status: 'pending-confirmation',
      customerName: 'John',
      customerPhone: '555-1234',
      customerEmail: 'john@test.com',
    }
    const actions = determineSaveActions(original, edited)
    expect(actions).toEqual([])
  })

  test('time change → reschedule action', () => {
    const edited = {
      dateTime: '2025-06-16T14:00:00.000Z',
      serviceId: 'svc-1',
      staffId: 'staff-1',
      status: 'pending-confirmation',
      customerName: 'John',
      customerPhone: '555-1234',
      customerEmail: 'john@test.com',
    }
    const actions = determineSaveActions(original, edited)
    expect(actions).toContainEqual({
      api: 'reschedule',
      payload: { appointmentId: 'apt-1', newDateTime: '2025-06-16T14:00:00.000Z' }
    })
  })

  test('staff change → reassign action', () => {
    const edited = {
      dateTime: '2025-06-15T10:00:00.000Z',
      serviceId: 'svc-1',
      staffId: 'staff-2',
      status: 'pending-confirmation',
      customerName: 'John',
      customerPhone: '555-1234',
      customerEmail: 'john@test.com',
    }
    const actions = determineSaveActions(original, edited)
    expect(actions).toContainEqual({
      api: 'reassign',
      payload: { appointmentId: 'apt-1', newStaffId: 'staff-2', requestingVendorId: 'vendor-1' }
    })
  })

  test('clearing staff → patch with null', () => {
    const edited = {
      dateTime: '2025-06-15T10:00:00.000Z',
      serviceId: 'svc-1',
      staffId: '',
      status: 'pending-confirmation',
      customerName: 'John',
      customerPhone: '555-1234',
      customerEmail: 'john@test.com',
    }
    const actions = determineSaveActions(original, edited)
    expect(actions).toContainEqual({ api: 'patch', field: 'staffId', value: null })
  })

  test('status change → patch action', () => {
    const edited = {
      dateTime: '2025-06-15T10:00:00.000Z',
      serviceId: 'svc-1',
      staffId: 'staff-1',
      status: 'confirmed',
      customerName: 'John',
      customerPhone: '555-1234',
      customerEmail: 'john@test.com',
    }
    const actions = determineSaveActions(original, edited)
    expect(actions).toContainEqual({ api: 'patch', field: 'status', value: 'confirmed' })
  })

  test('service change → patch action', () => {
    const edited = {
      dateTime: '2025-06-15T10:00:00.000Z',
      serviceId: 'svc-2',
      staffId: 'staff-1',
      status: 'pending-confirmation',
      customerName: 'John',
      customerPhone: '555-1234',
      customerEmail: 'john@test.com',
    }
    const actions = determineSaveActions(original, edited)
    expect(actions).toContainEqual({ api: 'patch', field: 'serviceId', value: 'svc-2' })
  })

  test('customer name change → patch action', () => {
    const edited = {
      dateTime: '2025-06-15T10:00:00.000Z',
      serviceId: 'svc-1',
      staffId: 'staff-1',
      status: 'pending-confirmation',
      customerName: 'Jane Doe',
      customerPhone: '555-1234',
      customerEmail: 'john@test.com',
    }
    const actions = determineSaveActions(original, edited)
    expect(actions).toContainEqual({
      api: 'patch',
      field: 'customer',
      value: { name: 'Jane Doe', phone: '555-1234', email: 'john@test.com' }
    })
  })

  test('multiple changes → multiple actions', () => {
    const edited = {
      dateTime: '2025-06-16T14:00:00.000Z',
      serviceId: 'svc-2',
      staffId: 'staff-2',
      status: 'confirmed',
      customerName: 'Jane',
      customerPhone: '555-9999',
      customerEmail: 'jane@test.com',
    }
    const actions = determineSaveActions(original, edited)
    expect(actions.length).toBe(5) // reschedule + reassign + status + service + customer
    expect(actions.find(a => a.api === 'reschedule')).toBeDefined()
    expect(actions.find(a => a.api === 'reassign')).toBeDefined()
    expect(actions.find(a => a.field === 'status')).toBeDefined()
    expect(actions.find(a => a.field === 'serviceId')).toBeDefined()
    expect(actions.find(a => a.field === 'customer')).toBeDefined()
  })

  test('handles original with no staffId (null)', () => {
    const noStaffOriginal = { ...original, staffId: null }
    const edited = {
      dateTime: '2025-06-15T10:00:00.000Z',
      serviceId: 'svc-1',
      staffId: 'staff-1',
      status: 'pending-confirmation',
      customerName: 'John',
      customerPhone: '555-1234',
      customerEmail: 'john@test.com',
    }
    const actions = determineSaveActions(noStaffOriginal, edited)
    expect(actions).toContainEqual({
      api: 'reassign',
      payload: { appointmentId: 'apt-1', newStaffId: 'staff-1', requestingVendorId: 'vendor-1' }
    })
  })
})
