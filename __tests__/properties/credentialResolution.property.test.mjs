/**
 * Property-Based Tests for Credential Resolution
 *
 * Uses fast-check to validate correctness properties for the credential
 * resolution chain, invalid credentials detection, no-credentials fallback,
 * token expiry detection, and house-is-vendor resolution.
 * Feature: payments-kiosk-overhaul
 *
 * Properties tested:
 * - Property 6: Credential resolution chain ordering
 * - Property 7: Invalid credentials detection
 * - Property 8: No-credentials returns inPersonRequired
 * - Property 9: Token expiry detection
 * - Property 10: House-is-vendor direct resolution
 *
 * **Validates: Requirements 2.1, 2.2, 2.4, 2.6, 2.7, 6.1, 6.5**
 */

import fc from 'fast-check'
import { hasValidCredentials, resolveCredentialChain } from '../../app/utils/paymentRouting.ts'
import { isTokenExpiringSoon } from '../../lib/square-token-enhanced.ts'

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a non-empty, non-whitespace string suitable for a Square access token.
 */
const arbValidToken = fc.string({ minLength: 1, maxLength: 64 }).filter(
  (s) => s.trim().length > 0
)

/**
 * Generates a non-empty, non-whitespace string suitable for a Square location ID.
 */
const arbValidLocationId = fc.string({ minLength: 1, maxLength: 32 }).filter(
  (s) => s.trim().length > 0
)

/**
 * Generates an OAuth status that is NOT 'error' (valid for staff credentials).
 */
const arbNonErrorStatus = fc.constantFrom('connected', 'disconnected', 'pending', 'unknown')

/**
 * Generates any squareOAuthStatus value (including 'error').
 */
const arbAnyStatus = fc.constantFrom('connected', 'disconnected', 'error', 'pending', 'unknown')

/**
 * Generates a vendorId string.
 */
const arbVendorId = fc.string({ minLength: 1, maxLength: 16 }).filter((s) => s.trim().length > 0)

/**
 * Generates a staff member with VALID credentials:
 * - squareOAuthStatus !== 'error'
 * - squareAccessToken is non-empty and non-whitespace
 * - squareLocationId is non-empty and non-whitespace
 */
function arbStaffWithValidCredentials(vendorId) {
  return fc.record({
    visibleId: fc.string({ minLength: 1, maxLength: 16 }),
    staffName: fc.string({ minLength: 1, maxLength: 32 }),
    vendorId: fc.constant(vendorId),
    isActive: fc.constant(true),
    squareAccessToken: arbValidToken,
    squareLocationId: arbValidLocationId,
    squareOAuthStatus: arbNonErrorStatus,
  })
}

/**
 * Generates a staff member with INVALID credentials:
 * Either token is empty/whitespace, locationId is empty/whitespace, or status is 'error'.
 */
function arbStaffWithInvalidCredentials(vendorId) {
  return fc.oneof(
    // Token is empty/null/whitespace
    fc.record({
      visibleId: fc.string({ minLength: 1, maxLength: 16 }),
      staffName: fc.string({ minLength: 1, maxLength: 32 }),
      vendorId: fc.constant(vendorId),
      isActive: fc.constant(true),
      squareAccessToken: fc.constantFrom(null, '', '   ', '\t'),
      squareLocationId: arbValidLocationId,
      squareOAuthStatus: arbNonErrorStatus,
    }),
    // LocationId is empty/null/whitespace
    fc.record({
      visibleId: fc.string({ minLength: 1, maxLength: 16 }),
      staffName: fc.string({ minLength: 1, maxLength: 32 }),
      vendorId: fc.constant(vendorId),
      isActive: fc.constant(true),
      squareAccessToken: arbValidToken,
      squareLocationId: fc.constantFrom(null, '', '   ', '\t'),
      squareOAuthStatus: arbNonErrorStatus,
    }),
    // Status is 'error'
    fc.record({
      visibleId: fc.string({ minLength: 1, maxLength: 16 }),
      staffName: fc.string({ minLength: 1, maxLength: 32 }),
      vendorId: fc.constant(vendorId),
      isActive: fc.constant(true),
      squareAccessToken: arbValidToken,
      squareLocationId: arbValidLocationId,
      squareOAuthStatus: fc.constant('error'),
    }),
    // Both token and locationId are invalid
    fc.record({
      visibleId: fc.string({ minLength: 1, maxLength: 16 }),
      staffName: fc.string({ minLength: 1, maxLength: 32 }),
      vendorId: fc.constant(vendorId),
      isActive: fc.constant(true),
      squareAccessToken: fc.constantFrom(null, '', '   '),
      squareLocationId: fc.constantFrom(null, '', '   '),
      squareOAuthStatus: arbAnyStatus,
    })
  )
}

