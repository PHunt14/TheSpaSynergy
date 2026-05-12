/**
 * Multi-Vendor Bundle Payment Route Integration Tests
 *
 * Validates the POST /api/payment branch that handles multi-vendor bundle payments
 * (identified by both `bundlePayments` and `bundleId` on the request).
 *
 * Covers Requirements 5.1, 5.6, 5.7:
 * - 5.1: Single charge for the total bundle amount
 * - 5.6: Reject card payment with 400 when any vendor is missing Square credentials
 * - 5.7: Record paymentId and per-appointment paymentAmount on each appointment
 */

import { jest } from '@jest/globals'

// ── Env ──────────────────────────────────────────────────────

process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT = 'sandbox'

// ── Mocks ────────────────────────────────────────────────────

const mockVendorDb = {}
const mockAppointmentDb = {}
const mockServiceDb = {}

const mockVendorGet = jest.fn(async ({ vendorId }) => ({
  data: mockVendorDb[vendorId] || null,
  errors: null,
}))
const mockVendorList = jest.fn(async () => ({
  data: Object.values(mockVendorDb),
  errors: null,
}))
const mockAppointmentList = jest.fn(async ({ filter } = {}) => {
  const all = Object.values(mockAppointmentDb)
  const bundleEq = filter?.bundleId?.eq
  const filtered = bundleEq ? all.filter(a => a.bundleId === bundleEq) : all
  return { data: filtered, errors: null }
})
const mockAppointmentUpdate = jest.fn(async (update) => {
  const existing = mockAppointmentDb[update.appointmentId] || {}
  mockAppointmentDb[update.appointmentId] = { ...existing, ...update }
  return { data: mockAppointmentDb[update.appointmentId], errors: null }
})
const mockServiceGet = jest.fn(async ({ serviceId }) => ({
  data: mockServiceDb[serviceId] || null,
  errors: null,
}))
const mockStaffGet = jest.fn(async () => ({ data: null, errors: null }))
const mockCreatePayment = jest.fn()

jest.unstable_mockModule('square', () => ({
  Client: jest.fn().mockImplementation(() => ({
    paymentsApi: { createPayment: mockCreatePayment },
  })),
  Environment: { Sandbox: 'sandbox', Production: 'production' },
}))

jest.unstable_mockModule('aws-amplify/data', () => ({
  generateClient: jest.fn(() => ({
    models: {
      Vendor: { get: mockVendorGet, list: mockVendorList },
      Appointment: { list: mockAppointmentList, update: mockAppointmentUpdate },
      Service: { get: mockServiceGet },
      StaffSchedule: { get: mockStaffGet },
    },
  })),
}))
jest.unstable_mockModule('aws-amplify', () => ({
  Amplify: { configure: jest.fn() },
}))
jest.unstable_mockModule('../../amplify_outputs.json', () => ({ default: {} }), { virtual: true })

// ── Seeders ──────────────────────────────────────────────────

function seedVendor(v) {
  const vendor = {
    vendorId: v.vendorId,
    name: v.name || v.vendorId,
    isHouse: v.isHouse || false,
    squareAccessToken: v.squareAccessToken || null,
    squareLocationId: v.squareLocationId || null,
    ...v,
  }
  mockVendorDb[vendor.vendorId] = vendor
  return vendor
}

function seedService(s) {
  const service = {
    serviceId: s.serviceId,
    vendorId: s.vendorId,
    price: s.price ?? 0,
    ...s,
  }
  mockServiceDb[service.serviceId] = service
  return service
}

function seedAppointment(a) {
  const appt = {
    appointmentId: a.appointmentId,
    bundleId: a.bundleId,
    serviceId: a.serviceId,
    vendorId: a.vendorId,
    staffId: a.staffId || null,
    status: a.status || 'pending-confirmation',
    ...a,
  }
  mockAppointmentDb[appt.appointmentId] = appt
  return appt
}

function resetDb() {
  Object.keys(mockVendorDb).forEach(k => delete mockVendorDb[k])
  Object.keys(mockAppointmentDb).forEach(k => delete mockAppointmentDb[k])
  Object.keys(mockServiceDb).forEach(k => delete mockServiceDb[k])
}

// ── Tests ────────────────────────────────────────────────────

