/**
 * Property-Based Tests for Idempotency Key Generation
 *
 * Uses fast-check to validate correctness properties for deterministic
 * idempotency key generation and distinct split payment keys.
 * Feature: payments-kiosk-overhaul
 *
 * Properties tested:
 * - Property 17: Deterministic idempotency keys
 * - Property 18: Distinct split idempotency keys
 *
 * **Validates: Requirements 5.1, 5.3**
 */

import fc from 'fast-check'
import { generateIdempotencyKey, hashSourceToken } from '../../lib/payment/idempotency.ts'

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a valid payment type string.
 */
const arbPaymentType = fc.constantFrom('house_fee', 'staff', 'full', 'custom')

/**
 * Generates a non-empty string suitable for an appointmentId.
 */
const arbAppointmentId = fc.string({ minLength: 1, maxLength: 64 }).filter(s => s.length > 0)

/**
 * Generates a 16-character hex string simulating a hashed source token.
 */
const arbSourceTokenHash = fc.hexaString({ minLength: 16, maxLength: 16 })

/**
 * Generates a triple of (appointmentId, paymentType, sourceTokenHash).
 */
const arbTriple = fc.tuple(arbAppointmentId, arbPaymentType, arbSourceTokenHash)

/**
 * Generates two distinct triples guaranteed to differ in at least one component.
 */
const arbTwoDistinctTriples = fc.tuple(arbTriple, arbTriple).filter(
  ([a, b]) => a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]
)

// ── Property 17: Deterministic idempotency keys ───────────────

describe('Feature: payments-kiosk-overhaul, Property 17: Deterministic idempotency keys', () => {
  test('same triple always produces the same idempotency key', () => {
    fc.assert(
      fc.property(
        arbTriple,
        ([appointmentId, paymentType, sourceTokenHash]) => {
          const key1 = generateIdempotencyKey(appointmentId, paymentType, sourceTokenHash)
          const key2 = generateIdempotencyKey(appointmentId, paymentType, sourceTokenHash)
          return key1 === key2
        }
      ),
      { numRuns: 100 }
    )
  })

  test('different triples produce different idempotency keys', () => {
    fc.assert(
      fc.property(
        arbTwoDistinctTriples,
        ([[id1, type1, hash1], [id2, type2, hash2]]) => {
          const key1 = generateIdempotencyKey(id1, type1, hash1)
          const key2 = generateIdempotencyKey(id2, type2, hash2)
          return key1 !== key2
        }
      ),
      { numRuns: 100 }
    )
  })

  test('idempotency key is a 32-character hex string', () => {
    fc.assert(
      fc.property(
        arbTriple,
        ([appointmentId, paymentType, sourceTokenHash]) => {
          const key = generateIdempotencyKey(appointmentId, paymentType, sourceTokenHash)
          return key.length === 32 && /^[0-9a-f]{32}$/.test(key)
        }
      ),
      { numRuns: 100 }
    )
  })

  test('hashSourceToken produces a 16-character hex string', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 128 }),
        (sourceId) => {
          const hash = hashSourceToken(sourceId)
          return hash.length === 16 && /^[0-9a-f]{16}$/.test(hash)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 18: Distinct split idempotency keys ──────────────

describe('Feature: payments-kiosk-overhaul, Property 18: Distinct split idempotency keys', () => {
  test('house_fee and staff payment types produce different keys for same appointment and hash', () => {
    fc.assert(
      fc.property(
        arbAppointmentId,
        arbSourceTokenHash,
        (appointmentId, sourceTokenHash) => {
          const houseKey = generateIdempotencyKey(appointmentId, 'house_fee', sourceTokenHash)
          const staffKey = generateIdempotencyKey(appointmentId, 'staff', sourceTokenHash)
          return houseKey !== staffKey
        }
      ),
      { numRuns: 100 }
    )
  })
})