/**
 * Generates a house provider (Vendor) with VALID credentials.
 */
function arbHouseProviderWithValidCredentials(vendorId) {
  return fc.record({
    vendorId: fc.constant(vendorId),
    name: fc.string({ minLength: 1, maxLength: 32 }),
    email: fc.constant('house@test.com'),
    isActive: fc.constant(true),
    isHouse: fc.constant(true),
    squareAccessToken: arbValidToken,
    squareLocationId: arbValidLocationId,
    squareOAuthStatus: arbAnyStatus,
  })
}

/**
 * Generates a house provider (Vendor) with INVALID credentials.
 */
function arbHouseProviderWithInvalidCredentials(vendorId) {
  return fc.oneof(
    fc.record({
      vendorId: fc.constant(vendorId),
      name: fc.string({ minLength: 1, maxLength: 32 }),
      email: fc.constant('house@test.com'),
      isActive: fc.constant(true),
      isHouse: fc.constant(true),
      squareAccessToken: fc.constantFrom(null, '', '   ', '\t'),
      squareLocationId: arbValidLocationId,
      squareOAuthStatus: arbAnyStatus,
    }),
    fc.record({
      vendorId: fc.constant(vendorId),
      name: fc.string({ minLength: 1, maxLength: 32 }),
      email: fc.constant('house@test.com'),
      isActive: fc.constant(true),
      isHouse: fc.constant(true),
      squareAccessToken: arbValidToken,
      squareLocationId: fc.constantFrom(null, '', '   ', '\t'),
      squareOAuthStatus: arbAnyStatus,
    }),
    fc.record({
      vendorId: fc.constant(vendorId),
      name: fc.string({ minLength: 1, maxLength: 32 }),
      email: fc.constant('house@test.com'),
      isActive: fc.constant(true),
      isHouse: fc.constant(true),
      squareAccessToken: fc.constantFrom(null, '', '   '),
      squareLocationId: fc.constantFrom(null, '', '   '),
      squareOAuthStatus: arbAnyStatus,
    })
  )
}

/**
 * Generates an entity with invalid credentials for hasValidCredentials testing.
 * Either squareAccessToken or squareLocationId is null/empty/whitespace.
 */
function arbEntityWithInvalidTokenOrLocation() {
  return fc.oneof(
    // Invalid token, any locationId, any status
    fc.record({
      squareAccessToken: fc.constantFrom(null, undefined, '', '   ', '\t\n', '  \t  '),
      squareLocationId: fc.oneof(arbValidLocationId, fc.constantFrom(null, '', '   ')),
      squareOAuthStatus: arbAnyStatus,
    }),
    // Valid token, invalid locationId, any status
    fc.record({
      squareAccessToken: arbValidToken,
      squareLocationId: fc.constantFrom(null, undefined, '', '   ', '\t\n', '  \t  '),
      squareOAuthStatus: arbAnyStatus,
    }),
    // Both invalid, any status
    fc.record({
      squareAccessToken: fc.constantFrom(null, undefined, '', '   '),
      squareLocationId: fc.constantFrom(null, undefined, '', '   '),
      squareOAuthStatus: arbAnyStatus,
    })
  )
}

// ── Property 6: Credential resolution chain ordering ──────────