describe('POST /api/payment (multi-vendor bundle branch)', () => {
  let handler

  beforeAll(async () => {
    handler = await import('../../app/api/payment/route.js')
  })

  beforeEach(() => {
    resetDb()
    jest.clearAllMocks()
  })

  test('processes single charge for the total bundle amount (Req 5.1)', async () => {
    seedVendor({ vendorId: 'vendor-house', isHouse: true, squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE' })
    seedVendor({ vendorId: 'vendor-a', squareAccessToken: 'a-tok', squareLocationId: 'LOC-A' })
    seedVendor({ vendorId: 'vendor-b', squareAccessToken: 'b-tok', squareLocationId: 'LOC-B' })

    seedService({ serviceId: 'svc-1', vendorId: 'vendor-a', price: 100 })
    seedService({ serviceId: 'svc-2', vendorId: 'vendor-b', price: 100 })

    seedAppointment({ appointmentId: 'apt-1', bundleId: 'bundle-xyz', serviceId: 'svc-1', vendorId: 'vendor-a' })
    seedAppointment({ appointmentId: 'apt-2', bundleId: 'bundle-xyz', serviceId: 'svc-2', vendorId: 'vendor-b' })

    mockCreatePayment.mockResolvedValueOnce({
      result: { payment: { id: 'pay-bundle-1', status: 'COMPLETED' } },
    })

    const req = {
      json: async () => ({
        sourceId: 'cnon:ok',
        amount: 200,
        bundleId: 'bundle-xyz',
        bundlePayments: [
          { vendorId: 'vendor-a', amount: 100, isHouseFee: false },
          { vendorId: 'vendor-b', amount: 100, isHouseFee: false },
        ],
      }),
    }

    const res = await handler.POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.paymentId).toBe('pay-bundle-1')
    expect(body.bundleId).toBe('bundle-xyz')

    // Exactly one Square charge for the full amount
    expect(mockCreatePayment).toHaveBeenCalledTimes(1)
    const paymentArg = mockCreatePayment.mock.calls[0][0]
    expect(paymentArg.amountMoney).toEqual({ amount: BigInt(20000), currency: 'USD' })
  })

  test('splits charge across vendors via additionalRecipients (Req 5.2)', async () => {
    seedVendor({ vendorId: 'vendor-house', isHouse: true, squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE' })
    seedVendor({ vendorId: 'vendor-a', squareAccessToken: 'a-tok', squareLocationId: 'LOC-A' })
    seedVendor({ vendorId: 'vendor-b', squareAccessToken: 'b-tok', squareLocationId: 'LOC-B' })

    seedService({ serviceId: 'svc-1', vendorId: 'vendor-a', price: 100 })
    seedService({ serviceId: 'svc-2', vendorId: 'vendor-b', price: 100 })
    seedAppointment({ appointmentId: 'apt-1', bundleId: 'bundle-xyz', serviceId: 'svc-1', vendorId: 'vendor-a' })
    seedAppointment({ appointmentId: 'apt-2', bundleId: 'bundle-xyz', serviceId: 'svc-2', vendorId: 'vendor-b' })

    mockCreatePayment.mockResolvedValueOnce({
      result: { payment: { id: 'pay-bundle-2', status: 'COMPLETED' } },
    })

    const req = {
      json: async () => ({
        sourceId: 'cnon:ok',
        amount: 200,
        bundleId: 'bundle-xyz',
        bundlePayments: [
          { vendorId: 'vendor-a', amount: 100, isHouseFee: false },
          { vendorId: 'vendor-b', amount: 100, isHouseFee: false },
        ],
      }),
    }

    const res = await handler.POST(req)
    expect(res.status).toBe(200)

    const paymentArg = mockCreatePayment.mock.calls[0][0]
    // Primary vendor gets direct funds; the other is listed as an additional recipient
    expect(paymentArg.additionalRecipients).toBeDefined()
    expect(paymentArg.additionalRecipients).toHaveLength(1)
    expect(paymentArg.additionalRecipients[0].locationId).toBeDefined()
    expect(paymentArg.additionalRecipients[0].amountMoney.amount).toBe(BigInt(10000))
  })

  test('records paymentId and per-appointment paymentAmount on each appointment (Req 5.7)', async () => {
    seedVendor({ vendorId: 'vendor-house', isHouse: true, squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE' })
    seedVendor({ vendorId: 'vendor-a', squareAccessToken: 'a-tok', squareLocationId: 'LOC-A' })
    seedVendor({ vendorId: 'vendor-b', squareAccessToken: 'b-tok', squareLocationId: 'LOC-B' })

    seedService({ serviceId: 'svc-1', vendorId: 'vendor-a', price: 150 })
    seedService({ serviceId: 'svc-2', vendorId: 'vendor-b', price: 50 })
    seedAppointment({ appointmentId: 'apt-1', bundleId: 'bundle-xyz', serviceId: 'svc-1', vendorId: 'vendor-a' })
    seedAppointment({ appointmentId: 'apt-2', bundleId: 'bundle-xyz', serviceId: 'svc-2', vendorId: 'vendor-b' })

    mockCreatePayment.mockResolvedValueOnce({
      result: { payment: { id: 'pay-bundle-3', status: 'COMPLETED' } },
    })

    const req = {
      json: async () => ({
        sourceId: 'cnon:ok',
        amount: 200, // subtotal — no discount
        bundleId: 'bundle-xyz',
        bundlePayments: [
          { vendorId: 'vendor-a', amount: 150, isHouseFee: false },
          { vendorId: 'vendor-b', amount: 50, isHouseFee: false },
        ],
      }),
    }

    const res = await handler.POST(req)
    expect(res.status).toBe(200)

    // Both appointments in the bundle should be updated
    expect(mockAppointmentUpdate).toHaveBeenCalledTimes(2)

    const updates = mockAppointmentUpdate.mock.calls.map(c => c[0])
    const apt1 = updates.find(u => u.appointmentId === 'apt-1')
    const apt2 = updates.find(u => u.appointmentId === 'apt-2')

    expect(apt1.paymentId).toBe('pay-bundle-3')
    expect(apt1.paymentStatus).toBe('COMPLETED')
    // apt-1 is proportional: (150/200) * 200 = 150
    expect(apt1.paymentAmount).toBe(150)

    expect(apt2.paymentId).toBe('pay-bundle-3')
    expect(apt2.paymentStatus).toBe('COMPLETED')
    // apt-2 is proportional: (50/200) * 200 = 50
    expect(apt2.paymentAmount).toBe(50)
  })

  test('proportional share is applied when bundle has a discount (Req 5.5, 5.7)', async () => {
    seedVendor({ vendorId: 'vendor-house', isHouse: true, squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE' })
    seedVendor({ vendorId: 'vendor-a', squareAccessToken: 'a-tok', squareLocationId: 'LOC-A' })
    seedVendor({ vendorId: 'vendor-b', squareAccessToken: 'b-tok', squareLocationId: 'LOC-B' })

    seedService({ serviceId: 'svc-1', vendorId: 'vendor-a', price: 100 })
    seedService({ serviceId: 'svc-2', vendorId: 'vendor-b', price: 100 })
    seedAppointment({ appointmentId: 'apt-1', bundleId: 'bundle-xyz', serviceId: 'svc-1', vendorId: 'vendor-a' })
    seedAppointment({ appointmentId: 'apt-2', bundleId: 'bundle-xyz', serviceId: 'svc-2', vendorId: 'vendor-b' })

    mockCreatePayment.mockResolvedValueOnce({
      result: { payment: { id: 'pay-bundle-disc', status: 'COMPLETED' } },
    })

    // Discounted total = 180 (10% off the $200 subtotal)
    const req = {
      json: async () => ({
        sourceId: 'cnon:ok',
        amount: 180,
        bundleId: 'bundle-xyz',
        bundlePayments: [
          { vendorId: 'vendor-a', amount: 90, isHouseFee: false },
          { vendorId: 'vendor-b', amount: 90, isHouseFee: false },
        ],
      }),
    }

    await handler.POST(req)

    const updates = mockAppointmentUpdate.mock.calls.map(c => c[0])
    const apt1 = updates.find(u => u.appointmentId === 'apt-1')
    const apt2 = updates.find(u => u.appointmentId === 'apt-2')
    // Each appointment is half of the $200 subtotal → half of the $180 total = $90
    expect(apt1.paymentAmount).toBe(90)
    expect(apt2.paymentAmount).toBe(90)
  })

  test('returns 400 when a vendor in the bundle is missing Square credentials (Req 5.6)', async () => {
    seedVendor({ vendorId: 'vendor-house', isHouse: true, squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE' })
    seedVendor({ vendorId: 'vendor-a', squareAccessToken: 'a-tok', squareLocationId: 'LOC-A' })
    // vendor-b has NO Square credentials
    seedVendor({ vendorId: 'vendor-b', squareAccessToken: null, squareLocationId: null })

    const req = {
      json: async () => ({
        sourceId: 'cnon:ok',
        amount: 200,
        bundleId: 'bundle-xyz',
        bundlePayments: [
          { vendorId: 'vendor-a', amount: 100, isHouseFee: false },
          { vendorId: 'vendor-b', amount: 100, isHouseFee: false },
        ],
      }),
    }

    const res = await handler.POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/card payment unavailable/i)
    expect(body.vendors).toContain('vendor-b')
    expect(mockCreatePayment).not.toHaveBeenCalled()
    expect(mockAppointmentUpdate).not.toHaveBeenCalled()
  })

  test('returns 400 when a vendor has an access token but no location id (Req 5.6)', async () => {
    seedVendor({ vendorId: 'vendor-house', isHouse: true, squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE' })
    seedVendor({ vendorId: 'vendor-a', squareAccessToken: 'a-tok', squareLocationId: 'LOC-A' })
    // vendor-b has an access token but no location id — cannot be an additionalRecipient
    seedVendor({ vendorId: 'vendor-b', squareAccessToken: 'b-tok', squareLocationId: null })

    const req = {
      json: async () => ({
        sourceId: 'cnon:ok',
        amount: 200,
        bundleId: 'bundle-xyz',
        bundlePayments: [
          { vendorId: 'vendor-a', amount: 100, isHouseFee: false },
          { vendorId: 'vendor-b', amount: 100, isHouseFee: false },
        ],
      }),
    }

    const res = await handler.POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.vendors).toContain('vendor-b')
    expect(mockCreatePayment).not.toHaveBeenCalled()
  })
})
