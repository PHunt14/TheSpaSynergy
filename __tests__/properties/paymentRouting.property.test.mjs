/**
 * Property-Based Tests for Payment Routing Service
 *
 * Uses fast-check to validate correctness properties for payment routing,
 * house fee splitting, and credential resolution with fallback logic.
 * Feature: unified-business-model
 *
 * Properties tested:
 * - Property 10: Payment routes to correct Square account with house fee split
 *
 * **Validates: Requirements 6.1, 6.2, 10.2, 10.3**
 */

import fc from 'fast-check'
import { resolvePaymentRoute, PaymentRouteError } from '../../app/utils/paymentRouting.ts'

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a non-empty, non-whitespace string suitable for Square credentials.
 */
function arbCredentialString() {
  return fc.string({ minLength: 3, maxLength: 30 }).filter((s) => s.trim().length > 0)
}

/**
 * Generates a valid Square OAuth status (not "error").
 */
function arbValidOAuthStatus() {
  return fc.oneof(fc.constant('connected'), fc.constant('disconnected'))
}

/**
 * Generates a staff member with valid Square credentials.
 */
function arbStaffWithCredentials() {
  return fc.record({
    visibleId: fc.string({ minLength: 1, maxLength: 10 }),
    staffName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    vendorId: fc.string({ minLength: 1, maxLength: 10 }),
    isActive: fc.constant(true),
    squareAccessToken: arbCredentialString(),
    squareLocationId: arbCredentialString(),
    squareOAuthStatus: arbValidOAuthStatus(),
  })
}

/**
 * Generates a staff member WITHOUT valid Square credentials.
 * This means one or more of: missing token, missing location, or status is "error".
 */
function arbStaffWithoutCredentials() {
  return fc.oneof(
    // Case 1: squareOAuthStatus is "error"
    fc.record({
      visibleId: fc.string({ minLength: 1, maxLength: 10 }),
      staffName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
      vendorId: fc.string({ minLength: 1, maxLength: 10 }),
      isActive: fc.constant(true),
      squareAccessToken: arbCredentialString(),
      squareLocationId: arbCredentialString(),
      squareOAuthStatus: fc.constant('error'),
    }),
    // Case 2: missing squareAccessToken
    fc.record({
      visibleId: fc.string({ minLength: 1, maxLength: 10 }),
      staffName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
      vendorId: fc.string({ minLength: 1, maxLength: 10 }),
      isActive: fc.constant(true),
      squareAccessToken: fc.constant(undefined),
      squareLocationId: arbCredentialString(),
      squareOAuthStatus: arbValidOAuthStatus(),
    }),
    // Case 3: missing squareLocationId
    fc.record({
      visibleId: fc.string({ minLength: 1, maxLength: 10 }),
      staffName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
      vendorId: fc.string({ minLength: 1, maxLength: 10 }),
      isActive: fc.constant(true),
      squareAccessToken: arbCredentialString(),
      squareLocationId: fc.constant(undefined),
      squareOAuthStatus: arbValidOAuthStatus(),
    }),
    // Case 4: empty string access token
    fc.record({
      visibleId: fc.string({ minLength: 1, maxLength: 10 }),
      staffName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
      vendorId: fc.string({ minLength: 1, maxLength: 10 }),
      isActive: fc.constant(true),
      squareAccessToken: fc.constant('   '),
      squareLocationId: arbCredentialString(),
      squareOAuthStatus: arbValidOAuthStatus(),
    })
  )
}

/**
 * Generates a provider (vendor) with valid Square credentials.
 */
function arbProviderWithCredentials() {
  return fc.record({
    vendorId: fc.string({ minLength: 1, maxLength: 10 }),
    name: fc.string({ minLength: 1, maxLength: 20 }),
    email: fc.string({ minLength: 3, maxLength: 20 }),
    isActive: fc.constant(true),
    isHouse: fc.constant(false),
    squareAccessToken: arbCredentialString(),
    squareLocationId: arbCredentialString(),
    squareOAuthStatus: arbValidOAuthStatus(),
  })
}

/**
 * Generates a house provider with valid Square credentials.
 */
function arbHouseProvider() {
  return fc.record({
    vendorId: fc.string({ minLength: 1, maxLength: 10 }),
    name: fc.string({ minLength: 1, maxLength: 20 }),
    email: fc.string({ minLength: 3, maxLength: 20 }),
    isActive: fc.constant(true),
    isHouse: fc.constant(true),
    squareAccessToken: arbCredentialString(),
    squareLocationId: arbCredentialString(),
    squareOAuthStatus: arbValidOAuthStatus(),
  })
}

/**
 * Generates a service with house fee enabled.
 * Ensures houseFeeAmount <= price to keep staffAmount non-negative.
 */
