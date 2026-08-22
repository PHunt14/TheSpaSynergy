/**
 * Unit Tests for Idempotency Key Generator
 *
 * Tests that idempotency keys are deterministic and that split payment
 * suffixes produce distinct keys.
 *
 * Requirements: 5.1, 5.3
 */

import { describe, test, expect } from '@jest/globals'
import { generateIdempotencyKey, hashSourceToken } from '../../lib/payment/idempotency.ts'

describe('hashSourceToken', () => {
  test('produces a 16-character hex string', () => {
    const hash = hashSourceToken('cnon:card-nonce-ok')
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
  })

  test('is deterministic — same input always produces same output', () => {
    const input = 'cnon:card-nonce-abc123'
    const hash1 = hashSourceToken(input)
    const hash2 = hashSourceToken(input)
    expect(hash1).toBe(hash2)
  })

  test('different inputs produce different hashes', () => {
    const hash1 = hashSourceToken('cnon:card-nonce-1')
    const hash2 = hashSourceToken('cnon:card-nonce-2')
    expect(hash1).not.toBe(hash2)
  })

  test('handles empty string input', () => {
    const hash = hashSourceToken('')
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('generateIdempotencyKey', () => {
  const appointmentId = 'appt-12345'
  const sourceTokenHash = hashSourceToken('cnon:card-nonce-ok')

  test('produces a 32-character hex string', () => {
    const key = generateIdempotencyKey(appointmentId, 'full', sourceTokenHash)
    expect(key).toMatch(/^[0-9a-f]{32}$/)
  })

  test('is deterministic — same inputs always produce same key', () => {
    const key1 = generateIdempotencyKey(appointmentId, 'full', sourceTokenHash)
    const key2 = generateIdempotencyKey(appointmentId, 'full', sourceTokenHash)
    expect(key1).toBe(key2)
  })

  test('different appointmentIds produce different keys', () => {
    const key1 = generateIdempotencyKey('appt-111', 'full', sourceTokenHash)
    const key2 = generateIdempotencyKey('appt-222', 'full', sourceTokenHash)
    expect(key1).not.toBe(key2)
  })

  test('different paymentTypes produce different keys', () => {
    const key1 = generateIdempotencyKey(appointmentId, 'house_fee', sourceTokenHash)
    const key2 = generateIdempotencyKey(appointmentId, 'staff', sourceTokenHash)
    expect(key1).not.toBe(key2)
  })

  test('different sourceTokenHashes produce different keys', () => {
    const hash1 = hashSourceToken('cnon:nonce-A')
    const hash2 = hashSourceToken('cnon:nonce-B')
    const key1 = generateIdempotencyKey(appointmentId, 'full', hash1)
    const key2 = generateIdempotencyKey(appointmentId, 'full', hash2)
    expect(key1).not.toBe(key2)
  })

  test('house_fee and staff types produce distinct keys for split payments (Req 5.3)', () => {
    const houseKey = generateIdempotencyKey(appointmentId, 'house_fee', sourceTokenHash)
    const staffKey = generateIdempotencyKey(appointmentId, 'staff', sourceTokenHash)
    expect(houseKey).not.toBe(staffKey)
  })

  test('custom type produces a distinct key from other types', () => {
    const customKey = generateIdempotencyKey(appointmentId, 'custom', sourceTokenHash)
    const fullKey = generateIdempotencyKey(appointmentId, 'full', sourceTokenHash)
    const houseKey = generateIdempotencyKey(appointmentId, 'house_fee', sourceTokenHash)
    const staffKey = generateIdempotencyKey(appointmentId, 'staff', sourceTokenHash)
    expect(customKey).not.toBe(fullKey)
    expect(customKey).not.toBe(houseKey)
    expect(customKey).not.toBe(staffKey)
  })
})
