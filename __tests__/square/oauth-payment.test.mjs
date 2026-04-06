/**
 * Square OAuth + Payment Tests
 *
 * Unit tests for:
 * - OAuth URL generation
 * - OAuth state encoding/decoding
 * - Webhook signature verification
 * - Webhook event processing + idempotency
 * - Vendor token update builders
 * - Vendor disconnect update builder
 * - Payment vendor validation
 * - Token expiry detection
 *
 * Integration tests for:
 * - Payment route (POST /api/payment)
 */

import { jest } from '@jest/globals'
import { createHmac } from 'node:crypto'

import {
  buildOAuthUrl,
  decodeOAuthState,
  verifyWebhookSignature,
  buildVendorTokenUpdate,
  buildVendorDisconnectUpdate,
  processPaymentEvent,
  validateVendorForPayment,
  isTokenExpiringSoon,
} from '../../lib/square/core.js'

// ── Env ───────────────────────────────────────────────────────

process.env.SQUARE_APPLICATION_ID = 'sandbox-sq0idb-TEST'
process.env.SQUARE_APPLICATION_SECRET = 'sandbox-sq0csb-TEST'
process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID = 'sandbox-sq0idb-TEST'
process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID = 'LTEST123'
process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT = 'sandbox'
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = 'test-webhook-key'

// ── Helpers ───────────────────────────────────────────────────

function makeWebhookSignature(body) {
  const url = 'http://localhost:3000/api/webhooks/square'
  const hmac = createHmac('sha256', 'test-webhook-key')
  hmac.update(url + body)
  return hmac.digest('base64')
}

// ═══════════════════════════════════════════════════════════════
// UNIT TESTS
// ═══════════════════════════════════════════════════════════════

// ─── OAuth URL Generation ─────────────────────────────────────

describe('buildOAuthUrl', () => {
  const opts = {
    appId: 'sandbox-sq0idb-TEST',
    baseUrl: 'http://localhost:3000',
    environment: 'sandbox',
  }

  test('generates correct sandbox OAuth URL', () => {
    const url = buildOAuthUrl('vendor-1', opts)
    expect(url).toContain('connect.squareupsandbox.com/oauth2/authorize')
    expect(url).toContain('client_id=sandbox-sq0idb-TEST')
    expect(url).toContain('PAYMENTS_WRITE')
    expect(url).toContain('PAYMENTS_READ')
    expect(url).toContain('MERCHANT_PROFILE_READ')
    expect(url).toContain('redirect_uri=')
    expect(url).toContain('state=')
  })

  test('generates production URL when environment is production', () => {
    const url = buildOAuthUrl('vendor-1', { ...opts, environment: 'production' })
    expect(url).toContain('connect.squareup.com/oauth2/authorize')
    expect(url).not.toContain('squareupsandbox.com')
  })

  test('returns null when appId is missing', () => {
    const url = buildOAuthUrl('vendor-1', { ...opts, appId: null })
    expect(url).toBeNull()
  })

  test('returns null when appId is empty string', () => {
    const url = buildOAuthUrl('vendor-1', { ...opts, appId: '' })
    expect(url).toBeNull()
  })

  test('includes encoded redirect URI', () => {
    const url = buildOAuthUrl('vendor-1', opts)
    expect(url).toContain(encodeURIComponent('http://localhost:3000/api/square/callback'))
  })
})

// ─── OAuth State Encoding/Decoding ────────────────────────────

describe('decodeOAuthState', () => {
  test('decodes valid state with vendorId', () => {
    const state = Buffer.from(JSON.stringify({ vendorId: 'vendor-1', nonce: 'abc' })).toString('base64url')
    const result = decodeOAuthState(state)
    expect(result).toEqual({ vendorId: 'vendor-1', nonce: 'abc' })
  })

  test('returns null for invalid base64', () => {
    expect(decodeOAuthState('not-valid!!!')).toBeNull()
  })

  test('returns null for valid base64 but no vendorId', () => {
    const state = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64url')
    expect(decodeOAuthState(state)).toBeNull()
  })

  test('returns null for empty string', () => {
    expect(decodeOAuthState('')).toBeNull()
  })
})

