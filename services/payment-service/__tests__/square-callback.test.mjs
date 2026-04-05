import { jest } from '@jest/globals'
import { setupMocks, resetAllMocks, dbMocks, mockObtainToken, mockListLocations } from './setup.mjs'

let app, request

const originalEnv = { ...process.env }

function makeState(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url')
}

beforeAll(async () => {
  app = await setupMocks()
  request = (await import('supertest')).default
})

beforeEach(() => {
  resetAllMocks()
  process.env = { ...originalEnv }
  process.env.SQUARE_APPLICATION_ID = 'sandbox-test-id'
  process.env.SQUARE_APPLICATION_SECRET = 'secret'
  process.env.APP_URL = 'http://localhost:3000'
})

afterAll(() => { process.env = originalEnv })

describe('GET /square/callback', () => {
  test('redirects with error when Square returns error param', async () => {
    const res = await request(app).get('/square/callback?error=access_denied')
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('error=oauth_failed')
  })

  test('redirects with error when code or state missing', async () => {
    const res = await request(app).get('/square/callback?code=abc')
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('missing_code_or_state')
  })

  test('redirects with error for invalid state', async () => {
    const res = await request(app).get('/square/callback?code=abc&state=!!!invalid!!!')
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('invalid_state')
  })

  test('redirects with error when credentials missing', async () => {
    delete process.env.SQUARE_APPLICATION_SECRET
    const state = makeState({ vendorId: 'v1', nonce: 'n' })
    const res = await request(app).get(`/square/callback?code=abc&state=${state}`)
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('missing_credentials')
  })

  test('redirects with error when obtainToken returns no accessToken', async () => {
    mockObtainToken.mockResolvedValue({ result: {} })
    const state = makeState({ vendorId: 'v1', nonce: 'n' })
    const res = await request(app).get(`/square/callback?code=abc&state=${state}`)
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('no_access_token')
  })

  test('redirects with error when no locations found', async () => {
    mockObtainToken.mockResolvedValue({
      result: { accessToken: 'tok', refreshToken: 'ref', merchantId: 'm1' },
    })
    mockListLocations.mockResolvedValue({ result: { locations: [] } })
    const state = makeState({ vendorId: 'v1', nonce: 'n' })
    const res = await request(app).get(`/square/callback?code=abc&state=${state}`)
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('no_locations')
  })

  test('saves vendor tokens and redirects on success', async () => {
    mockObtainToken.mockResolvedValue({
      result: { accessToken: 'tok', refreshToken: 'ref', merchantId: 'm1', expiresAt: '2025-12-01' },
    })
    mockListLocations.mockResolvedValue({
      result: { locations: [{ id: 'loc1', status: 'ACTIVE' }] },
    })
    dbMocks.updateVendor.mockResolvedValue()

    const state = makeState({ vendorId: 'v1', nonce: 'n' })
    const res = await request(app).get(`/square/callback?code=abc&state=${state}`)
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('success=square_connected')
    expect(res.headers.location).not.toContain('staffId')
    expect(dbMocks.updateVendor).toHaveBeenCalledWith('v1', expect.objectContaining({
      squareAccessToken: 'tok',
      squareLocationId: 'loc1',
      squareOAuthStatus: 'connected',
    }))
  })

  test('saves staff tokens when staffId present', async () => {
    mockObtainToken.mockResolvedValue({
      result: { accessToken: 'tok', refreshToken: 'ref', merchantId: 'm1' },
    })
    mockListLocations.mockResolvedValue({
      result: { locations: [{ id: 'loc1', status: 'ACTIVE' }] },
    })
    dbMocks.updateStaff.mockResolvedValue()

    const state = makeState({ vendorId: 'v1', staffId: 's1', nonce: 'n' })
    const res = await request(app).get(`/square/callback?code=abc&state=${state}`)
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('staffId=s1')
    expect(dbMocks.updateStaff).toHaveBeenCalledWith('s1', expect.objectContaining({
      squareAccessToken: 'tok',
      squareOAuthStatus: 'connected',
    }))
    expect(dbMocks.updateVendor).not.toHaveBeenCalled()
  })

  test('picks first location when no ACTIVE location exists', async () => {
    mockObtainToken.mockResolvedValue({
      result: { accessToken: 'tok', refreshToken: 'ref', merchantId: 'm1' },
    })
    mockListLocations.mockResolvedValue({
      result: { locations: [{ id: 'loc-inactive', status: 'INACTIVE' }] },
    })
    dbMocks.updateVendor.mockResolvedValue()

    const state = makeState({ vendorId: 'v1', nonce: 'n' })
    const res = await request(app).get(`/square/callback?code=abc&state=${state}`)
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('success=square_connected')
    expect(dbMocks.updateVendor).toHaveBeenCalledWith('v1', expect.objectContaining({
      squareLocationId: 'loc-inactive',
    }))
  })

  test('redirects with no_locations when listLocations throws', async () => {
    mockObtainToken.mockResolvedValue({
      result: { accessToken: 'tok', refreshToken: 'ref', merchantId: 'm1' },
    })
    mockListLocations.mockRejectedValue(new Error('locations api down'))

    const state = makeState({ vendorId: 'v1', nonce: 'n' })
    const res = await request(app).get(`/square/callback?code=abc&state=${state}`)
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('no_locations')
  })

  test('redirects with error when obtainToken throws', async () => {
    mockObtainToken.mockRejectedValue(new Error('network fail'))
    const state = makeState({ vendorId: 'v1', nonce: 'n' })
    const res = await request(app).get(`/square/callback?code=abc&state=${state}`)
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('oauth_failed')
    expect(res.headers.location).toContain('network%20fail')
  })
})
