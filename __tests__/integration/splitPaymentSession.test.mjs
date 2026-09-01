/**
 * Split Payment Session API Integration Tests
 *
 * Tests the POST /api/payment/split route with mocked external dependencies.
 * Validates: Requirements 4.1–4.7, 5.5, 7.1–7.7, 9.1–9.6
 */

import { jest } from '@jest/globals'

// ── Env ──────────────────────────────────────────────────────

process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT = 'sandbox'
process.env.SQUARE_ACCESS_TOKEN = 'test-access-token'

// ── In-memory DB ─────────────────────────────────────────────

const mockBundleDb = {}
const mockServiceDb = {}
const mockVendorDb = {}
const mockAppointmentDb = {}
const mockSessionDb = {}

// ── Mock Functions ───────────────────────────────────────────

const mockBundleGet = jest.fn(async ({ bundleId }) => ({
  data: mockBundleDb[bundleId] || null,
}))

const mockServiceGet = jest.fn(async ({ serviceId }) => ({
  data: mockServiceDb[serviceId] || null,
}))

const mockVendorGet = jest.fn(async ({ vendorId }) => ({
  data: mockVendorDb[vendorId] || null,
}))

const mockVendorList = jest.fn(async () => ({
  data: Object.values(mockVendorDb),
}))

const mockAppointmentList = jest.fn(async ({ filter } = {}) => {
  const all = Object.values(mockAppointmentDb)
  const bundleEq = filter?.bundleId?.eq
  const groupEq = filter?.groupId?.eq
  let filtered = all
  if (bundleEq) filtered = filtered.filter(a => a.bundleId === bundleEq)
  if (groupEq) filtered = filtered.filter(a => a.groupId === groupEq)
  return { data: filtered }
})

const mockAppointmentUpdate = jest.fn(async (update) => {
  const existing = mockAppointmentDb[update.appointmentId] || {}
  mockAppointmentDb[update.appointmentId] = { ...existing, ...update }
  return { data: mockAppointmentDb[update.appointmentId] }
})

const mockSessionGet = jest.fn(async ({ sessionId }) => ({
  data: mockSessionDb[sessionId] || null,
}))

const mockSessionCreate = jest.fn(async (session) => {
  mockSessionDb[session.sessionId] = session
  return { data: session }
})

const mockSessionUpdate = jest.fn(async (update) => {
  const existing = mockSessionDb[update.sessionId] || {}
  mockSessionDb[update.sessionId] = { ...existing, ...update }
  return { data: mockSessionDb[update.sessionId] }
})

const mockSessionListByBundleId = jest.fn(async ({ bundleId }) => {
  const sessions = Object.values(mockSessionDb).filter(s => s.bundleId === bundleId)
  return { data: sessions }
})

const mockSessionList = jest.fn(async ({ filter } = {}) => {
  let sessions = Object.values(mockSessionDb)
  if (filter?.bundleId?.eq) {
    sessions = sessions.filter(s => s.bundleId === filter.bundleId.eq)
  }
  if (filter?.groupId?.eq) {
    sessions = sessions.filter(s => s.groupId === filter.groupId.eq)
  }
  return { data: sessions }
})

const mockCreatePayment = jest.fn()
const mockRefundPayment = jest.fn()

// ── Module Mocks ─────────────────────────────────────────────

jest.unstable_mockModule('square', () => ({
  Client: jest.fn().mockImplementation(() => ({
    paymentsApi: { createPayment: mockCreatePayment },
    refundsApi: { refundPayment: mockRefundPayment },
  })),
  Environment: { Sandbox: 'sandbox', Production: 'production' },
}))

