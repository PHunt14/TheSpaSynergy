/**
 * Multi-Vendor Bundle Payment Route Integration Tests
 *
 * Validates the POST /api/payment branch that handles multi-vendor bundle payments
 * (identified by both `bundlePayments` and `bundleId` on the request).
 *
 * The new payment flow makes individual Square charges per recipient:
 * - House fee → house provider's Square (via house staff credentials)
 * - Each vendor's share → staff-level Square credentials (staff → vendor fallback)
 *
 * Covers Requirements 5.1, 5.6, 5.7:
 * - 5.1: Individual charges for each recipient (house + vendors)
 * - 5.6: Reject card payment with 400 when no Square credentials found for a vendor (after staff fallback)
 * - 5.7: Record paymentId and per-appointment paymentAmount on each appointment
 */

import { jest } from '@jest/globals'

// ── Env ──────────────────────────────────────────────────────

process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT = 'sandbox'

// ── Mocks ────────────────────────────────────────────────────

const mockVendorDb = {}
const mockAppointmentDb = {}
const mockServiceDb = {}
const mockStaffDb = {}

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
const mockStaffGet = jest.fn(async ({ visibleId }) => ({
  data: mockStaffDb[visibleId] || null,
  errors: null,
}))
const mockStaffListByVendor = jest.fn(async ({ vendorId }) => {
  const staffForVendor = Object.values(mockStaffDb).filter(s => s.vendorId === vendorId)
  return { data: staffForVendor, errors: null }
})
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
      StaffSchedule: { get: mockStaffGet, listStaffScheduleByVendorId: mockStaffListByVendor },
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

