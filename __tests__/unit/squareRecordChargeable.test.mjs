/**
 * Regression tests for the kiosk Square-status gate.
 *
 * Background: the kiosk called /api/square/status, whose usableRecord() check
 * rejected any record whose access token was expired — even when the record
 * still had a refresh token. The authenticated payment path, however, refreshes
 * an expired token just-in-time using the refresh token and charges successfully.
 * The mismatch made the kiosk show "The provider has not connected Square.
 * Please pay in person." for staff whose Square was in fact working. This was
 * confirmed against live data: 3 of 4 connected staff had expired access tokens
 * (with valid refresh tokens) after ~30 days.
 *
 * isSquareRecordChargeable is now the single source of truth shared by the
 * status endpoint, so it must match what the payment path can charge.
 */

import {
  isSquareRecordChargeable,
  squareRecordNeedsReconnect,
  shouldProactivelyRefresh,
  isTokenExpired,
} from '../../lib/square/core.js'

const DAY = 24 * 60 * 60 * 1000
const future = () => new Date(Date.now() + 30 * DAY).toISOString()
const past = () => new Date(Date.now() - 5 * DAY).toISOString()

const connectedStaff = (overrides = {}) => ({
  squareLocationId: 'loc_123',
  squareAccessToken: 'tok_123',
  squareRefreshToken: 'refresh_123',
  squareOAuthStatus: 'connected',
  squareTokenExpiresAt: future(),
  ...overrides,
})

describe('isTokenExpired', () => {
  test('past timestamps are expired', () => {
    expect(isTokenExpired(past())).toBe(true)
  })
  test('future timestamps are not expired', () => {
    expect(isTokenExpired(future())).toBe(false)
  })
  test('null/empty is treated as expired', () => {
    expect(isTokenExpired(null)).toBe(true)
    expect(isTokenExpired(undefined)).toBe(true)
    expect(isTokenExpired('')).toBe(true)
  })
})

describe('isSquareRecordChargeable', () => {
  test('fully connected, valid token → chargeable', () => {
    expect(isSquareRecordChargeable(connectedStaff())).toBe(true)
  })

  // The core regression: this is the live Trinity/Stacey/Makaila scenario.
  test('EXPIRED access token WITH a refresh token → still chargeable (payment refreshes JIT)', () => {
    const rec = connectedStaff({ squareTokenExpiresAt: past() })
    expect(isSquareRecordChargeable(rec)).toBe(true)
  })

  test('null expiry WITH a refresh token → chargeable', () => {
    const rec = connectedStaff({ squareTokenExpiresAt: null })
    expect(isSquareRecordChargeable(rec)).toBe(true)
  })

  test('expired access token and NO refresh token → not chargeable', () => {
    const rec = connectedStaff({ squareTokenExpiresAt: past(), squareRefreshToken: null })
    expect(isSquareRecordChargeable(rec)).toBe(false)
  })

  test('missing token or location → not chargeable', () => {
    expect(isSquareRecordChargeable(connectedStaff({ squareAccessToken: null }))).toBe(false)
    expect(isSquareRecordChargeable(connectedStaff({ squareLocationId: null }))).toBe(false)
  })

  test("status 'error' → not chargeable regardless of tokens", () => {
    expect(isSquareRecordChargeable(connectedStaff({ squareOAuthStatus: 'error' }))).toBe(false)
  })

  test("status 'disconnected' → not chargeable", () => {
    expect(isSquareRecordChargeable(connectedStaff({ squareOAuthStatus: 'disconnected' }))).toBe(false)
  })

  test('null record → not chargeable', () => {
    expect(isSquareRecordChargeable(null)).toBe(false)
    expect(isSquareRecordChargeable(undefined)).toBe(false)
  })

  // House / manually-entered vendor credentials often have a null expiry and no
  // refresh token but a manually set 'connected' status; those are handled by
  // the payment path's house branch. Here we only assert the general rule.
  test('house-style creds: expired + no refresh → not chargeable via this gate', () => {
    const house = { squareLocationId: 'loc_h', squareAccessToken: 'tok_h', squareRefreshToken: null, squareOAuthStatus: 'connected', squareTokenExpiresAt: null }
    expect(isSquareRecordChargeable(house)).toBe(false)
  })
})

describe('squareRecordNeedsReconnect', () => {
  test('expired with no refresh token → needs reconnect', () => {
    const rec = connectedStaff({ squareTokenExpiresAt: past(), squareRefreshToken: null })
    expect(squareRecordNeedsReconnect(rec)).toBe(true)
  })

  test("status 'error' with creds → needs reconnect", () => {
    expect(squareRecordNeedsReconnect(connectedStaff({ squareOAuthStatus: 'error' }))).toBe(true)
  })

  test('expired WITH refresh token → does NOT need reconnect (recoverable)', () => {
    const rec = connectedStaff({ squareTokenExpiresAt: past() })
    expect(squareRecordNeedsReconnect(rec)).toBe(false)
  })

  test('valid connected record → does NOT need reconnect', () => {
    expect(squareRecordNeedsReconnect(connectedStaff())).toBe(false)
  })

  test("status 'disconnected' → not a reconnect case (treated as never connected)", () => {
    expect(squareRecordNeedsReconnect(connectedStaff({ squareOAuthStatus: 'disconnected' }))).toBe(false)
  })

  test('no credentials → not a reconnect case', () => {
    expect(squareRecordNeedsReconnect({ squareOAuthStatus: 'error' })).toBe(false)
  })
})

describe('shouldProactivelyRefresh (scheduled background job)', () => {
  const soon = () => new Date(Date.now() + 2 * DAY).toISOString() // within 7-day window

  test('token valid and far from expiry → do NOT refresh', () => {
    expect(shouldProactivelyRefresh(connectedStaff())).toBe(false)
  })

  test('token expiring within threshold → refresh', () => {
    expect(shouldProactivelyRefresh(connectedStaff({ squareTokenExpiresAt: soon() }))).toBe(true)
  })

  test('token already expired but has refresh token → refresh', () => {
    expect(shouldProactivelyRefresh(connectedStaff({ squareTokenExpiresAt: past() }))).toBe(true)
  })

  test('null expiry with refresh token → refresh', () => {
    expect(shouldProactivelyRefresh(connectedStaff({ squareTokenExpiresAt: null }))).toBe(true)
  })

  test('no refresh token → cannot refresh, skip', () => {
    expect(shouldProactivelyRefresh(connectedStaff({ squareTokenExpiresAt: past(), squareRefreshToken: null }))).toBe(false)
  })

  test("status 'disconnected' → intentionally off, skip", () => {
    expect(shouldProactivelyRefresh(connectedStaff({ squareOAuthStatus: 'disconnected', squareTokenExpiresAt: past() }))).toBe(false)
  })

  test("status 'error' with refresh token → still attempt refresh (can self-heal)", () => {
    expect(shouldProactivelyRefresh(connectedStaff({ squareOAuthStatus: 'error', squareTokenExpiresAt: past() }))).toBe(true)
  })

  test('custom threshold is honored', () => {
    const in10Days = new Date(Date.now() + 10 * DAY).toISOString()
    expect(shouldProactivelyRefresh(connectedStaff({ squareTokenExpiresAt: in10Days }), 7)).toBe(false)
    expect(shouldProactivelyRefresh(connectedStaff({ squareTokenExpiresAt: in10Days }), 14)).toBe(true)
  })

  test('null record → skip', () => {
    expect(shouldProactivelyRefresh(null)).toBe(false)
  })
})