jest.unstable_mockModule('aws-amplify/data', () => ({
  generateClient: jest.fn(() => ({
    models: {
      Bundle: { get: mockBundleGet },
      Service: { get: mockServiceGet },
      Vendor: { get: mockVendorGet, list: mockVendorList },
      Appointment: { list: mockAppointmentList, update: mockAppointmentUpdate },
      // House payee resolution consults StaffSchedule (for the designated house
      // owner) and SiteSettings (for an optional override). These tests seed no
      // house staff, so resolution falls back to the house Vendor's own creds.
      StaffSchedule: { listStaffScheduleByVendorId: jest.fn(async () => ({ data: [] })), get: jest.fn(async () => ({ data: null })) },
      SiteSettings: { get: jest.fn(async () => ({ data: null })) },
      SplitPaymentSession: {
        get: mockSessionGet,
        create: mockSessionCreate,
        update: mockSessionUpdate,
        list: mockSessionList,
        listSplitPaymentSessionByBundleId: mockSessionListByBundleId,
      },
    },
  })),
}))

jest.unstable_mockModule('aws-amplify', () => ({
  Amplify: { configure: jest.fn() },
}))

jest.unstable_mockModule('../../amplify_outputs.json', () => ({ default: {} }), { virtual: true })

// ── Seeders ──────────────────────────────────────────────────

function seedBundle(b) {
  const bundle = {
    bundleId: b.bundleId,
    price: b.price ?? 100,
    status: b.status ?? 'pending',
    serviceIds: b.serviceIds ?? [],
    ...b,
  }
  mockBundleDb[bundle.bundleId] = bundle
  return bundle
}

function seedService(s) {
  const service = {
    serviceId: s.serviceId,
    vendorId: s.vendorId,
    price: s.price ?? 50,
    houseFeeEnabled: s.houseFeeEnabled ?? false,
    houseFeeAmount: s.houseFeeAmount ?? 0,
    ...s,
  }
  mockServiceDb[service.serviceId] = service
  return service
}

function seedVendor(v) {
  const vendor = {
    vendorId: v.vendorId,
    name: v.name || v.vendorId,
    isHouse: v.isHouse || false,
    squareAccessToken: v.squareAccessToken || 'tok',
    squareLocationId: v.squareLocationId || 'LOC-' + v.vendorId,
    ...v,
  }
  mockVendorDb[vendor.vendorId] = vendor
  return vendor
}

function seedAppointment(a) {
  const appt = {
    appointmentId: a.appointmentId,
    bundleId: a.bundleId,
    serviceId: a.serviceId,
    vendorId: a.vendorId,
    status: a.status || 'booked',
    paymentStatus: a.paymentStatus || null,
    ...a,
  }
  mockAppointmentDb[appt.appointmentId] = appt
  return appt
}

function seedSession(s) {
  const session = {
    sessionId: s.sessionId,
    bundleId: s.bundleId || null,
    groupId: s.groupId || null,
    totalAmountCents: s.totalAmountCents ?? 10000,
    splitType: s.splitType ?? 'equal',
    payerCount: s.payerCount ?? 2,
    status: s.status ?? 'pending',
    payers: s.payers ?? JSON.stringify([
      { payerIndex: 0, label: 'Person 1', amountCents: 5000, status: 'pending', squarePaymentId: null, paidAt: null },
      { payerIndex: 1, label: 'Person 2', amountCents: 5000, status: 'pending', squarePaymentId: null, paidAt: null },
    ]),
    createdAt: s.createdAt ?? new Date().toISOString(),
    expiresAt: s.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    ...s,
  }
  mockSessionDb[session.sessionId] = session
  return session
}

function resetDb() {
  Object.keys(mockBundleDb).forEach(k => delete mockBundleDb[k])
  Object.keys(mockServiceDb).forEach(k => delete mockServiceDb[k])
  Object.keys(mockVendorDb).forEach(k => delete mockVendorDb[k])
  Object.keys(mockAppointmentDb).forEach(k => delete mockAppointmentDb[k])
  Object.keys(mockSessionDb).forEach(k => delete mockSessionDb[k])
}

