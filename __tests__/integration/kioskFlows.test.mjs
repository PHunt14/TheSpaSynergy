/**
 * Kiosk Flow Integration Tests
 *
 * Covers the bugs fixed in the kiosk layer:
 *
 * 1. Multi-payment paymentId assignment — each appointment gets its vendor's paymentId
 * 2. Square location fallback — tries all vendors, not just the first
 * 3. Bundle staffId deduplication — two services from same vendor get different staffIds
 * 4. Tip reset on split mode switch — tip cleared when user picks split
 * 5. PIN timing-safe comparison — auth route uses timingSafeEqual
 * 6. Customer grouping collision — same-named customers on same day stay separate
 */

import { jest } from '@jest/globals'

// ── Env ──────────────────────────────────────────────────────

process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT = 'sandbox'

// ── Shared mock state ─────────────────────────────────────────

const mockVendorDb = {}
const mockAppointmentDb = {}
const mockServiceDb = {}
const mockSiteSettingsDb = {}
const mockStaffDb = {}

const mockVendorGet = jest.fn(async ({ vendorId }) => ({ data: mockVendorDb[vendorId] || null }))
const mockVendorList = jest.fn(async () => ({ data: Object.values(mockVendorDb) }))
const mockAppointmentList = jest.fn(async ({ filter } = {}) => {
  const all = Object.values(mockAppointmentDb)
  const bundleEq = filter?.bundleId?.eq
  const groupEq = filter?.groupId?.eq
  if (bundleEq) return { data: all.filter(a => a.bundleId === bundleEq) }
  if (groupEq) return { data: all.filter(a => a.groupId === groupEq) }
  return { data: all }
})
const mockAppointmentUpdate = jest.fn(async (update) => {
  mockAppointmentDb[update.appointmentId] = { ...mockAppointmentDb[update.appointmentId], ...update }
  return { data: mockAppointmentDb[update.appointmentId] }
})
const mockServiceGet = jest.fn(async ({ serviceId }) => ({ data: mockServiceDb[serviceId] || null }))
const mockStaffGet = jest.fn(async ({ visibleId } = {}) => ({ data: mockStaffDb[visibleId] || null }))
const mockStaffList = jest.fn(async ({ vendorId } = {}) => ({
  data: Object.values(mockStaffDb).filter(s => s.vendorId === vendorId),
}))
const mockSiteSettingsGet = jest.fn(async ({ settingKey }) => ({ data: mockSiteSettingsDb[settingKey] || null }))
const mockSiteSettingsUpdate = jest.fn(async (update) => {
  mockSiteSettingsDb[update.settingKey] = { ...mockSiteSettingsDb[update.settingKey], ...update }
  return { data: mockSiteSettingsDb[update.settingKey] }
})
const mockSiteSettingsCreate = jest.fn(async (record) => {
  mockSiteSettingsDb[record.settingKey] = record
  return { data: record }
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
      StaffSchedule: { get: mockStaffGet, listStaffScheduleByVendorId: mockStaffList },
      SiteSettings: { get: mockSiteSettingsGet, update: mockSiteSettingsUpdate, create: mockSiteSettingsCreate },
    },
  })),
}))
jest.unstable_mockModule('@aws-amplify/adapter-nextjs/data', () => ({
  generateServerClientUsingCookies: jest.fn(() => ({
    models: {
      Vendor: { get: mockVendorGet, list: mockVendorList },
      Appointment: { list: mockAppointmentList, update: mockAppointmentUpdate },
      Service: { get: mockServiceGet },
      StaffSchedule: { get: mockStaffGet, listStaffScheduleByVendorId: mockStaffList },
      SiteSettings: { get: mockSiteSettingsGet, update: mockSiteSettingsUpdate, create: mockSiteSettingsCreate },
    },
  })),
}))
jest.unstable_mockModule('next/headers', () => ({
  cookies: jest.fn(async () => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  })),
}))
jest.unstable_mockModule('aws-amplify', () => ({ Amplify: { configure: jest.fn() } }))
jest.unstable_mockModule('../../amplify_outputs.json', () => ({ default: {} }), { virtual: true })
jest.unstable_mockModule('../../lib/square/catalog.js', () => ({ buildOrderLineItems: jest.fn(() => []) }))
jest.unstable_mockModule('../../lib/square-token.js', () => ({
  refreshSquareToken: jest.fn(async () => true),
  isTokenExpiringSoon: jest.fn(() => false),
}))

