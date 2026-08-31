/**
 * Tests for the Square configuration validators that drive the kiosk's
 * "fail loudly" behavior. These guard the rule that the OAuth application ID's
 * environment (sandbox- prefix) must match NEXT_PUBLIC_SQUARE_ENVIRONMENT,
 * and that a missing app id is reported explicitly.
 */

import {
  normalizeEnvironment,
  environmentForAppId,
  validateSquareClientConfig,
  validateSquareServerConfig,
} from '../../lib/square/config.js'

describe('normalizeEnvironment', () => {
  test('maps "production" to production', () => {
    expect(normalizeEnvironment('production')).toBe('production')
  })

  test('treats anything else (including undefined) as sandbox', () => {
    expect(normalizeEnvironment('sandbox')).toBe('sandbox')
    expect(normalizeEnvironment(undefined)).toBe('sandbox')
    expect(normalizeEnvironment('')).toBe('sandbox')
    expect(normalizeEnvironment('PRODUCTION')).toBe('sandbox') // case-sensitive by design
  })
})

describe('environmentForAppId', () => {
  test('sandbox- prefixed ids are sandbox', () => {
    expect(environmentForAppId('sandbox-sq0idb-abc123')).toBe('sandbox')
  })

  test('non-prefixed ids are production', () => {
    expect(environmentForAppId('sq0idp-abc123')).toBe('production')
  })

  test('null/empty id returns null', () => {
    expect(environmentForAppId(null)).toBeNull()
    expect(environmentForAppId('')).toBeNull()
  })
})

describe('validateSquareClientConfig', () => {
  test('ok when sandbox app id matches sandbox environment', () => {
    const r = validateSquareClientConfig({ appId: 'sandbox-sq0idb-x', environment: 'sandbox' })
    expect(r.ok).toBe(true)
    expect(r.code).toBe('ok')
    expect(r.environment).toBe('sandbox')
  })

  test('ok when production app id matches production environment', () => {
    const r = validateSquareClientConfig({ appId: 'sq0idp-x', environment: 'production' })
    expect(r.ok).toBe(true)
    expect(r.code).toBe('ok')
  })

  test('fails loudly when app id is missing', () => {
    const r = validateSquareClientConfig({ appId: undefined, environment: 'sandbox' })
    expect(r.ok).toBe(false)
    expect(r.code).toBe('missing_app_id')
    expect(r.message).toMatch(/NEXT_PUBLIC_SQUARE_APPLICATION_ID/)
  })

  test('fails loudly on sandbox app id with production environment', () => {
    const r = validateSquareClientConfig({ appId: 'sandbox-sq0idb-x', environment: 'production' })
    expect(r.ok).toBe(false)
    expect(r.code).toBe('env_mismatch')
    expect(r.message).toMatch(/mismatch/i)
  })

  test('fails loudly on production app id with sandbox environment', () => {
    const r = validateSquareClientConfig({ appId: 'sq0idp-x', environment: 'sandbox' })
    expect(r.ok).toBe(false)
    expect(r.code).toBe('env_mismatch')
  })

  test('defaults missing environment to sandbox (so a production key mismatches loudly)', () => {
    const r = validateSquareClientConfig({ appId: 'sq0idp-x' })
    expect(r.ok).toBe(false)
    expect(r.code).toBe('env_mismatch')
  })
})

describe('validateSquareServerConfig', () => {
  test('applies the same rule as the client validator', () => {
    expect(validateSquareServerConfig({ appId: 'sandbox-x', environment: 'sandbox' }).ok).toBe(true)
    expect(validateSquareServerConfig({ appId: 'sandbox-x', environment: 'production' }).code).toBe('env_mismatch')
    expect(validateSquareServerConfig({ appId: '', environment: 'sandbox' }).code).toBe('missing_app_id')
  })
})