function createRequest(body) {
  return new Request('http://localhost/api/payment/split', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function seedStandardBundle() {
  seedVendor({ vendorId: 'house-vendor', isHouse: true, squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE' })
  seedVendor({ vendorId: 'vendor-a', squareAccessToken: 'a-tok', squareLocationId: 'LOC-A' })
  seedService({ serviceId: 'svc-1', vendorId: 'vendor-a', price: 100, houseFeeEnabled: false })
  seedBundle({ bundleId: 'bundle-1', price: 100, status: 'pending', serviceIds: ['svc-1'] })
  seedAppointment({ appointmentId: 'apt-1', bundleId: 'bundle-1', serviceId: 'svc-1', vendorId: 'vendor-a' })
}

function seedStandardGroup() {
  seedVendor({ vendorId: 'house-vendor', isHouse: true, squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE' })
  seedVendor({ vendorId: 'vendor-a', squareAccessToken: 'a-tok', squareLocationId: 'LOC-A' })
  seedVendor({ vendorId: 'vendor-b', squareAccessToken: 'b-tok', squareLocationId: 'LOC-B' })
  seedService({
    serviceId: 'svc-couple',
    vendorId: 'vendor-a',
    price: 230,
    houseFeeEnabled: false,
    houseFeeAmount: 0,
    providersRequired: 2,
    paymentSplitRules: { type: 'equal' },
  })
  seedAppointment({
    appointmentId: 'apt-g1',
    groupId: 'group-1',
    serviceId: 'svc-couple',
    vendorId: 'vendor-a',
    staffId: 'staff-1',
    paymentStatus: null,
    paymentId: null,
  })
  seedAppointment({
    appointmentId: 'apt-g2',
    groupId: 'group-1',
    serviceId: 'svc-couple',
    vendorId: 'vendor-b',
    staffId: 'staff-2',
    paymentStatus: null,
    paymentId: null,
  })
}

// ── Tests ────────────────────────────────────────────────────

describe('POST /api/payment/split', () => {
  let handler

  beforeAll(async () => {
    handler = await import('../../app/api/payment/split/route.ts')
  })

  beforeEach(() => {
    resetDb()
    jest.clearAllMocks()
  })

  // ── createSession ────────────────────────────────────────

  describe('createSession', () => {
    test('creates session for valid bundle with "pending" status', async () => {
      seedStandardBundle()

      const req = createRequest({
        action: 'createSession',
        bundleId: 'bundle-1',
        splitType: 'equal',
        payerCount: 2,
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.sessionId).toBeDefined()
      expect(body.payers).toHaveLength(2)
      expect(body.payers[0].amountCents).toBe(5000)
      expect(body.payers[1].amountCents).toBe(5000)
      expect(body.expiresAt).toBeDefined()
    })

    test('returns 400 when bundle not found', async () => {
      seedVendor({ vendorId: 'house-vendor', isHouse: true })

      const req = createRequest({
        action: 'createSession',
        bundleId: 'nonexistent-bundle',
        splitType: 'equal',
        payerCount: 2,
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toMatch(/Invalid bundle status/i)
    })

    test('returns 400 when bundle has invalid status', async () => {
      seedVendor({ vendorId: 'house-vendor', isHouse: true })
      seedVendor({ vendorId: 'vendor-a' })
      seedService({ serviceId: 'svc-1', vendorId: 'vendor-a', price: 100 })
      seedBundle({ bundleId: 'bundle-1', price: 100, status: 'cancelled', serviceIds: ['svc-1'] })

      const req = createRequest({
        action: 'createSession',
        bundleId: 'bundle-1',
        splitType: 'equal',
        payerCount: 2,
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toMatch(/Invalid bundle status/i)
    })

    test('returns 409 when active session already exists', async () => {
      seedStandardBundle()
      seedSession({ sessionId: 'existing-session', bundleId: 'bundle-1', status: 'pending' })

      const req = createRequest({
        action: 'createSession',
        bundleId: 'bundle-1',
        splitType: 'equal',
        payerCount: 2,
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(409)
      expect(body.error).toMatch(/Active split session already exists/i)
    })

    test('returns 400 when custom split amounts do not sum to total', async () => {
      seedStandardBundle()

      const req = createRequest({
        action: 'createSession',
        bundleId: 'bundle-1',
        splitType: 'custom',
        payerCount: 2,
        payerAmountsCents: [3000, 4000], // sum=7000, total=10000
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toMatch(/do not sum to/i)
    })
  })

  // ── payPayer ─────────────────────────────────────────────

  describe('payPayer', () => {
    test('successful charge marks payer as paid', async () => {
      seedStandardBundle()
      seedSession({
        sessionId: 'session-1',
        bundleId: 'bundle-1',
        totalAmountCents: 10000,
        payerCount: 2,
        payers: JSON.stringify([
          { payerIndex: 0, label: 'Person 1', amountCents: 5000, status: 'pending', squarePaymentId: null, paidAt: null },
          { payerIndex: 1, label: 'Person 2', amountCents: 5000, status: 'pending', squarePaymentId: null, paidAt: null },
        ]),
      })

      mockCreatePayment.mockResolvedValueOnce({
        result: { payment: { id: 'sq-pay-1', status: 'COMPLETED' } },
      })

      const req = createRequest({
        action: 'payPayer',
        sessionId: 'session-1',
        payerIndex: 0,
        sourceId: 'cnon:card-nonce',
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.squarePaymentId).toBe('sq-pay-1')
      expect(body.payerIndex).toBe(0)
      expect(body.sessionStatus).toBe('partial')
      expect(mockCreatePayment).toHaveBeenCalledTimes(1)
    })

    test('returns 502 when Square fails', async () => {
      seedStandardBundle()
      seedSession({ sessionId: 'session-1', bundleId: 'bundle-1' })

      mockCreatePayment.mockRejectedValueOnce({
        errors: [{ detail: 'Card declined' }],
      })

      const req = createRequest({
        action: 'payPayer',
        sessionId: 'session-1',
        payerIndex: 0,
        sourceId: 'cnon:bad-card',
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(502)
      expect(body.error).toMatch(/Payment processing failed/i)
      expect(body.details).toMatch(/Card declined/i)
    })

    test('returns 410 for expired session', async () => {
      seedStandardBundle()
      seedSession({
        sessionId: 'session-expired',
        bundleId: 'bundle-1',
        expiresAt: new Date(Date.now() - 1000).toISOString(), // already expired
      })

      const req = createRequest({
        action: 'payPayer',
        sessionId: 'session-expired',
        payerIndex: 0,
        sourceId: 'cnon:card',
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(410)
      expect(body.error).toMatch(/expired/i)
    })

    test('returns 409 when payer already paid', async () => {
      seedStandardBundle()
      seedSession({
        sessionId: 'session-1',
        bundleId: 'bundle-1',
        payers: JSON.stringify([
          { payerIndex: 0, label: 'Person 1', amountCents: 5000, status: 'paid', squarePaymentId: 'sq-1', paidAt: new Date().toISOString() },
          { payerIndex: 1, label: 'Person 2', amountCents: 5000, status: 'pending', squarePaymentId: null, paidAt: null },
        ]),
      })

      const req = createRequest({
        action: 'payPayer',
        sessionId: 'session-1',
        payerIndex: 0,
        sourceId: 'cnon:card',
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(409)
      expect(body.error).toMatch(/already completed/i)
    })

    test('returns 400 when sourceId is missing', async () => {
      seedStandardBundle()
      seedSession({ sessionId: 'session-1', bundleId: 'bundle-1' })

      const req = createRequest({
        action: 'payPayer',
        sessionId: 'session-1',
        payerIndex: 0,
        sourceId: '',
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toMatch(/Missing card nonce/i)
    })

    test('returns 400 when amountCents does not match stored session', async () => {
      seedStandardBundle()
      seedSession({
        sessionId: 'session-1',
        bundleId: 'bundle-1',
        payers: JSON.stringify([
          { payerIndex: 0, label: 'Person 1', amountCents: 5000, status: 'pending', squarePaymentId: null, paidAt: null },
          { payerIndex: 1, label: 'Person 2', amountCents: 5000, status: 'pending', squarePaymentId: null, paidAt: null },
        ]),
      })

      const req = createRequest({
        action: 'payPayer',
        sessionId: 'session-1',
        payerIndex: 0,
        sourceId: 'cnon:card',
        amountCents: 9999, // tampered amount
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toMatch(/Amount mismatch/i)
    })

    test('all payers paid triggers session completion and appointment update', async () => {
      seedStandardBundle()
      seedSession({
        sessionId: 'session-1',
        bundleId: 'bundle-1',
        totalAmountCents: 10000,
        payerCount: 2,
        payers: JSON.stringify([
          { payerIndex: 0, label: 'Person 1', amountCents: 5000, status: 'paid', squarePaymentId: 'sq-1', paidAt: new Date().toISOString() },
          { payerIndex: 1, label: 'Person 2', amountCents: 5000, status: 'pending', squarePaymentId: null, paidAt: null },
        ]),
        status: 'partial',
      })

      mockCreatePayment.mockResolvedValueOnce({
        result: { payment: { id: 'sq-pay-2', status: 'COMPLETED' } },
      })

      const req = createRequest({
        action: 'payPayer',
        sessionId: 'session-1',
        payerIndex: 1,
        sourceId: 'cnon:card',
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.sessionStatus).toBe('completed')

      // Session should be updated to completed
      expect(mockSessionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-1', status: 'completed' })
      )

      // Appointments should be updated with paid payment status
      expect(mockAppointmentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ appointmentId: 'apt-1', paymentStatus: 'paid' })
      )
    })
  })

  // ── getSession ───────────────────────────────────────────

  describe('getSession', () => {
    test('returns full session state for valid session', async () => {
      seedSession({
        sessionId: 'session-1',
        bundleId: 'bundle-1',
        totalAmountCents: 10000,
        splitType: 'equal',
        payerCount: 2,
        status: 'pending',
      })

      const req = createRequest({
        action: 'getSession',
        sessionId: 'session-1',
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.sessionId).toBe('session-1')
      expect(body.bundleId).toBe('bundle-1')
      expect(body.totalAmountCents).toBe(10000)
      expect(body.splitType).toBe('equal')
      expect(body.payerCount).toBe(2)
      expect(body.status).toBe('pending')
      expect(body.payers).toHaveLength(2)
    })

    test('returns 404 when session not found', async () => {
      const req = createRequest({
        action: 'getSession',
        sessionId: 'nonexistent-session',
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toMatch(/not found/i)
    })

    test('auto-marks expired session as expired', async () => {
      seedSession({
        sessionId: 'session-expired',
        bundleId: 'bundle-1',
        status: 'pending',
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      })

      const req = createRequest({
        action: 'getSession',
        sessionId: 'session-expired',
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.status).toBe('expired')
      expect(mockSessionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-expired', status: 'expired' })
      )
    })
  })

  // ── refund ───────────────────────────────────────────────

  describe('refund', () => {
    test('full refund issues individual refunds for each paid payer', async () => {
      seedVendor({ vendorId: 'house-vendor', isHouse: true, squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE' })
      seedSession({
        sessionId: 'session-1',
        bundleId: 'bundle-1',
        totalAmountCents: 10000,
        payerCount: 2,
        status: 'completed',
        payers: JSON.stringify([
          { payerIndex: 0, label: 'Person 1', amountCents: 5000, status: 'paid', squarePaymentId: 'sq-1', paidAt: new Date().toISOString() },
          { payerIndex: 1, label: 'Person 2', amountCents: 5000, status: 'paid', squarePaymentId: 'sq-2', paidAt: new Date().toISOString() },
        ]),
      })

      mockRefundPayment.mockResolvedValue({
        result: { refund: { id: 'ref-1', status: 'COMPLETED' } },
      })

      const req = createRequest({
        action: 'refund',
        sessionId: 'session-1',
        type: 'full',
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.sessionStatus).toBe('refunded')
      expect(body.results).toHaveLength(2)
      expect(body.results[0].success).toBe(true)
      expect(body.results[0].refundedAmountCents).toBe(5000)
      expect(body.results[1].success).toBe(true)
      expect(body.results[1].refundedAmountCents).toBe(5000)
      expect(mockRefundPayment).toHaveBeenCalledTimes(2)
    })

    test('partial refund distributes proportionally', async () => {
      seedVendor({ vendorId: 'house-vendor', isHouse: true, squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE' })
      seedSession({
        sessionId: 'session-1',
        bundleId: 'bundle-1',
        totalAmountCents: 10000,
        payerCount: 2,
        status: 'completed',
        payers: JSON.stringify([
          { payerIndex: 0, label: 'Person 1', amountCents: 7000, status: 'paid', squarePaymentId: 'sq-1', paidAt: new Date().toISOString() },
          { payerIndex: 1, label: 'Person 2', amountCents: 3000, status: 'paid', squarePaymentId: 'sq-2', paidAt: new Date().toISOString() },
        ]),
      })

      mockRefundPayment.mockResolvedValue({
        result: { refund: { id: 'ref-1', status: 'COMPLETED' } },
      })

      const req = createRequest({
        action: 'refund',
        sessionId: 'session-1',
        type: 'partial',
        refundAmountCents: 1000,
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.sessionStatus).toBe('refunded')
      // Proportional: payer 0 gets 70% of 1000=700, payer 1 gets 30% of 1000=300
      // With remainder to first: floor(1000*7000/10000)=700, floor(1000*3000/10000)=300
      // distributed=1000, remainder=0
      expect(body.results).toHaveLength(2)
      const totalRefunded = body.results.reduce((sum, r) => sum + (r.refundedAmountCents || 0), 0)
      expect(totalRefunded).toBe(1000)
    })

    test('one payer refund fails results in partially_refunded status', async () => {
      seedVendor({ vendorId: 'house-vendor', isHouse: true, squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE' })
      seedSession({
        sessionId: 'session-1',
        bundleId: 'bundle-1',
        totalAmountCents: 10000,
        payerCount: 2,
        status: 'completed',
        payers: JSON.stringify([
          { payerIndex: 0, label: 'Person 1', amountCents: 5000, status: 'paid', squarePaymentId: 'sq-1', paidAt: new Date().toISOString() },
          { payerIndex: 1, label: 'Person 2', amountCents: 5000, status: 'paid', squarePaymentId: 'sq-2', paidAt: new Date().toISOString() },
        ]),
      })

      // First payer refund succeeds, second fails
      mockRefundPayment
        .mockResolvedValueOnce({ result: { refund: { id: 'ref-1', status: 'COMPLETED' } } })
        .mockRejectedValueOnce({ errors: [{ detail: 'Refund failed' }] })

      const req = createRequest({
        action: 'refund',
        sessionId: 'session-1',
        type: 'full',
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(false)
      expect(body.sessionStatus).toBe('partially_refunded')
      expect(body.results).toHaveLength(2)
      expect(body.results[0].success).toBe(true)
      expect(body.results[1].success).toBe(false)
      expect(body.results[1].error).toMatch(/Refund failed/i)

      // Session status should be updated to partially_refunded
      expect(mockSessionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-1', status: 'partially_refunded' })
      )
    })
  })

  // ── Invalid action ─────────────────────────────────────────

  describe('invalid action', () => {
    test('returns 400 for unknown action', async () => {
      const req = createRequest({ action: 'unknownAction' })
      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toMatch(/Invalid action/i)
    })
  })

  // ── Group (Service) Split ──────────────────────────────────

  describe('createSession - group split', () => {
    test('creates session for valid group with equal split', async () => {
      seedStandardGroup()

      const req = createRequest({
        action: 'createSession',
        groupId: 'group-1',
        splitType: 'equal',
        payerCount: 2,
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.sessionId).toBeDefined()
      expect(body.payers).toHaveLength(2)
      // $230 = 23000 cents, split equally = 11500 each
      expect(body.payers[0].amountCents).toBe(11500)
      expect(body.payers[1].amountCents).toBe(11500)
    })

    test('returns 404 when group not found', async () => {
      seedVendor({ vendorId: 'house-vendor', isHouse: true })

      const req = createRequest({
        action: 'createSession',
        groupId: 'nonexistent-group',
        splitType: 'equal',
        payerCount: 2,
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toMatch(/Group not found/i)
    })

    test('returns 400 when group already paid', async () => {
      seedStandardGroup()
      // Mark one appointment as paid
      mockAppointmentDb['apt-g1'].paymentStatus = 'paid'
      mockAppointmentDb['apt-g1'].paymentId = 'sq-existing'

      const req = createRequest({
        action: 'createSession',
        groupId: 'group-1',
        splitType: 'equal',
        payerCount: 2,
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toMatch(/already paid/i)
    })

    test('returns 409 when active session already exists for group', async () => {
      seedStandardGroup()
      seedSession({ sessionId: 'existing-session', groupId: 'group-1', status: 'pending' })

      const req = createRequest({
        action: 'createSession',
        groupId: 'group-1',
        splitType: 'equal',
        payerCount: 2,
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(409)
      expect(body.error).toMatch(/Active split session already exists/i)
    })

    test('returns 400 when neither bundleId nor groupId nor appointmentId provided', async () => {
      const req = createRequest({
        action: 'createSession',
        splitType: 'equal',
        payerCount: 2,
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toMatch(/bundleId.*groupId.*appointmentId/i)
    })
  })

  describe('payPayer - group split', () => {
    test('successful charge for group session marks payer as paid', async () => {
      seedStandardGroup()
      seedSession({
        sessionId: 'session-g1',
        groupId: 'group-1',
        totalAmountCents: 23000,
        payerCount: 2,
        payers: JSON.stringify([
          { payerIndex: 0, label: 'Person 1', amountCents: 11500, status: 'pending', squarePaymentId: null, paidAt: null },
          { payerIndex: 1, label: 'Person 2', amountCents: 11500, status: 'pending', squarePaymentId: null, paidAt: null },
        ]),
      })

      mockCreatePayment.mockResolvedValueOnce({
        result: { payment: { id: 'sq-pay-g1', status: 'COMPLETED' } },
      })

      const req = createRequest({
        action: 'payPayer',
        sessionId: 'session-g1',
        payerIndex: 0,
        sourceId: 'cnon:card-nonce',
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.squarePaymentId).toBe('sq-pay-g1')
      expect(body.sessionStatus).toBe('partial')
    })

    test('all payers paid in group session marks appointments as paid', async () => {
      seedStandardGroup()
      seedSession({
        sessionId: 'session-g1',
        groupId: 'group-1',
        totalAmountCents: 23000,
        payerCount: 2,
        status: 'partial',
        payers: JSON.stringify([
          { payerIndex: 0, label: 'Person 1', amountCents: 11500, status: 'paid', squarePaymentId: 'sq-g1', paidAt: new Date().toISOString() },
          { payerIndex: 1, label: 'Person 2', amountCents: 11500, status: 'pending', squarePaymentId: null, paidAt: null },
        ]),
      })

      mockCreatePayment.mockResolvedValueOnce({
        result: { payment: { id: 'sq-pay-g2', status: 'COMPLETED' } },
      })

      const req = createRequest({
        action: 'payPayer',
        sessionId: 'session-g1',
        payerIndex: 1,
        sourceId: 'cnon:card-nonce',
      })

      const res = await handler.POST(req)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.sessionStatus).toBe('completed')

      // Both group appointments should be updated
      expect(mockAppointmentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ appointmentId: 'apt-g1', paymentStatus: 'paid' })
      )
      expect(mockAppointmentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ appointmentId: 'apt-g2', paymentStatus: 'paid' })
      )
    })
  })
})