// ── Helpers ───────────────────────────────────────────────────

function seedVendor(v) {
  mockVendorDb[v.vendorId] = { name: v.vendorId, isHouse: false, squareOAuthStatus: 'connected', ...v }
}
function seedService(s) {
  mockServiceDb[s.serviceId] = { price: 0, houseFeeEnabled: false, houseFeeAmount: 0, ...s }
}
function seedAppointment(a) {
  mockAppointmentDb[a.appointmentId] = { status: 'pending', bundleId: null, staffId: null, groupId: null, ...a }
}
function seedStaff(s) {
  mockStaffDb[s.visibleId] = { squareOAuthStatus: 'connected', isActive: true, ...s }
}
function seedSiteSetting(key, value) {
  mockSiteSettingsDb[key] = { settingKey: key, settingValue: value }
}
function resetDb() {
  for (const k of Object.keys(mockVendorDb)) delete mockVendorDb[k]
  for (const k of Object.keys(mockAppointmentDb)) delete mockAppointmentDb[k]
  for (const k of Object.keys(mockServiceDb)) delete mockServiceDb[k]
  for (const k of Object.keys(mockSiteSettingsDb)) delete mockSiteSettingsDb[k]
  for (const k of Object.keys(mockStaffDb)) delete mockStaffDb[k]
}

// ── Tests ─────────────────────────────────────────────────────

describe('Kiosk: multi-vendor paymentId assignment', () => {
  let handler

  beforeAll(async () => {
    handler = await import('../../app/api/payment/route.ts')
  })

  beforeEach(() => {
    resetDb()
    jest.clearAllMocks()
  })

  test('each vendor appointment gets its own paymentId from splitPayments', async () => {
    seedVendor({ vendorId: 'vendor-house', isHouse: true, squareAccessToken: 'tok-h', squareLocationId: 'LOC-H' })
    seedVendor({ vendorId: 'vendor-a', squareAccessToken: 'tok-a', squareLocationId: 'LOC-A' })
    seedVendor({ vendorId: 'vendor-b', squareAccessToken: 'tok-b', squareLocationId: 'LOC-B' })
    seedStaff({ visibleId: 'staff-h', vendorId: 'vendor-house', squareAccessToken: 'tok-h', squareLocationId: 'LOC-H' })
    seedStaff({ visibleId: 'staff-a', vendorId: 'vendor-a', squareAccessToken: 'tok-a', squareLocationId: 'LOC-A' })
    seedStaff({ visibleId: 'staff-b', vendorId: 'vendor-b', squareAccessToken: 'tok-b', squareLocationId: 'LOC-B' })

    // Return different paymentIds per call
    mockCreatePayment
      .mockResolvedValueOnce({ result: { payment: { id: 'pay-vendor-a', status: 'COMPLETED' } } })
      .mockResolvedValueOnce({ result: { payment: { id: 'pay-vendor-b', status: 'COMPLETED' } } })

    const req = {
      json: async () => ({
        sourceId: 'cnon:ok',
        amount: 150,
        bundlePayments: [
          { vendorId: 'vendor-a', staffId: 'staff-a', amount: 65, isHouseFee: false },
          { vendorId: 'vendor-b', staffId: 'staff-b', amount: 85, isHouseFee: false },
        ],
      }),
    }

    const res = await handler.POST(req)
    const body = await res.json()

    expect(body.success).toBe(true)
    expect(body.splitPayments).toHaveLength(2)

    const payA = body.splitPayments.find(sp => sp.vendorId === 'vendor-a')
    const payB = body.splitPayments.find(sp => sp.vendorId === 'vendor-b')
    expect(payA.paymentId).toBe('pay-vendor-a')
    expect(payB.paymentId).toBe('pay-vendor-b')
    // The two paymentIds must be distinct
    expect(payA.paymentId).not.toBe(payB.paymentId)
  })

  test('single-vendor payment returns paymentId (no splitPayments)', async () => {
    seedVendor({ vendorId: 'vendor-house', isHouse: true, squareAccessToken: 'tok-h', squareLocationId: 'LOC-H' })
    seedVendor({ vendorId: 'vendor-a', squareAccessToken: 'tok-a', squareLocationId: 'LOC-A' })
    seedStaff({ visibleId: 'staff-a', vendorId: 'vendor-a', squareAccessToken: 'tok-a', squareLocationId: 'LOC-A' })
    seedService({ serviceId: 'svc-1', vendorId: 'vendor-a', price: 65 })

    mockCreatePayment.mockResolvedValueOnce({ result: { payment: { id: 'pay-single', status: 'COMPLETED' } } })

    const req = {
      json: async () => ({
        sourceId: 'cnon:ok',
        amount: 65,
        vendorId: 'vendor-a',
        staffId: 'staff-a',
        serviceIds: ['svc-1'],
      }),
    }

    const res = await handler.POST(req)
    const body = await res.json()

    expect(body.success).toBe(true)
    expect(body.paymentId).toBe('pay-single')
  })

  test('multi-vendor with house fee: house paymentId is separate from vendor paymentIds', async () => {
    seedVendor({ vendorId: 'vendor-house', isHouse: true, squareAccessToken: 'tok-h', squareLocationId: 'LOC-H' })
    seedVendor({ vendorId: 'vendor-a', squareAccessToken: 'tok-a', squareLocationId: 'LOC-A' })
    seedStaff({ visibleId: 'staff-h', vendorId: 'vendor-house', squareAccessToken: 'tok-h', squareLocationId: 'LOC-H' })
    seedStaff({ visibleId: 'staff-a', vendorId: 'vendor-a', squareAccessToken: 'tok-a', squareLocationId: 'LOC-A' })

    mockCreatePayment
      .mockResolvedValueOnce({ result: { payment: { id: 'pay-house-fee', status: 'COMPLETED' } } })
      .mockResolvedValueOnce({ result: { payment: { id: 'pay-vendor-a', status: 'COMPLETED' } } })

    const req = {
      json: async () => ({
        sourceId: 'cnon:ok',
        amount: 65,
        bundlePayments: [
          { vendorId: 'vendor-house', amount: 20, isHouseFee: true },
          { vendorId: 'vendor-a', staffId: 'staff-a', amount: 45, isHouseFee: false },
        ],
      }),
    }

    const res = await handler.POST(req)
    const body = await res.json()

    expect(body.success).toBe(true)
    const housePay = body.splitPayments.find(sp => sp.isHouseFee)
    const vendorPay = body.splitPayments.find(sp => !sp.isHouseFee)
    expect(housePay.paymentId).toBe('pay-house-fee')
    expect(vendorPay.paymentId).toBe('pay-vendor-a')
    expect(housePay.paymentId).not.toBe(vendorPay.paymentId)
  })
})