// ─── Webhook Signature Verification ──────────────────────────

describe('verifyWebhookSignature', () => {
  const webhookUrl = 'http://localhost:3000/api/webhooks/square'
  const sigKey = 'test-webhook-key'

  test('passes with correct signature', () => {
    const body = '{"type":"payment.completed"}'
    const hmac = createHmac('sha256', sigKey)
    hmac.update(webhookUrl + body)
    const sig = hmac.digest('base64')

    expect(verifyWebhookSignature(body, sig, webhookUrl, sigKey)).toBe(true)
  })

  test('fails with incorrect signature', () => {
    expect(verifyWebhookSignature('body', 'bad-sig', webhookUrl, sigKey)).toBe(false)
  })

  test('fails when signature is null', () => {
    expect(verifyWebhookSignature('body', null, webhookUrl, sigKey)).toBe(false)
  })

  test('fails when sigKey is null', () => {
    expect(verifyWebhookSignature('body', 'sig', webhookUrl, null)).toBe(false)
  })

  test('fails when sigKey is empty', () => {
    expect(verifyWebhookSignature('body', 'sig', webhookUrl, '')).toBe(false)
  })
})

// ─── Vendor Token Update Builder ──────────────────────────────

describe('buildVendorTokenUpdate', () => {
  test('builds correct update object from token result', () => {
    const result = buildVendorTokenUpdate('vendor-1', {
      accessToken: 'tok_new',
      refreshToken: 'ref_new',
      merchantId: 'merch-1',
      expiresAt: '2025-08-01T00:00:00Z',
    }, 'LOC1', 'app-id')

    expect(result).toMatchObject({
      vendorId: 'vendor-1',
      squareAccessToken: 'tok_new',
      squareRefreshToken: 'ref_new',
      squareMerchantId: 'merch-1',
      squareLocationId: 'LOC1',
      squareApplicationId: 'app-id',
      squareOAuthStatus: 'connected',
      squareTokenExpiresAt: '2025-08-01T00:00:00Z',
    })
    expect(result.squareConnectedAt).toBeDefined()
  })

  test('returns null when accessToken is missing', () => {
    const result = buildVendorTokenUpdate('vendor-1', {
      accessToken: null,
      refreshToken: 'ref',
    }, 'LOC1', 'app-id')
    expect(result).toBeNull()
  })

  test('handles missing refreshToken gracefully', () => {
    const result = buildVendorTokenUpdate('vendor-1', {
      accessToken: 'tok',
    }, 'LOC1', 'app-id')
    expect(result.squareRefreshToken).toBeNull()
    expect(result.squareMerchantId).toBeNull()
  })

  test('generates default expiresAt when not provided', () => {
    const result = buildVendorTokenUpdate('vendor-1', {
      accessToken: 'tok',
    }, 'LOC1', 'app-id')
    const expiry = new Date(result.squareTokenExpiresAt).getTime()
    const now = Date.now()
    // Should be ~30 days from now
    expect(expiry).toBeGreaterThan(now + 29 * 24 * 60 * 60 * 1000)
    expect(expiry).toBeLessThan(now + 31 * 24 * 60 * 60 * 1000)
  })
})

// ─── Vendor Disconnect Update Builder ─────────────────────────

describe('buildVendorDisconnectUpdate', () => {
  test('clears all Square fields', () => {
    const result = buildVendorDisconnectUpdate('vendor-1')
    expect(result).toEqual({
      vendorId: 'vendor-1',
      squareAccessToken: null,
      squareRefreshToken: null,
      squareMerchantId: null,
      squareLocationId: null,
      squareApplicationId: null,
      squareOAuthStatus: 'disconnected',
      squareTokenExpiresAt: null,
      squareConnectedAt: null,
    })
  })
})

// ─── Webhook Event Processing ─────────────────────────────────