describe('Feature: payments-kiosk-overhaul, Property 6: Credential resolution chain ordering', () => {
  /**
   * **Validates: Requirements 2.1**
   *
   * For any staff member with valid credentials (non-error status, non-empty token,
   * non-empty locationId), the resolution SHALL select the staff's own credentials
   * regardless of sibling or house credential availability.
   */
  test('staff with valid credentials are selected regardless of sibling or house availability', () => {
    fc.assert(
      fc.property(
        arbVendorId.chain((staffVendorId) =>
          arbVendorId.chain((houseVendorId) =>
            fc.tuple(
              arbStaffWithValidCredentials(staffVendorId),
              // Siblings with valid credentials
              fc.array(arbStaffWithValidCredentials(staffVendorId), { minLength: 0, maxLength: 3 }),
              // House provider with valid credentials
              arbHouseProviderWithValidCredentials(houseVendorId)
            )
          )
        ).filter(([staff, , house]) => staff.vendorId !== house.vendorId),
        ([staff, siblings, house]) => {
          const result = resolveCredentialChain(staff, siblings, house)

          // Must not be an error
          if ('code' in result) return false

          // Must select staff's own credentials
          return (
            result.source === 'staff' &&
            result.credentials.accessToken === staff.squareAccessToken &&
            result.credentials.locationId === staff.squareLocationId
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 7: Invalid credentials detection ─────────────────

describe('Feature: payments-kiosk-overhaul, Property 7: Invalid credentials detection', () => {
  /**
   * **Validates: Requirements 2.2**
   *
   * For any entity where squareAccessToken is null, empty, or whitespace-only,
   * OR squareLocationId is null, empty, or whitespace-only, hasValidCredentials
   * SHALL return false regardless of squareOAuthStatus value.
   */
  test('returns false when token is null, empty, or whitespace-only', () => {
    fc.assert(
      fc.property(
        fc.record({
          squareAccessToken: fc.constantFrom(null, undefined, '', '   ', '\t', '\n', '  \t\n  '),
          squareLocationId: arbValidLocationId,
          squareOAuthStatus: arbAnyStatus,
        }),
        (entity) => {
          return hasValidCredentials(entity) === false
        }
      ),
      { numRuns: 100 }
    )
  })

  test('returns false when locationId is null, empty, or whitespace-only', () => {
    fc.assert(
      fc.property(
        fc.record({
          squareAccessToken: arbValidToken,
          squareLocationId: fc.constantFrom(null, undefined, '', '   ', '\t', '\n', '  \t\n  '),
          squareOAuthStatus: arbAnyStatus,
        }),
        (entity) => {
          return hasValidCredentials(entity) === false
        }
      ),
      { numRuns: 100 }
    )
  })

  test('returns false when both token and locationId are invalid', () => {
    fc.assert(
      fc.property(
        arbEntityWithInvalidTokenOrLocation(),
        (entity) => {
          return hasValidCredentials(entity) === false
        }
      ),
      { numRuns: 100 }
    )
  })

  test('returns false regardless of OAuth status when token or location is invalid', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('connected', 'disconnected', 'error', 'pending', 'unknown', 'authorized'),
        fc.constantFrom(null, undefined, '', '   '),
        (status, invalidValue) => {
          // Invalid token with any status
          const entity1 = {
            squareAccessToken: invalidValue,
            squareLocationId: 'valid-loc-id',
            squareOAuthStatus: status,
          }
          // Invalid locationId with any status
          const entity2 = {
            squareAccessToken: 'valid-token',
            squareLocationId: invalidValue,
            squareOAuthStatus: status,
          }
          return hasValidCredentials(entity1) === false && hasValidCredentials(entity2) === false
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 8: No-credentials returns inPersonRequired ───────

describe('Feature: payments-kiosk-overhaul, Property 8: No-credentials returns inPersonRequired', () => {
  /**
   * **Validates: Requirements 2.4**
   *
   * For any payment attempt where staff, all sibling staff, and house provider
   * all lack valid credentials, the response SHALL contain inPersonRequired: true.
   */
  test('returns inPersonRequired when no level has valid credentials', () => {
    fc.assert(
      fc.property(
        arbVendorId.chain((staffVendorId) =>
          arbVendorId.chain((houseVendorId) =>
            fc.tuple(
              arbStaffWithInvalidCredentials(staffVendorId),
              fc.array(arbStaffWithInvalidCredentials(staffVendorId), { minLength: 0, maxLength: 3 }),
              arbHouseProviderWithInvalidCredentials(houseVendorId)
            )
          )
        ).filter(([staff, , house]) => staff.vendorId !== house.vendorId),
        ([staff, siblings, house]) => {
          const result = resolveCredentialChain(staff, siblings, house)

          // Must be an error with inPersonRequired
          return (
            'code' in result &&
            result.code === 'NO_CREDENTIALS' &&
            result.inPersonRequired === true
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 9: Token expiry detection ────────────────────────

describe('Feature: payments-kiosk-overhaul, Property 9: Token expiry detection', () => {
  /**
   * **Validates: Requirements 2.6, 6.1, 6.5**
   *
   * For any squareTokenExpiresAt value that is null, undefined, empty string,
   * or an ISO timestamp within 24 hours of the current time,
   * isTokenExpiringSoon SHALL return true.
   */
  test('returns true for null, undefined, or empty string expiresAt', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, undefined, '', '   '),
        (expiresAt) => {
          return isTokenExpiringSoon(expiresAt) === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('returns true for timestamps within 24 hours of now', () => {
    fc.assert(
      fc.property(
        // Generate offset in milliseconds: from -24 hours (already past) to +23:59 hours (within 24h)
        fc.integer({ min: -24 * 60 * 60 * 1000, max: 23 * 60 * 60 * 1000 + 59 * 60 * 1000 }),
        (offsetMs) => {
          const expiresAt = new Date(Date.now() + offsetMs).toISOString()
          return isTokenExpiringSoon(expiresAt) === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('returns false for timestamps more than 24 hours from now', () => {
    fc.assert(
      fc.property(
        // Generate offset: from 25 hours to 365 days in the future
        fc.integer({ min: 25 * 60 * 60 * 1000, max: 365 * 24 * 60 * 60 * 1000 }),
        (offsetMs) => {
          const expiresAt = new Date(Date.now() + offsetMs).toISOString()
          return isTokenExpiringSoon(expiresAt) === false
        }
      ),
      { numRuns: 100 }
    )
  })

  test('returns true for invalid date strings (unparseable)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('not-a-date', 'invalid', 'abc-def-ghi', 'xyz', '!!timestamp!!'),
        (expiresAt) => {
          return isTokenExpiringSoon(expiresAt) === true
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 10: House-is-vendor direct resolution ────────────

describe('Feature: payments-kiosk-overhaul, Property 10: House-is-vendor direct resolution', () => {
  /**
   * **Validates: Requirements 2.7**
   *
   * For any vendor where vendor.vendorId === houseProvider.vendorId,
   * credential resolution SHALL resolve to the house provider's credentials
   * without producing a "Square not connected" error.
   */
  test('resolves to house credentials when staff vendorId matches house vendorId', () => {
    fc.assert(
      fc.property(
        arbVendorId.chain((sharedVendorId) =>
          fc.tuple(
            // Staff with INVALID credentials on the same vendor as house
            arbStaffWithInvalidCredentials(sharedVendorId),
            // House provider with VALID credentials and same vendorId
            arbHouseProviderWithValidCredentials(sharedVendorId)
          )
        ),
        ([staff, house]) => {
          // No siblings provided (house-is-vendor scenario)
          const result = resolveCredentialChain(staff, [], house)

          // Must NOT be an error
          if ('code' in result) return false

          // Must resolve to house credentials
          return (
            result.source === 'house' &&
            result.credentials.accessToken === house.squareAccessToken &&
            result.credentials.locationId === house.squareLocationId
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  test('does not produce NO_CREDENTIALS error when house-is-vendor has valid credentials', () => {
    fc.assert(
      fc.property(
        arbVendorId.chain((sharedVendorId) =>
          fc.tuple(
            arbStaffWithInvalidCredentials(sharedVendorId),
            fc.array(arbStaffWithInvalidCredentials(sharedVendorId), { minLength: 0, maxLength: 3 }),
            arbHouseProviderWithValidCredentials(sharedVendorId)
          )
        ),
        ([staff, siblings, house]) => {
          const result = resolveCredentialChain(staff, siblings, house)

          // Must never produce NO_CREDENTIALS error when house has valid credentials
          if ('code' in result) return false

          // Resolution path should skip sibling check (house-is-vendor optimization)
          return (
            result.resolutionPath.includes('sibling:skipped_house_is_vendor') &&
            result.source === 'house'
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  test('staff with valid credentials still resolves to staff even in house-is-vendor scenario', () => {
    fc.assert(
      fc.property(
        arbVendorId.chain((sharedVendorId) =>
          fc.tuple(
            arbStaffWithValidCredentials(sharedVendorId),
            arbHouseProviderWithValidCredentials(sharedVendorId)
          )
        ),
        ([staff, house]) => {
          const result = resolveCredentialChain(staff, [], house)

          // Staff's own valid credentials take priority even in house-is-vendor case
          if ('code' in result) return false
          return (
            result.source === 'staff' &&
            result.credentials.accessToken === staff.squareAccessToken &&
            result.credentials.locationId === staff.squareLocationId
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})
