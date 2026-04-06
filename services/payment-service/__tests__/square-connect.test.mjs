import { jest } from '@jest/globals'
import { setupMocks, resetAllMocks } from './setup.mjs'

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
  process.env.APP_URL = 'http://localhost:3000'
})

afterAll(() => { process.env = originalEnv })

describe('GET /square/connect', () => {
  test('400 when vendorId missing', async () => {
    const res = await request(app).get('/square/connect')
    expect(res.status).toBe(400)
  })

  test('redirects to error when SQUARE_APPLICATION_ID missing', async () => {
    delete process.env.SQUARE_APPLICATION_ID
    const res = await request(app).get('/square/connect?vendorId=v1')
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('error=missing_credentials')
  })

  test('redirects to sandbox OAuth URL', async () => {
    const res = await request(app).get('/square/connect?vendorId=v1')
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('connect.squareupsandbox.com')
    expect(res.headers.location).toContain('client_id=sandbox-test-id')
  })

  test('redirects to production OAuth URL for production app ID', async () => {
    process.env.SQUARE_APPLICATION_ID = 'sq0idp-prod'
    const res = await request(app).get('/square/connect?vendorId=v1')
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('connect.squareup.com')
    expect(res.headers.location).not.toContain('sandbox')
  })

  test('includes staffId in state when provided', async () => {
    const res = await request(app).get('/square/connect?vendorId=v1&staffId=s1')
    expect(res.status).toBe(302)
    // State is base64url-encoded in the redirect URL
    const url = new URL(res.headers.location)
    const state = JSON.parse(Buffer.from(url.searchParams.get('state'), 'base64url').toString())
    expect(state.vendorId).toBe('v1')
    expect(state.staffId).toBe('s1')
  })
})