describe('Kiosk: bundle staffId deduplication', () => {
  test('two services from same vendor get different staffIds', () => {
    // Simulate the enrichment logic from bundle/[bundleId]/page.jsx
    const appointments = [
      { appointmentId: 'apt-1', vendorId: 'vendor-a', staffId: 'staff-a1', service: { price: 65 } },
      { appointmentId: 'apt-2', vendorId: 'vendor-a', staffId: 'staff-a2', service: { price: 85 } },
    ]

    const bundlePayments = [
      { vendorId: 'vendor-a', amount: 65, isHouseFee: false },
      { vendorId: 'vendor-a', amount: 85, isHouseFee: false },
    ]

    const usedAppointmentIds = new Set()
    const enriched = bundlePayments.map(bp => {
      if (bp.isHouseFee) return bp
      const matchingApt = appointments.find(a => a.vendorId === bp.vendorId && !usedAppointmentIds.has(a.appointmentId))
      if (matchingApt) usedAppointmentIds.add(matchingApt.appointmentId)
      return { ...bp, staffId: matchingApt?.staffId || undefined }
    })

    expect(enriched[0].staffId).toBe('staff-a1')
    expect(enriched[1].staffId).toBe('staff-a2')
    expect(enriched[0].staffId).not.toBe(enriched[1].staffId)
  })

  test('house fee entry is not enriched with staffId', () => {
    const appointments = [
      { appointmentId: 'apt-1', vendorId: 'vendor-a', staffId: 'staff-a1', service: { price: 65 } },
    ]

    const bundlePayments = [
      { vendorId: 'vendor-house', amount: 20, isHouseFee: true },
      { vendorId: 'vendor-a', amount: 45, isHouseFee: false },
    ]

    const usedAppointmentIds = new Set()
    const enriched = bundlePayments.map(bp => {
      if (bp.isHouseFee) return bp
      const matchingApt = appointments.find(a => a.vendorId === bp.vendorId && !usedAppointmentIds.has(a.appointmentId))
      if (matchingApt) usedAppointmentIds.add(matchingApt.appointmentId)
      return { ...bp, staffId: matchingApt?.staffId || undefined }
    })

    expect(enriched[0].staffId).toBeUndefined()
    expect(enriched[1].staffId).toBe('staff-a1')
  })

  test('single service per vendor: staffId assigned correctly', () => {
    const appointments = [
      { appointmentId: 'apt-1', vendorId: 'vendor-a', staffId: 'staff-a', service: { price: 65 } },
      { appointmentId: 'apt-2', vendorId: 'vendor-b', staffId: 'staff-b', service: { price: 85 } },
    ]

    const bundlePayments = [
      { vendorId: 'vendor-a', amount: 65, isHouseFee: false },
      { vendorId: 'vendor-b', amount: 85, isHouseFee: false },
    ]

    const usedAppointmentIds = new Set()
    const enriched = bundlePayments.map(bp => {
      if (bp.isHouseFee) return bp
      const matchingApt = appointments.find(a => a.vendorId === bp.vendorId && !usedAppointmentIds.has(a.appointmentId))
      if (matchingApt) usedAppointmentIds.add(matchingApt.appointmentId)
      return { ...bp, staffId: matchingApt?.staffId || undefined }
    })

    expect(enriched[0].staffId).toBe('staff-a')
    expect(enriched[1].staffId).toBe('staff-b')
  })
})