function arbServiceWithHouseFee() {
  return fc.record({
    serviceId: fc.string({ minLength: 1, maxLength: 10 }),
    name: fc.string({ minLength: 1, maxLength: 20 }),
    price: fc.integer({ min: 10, max: 1000 }),
    houseFeeEnabled: fc.constant(true),
    houseFeeAmount: fc.integer({ min: 1, max: 10 }),
  }).filter((s) => s.houseFeeAmount <= s.price)
}

/**
 * Generates a service with house fee disabled.
 */
function arbServiceWithoutHouseFee() {
  return fc.record({
    serviceId: fc.string({ minLength: 1, maxLength: 10 }),
    name: fc.string({ minLength: 1, maxLength: 20 }),
    price: fc.integer({ min: 10, max: 1000 }),
    houseFeeEnabled: fc.constant(false),
    houseFeeAmount: fc.integer({ min: 0, max: 100 }),
  })
}

/**
 * Generates a basic appointment record.
 */
function arbAppointment() {
  return fc.record({
    appointmentId: fc.string({ minLength: 1, maxLength: 10 }),
    vendorId: fc.string({ minLength: 1, maxLength: 10 }),
    serviceId: fc.string({ minLength: 1, maxLength: 10 }),
    staffId: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: undefined }),
  })
}

// ── Property 10: Payment Routing ──────────────────────────────

describe('Feature: unified-business-model, Property 10: Payment routes to correct Square account with house fee split', () => {
  test('house fee routes to house provider Square account', () => {
    fc.assert(
      fc.property(
        arbAppointment(),
        arbStaffWithCredentials(),
        arbProviderWithCredentials(),
        arbServiceWithHouseFee(),
        arbHouseProvider(),
        (appointment, staff, provider, service, houseProvider) => {
          const result = resolvePaymentRoute(appointment, staff, provider, service, houseProvider)

          // houseFeeCredentials must match houseProvider's credentials
          return (
            result.houseFeeCredentials.accessToken === houseProvider.squareAccessToken &&
            result.houseFeeCredentials.locationId === houseProvider.squareLocationId
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  test('staffAmount equals service price minus houseFeeAmount', () => {
    fc.assert(
      fc.property(
        arbAppointment(),
        arbStaffWithCredentials(),
        arbProviderWithCredentials(),
        fc.oneof(arbServiceWithHouseFee(), arbServiceWithoutHouseFee()),
        arbHouseProvider(),
        (appointment, staff, provider, service, houseProvider) => {
          const result = resolvePaymentRoute(appointment, staff, provider, service, houseProvider)

          return result.staffAmount === service.price - result.houseFeeAmount
        }
      ),
      { numRuns: 100 }
    )
  })

  test('when staff has valid credentials, effectiveCredentials equals staff credentials', () => {
    fc.assert(
      fc.property(
        arbAppointment(),
        arbStaffWithCredentials(),
        arbProviderWithCredentials(),
        arbServiceWithHouseFee(),
        arbHouseProvider(),
        (appointment, staff, provider, service, houseProvider) => {
          const result = resolvePaymentRoute(appointment, staff, provider, service, houseProvider)

          // effectiveCredentials should be staff's own credentials
          return (
            result.effectiveCredentials.accessToken === staff.squareAccessToken &&
            result.effectiveCredentials.locationId === staff.squareLocationId &&
            result.staffSquareCredentials !== null &&
            result.effectiveCredentials.accessToken === result.staffSquareCredentials.accessToken &&
            result.effectiveCredentials.locationId === result.staffSquareCredentials.locationId
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  test('when staff lacks credentials but provider has them, effectiveCredentials equals provider credentials', () => {
    fc.assert(
      fc.property(
        arbAppointment(),
        arbStaffWithoutCredentials(),
        arbProviderWithCredentials(),
        arbServiceWithHouseFee(),
        arbHouseProvider(),
        (appointment, staff, provider, service, houseProvider) => {
          const result = resolvePaymentRoute(appointment, staff, provider, service, houseProvider)

          // effectiveCredentials should fall back to provider's credentials
          return (
            result.effectiveCredentials.accessToken === provider.squareAccessToken &&
            result.effectiveCredentials.locationId === provider.squareLocationId &&
            result.providerSquareCredentials !== null &&
            result.effectiveCredentials.accessToken === result.providerSquareCredentials.accessToken &&
            result.effectiveCredentials.locationId === result.providerSquareCredentials.locationId
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  test('houseFeeAmount equals service.houseFeeAmount when houseFeeEnabled, 0 otherwise', () => {
    fc.assert(
      fc.property(
        arbAppointment(),
        arbStaffWithCredentials(),
        arbProviderWithCredentials(),
        fc.oneof(arbServiceWithHouseFee(), arbServiceWithoutHouseFee()),
        arbHouseProvider(),
        (appointment, staff, provider, service, houseProvider) => {
          const result = resolvePaymentRoute(appointment, staff, provider, service, houseProvider)

          if (service.houseFeeEnabled && service.houseFeeAmount > 0) {
            return result.houseFeeAmount === service.houseFeeAmount
          } else {
            return result.houseFeeAmount === 0
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
