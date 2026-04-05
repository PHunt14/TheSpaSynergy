import { jest } from '@jest/globals'
import { setupMocks, resetAllMocks, dbMocks, mockRevokeToken } from './setup.mjs'

let app, request

const originalEnv = { ...process.env }

beforeAll(async () => {
  app = await setupMocks()
  request = (await import('supertest')).default
})

beforeEach(() => {
  resetAllMocks()
  process.env = { ...originalEnv }
  process.env.SQUARE_APPLICATION_ID = 'sandbox-test-id'
  process.env.SQUARE_APPLICATION_SECRET = 'secret'
})

afterAll(() => { process.env = originalEnv })

describe('POST /square/disconnect', () => {
  test('400 when neither vendorId nor staffId provided', async () => {
    const res = await request(app).post('/square/disconnect').send({})
    expect(res.status).toBe(400)
  })

  test('disconnects vendor and revokes token', async () => {
    dbMocks.getVendor.mockResolvedValue({ vendorId: 'v1', squareAccessToken: 'tok' })
    dbMocks.updateVendor.mockResolvedValue()
    mockRevokeToken.mockResolvedValue({})

    const res = await request(app).post('/square/disconnect').send({ vendorId: 'v1' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(dbMocks.updateVendor).toHaveBeenCalledWith('v1', expect.objectContaining({
      squareAccessToken: null,
      squareOAuthStatus: 'disconnected',
    }))
  })

  test('disconnects vendor even when revocation fails', async () => {
    dbMocks.getVendor.mockResolvedValue({ vendorId: 'v1', squareAccessToken: 'tok' })
    dbMocks.updateVendor.mockResolvedValue()
    mockRevokeToken.mockRejectedValue(new Error('revoke fail'))

    const res = await request(app).post('/square/disconnect').send({ vendorId: 'v1' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  test('disconnects vendor without revocation when no token exists', async () => {
    dbMocks.getVendor.mockResolvedValue({ vendorId: 'v1' })
    dbMocks.updateVendor.mockResolvedValue()

    const res = await request(app).post('/square/disconnect').send({ vendorId: 'v1' })
    expect(res.status).toBe(200)
    expect(mockRevokeToken).not.toHaveBeenCalled()
  })

  test('disconnects staff by staffId', async () => {
    dbMocks.getStaff.mockResolvedValue({ visibleId: 's1', squareAccessToken: 'staff-tok' })
    dbMocks.updateStaff.mockResolvedValue()
    mockRevokeToken.mockResolvedValue({})

    const res = await request(app).post('/square/disconnect').send({ staffId: 's1' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(dbMocks.updateStaff).toHaveBeenCalledWith('s1', expect.objectContaining({
      squareAccessToken: null,
      squareOAuthStatus: 'disconnected',
    }))
  })

  test('404 when staff not found', async () => {
    dbMocks.getStaff.mockResolvedValue(null)
    const res = await request(app).post('/square/disconnect').send({ staffId: 's1' })
    expect(res.status).toBe(404)
  })

  test('500 when db throws', async () => {
    dbMocks.getVendor.mockRejectedValue(new Error('db error'))
    const res = await request(app).post('/square/disconnect').send({ vendorId: 'v1' })
    expect(res.status).toBe(500)
  })
})