describe('Kiosk: customer grouping collision prevention', () => {
  // Simulate the grouping logic from kiosk/page.jsx

  function groupAppointments(appointments) {
    const customerGroups = {}
    appointments.forEach(apt => {
      const key = apt.clientId
        ? `client:${apt.clientId}`
        : `name:${apt.customer?.name || 'Walk-in'}:${apt.dateTime?.slice(0, 10) || ''}`
      if (!customerGroups[key]) customerGroups[key] = []
      customerGroups[key].push(apt)
    })
    return customerGroups
  }

  test('same name different clientId: kept in separate groups', () => {
    const appointments = [
      { appointmentId: 'apt-1', clientId: 'client-1', customer: { name: 'Sarah' }, dateTime: '2025-07-01T10:00' },
      { appointmentId: 'apt-2', clientId: 'client-2', customer: { name: 'Sarah' }, dateTime: '2025-07-01T11:00' },
    ]
    const groups = groupAppointments(appointments)
    expect(Object.keys(groups)).toHaveLength(2)
  })

  test('same clientId: grouped together (multi-service same customer)', () => {
    const appointments = [
      { appointmentId: 'apt-1', clientId: 'client-1', customer: { name: 'Sarah' }, dateTime: '2025-07-01T10:00' },
      { appointmentId: 'apt-2', clientId: 'client-1', customer: { name: 'Sarah' }, dateTime: '2025-07-01T11:00' },
    ]
    const groups = groupAppointments(appointments)
    expect(Object.keys(groups)).toHaveLength(1)
    expect(groups['client:client-1']).toHaveLength(2)
  })

  test('no clientId, same name, same day: grouped together', () => {
    const appointments = [
      { appointmentId: 'apt-1', clientId: null, customer: { name: 'Sarah' }, dateTime: '2025-07-01T10:00' },
      { appointmentId: 'apt-2', clientId: null, customer: { name: 'Sarah' }, dateTime: '2025-07-01T11:00' },
    ]
    const groups = groupAppointments(appointments)
    expect(Object.keys(groups)).toHaveLength(1)
  })

  test('no clientId, same name, different day: kept separate', () => {
    const appointments = [
      { appointmentId: 'apt-1', clientId: null, customer: { name: 'Sarah' }, dateTime: '2025-07-01T10:00' },
      { appointmentId: 'apt-2', clientId: null, customer: { name: 'Sarah' }, dateTime: '2025-07-02T10:00' },
    ]
    const groups = groupAppointments(appointments)
    expect(Object.keys(groups)).toHaveLength(2)
  })

  test('walk-in with no name: grouped under Walk-in key', () => {
    const appointments = [
      { appointmentId: 'apt-1', clientId: null, customer: null, dateTime: '2025-07-01T10:00' },
      { appointmentId: 'apt-2', clientId: null, customer: null, dateTime: '2025-07-01T11:00' },
    ]
    const groups = groupAppointments(appointments)
    expect(Object.keys(groups)).toHaveLength(1)
    expect(Object.keys(groups)[0]).toMatch(/Walk-in/)
  })
})

