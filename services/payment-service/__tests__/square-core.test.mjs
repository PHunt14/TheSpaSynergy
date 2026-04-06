import { jest } from '@jest/globals'
import { createHmac } from 'crypto'

const originalEnv = { ...process.env }

jest.unstable_mockModule('crypto', () => ({
  randomUUID: () => 'test-uuid',
  createHmac,
}))

const { squareEnv, verifyWebhookSignature, buildOAuthUrl, decodeOAuthState } = await import('../src/square-core.js')

beforeEach(() => {
  process.env = { ...originalEnv }
})

afterAll(() => {
  process.env = originalEnv
})

// ── squareEnv ─────────────────────────────────────────────────

describe('squareEnv', () => {
  test('returns Production when env is production', () => {
    process.env.SQUARE_ENVIRONMENT = 'production'
    expect(squareEnv()).toBe('Production')
  })

  test('returns Sandbox when env is not production', () => {
    process.env.SQUARE_ENVIRONMENT = 'sandbox'
    expect(squareEnv()).toBe('Sandbox')
  })

  test('returns Sandbox when env is unset', () => {
    delete process.env.SQUARE_ENVIRONMENT
    expect(squareEnv()).toBe('Sandbox')
  })
})

// ── verifyWebhookSignature ────────────────────────────────────

describe('verifyWebhookSignature', () => {
  test('returns false when sigKey is missing', () => {
    expect(verifyWebhookSignature('body', 'sig', 'url', '')).toBe(false)
  })

  test('returns false when signature is missing', () => {
    expect(verifyWebhookSignature('body', null, 'url', 'key')).toBe(false)
  })

  test('returns true for valid signature', () => {
    const sigKey = 'test-key'
    const webhookUrl = 'https://example.com/webhook'
    const body = '{"type":"payment.completed"}'
    const hmac = createHmac('sha256', sigKey)
    hmac.update(webhookUrl + body)
    const validSig = hmac.digest('base64')
    expect(verifyWebhookSignature(body, validSig, webhookUrl, sigKey)).toBe(true)
  })

  test('returns false for invalid signature', () => {
    expect(verifyWebhookSignature('body', 'bad-sig', 'url', 'key')).toBe(false)
  })
})

// ── buildOAuthUrl ─────────────────────────────────────────────

describe('buildOAuthUrl', () => {
  test('returns null when SQUARE_APPLICATION_ID is not set', () => {
    delete process.env.SQUARE_APPLICATION_ID
    expect(buildOAuthUrl('v1', null)).toBeNull()
  })

  test('builds sandbox URL for sandbox app ID', () => {
    process.env.SQUARE_APPLICATION_ID = 'sandbox-abc'
    process.env.APP_URL = 'http://localhost:3000'
    const url = buildOAuthUrl('v1', null)
    expect(url).toContain('connect.squareupsandbox.com')
    expect(url).toContain('client_id=sandbox-abc')
    expect(url).toContain('MERCHANT_PROFILE_READ')
  })

  test('builds production URL for production app ID', () => {
    process.env.SQUARE_APPLICATION_ID = 'sq0idp-prod'
    process.env.APP_URL = 'http://localhost:3000'
    const url = buildOAuthUrl('v1', 's1')
    expect(url).toContain('connect.squareup.com')
    expect(url).not.toContain('sandbox')
  })
})

// ── decodeOAuthState ──────────────────────────────────────────

describe('decodeOAuthState', () => {
  test('decodes valid state with vendorId', () => {
    const state = Buffer.from(JSON.stringify({ vendorId: 'v1', nonce: 'n' })).toString('base64url')
    expect(decodeOAuthState(state)).toEqual({ vendorId: 'v1', nonce: 'n' })
  })

  test('returns null for state without vendorId', () => {
    const state = Buffer.from(JSON.stringify({ nonce: 'n' })).toString('base64url')
    expect(decodeOAuthState(state)).toBeNull()
  })

  test('returns null for invalid base64', () => {
    expect(decodeOAuthState('not-valid!!!')).toBeNull()
  })
})
