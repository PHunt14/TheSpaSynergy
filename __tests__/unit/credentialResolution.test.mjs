/**
 * Unit Tests for Credential Resolution Chain
 *
 * Tests the new hasValidCredentials, credentialsMatch, and resolveCredentialChain
 * functions added to paymentRouting.ts.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.7
 */

import { describe, test, expect } from '@jest/globals'
import {
  hasValidCredentials,
  credentialsMatch,
  resolveCredentialChain,
} from '../../app/utils/paymentRouting.ts'

// ── Test Fixtures ────────────────────────────────────────────

function makeStaff(overrides = {}) {
  return {
    visibleId: 'staff-1',
    staffName: 'Trinity',
    vendorId: 'vendor-1',
    isActive: true,
    squareAccessToken: 'staff-token-123',
    squareLocationId: 'staff-loc-456',
    squareOAuthStatus: 'connected',
    ...overrides,
  }
}

function makeSiblingStaff(overrides = {}) {
  return {
    visibleId: 'staff-2',
    staffName: 'Neo',
    vendorId: 'vendor-1',
    isActive: true,
    squareAccessToken: 'sibling-token-789',
    squareLocationId: 'sibling-loc-012',
    squareOAuthStatus: 'connected',
    ...overrides,
  }
}

function makeHouseProvider(overrides = {}) {
  return {
    vendorId: 'house-vendor',
    name: 'Stacey House',
    email: 'stacey@example.com',
    isActive: true,
    isHouse: true,
    squareAccessToken: 'house-token-abc',
    squareLocationId: 'house-loc-def',
    squareOAuthStatus: 'connected',
    ...overrides,
  }
}

// ── hasValidCredentials ─────────────────────────────────────

describe('hasValidCredentials', () => {
  test('returns true when all conditions met', () => {
    expect(hasValidCredentials({
      squareAccessToken: 'token-123',
      squareLocationId: 'loc-456',
      squareOAuthStatus: 'connected',
    })).toBe(true)
  })

  test('returns true when status is "disconnected" (not "error")', () => {
    expect(hasValidCredentials({
      squareAccessToken: 'token-123',
      squareLocationId: 'loc-456',
      squareOAuthStatus: 'disconnected',
    })).toBe(true)
  })

  test('returns false when squareOAuthStatus is "error"', () => {
    expect(hasValidCredentials({
      squareAccessToken: 'token-123',
      squareLocationId: 'loc-456',
      squareOAuthStatus: 'error',
    })).toBe(false)
  })

  test('returns false when squareAccessToken is empty', () => {
    expect(hasValidCredentials({
      squareAccessToken: '',
      squareLocationId: 'loc-456',
      squareOAuthStatus: 'connected',
    })).toBe(false)
  })

  test('returns false when squareAccessToken is whitespace-only', () => {
    expect(hasValidCredentials({
      squareAccessToken: '   ',
      squareLocationId: 'loc-456',
      squareOAuthStatus: 'connected',
    })).toBe(false)
  })

  test('returns false when squareAccessToken is undefined', () => {
    expect(hasValidCredentials({
      squareAccessToken: undefined,
      squareLocationId: 'loc-456',
      squareOAuthStatus: 'connected',
    })).toBe(false)
  })

  test('returns false when squareLocationId is empty', () => {
    expect(hasValidCredentials({
      squareAccessToken: 'token-123',
      squareLocationId: '',
      squareOAuthStatus: 'connected',
    })).toBe(false)
  })

  test('returns false when squareLocationId is whitespace-only', () => {
    expect(hasValidCredentials({
      squareAccessToken: 'token-123',
      squareLocationId: '  \t  ',
      squareOAuthStatus: 'connected',
    })).toBe(false)
  })

  test('returns false when squareLocationId is undefined', () => {
    expect(hasValidCredentials({
      squareAccessToken: 'token-123',
      squareLocationId: undefined,
      squareOAuthStatus: 'connected',
    })).toBe(false)
  })

  test('returns true when squareOAuthStatus is undefined (not "error")', () => {
    expect(hasValidCredentials({
      squareAccessToken: 'token-123',
      squareLocationId: 'loc-456',
      squareOAuthStatus: undefined,
    })).toBe(true)
  })
})

