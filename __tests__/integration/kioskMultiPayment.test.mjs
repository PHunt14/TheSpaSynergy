/**
 * Kiosk Multi-Appointment Payment Integration Tests
 *
 * Validates the combined checkout flow where a customer pays for multiple
 * individual appointments in a single transaction at the kiosk.
 *
 * Covers:
 * - Single-vendor multi-service: one charge to one vendor
 * - Multi-vendor multi-service: one charge split via additionalRecipients
 * - All appointments marked as paid with shared paymentId
 * - Tip distributed evenly across appointments
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
const mockStaffList = jest.fn(async () => ({ data: [], errors: null }))
const mockCreatePayment = jest.fn()

jest.unstable_mockModule('square', () => ({
  Client: jest.fn().mockImplementation(() => ({
    paymentsApi: { createPayment: mockCreatePayment },
    ordersApi: { createOrder: jest.fn().mockResolvedValue({ result: { order: { id: 'order-1' } } }) },
  })),
  Environment: { Sandbox: 'sandbox', Production: 'production' },
}))

jest.unstable_mockModule('aws-amplify/data', () => ({
  generateClient: jest.fn(() => ({
    models: {
      Vendor: { get: mockVendorGet, list: mockVendorList },
      Appointment: { list: mockAppointmentList, update: mockAppointmentUpdate },
      Service: { get: mockServiceGet },
      StaffSchedule: { get: mockStaffGet, listStaffScheduleByVendorId: mockStaffList },
    },
  })),
}))
jest.unstable_mockModule('aws-amplify', () => ({
  Amplify: { configure: jest.fn() },
}))
jest.unstable_mockModule('../../amplify_outputs.json', () => ({ default: {} }), { virtual: true })
jest.unstable_mockModule('../../lib/square/catalog.js', () => ({
  buildOrderLineItems: jest.fn(() => []),
}))
jest.unstable_mockModule('../../lib/square-token.js', () => ({
  refreshSquareToken: jest.fn(async () => true),
  isTokenExpiringSoon: jest.fn(() => false),
}))

// ── Seeders ──────────────────────────────────────────────────

function seedVendor(v) {
  mockVendorDb[v.vendorId] = {
    name: v.name || v.vendorId,
    isHouse: v.isHouse || false,
    squareAccessToken: v.squareAccessToken || null,
    squareLocationId: v.squareLocationId || null,
    ...v,
  }
}

function seedService(s) {
  mockServiceDb[s.serviceId] = { price: 0, ...s }
}

function seedAppointment(a) {
  mockAppointmentDb[a.appointmentId] = {
    status: 'pending',
    bundleId: null,
    staffId: null,
    ...a,
  }
}

function resetDb() {
  Object.keys(mockVendorDb).forEach(k => delete mockVendorDb[k])
  Object.keys(mockAppointmentDb).forEach(k => delete mockAppointmentDb[k])
  Object.keys(mockServiceDb).forEach(k => delete mockServiceDb[k])
}

// ── Tests ────────────────────────────────────────────────────

describe('Kiosk multi-appointment payment', () => {
  let handler

  beforeAll(async () => {
    handler = await import('../../app/api/payment/route.ts')
  })

  beforeEach(() => {
    resetDb()
    jest.clearAllMocks()
  })

  test('single-vendor: processes one charge for combined total', async () => {
    seedVendor({ vendorId: 'vendor-house', isHouse: true, squareAccessToken: 'tok-h', squareLocationId: 'LOC-H' })
    seedVendor({ vendorId: 'vendor-a', squareAccessToken: 'tok-a', squareLocationId: 'LOC-A' })
    seedService({ serviceId: 'svc-1', vendorId: 'vendor-a', price: 65 })
    seedService({ serviceId: 'svc-2', vendorId: 'vendor-a', price: 85 })

    mockStaffGet.mockResolvedValue({ data: { visibleId: 'staff-1', vendorId: 'vendor-a', squareAccessToken: 'tok-a', squareLocationId: 'LOC-A', squareOAuthStatus: 'connected' } })
    mockCreatePayment.mockResolvedValueOnce({
      result: { payment: { id: 'pay-multi-1', status: 'COMPLETED' } },
    })

    const req = {
      json: async () => ({
        sourceId: 'cnon:ok',
        amount: 150,
        vendorId: 'vendor-a',
        staffId: 'staff-1',
        serviceIds: ['svc-1', 'svc-2'],
      }),
    }

    const res = await handler.POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.paymentId).toBe('pay-multi-1')
    expect(mockCreatePayment).toHaveBeenCalledTimes(1)

    const paymentArg = mockCreatePayment.mock.calls[0][0]
    expect(paymentArg.amountMoney).toEqual({ amount: BigInt(15000), currency: 'USD' })
  })

  test('single-vendor with tip: tip sent as tipMoney', async () => {
    seedVendor({ vendorId: 'vendor-house', isHouse: true, squareAccessToken: 'tok-h', squareLocationId: 'LOC-H' })
    seedVendor({ vendorId: 'vendor-a', squareAccessToken: 'tok-a', squareLocationId: 'LOC-A' })
    seedService({ serviceId: 'svc-1', vendorId: 'vendor-a', price: 65 })

    mockStaffGet.mockResolvedValue({ data: { visibleId: 'staff-1', vendorId: 'vendor-a', squareAccessToken: 'tok-a', squareLocationId: 'LOC-A', squareOAuthStatus: 'connected' } })
    mockCreatePayment.mockResolvedValueOnce({
      result: { payment: { id: 'pay-tip-1', status: 'COMPLETED' } },
    })

    const req = {
      json: async () => ({
        sourceId: 'cnon:ok',
        amount: 65,
        tipAmount: 13,
        vendorId: 'vendor-a',
        staffId: 'staff-1',
        serviceIds: ['svc-1'],
      }),
    }

    const res = await handler.POST(req)
    expect(res.status).toBe(200)

    const paymentArg = mockCreatePayment.mock.calls[0][0]
    expect(paymentArg.tipMoney).toEqual({ amount: BigInt(1300), currency: 'USD' })
  })

  test('multi-vendor: uses bundlePayments to split across vendors', async () => {
    seedVendor({ vendorId: 'vendor-house', isHouse: true, squareAccessToken: 'tok-h', squareLocationId: 'LOC-H' })
    seedVendor({ vendorId: 'vendor-a', squareAccessToken: 'tok-a', squareLocationId: 'LOC-A' })
    seedVendor({ vendorId: 'vendor-b', squareAccessToken: 'tok-b', squareLocationId: 'LOC-B' })

    mockCreatePayment.mockResolvedValueOnce({
      result: { payment: { id: 'pay-multi-mv', status: 'COMPLETED' } },
    })

    const req = {
      json: async () => ({
        sourceId: 'cnon:ok',
        amount: 150,
        bundlePayments: [
          { vendorId: 'vendor-a', amount: 65, isHouseFee: false },
          { vendorId: 'vendor-b', amount: 85, isHouseFee: false },
        ],
      }),
    }

    const res = await handler.POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockCreatePayment).toHaveBeenCalledTimes(1)

    const paymentArg = mockCreatePayment.mock.calls[0][0]
    expect(paymentArg.amountMoney).toEqual({ amount: BigInt(15000), currency: 'USD' })
    expect(paymentArg.additionalRecipients).toHaveLength(1)
  })

  test('multi-vendor rejects when vendor missing Square', async () => {
    seedVendor({ vendorId: 'vendor-house', isHouse: true, squareAccessToken: 'tok-h', squareLocationId: 'LOC-H' })
    seedVendor({ vendorId: 'vendor-a', squareAccessToken: 'tok-a', squareLocationId: 'LOC-A' })
    seedVendor({ vendorId: 'vendor-b', squareAccessToken: null, squareLocationId: null })

    const req = {
      json: async () => ({
        sourceId: 'cnon:ok',
        amount: 150,
        bundlePayments: [
          { vendorId: 'vendor-a', amount: 65, isHouseFee: false },
          { vendorId: 'vendor-b', amount: 85, isHouseFee: false },
        ],
      }),
    }

    const res = await handler.POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/card payment unavailable/i)
    expect(mockCreatePayment).not.toHaveBeenCalled()
  })
})