describe('processPaymentEvent', () => {
  test('returns update for completed payment', () => {
    const event = {
      type: 'payment.completed',
      data: {
        object: {
          payment: { id: 'pay-123', status: 'COMPLETED', amountMoney: { amount: 6500, currency: 'USD' } },
        },
      },
    }
    const appointment = { appointmentId: 'appt-1', paymentStatus: null, status: 'pending' }
    const result = processPaymentEvent(event, appointment)

    expect(result).toMatchObject({
      appointmentId: 'appt-1',
      paymentStatus: 'COMPLETED',
      paymentAmount: 65,
      status: 'confirmed',
    })
    expect(result.paymentRaw).toBeDefined()
  })

  test('idempotency: returns null when status already matches', () => {
    const event = {
      data: { object: { payment: { id: 'pay-123', status: 'COMPLETED', amountMoney: { amount: 6500 } } } },
    }
    const appointment = { appointmentId: 'appt-1', paymentStatus: 'COMPLETED', status: 'confirmed' }
    expect(processPaymentEvent(event, appointment)).toBeNull()
  })

  test('returns null when payment ID is missing', () => {
    const event = { data: { object: { payment: {} } } }
    expect(processPaymentEvent(event, {})).toBeNull()
  })

  test('returns null when payment object is missing', () => {
    const event = { data: { object: {} } }
    expect(processPaymentEvent(event, {})).toBeNull()
  })

  test('does not change appointment status for non-COMPLETED payment', () => {
    const event = {
      data: { object: { payment: { id: 'pay-123', status: 'PENDING', amountMoney: { amount: 6500 } } } },
    }
    const appointment = { appointmentId: 'appt-1', paymentStatus: null, status: 'pending' }
    const result = processPaymentEvent(event, appointment)
    expect(result.paymentStatus).toBe('PENDING')
    expect(result.status).toBeUndefined() // status unchanged
  })

  test('handles missing amountMoney', () => {
    const event = {
      data: { object: { payment: { id: 'pay-123', status: 'COMPLETED' } } },
    }
    const appointment = { appointmentId: 'appt-1', paymentStatus: null, status: 'pending' }
    const result = processPaymentEvent(event, appointment)
    expect(result.paymentAmount).toBeUndefined()
  })
})

// ─── Payment Vendor Validation ────────────────────────────────

describe('validateVendorForPayment', () => {
  test('returns error for null vendor', () => {
    const result = validateVendorForPayment(null)
    expect(result.error).toBe('Vendor not found')
    expect(result.status).toBe(404)
  })

  test('returns error for vendor with OAuth error status', () => {
    const result = validateVendorForPayment({
      squareOAuthStatus: 'error',
      squareAccessToken: 'expired-tok',
    })
    expect(result.error).toContain('unavailable')
    expect(result.status).toBe(400)
  })

  test('returns error for vendor without access token', () => {
    const result = validateVendorForPayment({
      squareOAuthStatus: 'disconnected',
      squareAccessToken: null,
    })
    expect(result.error).toContain('configuration')
    expect(result.status).toBe(500)
  })

  test('returns accessToken and locationId for connected vendor', () => {
    const result = validateVendorForPayment({
      squareOAuthStatus: 'connected',
      squareAccessToken: 'tok-123',
      squareLocationId: 'LOC-1',
    })
    expect(result.accessToken).toBe('tok-123')
    expect(result.locationId).toBe('LOC-1')
    expect(result.error).toBeUndefined()
  })
})

// ─── Token Expiry Detection ───────────────────────────────────