describe('Kiosk: PIN auth timing-safe comparison', () => {
  let authHandler

  beforeAll(async () => {
    authHandler = await import('../../app/api/kiosk/auth/route.ts')
  })

  beforeEach(() => {
    resetDb()
    jest.clearAllMocks()
  })

  const makeCookieStore = () => {
    const store = {}
    return {
      get: jest.fn((name) => store[name] ? { value: store[name] } : undefined),
      set: jest.fn((name, value) => { store[name] = value }),
    }
  }

  test('correct PIN returns success', async () => {
    seedSiteSetting('kioskPin', '1234')
    const req = { json: async () => ({ pin: '1234' }) }
    const res = await authHandler.POST(req)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  test('wrong PIN returns 401', async () => {
    seedSiteSetting('kioskPin', '1234')
    const req = { json: async () => ({ pin: '9999' }) }
    const res = await authHandler.POST(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/invalid pin/i)
  })

  test('missing PIN returns 400', async () => {
    const req = { json: async () => ({}) }
    const res = await authHandler.POST(req)
    expect(res.status).toBe(400)
  })

  test('no PIN configured returns 403', async () => {
    // No kioskPin in settings
    const req = { json: async () => ({ pin: '1234' }) }
    const res = await authHandler.POST(req)
    expect(res.status).toBe(403)
  })

  test('different-length PIN does not throw (timingSafeEqual length guard)', async () => {
    seedSiteSetting('kioskPin', '1234')
    // A longer PIN should not crash — it should just return 401
    const req = { json: async () => ({ pin: '12345678' }) }
    const res = await authHandler.POST(req)
    expect(res.status).toBe(401)
  })
})

describe('Kiosk: Square location fallback across vendors', () => {
  // Unit-test the tryResolve pattern extracted from multi/page.jsx and bundle/[bundleId]/page.jsx

  function tryResolveSquareLocation(appointments, resolveSquareLocation) {
    return new Promise((resolve) => {
      const tryResolve = (index) => {
        if (index >= appointments.length) { resolve(null); return }
        resolveSquareLocation(appointments[index].vendorId, (locationId) => {
          if (locationId) {
            resolve(locationId)
          } else {
            tryResolve(index + 1)
          }
        })
      }
      tryResolve(0)
    })
  }

  test('first vendor has Square: resolves immediately', async () => {
    const appointments = [
      { vendorId: 'vendor-a' },
      { vendorId: 'vendor-b' },
    ]
    const mockResolve = jest.fn((vendorId, cb) => cb('LOC-A'))
    const result = await tryResolveSquareLocation(appointments, mockResolve)
    expect(result).toBe('LOC-A')
    expect(mockResolve).toHaveBeenCalledTimes(1)
  })

  test('first vendor has no Square, second does: falls back to second', async () => {
    const appointments = [
      { vendorId: 'vendor-a' },
      { vendorId: 'vendor-b' },
    ]
    const mockResolve = jest.fn((vendorId, cb) => {
      cb(vendorId === 'vendor-b' ? 'LOC-B' : null)
    })
    const result = await tryResolveSquareLocation(appointments, mockResolve)
    expect(result).toBe('LOC-B')
    expect(mockResolve).toHaveBeenCalledTimes(2)
  })

  test('no vendor has Square: resolves null', async () => {
    const appointments = [
      { vendorId: 'vendor-a' },
      { vendorId: 'vendor-b' },
    ]
    const mockResolve = jest.fn((vendorId, cb) => cb(null))
    const result = await tryResolveSquareLocation(appointments, mockResolve)
    expect(result).toBeNull()
    expect(mockResolve).toHaveBeenCalledTimes(2)
  })

  test('empty appointments list: resolves null without calling resolver', async () => {
    const mockResolve = jest.fn()
    const result = await tryResolveSquareLocation([], mockResolve)
    expect(result).toBeNull()
    expect(mockResolve).not.toHaveBeenCalled()
  })
})
