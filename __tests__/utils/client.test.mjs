/**
 * Client Utility Tests
 *
 * Unit tests for:
 * - normalizePhone (phone number normalization)
 * - normalizeEmail (email normalization)
 * - isMatchingClient (client identity matching)
 */

import {
  normalizePhone,
  normalizeEmail,
  isMatchingClient,
} from '../../app/utils/client.js'

// ── normalizePhone ────────────────────────────────────────────

describe('normalizePhone', () => {
  test('strips non-digits and returns last 10', () => {
    expect(normalizePhone('(240) 329-6537')).toBe('2403296537')
  })

  test('handles +1 prefix', () => {
    expect(normalizePhone('+12403296537')).toBe('2403296537')
  })

  test('handles plain 10 digits', () => {
    expect(normalizePhone('2403296537')).toBe('2403296537')
  })

  test('returns null for too-short numbers', () => {
    expect(normalizePhone('12345')).toBeNull()
  })

  test('returns null for empty/null', () => {
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone(undefined)).toBeNull()
  })
})

// ── normalizeEmail ────────────────────────────────────────────

describe('normalizeEmail', () => {
  test('lowercases and trims', () => {
    expect(normalizeEmail('  Jane@Example.COM  ')).toBe('jane@example.com')
  })

  test('returns null for empty/null', () => {
    expect(normalizeEmail('')).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
    expect(normalizeEmail(undefined)).toBeNull()
  })
})

// ── isMatchingClient ──────────────────────────────────────────

describe('isMatchingClient', () => {
  test('matches by phone', () => {
    expect(isMatchingClient(
      { phone: '2403296537', email: '' },
      { phone: '(240) 329-6537', email: 'different@email.com' }
    )).toBe(true)
  })

  test('matches by email when phones differ', () => {
    expect(isMatchingClient(
      { phone: '1111111111', email: 'jane@example.com' },
      { phone: '2222222222', email: 'Jane@Example.COM' }
    )).toBe(true)
  })

  test('does not match when both differ', () => {
    expect(isMatchingClient(
      { phone: '1111111111', email: 'a@b.com' },
      { phone: '2222222222', email: 'c@d.com' }
    )).toBe(false)
  })

  test('does not match when both are empty', () => {
    expect(isMatchingClient(
      { phone: '', email: '' },
      { phone: '', email: '' }
    )).toBe(false)
  })

  test('phone takes priority — matches even if emails are null', () => {
    expect(isMatchingClient(
      { phone: '+1-240-329-6537', email: null },
      { phone: '2403296537', email: null }
    )).toBe(true)
  })
})
