/**
 * Property-Based Tests for Disconnected Square Blocking
 *
 * Uses fast-check to validate that online payment is blocked when
 * neither the staff member nor the provider have valid Square credentials.
 * Feature: unified-business-model
 *
 * Properties tested:
 * - Property 11: Disconnected Square prevents online payment
 *
 * **Validates: Requirements 6.4**
 */

import fc from 'fast-check'
import { resolvePaymentRoute, PaymentRouteError } from '../../app/utils/paymentRouting.ts'

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a valid Square access token (non-empty, non-whitespace).
 */
function arbValidToken() {
  return fc.string({ minLength: 5, maxLength: 40 }).filter((s) => s.trim().length > 0)
}

/**
 * Generates a valid Square location ID (non-empty, non-whitespace).
 */
function arbValidLocationId() {
  return fc.string({ minLength: 3, maxLength: 20 }).filter((s) => s.trim().length > 0)
}

/**
 * Generates an appointment record.
 */
function arbAppointment() {
  return fc.record({
    appointmentId: fc.string({ minLength: 1, maxLength: 15 }),
    vendorId: fc.string({ minLength: 1, maxLength: 10 }),
    serviceId: fc.string({ minLength: 1, maxLength: 10 }),
    staffId: fc.string({ minLength: 1, maxLength: 10 }),
  })
}

/**
 * Generates a service with house fee enabled and valid pricing.
 */
function arbService() {
  return fc.record({
    serviceId: fc.string({ minLength: 1, maxLength: 10 }),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    price: fc.integer({ min: 10, max: 500 }),
    houseFeeEnabled: fc.boolean(),
    houseFeeAmount: fc.integer({ min: 0, max: 50 }),
  })
}

/**
 * Generates a house provider WITH valid Square credentials.
 * (We always want the house provider to be valid so we isolate staff/provider path.)
 */
function arbValidHouseProvider() {
  return fc.record({
    vendorId: fc.constant('house-provider'),
    name: fc.constant('Stacey House'),
    email: fc.constant('stacey@house.com'),
    isActive: fc.constant(true),
    isHouse: fc.constant(true),
    squareAccessToken: arbValidToken(),
    squareLocationId: arbValidLocationId(),
    squareOAuthStatus: fc.constant('connected'),
  })
}

/**
 * Generates a staff member with squareOAuthStatus = "error" and no valid credentials.
 */
function arbStaffWithErrorStatus() {
  return fc.record({
    visibleId: fc.string({ minLength: 1, maxLength: 10 }),
    staffName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    vendorId: fc.string({ minLength: 1, maxLength: 10 }),
    isActive: fc.constant(true),
    squareAccessToken: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    squareLocationId: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: undefined }),
    squareOAuthStatus: fc.constant('error'),
  })
}

/**
 * Generates a staff member that lacks an access token (undefined or missing).
 */
function arbStaffWithoutAccessToken() {
  return fc.record({
    visibleId: fc.string({ minLength: 1, maxLength: 10 }),
    staffName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    vendorId: fc.string({ minLength: 1, maxLength: 10 }),
    isActive: fc.constant(true),
    squareAccessToken: fc.constant(undefined),
    squareLocationId: fc.option(arbValidLocationId(), { nil: undefined }),
    squareOAuthStatus: fc.constantFrom('connected', 'disconnected'),
  })
}

/**
 * Generates a staff member that lacks a location ID (undefined or missing).
 */
function arbStaffWithoutLocationId() {
  return fc.record({
    visibleId: fc.string({ minLength: 1, maxLength: 10 }),
    staffName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    vendorId: fc.string({ minLength: 1, maxLength: 10 }),
    isActive: fc.constant(true),
    squareAccessToken: fc.option(arbValidToken(), { nil: undefined }),
    squareLocationId: fc.constant(undefined),
    squareOAuthStatus: fc.constantFrom('connected', 'disconnected'),
  })
}

/**
 * Generates a staff member with empty or whitespace-only access token.
 */
function arbStaffWithEmptyAccessToken() {
  return fc.record({
    visibleId: fc.string({ minLength: 1, maxLength: 10 }),
    staffName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    vendorId: fc.string({ minLength: 1, maxLength: 10 }),
    isActive: fc.constant(true),
    squareAccessToken: fc.constantFrom('', '  ', '\t', '   \n  '),
    squareLocationId: fc.option(arbValidLocationId(), { nil: undefined }),
    squareOAuthStatus: fc.constantFrom('connected', 'disconnected'),
  })
}

/**
 * Generates a provider that also lacks valid Square credentials.
 * This ensures the fallback path also fails.
 */
function arbProviderWithoutCredentials() {
  return fc.record({
    vendorId: fc.string({ minLength: 1, maxLength: 10 }),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    email: fc.string({ minLength: 3, maxLength: 30 }),
    isActive: fc.constant(true),
    isHouse: fc.constant(false),
    squareAccessToken: fc.oneof(fc.constant(undefined), fc.constant(''), fc.constant('   ')),
    squareLocationId: fc.oneof(fc.constant(undefined), fc.constant(''), fc.constant('  ')),
    squareOAuthStatus: fc.constantFrom('error', 'disconnected'),
  })
}

// ── Property 11: Disconnected Square prevents online payment ──

describe('Feature: unified-business-model, Property 11: Disconnected Square prevents online payment', () => {
  test('staff with squareOAuthStatus="error" AND provider lacks credentials → throws PaymentRouteError', () => {
    fc.assert(
      fc.property(
        arbAppointment(),
        arbStaffWithErrorStatus(),
        arbProviderWithoutCredentials(),
        arbService(),
        arbValidHouseProvider(),
        (appointment, staff, provider, service, houseProvider) => {
          try {
            resolvePaymentRoute(appointment, staff, provider, service, houseProvider)
            return false // Should have thrown
          } catch (error) {
            return error instanceof PaymentRouteError
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  test('staff lacks accessToken AND provider lacks credentials → throws PaymentRouteError', () => {
    fc.assert(
      fc.property(
        arbAppointment(),
        arbStaffWithoutAccessToken(),
        arbProviderWithoutCredentials(),
        arbService(),
        arbValidHouseProvider(),
        (appointment, staff, provider, service, houseProvider) => {
          try {
            resolvePaymentRoute(appointment, staff, provider, service, houseProvider)
            return false // Should have thrown
          } catch (error) {
            return error instanceof PaymentRouteError
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  test('staff lacks locationId AND provider lacks credentials → throws PaymentRouteError', () => {
    fc.assert(
      fc.property(
        arbAppointment(),
        arbStaffWithoutLocationId(),
        arbProviderWithoutCredentials(),
        arbService(),
        arbValidHouseProvider(),
        (appointment, staff, provider, service, houseProvider) => {
          try {
            resolvePaymentRoute(appointment, staff, provider, service, houseProvider)
            return false // Should have thrown
          } catch (error) {
            return error instanceof PaymentRouteError
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  test('staff has empty/whitespace-only accessToken AND provider lacks credentials → throws PaymentRouteError', () => {
    fc.assert(
      fc.property(
        arbAppointment(),
        arbStaffWithEmptyAccessToken(),
        arbProviderWithoutCredentials(),
        arbService(),
        arbValidHouseProvider(),
        (appointment, staff, provider, service, houseProvider) => {
          try {
            resolvePaymentRoute(appointment, staff, provider, service, houseProvider)
            return false // Should have thrown
          } catch (error) {
            return error instanceof PaymentRouteError
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