describe('isTokenExpiringSoon', () => {
  test('returns true when expiresAt is null', () => {
    expect(isTokenExpiringSoon(null)).toBe(true)
  })

  test('returns true when token expires within threshold', () => {
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    expect(isTokenExpiringSoon(soon, 7)).toBe(true)
  })

  test('returns false when token expires well after threshold', () => {
    const later = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString()
    expect(isTokenExpiringSoon(later, 7)).toBe(false)
  })

  test('returns true when token is already expired', () => {
    const past = new Date(Date.now() - 1000).toISOString()
    expect(isTokenExpiringSoon(past)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// INTEGRATION TESTS — Payment Route
// ═══════════════════════════════════════════════════════════════

// Mock dependencies before importing payment route
const mockVendorDb = {}
const mockVendorGet = jest.fn(async ({ vendorId }) => ({
  data: mockVendorDb[vendorId] || null,
  errors: null,
}))
const mockVendorList = jest.fn(async () => ({
  data: Object.values(mockVendorDb),
  errors: null,
}))
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
    },
  })),
}))
jest.unstable_mockModule('aws-amplify', () => ({
  Amplify: { configure: jest.fn() },
}))
jest.unstable_mockModule('../../../amplify_outputs.json', () => ({}), { virtual: true })

function seedVendor(overrides = {}) {
  const v = {
    vendorId: 'vendor-1',
    name: 'Test Vendor',
    squareAccessToken: null,
    squareRefreshToken: null,
    squareMerchantId: null,
    squareLocationId: null,
    squareOAuthStatus: 'disconnected',
    squareConnectedAt: null,
    isHouse: false,
    ...overrides,
  }
  mockVendorDb[v.vendorId] = v
  return v
}

function resetDb() {
  Object.keys(mockVendorDb).forEach((k) => delete mockVendorDb[k])
}

describe('POST /api/payment (integration)', () => {
  let handler

  beforeAll(async () => {
    handler = await import('../../app/api/payment/route.js')
  })

  beforeEach(() => {
    resetDb()
    jest.clearAllMocks()
  })

  test('uses vendor access token for payment', async () => {
    seedVendor({
      squareAccessToken: 'vendor-tok',
      squareLocationId: 'VLOC1',
      squareOAuthStatus: 'connected',
    })
    mockCreatePayment.mockResolvedValueOnce({
      result: { payment: { id: 'pay-new', status: 'COMPLETED' } },
    })

    const req = {
      json: async () => ({
        sourceId: 'cnon:card-nonce-ok',
        amount: 65,
        vendorId: 'vendor-1',
      }),
    }
    const res = await handler.POST(req)
    const body = await res.json()

    expect(body.success).toBe(true)
    expect(body.paymentId).toBe('pay-new')
  })

  test('rejects payment when vendor not connected and no platform token', async () => {
    seedVendor({ squareAccessToken: null })
    const origToken = process.env.SQUARE_ACCESS_TOKEN
    delete process.env.SQUARE_ACCESS_TOKEN

    const req = {
      json: async () => ({
        sourceId: 'cnon:card-nonce-ok',
        amount: 65,
        vendorId: 'vendor-1',
      }),
    }
    const res = await handler.POST(req)
    expect(res.status).toBe(500)

    process.env.SQUARE_ACCESS_TOKEN = origToken
  })

  test('rejects payment when vendor has OAuth error status', async () => {
    seedVendor({ squareOAuthStatus: 'error', squareAccessToken: 'expired-tok' })

    const req = {
      json: async () => ({
        sourceId: 'cnon:card-nonce-ok',
        amount: 65,
        vendorId: 'vendor-1',
      }),
    }
    const res = await handler.POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('unavailable')
  })

  test('returns error for missing payment details', async () => {
    const req = { json: async () => ({ sourceId: null, amount: null }) }
    const res = await handler.POST(req)
    expect(res.status).toBe(400)
  })

  test('returns 404 for unknown vendor', async () => {
    const req = {
      json: async () => ({
        sourceId: 'cnon:card-nonce-ok',
        amount: 65,
        vendorId: 'vendor-nonexistent',
      }),
    }
    const res = await handler.POST(req)
    expect(res.status).toBe(404)
  })

  test('returns error when Square API fails', async () => {
    seedVendor({ squareAccessToken: 'vendor-tok', squareLocationId: 'VLOC1' })
    mockCreatePayment.mockRejectedValueOnce(new Error('Card declined'))

    const req = {
      json: async () => ({
        sourceId: 'cnon:card-nonce-fail',
        amount: 65,
        vendorId: 'vendor-1',
      }),
    }
    const res = await handler.POST(req)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('failed')
  })
})
