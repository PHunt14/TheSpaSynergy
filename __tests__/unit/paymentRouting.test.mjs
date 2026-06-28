/**
 * Unit Tests for Payment Routing Service
 *
 * Tests the resolvePaymentRoute function for credential resolution,
 * house fee calculation, and error cases.
 *
 * Requirements: 6.1, 6.2, 6.4, 10.2, 10.3
 */

import { describe, test, expect } from '@jest/globals'
import { resolvePaymentRoute, PaymentRouteError } from '../../app/utils/paymentRouting.ts'

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

function makeProvider(overrides = {}) {
  return {
    vendorId: 'vendor-1',
    name: 'Kera Studio',
    email: 'kera@example.com',
    isActive: true,
    isHouse: false,
    squareAccessToken: 'provider-token-789',
    squareLocationId: 'provider-loc-012',
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

function makeService(overrides = {}) {
  return {
    serviceId: 'service-1',
    name: 'Haircut',
    price: 100,
    houseFeeEnabled: true,
    houseFeeAmount: 20,
    ...overrides,
  }
}

function makeAppointment(overrides = {}) {
  return {
    appointmentId: 'appt-1',
    vendorId: 'vendor-1',
    serviceId: 'service-1',
    staffId: 'staff-1',
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────

describe('resolvePaymentRoute', () => {
  describe('credential resolution', () => {
    test('uses staff credentials when staff has valid Square account', () => {
      const result = resolvePaymentRoute(
        makeAppointment(),
        makeStaff(),
        makeProvider(),
        makeService(),
        makeHouseProvider()
      )

      expect(result.staffSquareCredentials).toEqual({
        accessToken: 'staff-token-123',
        locationId: 'staff-loc-456',
      })
      expect(result.effectiveCredentials).toEqual({
        accessToken: 'staff-token-123',
        locationId: 'staff-loc-456',
      })
    })

    test('falls back to provider credentials when staff lacks access token', () => {
      const staff = makeStaff({ squareAccessToken: undefined })
      const result = resolvePaymentRoute(
        makeAppointment(),
        staff,
        makeProvider(),
        makeService(),
        makeHouseProvider()
      )

      expect(result.staffSquareCredentials).toBeNull()
      expect(result.effectiveCredentials).toEqual({
        accessToken: 'provider-token-789',
        locationId: 'provider-loc-012',
      })
    })

    test('falls back to provider credentials when staff lacks location ID', () => {
      const staff = makeStaff({ squareLocationId: undefined })
      const result = resolvePaymentRoute(
        makeAppointment(),
        staff,
        makeProvider(),
        makeService(),
        makeHouseProvider()
      )

      expect(result.staffSquareCredentials).toBeNull()
      expect(result.effectiveCredentials).toEqual({
        accessToken: 'provider-token-789',
        locationId: 'provider-loc-012',
      })
    })

    test('falls back to provider when staff squareOAuthStatus is "error"', () => {
      const staff = makeStaff({ squareOAuthStatus: 'error' })
      const result = resolvePaymentRoute(
        makeAppointment(),
        staff,
        makeProvider(),
        makeService(),
        makeHouseProvider()
      )

      expect(result.staffSquareCredentials).toBeNull()
      expect(result.effectiveCredentials).toEqual({
        accessToken: 'provider-token-789',
        locationId: 'provider-loc-012',
      })
    })

    test('falls back to provider when staff has empty access token', () => {
      const staff = makeStaff({ squareAccessToken: '  ' })
      const result = resolvePaymentRoute(
        makeAppointment(),
        staff,
        makeProvider(),
        makeService(),
        makeHouseProvider()
      )

      expect(result.staffSquareCredentials).toBeNull()
      expect(result.effectiveCredentials).toEqual({
        accessToken: 'provider-token-789',
        locationId: 'provider-loc-012',
      })
    })

    test('throws PaymentRouteError when neither staff nor provider have credentials', () => {
      const staff = makeStaff({
        squareAccessToken: undefined,
        squareLocationId: undefined,
        squareOAuthStatus: 'disconnected',
      })
      const provider = makeProvider({
        squareAccessToken: undefined,
        squareLocationId: undefined,
        squareOAuthStatus: 'disconnected',
      })

      expect(() =>
        resolvePaymentRoute(
          makeAppointment(),
          staff,
          provider,
          makeService(),
          makeHouseProvider()
        )
      ).toThrow(PaymentRouteError)
    })

    test('error message mentions in-person payment requirement', () => {
      const staff = makeStaff({
        squareAccessToken: undefined,
        squareOAuthStatus: 'disconnected',
      })
      const provider = makeProvider({
        squareAccessToken: undefined,
        squareOAuthStatus: 'disconnected',
      })

      expect(() =>
        resolvePaymentRoute(
          makeAppointment(),
          staff,
          provider,
          makeService(),
          makeHouseProvider()
        )
      ).toThrow(/in-person payment/i)
    })

    test('returns provider credentials in result even when staff credentials are used', () => {
      const result = resolvePaymentRoute(
        makeAppointment(),
        makeStaff(),
        makeProvider(),
        makeService(),
        makeHouseProvider()
      )

      expect(result.providerSquareCredentials).toEqual({
        accessToken: 'provider-token-789',
        locationId: 'provider-loc-012',
      })
    })
  })

  describe('house fee calculation', () => {
    test('calculates house fee when houseFeeEnabled and amount > 0', () => {
      const result = resolvePaymentRoute(
        makeAppointment(),
        makeStaff(),
        makeProvider(),
        makeService({ price: 100, houseFeeEnabled: true, houseFeeAmount: 20 }),
        makeHouseProvider()
      )

      expect(result.houseFeeAmount).toBe(20)
      expect(result.staffAmount).toBe(80)
    })

    test('no house fee when houseFeeEnabled is false', () => {
      const result = resolvePaymentRoute(
        makeAppointment(),
        makeStaff(),
        makeProvider(),
        makeService({ price: 100, houseFeeEnabled: false, houseFeeAmount: 20 }),
        makeHouseProvider()
      )

      expect(result.houseFeeAmount).toBe(0)
      expect(result.staffAmount).toBe(100)
    })

    test('no house fee when houseFeeAmount is 0', () => {
      const result = resolvePaymentRoute(
        makeAppointment(),
        makeStaff(),
        makeProvider(),
        makeService({ price: 100, houseFeeEnabled: true, houseFeeAmount: 0 }),
        makeHouseProvider()
      )

      expect(result.houseFeeAmount).toBe(0)
      expect(result.staffAmount).toBe(100)
    })

    test('house fee credentials come from house provider', () => {
      const result = resolvePaymentRoute(
        makeAppointment(),
        makeStaff(),
        makeProvider(),
        makeService(),
        makeHouseProvider()
      )

      expect(result.houseFeeCredentials).toEqual({
        accessToken: 'house-token-abc',
        locationId: 'house-loc-def',
      })
    })

    test('throws when house provider lacks Square credentials', () => {
      const houseProvider = makeHouseProvider({
        squareAccessToken: undefined,
        squareOAuthStatus: 'disconnected',
      })

      expect(() =>
        resolvePaymentRoute(
          makeAppointment(),
          makeStaff(),
          makeProvider(),
          makeService(),
          houseProvider
        )
      ).toThrow(PaymentRouteError)
    })

    test('staff amount is full price when no house fee', () => {
      const result = resolvePaymentRoute(
        makeAppointment(),
        makeStaff(),
        makeProvider(),
        makeService({ price: 150, houseFeeEnabled: false, houseFeeAmount: 0 }),
        makeHouseProvider()
      )

      expect(result.staffAmount).toBe(150)
    })
  })

  describe('status values', () => {
    test('staff with "connected" status and valid credentials are accepted', () => {
      const staff = makeStaff({ squareOAuthStatus: 'connected' })
      const result = resolvePaymentRoute(
        makeAppointment(),
        staff,
        makeProvider(),
        makeService(),
        makeHouseProvider()
      )

      expect(result.staffSquareCredentials).not.toBeNull()
    })

    test('staff with "disconnected" status but valid tokens are accepted', () => {
      const staff = makeStaff({ squareOAuthStatus: 'disconnected' })
      const result = resolvePaymentRoute(
        makeAppointment(),
        staff,
        makeProvider(),
        makeService(),
        makeHouseProvider()
      )

      // "disconnected" is not "error", so credentials are still valid if tokens exist
      expect(result.staffSquareCredentials).not.toBeNull()
    })

    test('staff with "error" status are rejected regardless of tokens', () => {
      const staff = makeStaff({ squareOAuthStatus: 'error' })
      const result = resolvePaymentRoute(
        makeAppointment(),
        staff,
        makeProvider(),
        makeService(),
        makeHouseProvider()
      )

      expect(result.staffSquareCredentials).toBeNull()
    })
  })
})