function seedStaff(s) {
  mockStaffDb[s.visibleId] = {
    isActive: true,
    squareAccessToken: null,
    squareLocationId: null,
    squareOAuthStatus: 'disconnected',
    ...s,
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
  Object.keys(mockStaffDb).forEach(k => delete mockStaffDb[k])
}

// ── Tests ────────────────────────────────────────────────────

describe('POST /api/payment (multi-vendor bundle branch)', () => {
  let handler

  beforeAll(async () => {
    handler = await import('../../app/api/payment/route.ts')
  })

  beforeEach(() => {
    resetDb()
    jest.clearAllMocks()
  })

  test('processes individual charges per vendor using staff credentials (Req 5.1)', async () => {
    seedVendor({ vendorId: 'vendor-house', isHouse: true, squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE' })
    seedVendor({ vendorId: 'vendor-a' })
    seedVendor({ vendorId: 'vendor-b' })

    seedStaff({ visibleId: 'staff-a', vendorId: 'vendor-a', squareAccessToken: 'a-tok', squareLocationId: 'LOC-A', squareOAuthStatus: 'connected' })
    seedStaff({ visibleId: 'staff-b', vendorId: 'vendor-b', squareAccessToken: 'b-tok', squareLocationId: 'LOC-B', squareOAuthStatus: 'connected' })
    seedStaff({ visibleId: 'staff-house', vendorId: 'vendor-house', squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE', squareOAuthStatus: 'connected' })

    seedService({ serviceId: 'svc-1', vendorId: 'vendor-a', price: 100 })
    seedService({ serviceId: 'svc-2', vendorId: 'vendor-b', price: 100 })

    seedAppointment({ appointmentId: 'apt-1', bundleId: 'bundle-xyz', serviceId: 'svc-1', vendorId: 'vendor-a', staffId: 'staff-a' })
    seedAppointment({ appointmentId: 'apt-2', bundleId: 'bundle-xyz', serviceId: 'svc-2', vendorId: 'vendor-b', staffId: 'staff-b' })

    mockCreatePayment.mockResolvedValue({
      result: { payment: { id: 'pay-bundle-1', status: 'COMPLETED' } },
    })

    const req = {
      json: async () => ({
        sourceId: 'cnon:ok',
        amount: 200,
        bundleId: 'bundle-xyz',
        bundlePayments: [
          { vendorId: 'vendor-a', staffId: 'staff-a', amount: 100, isHouseFee: false },
          { vendorId: 'vendor-b', staffId: 'staff-b', amount: 100, isHouseFee: false },
        ],
      }),
    }

    const res = await handler.POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.paymentId).toBeDefined()
    expect(body.bundleId).toBe('bundle-xyz')

    // Individual charges for each vendor (no house fee in this case)
    expect(mockCreatePayment).toHaveBeenCalledTimes(2)

    const calls = mockCreatePayment.mock.calls
    const amounts = calls.map(c => Number(c[0].amountMoney.amount))
    expect(amounts.sort()).toEqual([10000, 10000])
  })

  test('house fee charged separately to house account', async () => {
    seedVendor({ vendorId: 'vendor-house', isHouse: true, squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE' })
    seedVendor({ vendorId: 'vendor-a' })

    seedStaff({ visibleId: 'staff-a', vendorId: 'vendor-a', squareAccessToken: 'a-tok', squareLocationId: 'LOC-A', squareOAuthStatus: 'connected' })
    seedStaff({ visibleId: 'staff-house', vendorId: 'vendor-house', squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE', squareOAuthStatus: 'connected' })

    seedService({ serviceId: 'svc-1', vendorId: 'vendor-a', price: 100 })
    seedAppointment({ appointmentId: 'apt-1', bundleId: 'bundle-xyz', serviceId: 'svc-1', vendorId: 'vendor-a', staffId: 'staff-a' })

    mockCreatePayment.mockResolvedValue({
      result: { payment: { id: 'pay-house-split', status: 'COMPLETED' } },
    })

    const req = {
      json: async () => ({
        sourceId: 'cnon:ok',
        amount: 100,
        bundleId: 'bundle-xyz',
        bundlePayments: [
          { vendorId: 'vendor-house', amount: 30, isHouseFee: true },
          { vendorId: 'vendor-a', staffId: 'staff-a', amount: 70, isHouseFee: false },
        ],
      }),
    }

    const res = await handler.POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)

    // Two charges: house fee + vendor share
    expect(mockCreatePayment).toHaveBeenCalledTimes(2)
    const amounts = mockCreatePayment.mock.calls.map(c => Number(c[0].amountMoney.amount)).sort()
    expect(amounts).toEqual([3000, 7000])
  })

  test('records paymentId and per-appointment paymentAmount on each appointment (Req 5.7)', async () => {
    seedVendor({ vendorId: 'vendor-house', isHouse: true, squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE' })
    seedVendor({ vendorId: 'vendor-a' })
    seedVendor({ vendorId: 'vendor-b' })

    seedStaff({ visibleId: 'staff-a', vendorId: 'vendor-a', squareAccessToken: 'a-tok', squareLocationId: 'LOC-A', squareOAuthStatus: 'connected' })
    seedStaff({ visibleId: 'staff-b', vendorId: 'vendor-b', squareAccessToken: 'b-tok', squareLocationId: 'LOC-B', squareOAuthStatus: 'connected' })
    seedStaff({ visibleId: 'staff-house', vendorId: 'vendor-house', squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE', squareOAuthStatus: 'connected' })

    seedService({ serviceId: 'svc-1', vendorId: 'vendor-a', price: 150 })
    seedService({ serviceId: 'svc-2', vendorId: 'vendor-b', price: 50 })
    seedAppointment({ appointmentId: 'apt-1', bundleId: 'bundle-xyz', serviceId: 'svc-1', vendorId: 'vendor-a', staffId: 'staff-a' })
    seedAppointment({ appointmentId: 'apt-2', bundleId: 'bundle-xyz', serviceId: 'svc-2', vendorId: 'vendor-b', staffId: 'staff-b' })

    mockCreatePayment.mockResolvedValue({
      result: { payment: { id: 'pay-bundle-3', status: 'COMPLETED' } },
    })

    const req = {
      json: async () => ({
        sourceId: 'cnon:ok',
        amount: 200,
        bundleId: 'bundle-xyz',
        bundlePayments: [
          { vendorId: 'vendor-a', staffId: 'staff-a', amount: 150, isHouseFee: false },
          { vendorId: 'vendor-b', staffId: 'staff-b', amount: 50, isHouseFee: false },
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
    expect(apt1.paymentAmount).toBe(150)

    expect(apt2.paymentId).toBe('pay-bundle-3')
    expect(apt2.paymentStatus).toBe('COMPLETED')
    expect(apt2.paymentAmount).toBe(50)
  })

  test('returns 400 when no Square credentials available for a vendor (Req 5.6)', async () => {
    seedVendor({ vendorId: 'vendor-house', isHouse: true, squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE' })
    seedVendor({ vendorId: 'vendor-a' })
    // vendor-b has NO Square credentials and no connected staff
    seedVendor({ vendorId: 'vendor-b', squareAccessToken: null, squareLocationId: null })

    seedStaff({ visibleId: 'staff-a', vendorId: 'vendor-a', squareAccessToken: 'a-tok', squareLocationId: 'LOC-A', squareOAuthStatus: 'connected' })
    seedStaff({ visibleId: 'staff-house', vendorId: 'vendor-house', squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE', squareOAuthStatus: 'connected' })
    // No staff for vendor-b with Square connected

    const req = {
      json: async () => ({
        sourceId: 'cnon:ok',
        amount: 150,
        bundlePayments: [
          { vendorId: 'vendor-a', staffId: 'staff-a', amount: 65, isHouseFee: false },
          { vendorId: 'vendor-b', amount: 85, isHouseFee: false },
        ],
      }),
    }

    const res = await handler.POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/card payment unavailable|no square connection/i)
    // House fee was not charged since we check credentials before processing
  })

  test('falls back to staff credentials when vendor has no Square', async () => {
    seedVendor({ vendorId: 'vendor-house', isHouse: true, squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE' })
    // vendor-a has no vendor-level Square
    seedVendor({ vendorId: 'vendor-a', squareAccessToken: null, squareLocationId: null })

    // But its staff member IS connected
    seedStaff({ visibleId: 'staff-a', vendorId: 'vendor-a', squareAccessToken: 'staff-a-tok', squareLocationId: 'STAFF-LOC-A', squareOAuthStatus: 'connected' })
    seedStaff({ visibleId: 'staff-house', vendorId: 'vendor-house', squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE', squareOAuthStatus: 'connected' })

    seedService({ serviceId: 'svc-1', vendorId: 'vendor-a', price: 100 })
    seedAppointment({ appointmentId: 'apt-1', bundleId: 'bundle-xyz', serviceId: 'svc-1', vendorId: 'vendor-a', staffId: 'staff-a' })

    mockCreatePayment.mockResolvedValue({
      result: { payment: { id: 'pay-staff-fallback', status: 'COMPLETED' } },
    })

    const req = {
      json: async () => ({
        sourceId: 'cnon:ok',
        amount: 100,
        bundleId: 'bundle-xyz',
        bundlePayments: [
          { vendorId: 'vendor-a', staffId: 'staff-a', amount: 100, isHouseFee: false },
        ],
      }),
    }

    const res = await handler.POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockCreatePayment).toHaveBeenCalledTimes(1)

    // Verify staff credentials were used
    const paymentArg = mockCreatePayment.mock.calls[0][0]
    expect(paymentArg.locationId).toBe('STAFF-LOC-A')
  })

  test('tip is distributed among non-house recipients', async () => {
    seedVendor({ vendorId: 'vendor-house', isHouse: true, squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE' })
    seedVendor({ vendorId: 'vendor-a' })
    seedVendor({ vendorId: 'vendor-b' })

    seedStaff({ visibleId: 'staff-a', vendorId: 'vendor-a', squareAccessToken: 'a-tok', squareLocationId: 'LOC-A', squareOAuthStatus: 'connected' })
    seedStaff({ visibleId: 'staff-b', vendorId: 'vendor-b', squareAccessToken: 'b-tok', squareLocationId: 'LOC-B', squareOAuthStatus: 'connected' })
    seedStaff({ visibleId: 'staff-house', vendorId: 'vendor-house', squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE', squareOAuthStatus: 'connected' })

    mockCreatePayment.mockResolvedValue({
      result: { payment: { id: 'pay-tip', status: 'COMPLETED' } },
    })

    const req = {
      json: async () => ({
        sourceId: 'cnon:ok',
        amount: 200,
        tipAmount: 20,
        bundlePayments: [
          { vendorId: 'vendor-a', staffId: 'staff-a', amount: 100, isHouseFee: false },
          { vendorId: 'vendor-b', staffId: 'staff-b', amount: 100, isHouseFee: false },
        ],
      }),
    }

    const res = await handler.POST(req)
    expect(res.status).toBe(200)

    // Two charges (no house fee in this test), each should have tip
    expect(mockCreatePayment).toHaveBeenCalledTimes(2)
    const tips = mockCreatePayment.mock.calls.map(c => c[0].tipMoney ? Number(c[0].tipMoney.amount) : 0)
    expect(tips.reduce((sum, t) => sum + t, 0)).toBe(2000) // $20 total tip in cents
  })
})