// ── credentialsMatch ────────────────────────────────────────

describe('credentialsMatch', () => {
  test('returns true when both accessToken and locationId match', () => {
    const a = { accessToken: 'token-abc', locationId: 'loc-123' }
    const b = { accessToken: 'token-abc', locationId: 'loc-123' }
    expect(credentialsMatch(a, b)).toBe(true)
  })

  test('returns false when accessTokens differ', () => {
    const a = { accessToken: 'token-abc', locationId: 'loc-123' }
    const b = { accessToken: 'token-xyz', locationId: 'loc-123' }
    expect(credentialsMatch(a, b)).toBe(false)
  })

  test('returns false when locationIds differ', () => {
    const a = { accessToken: 'token-abc', locationId: 'loc-123' }
    const b = { accessToken: 'token-abc', locationId: 'loc-456' }
    expect(credentialsMatch(a, b)).toBe(false)
  })

  test('returns false when both differ', () => {
    const a = { accessToken: 'token-abc', locationId: 'loc-123' }
    const b = { accessToken: 'token-xyz', locationId: 'loc-456' }
    expect(credentialsMatch(a, b)).toBe(false)
  })
})

// ── resolveCredentialChain ──────────────────────────────────

describe('resolveCredentialChain', () => {
  describe('staff resolution (step a)', () => {
    test('resolves to staff credentials when staff has valid credentials', () => {
      const staff = makeStaff()
      const result = resolveCredentialChain(staff, [], makeHouseProvider())

      expect(result).toEqual({
        credentials: { accessToken: 'staff-token-123', locationId: 'staff-loc-456' },
        source: 'staff',
        staffId: 'staff-1',
        vendorId: 'vendor-1',
        resolutionPath: ['staff:resolved'],
      })
    })

    test('staff resolution takes priority over sibling and house', () => {
      const staff = makeStaff()
      const sibling = makeSiblingStaff()
      const result = resolveCredentialChain(staff, [sibling], makeHouseProvider())

      expect(result.source).toBe('staff')
      expect(result.credentials.accessToken).toBe('staff-token-123')
    })
  })

  describe('sibling staff resolution (step b)', () => {
    test('falls back to sibling when staff is invalid', () => {
      const staff = makeStaff({ squareOAuthStatus: 'error' })
      const sibling = makeSiblingStaff()
      const result = resolveCredentialChain(staff, [sibling], makeHouseProvider())

      expect(result).toEqual({
        credentials: { accessToken: 'sibling-token-789', locationId: 'sibling-loc-012' },
        source: 'sibling_staff',
        staffId: 'staff-2',
        vendorId: 'vendor-1',
        resolutionPath: ['staff:invalid', 'sibling:resolved'],
      })
    })

    test('valid sibling credentials still work when status is "disconnected"', () => {
      const staff = makeStaff({ squareAccessToken: '' })
      const sibling = makeSiblingStaff({ squareOAuthStatus: 'disconnected' })
      const result = resolveCredentialChain(staff, [sibling], makeHouseProvider())

      expect(result.source).toBe('sibling_staff')
      expect(result.credentials.accessToken).toBe('sibling-token-789')
      expect(result.resolutionPath).toContain('sibling:resolved')
    })

    test('sibling with empty token is skipped', () => {
      const staff = makeStaff({ squareAccessToken: '' })
      const sibling = makeSiblingStaff({ squareAccessToken: '' })
      const result = resolveCredentialChain(staff, [sibling], makeHouseProvider())

      expect(result.source).toBe('house')
    })

    test('sibling with whitespace-only locationId is skipped', () => {
      const staff = makeStaff({ squareAccessToken: '' })
      const sibling = makeSiblingStaff({ squareLocationId: '   ' })
      const result = resolveCredentialChain(staff, [sibling], makeHouseProvider())

      expect(result.source).toBe('house')
    })

    test('picks the first valid sibling when multiple exist', () => {
      const staff = makeStaff({ squareAccessToken: undefined })
      const sibling1 = makeSiblingStaff({ visibleId: 'staff-2', squareAccessToken: 'first-token' })
      const sibling2 = makeSiblingStaff({ visibleId: 'staff-3', squareAccessToken: 'second-token' })
      const result = resolveCredentialChain(staff, [sibling1, sibling2], makeHouseProvider())

      expect(result.source).toBe('sibling_staff')
      expect(result.credentials.accessToken).toBe('first-token')
      expect(result.staffId).toBe('staff-2')
    })
  })

  describe('house provider resolution (step c)', () => {
    test('falls back to house when staff and siblings are invalid', () => {
      const staff = makeStaff({ squareAccessToken: undefined })
      const sibling = makeSiblingStaff({ squareOAuthStatus: 'error' })
      const result = resolveCredentialChain(staff, [sibling], makeHouseProvider())

      expect(result).toEqual({
        credentials: { accessToken: 'house-token-abc', locationId: 'house-loc-def' },
        source: 'house',
        vendorId: 'house-vendor',
        resolutionPath: ['staff:invalid', 'sibling:none', 'house:resolved'],
      })
    })

    test('house provider does NOT require squareOAuthStatus !== "error"', () => {
      const staff = makeStaff({ squareAccessToken: undefined })
      const house = makeHouseProvider({ squareOAuthStatus: 'error' })
      const result = resolveCredentialChain(staff, [], house)

      // House resolves even with 'error' status — just needs valid token+location
      expect(result.source).toBe('house')
      expect(result.credentials.accessToken).toBe('house-token-abc')
    })

    test('house provider with empty token results in error', () => {
      const staff = makeStaff({ squareAccessToken: undefined })
      const house = makeHouseProvider({ squareAccessToken: '' })
      const result = resolveCredentialChain(staff, [], house)

      expect(result.code).toBe('NO_CREDENTIALS')
      expect(result.inPersonRequired).toBe(true)
    })
  })

  describe('house-is-vendor case (Requirement 2.7)', () => {
    test('skips sibling check when staff.vendorId === houseProvider.vendorId', () => {
      const staff = makeStaff({ vendorId: 'house-vendor', squareAccessToken: undefined })
      const sibling = makeSiblingStaff({ vendorId: 'house-vendor' })
      const house = makeHouseProvider({ vendorId: 'house-vendor' })
      const result = resolveCredentialChain(staff, [sibling], house)

      expect(result.source).toBe('house')
      expect(result.resolutionPath).toContain('sibling:skipped_house_is_vendor')
      expect(result.resolutionPath).not.toContain('sibling:resolved')
    })

    test('still resolves to staff if staff has valid credentials (house-is-vendor)', () => {
      const staff = makeStaff({ vendorId: 'house-vendor' })
      const house = makeHouseProvider({ vendorId: 'house-vendor' })
      const result = resolveCredentialChain(staff, [], house)

      expect(result.source).toBe('staff')
    })
  })

  describe('no credentials error (Requirement 2.4)', () => {
    test('returns CredentialResolutionError when all levels fail', () => {
      const staff = makeStaff({ squareAccessToken: undefined })
      const house = makeHouseProvider({ squareAccessToken: undefined, squareLocationId: undefined })
      const result = resolveCredentialChain(staff, [], house)

      expect(result.code).toBe('NO_CREDENTIALS')
      expect(result.inPersonRequired).toBe(true)
      expect(result.staffName).toBe('Trinity')
      expect(result.vendorName).toBe('Stacey House')
      expect(result.message).toContain('In-person payment is required')
    })

    test('uses visibleId when staffName is missing', () => {
      const staff = makeStaff({ staffName: undefined, squareAccessToken: undefined })
      const house = makeHouseProvider({ squareAccessToken: undefined })
      const result = resolveCredentialChain(staff, [], house)

      expect(result.staffName).toBe('staff-1')
    })

    test('resolution path shows all steps when house resolves', () => {
      const staff = makeStaff({ squareAccessToken: undefined })
      const sibling = makeSiblingStaff({ squareOAuthStatus: 'error' })
      const house = makeHouseProvider()
      const result = resolveCredentialChain(staff, [sibling], house)

      expect(result.resolutionPath).toEqual([
        'staff:invalid',
        'sibling:none',
        'house:resolved',
      ])
    })
  })
})
