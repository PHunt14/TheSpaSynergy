import { jest } from '@jest/globals'
import { setupMocks, resetAllMocks, dbMocks, mockCreatePayment } from './setup.mjs'

let app, request

beforeAll(async () => {
  app = await setupMocks()
  request = (await import('supertest')).default
})

beforeEach(() => resetAllMocks())

// ── Validation ────────────────────────────────────────────────

describe('POST /payment — validation', () => {
  test('400 when sourceId missing', async () => {
    const res = await request(app).post('/payment').send({ amount: 10 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing/)
  })

  test('400 when amount missing', async () => {
    const res = await request(app).post('/payment').send({ sourceId: 'tok' })
    expect(res.status).toBe(400)
  })

  test('400 when no vendorId and no bundlePayments', async () => {
    const res = await request(app).post('/payment').send({ sourceId: 'tok', amount: 10 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Invalid payment configuration/)
  })
})

// ── Single payment ────────────────────────────────────────────

describe('POST /payment — single', () => {
  const payload = { sourceId: 'cnon:card', amount: 50, vendorId: 'v1' }

  test('succeeds with vendor credentials', async () => {
    dbMocks.getVendor.mockResolvedValue({
      vendorId: 'v1', squareAccessToken: 'tok', squareLocationId: 'loc1',
    })
    mockCreatePayment.mockResolvedValue({
      result: { payment: { id: 'pay_1', status: 'COMPLETED' } },
    })

    const res = await request(app).post('/payment').send(payload)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ success: true, paymentId: 'pay_1', status: 'COMPLETED' })
  })

  test('uses staff credentials when staffId provided and staff has token', async () => {
    dbMocks.getStaff.mockResolvedValue({
      visibleId: 's1', squareAccessToken: 'staff-tok', squareLocationId: 'staff-loc',
    })
    mockCreatePayment.mockResolvedValue({
      result: { payment: { id: 'pay_2', status: 'COMPLETED' } },
    })

    const res = await request(app).post('/payment').send({ ...payload, staffId: 's1' })
    expect(res.status).toBe(200)
    expect(dbMocks.getVendor).not.toHaveBeenCalled()
  })

  test('falls back to vendor when staff has no token', async () => {
    dbMocks.getStaff.mockResolvedValue({ visibleId: 's1' })
    dbMocks.getVendor.mockResolvedValue({
      vendorId: 'v1', squareAccessToken: 'tok', squareLocationId: 'loc1',
    })
    mockCreatePayment.mockResolvedValue({
      result: { payment: { id: 'pay_3', status: 'COMPLETED' } },
    })

    const res = await request(app).post('/payment').send({ ...payload, staffId: 's1' })
    expect(res.status).toBe(200)
    expect(dbMocks.getVendor).toHaveBeenCalledWith('v1')
  })

  test('404 when vendor not found', async () => {
    dbMocks.getVendor.mockResolvedValue(null)
    const res = await request(app).post('/payment').send(payload)
    expect(res.status).toBe(404)
  })

  test('400 when vendor squareOAuthStatus is error', async () => {
    dbMocks.getVendor.mockResolvedValue({
      vendorId: 'v1', squareOAuthStatus: 'error', squareAccessToken: 'tok', squareLocationId: 'loc',
    })
    const res = await request(app).post('/payment').send(payload)
    expect(res.status).toBe(400)
    expect(res.body.details).toMatch(/reconnected/)
  })

  test('500 when vendor has no locationId', async () => {
    dbMocks.getVendor.mockResolvedValue({ vendorId: 'v1', squareAccessToken: 'tok' })
    const res = await request(app).post('/payment').send(payload)
    expect(res.status).toBe(500)
  })

  test('500 when Square API throws', async () => {
    dbMocks.getVendor.mockResolvedValue({
      vendorId: 'v1', squareAccessToken: 'tok', squareLocationId: 'loc1',
    })
    mockCreatePayment.mockRejectedValue(new Error('Square down'))
    const res = await request(app).post('/payment').send(payload)
    expect(res.status).toBe(500)
    expect(res.body.details).toMatch(/Square down/)
  })
})

// ── Bundle payment ────────────────────────────────────────────

describe('POST /payment — bundle', () => {
  const houseVendor = { vendorId: 'house', isHouse: true, squareAccessToken: 'h-tok', squareLocationId: 'h-loc' }
  const otherVendor = { vendorId: 'v2', squareAccessToken: 'v2-tok', squareLocationId: 'v2-loc' }

  const bundlePayload = {
    sourceId: 'cnon:card',
    amount: 100,
    bundlePayments: [
      { vendorId: 'house', amount: 40 },
      { vendorId: 'v2', amount: 60 },
    ],
  }

  test('succeeds with house + other vendor', async () => {
    dbMocks.listVendors.mockResolvedValue([houseVendor, otherVendor])
    dbMocks.getVendor.mockResolvedValue(otherVendor)
    mockCreatePayment.mockResolvedValue({
      result: { payment: { id: 'pay_b1', status: 'COMPLETED' } },
    })

    const res = await request(app).post('/payment').send(bundlePayload)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ success: true, paymentId: 'pay_b1' })
    expect(res.body.splitPayments).toHaveLength(2)
  })

  test('consolidates duplicate vendorIds', async () => {
    dbMocks.listVendors.mockResolvedValue([houseVendor, otherVendor])
    dbMocks.getVendor.mockResolvedValue(otherVendor)
    mockCreatePayment.mockResolvedValue({
      result: { payment: { id: 'pay_b2', status: 'COMPLETED' } },
    })

    const res = await request(app).post('/payment').send({
      sourceId: 'cnon:card',
      amount: 100,
      bundlePayments: [
        { vendorId: 'v2', amount: 30 },
        { vendorId: 'v2', amount: 30 },
        { vendorId: 'house', amount: 40 },
      ],
    })
    expect(res.status).toBe(200)
    expect(res.body.splitPayments).toHaveLength(2)
    expect(res.body.splitPayments.find(p => p.vendorId === 'v2').amount).toBe(60)
  })

  test('500 when no house vendor configured', async () => {
    dbMocks.listVendors.mockResolvedValue([otherVendor])
    const res = await request(app).post('/payment').send(bundlePayload)
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/House vendor/)
  })

  test('400 when a non-house vendor is not connected to Square', async () => {
    dbMocks.listVendors.mockResolvedValue([houseVendor, otherVendor])
    dbMocks.getVendor.mockResolvedValue({ vendorId: 'v2' }) // no squareAccessToken
    const res = await request(app).post('/payment').send(bundlePayload)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/not connected/)
  })

  test('works when bundle has no house vendor payments', async () => {
    const v3 = { vendorId: 'v3', squareAccessToken: 'v3-tok', squareLocationId: 'v3-loc' }
    dbMocks.listVendors.mockResolvedValue([houseVendor, otherVendor, v3])
    dbMocks.getVendor.mockImplementation(async (id) => {
      if (id === 'v2') return otherVendor
      if (id === 'v3') return v3
      return null
    })
    mockCreatePayment.mockResolvedValue({
      result: { payment: { id: 'pay_b3', status: 'COMPLETED' } },
    })

    const res = await request(app).post('/payment').send({
      sourceId: 'cnon:card',
      amount: 100,
      bundlePayments: [
        { vendorId: 'v2', amount: 60 },
        { vendorId: 'v3', amount: 40 },
      ],
    })
    expect(res.status).toBe(200)
  })
})
