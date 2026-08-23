/**
 * Property-Based Tests for Payment Audit Trail
 *
 * Uses fast-check to validate correctness properties for audit record
 * completeness and append-only semantics.
 * Feature: payments-kiosk-overhaul
 *
 * Properties tested:
 * - Property 20: Successful payment audit completeness
 * - Property 21: Failed payment audit completeness
 * - Property 22: Append-only audit records
 *
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.5**
 */

import { jest } from '@jest/globals'
import fc from 'fast-check'

// ── Mock Setup for Property 22 ───────────────────────────────

let mockPaymentRaw = null

const mockGet = jest.fn(() =>
  Promise.resolve({
    data: {
      appointmentId: 'test-appointment',
      get paymentRaw() {
        return mockPaymentRaw
      },
    },
  })
)

const mockUpdate = jest.fn((input) => {
  // Simulate the database update by tracking the paymentRaw state
  mockPaymentRaw = input.paymentRaw
  return Promise.resolve({ data: input })
})

jest.unstable_mockModule('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      Appointment: {
        get: mockGet,
        update: mockUpdate,
      },
    },
  }),
}))

// ── Dynamic Import (after mocks registered) ──────────────────

const { buildAuditRecord, appendAuditRecord } = await import('../../lib/payment/audit.ts')

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a valid routing method.
 */
const arbRoutingMethod = fc.constantFrom('staff', 'sibling_staff', 'house')

/**
 * Generates a non-empty credential resolution path array.
 */
const arbResolutionPath = fc.array(
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz:_'), { minLength: 3, maxLength: 30 }),
  { minLength: 1, maxLength: 5 }
)

/**
 * Generates a non-empty string (for IDs, descriptions, etc).
 */
const arbNonEmptyString = fc.string({ minLength: 1, maxLength: 64 }).filter(s => s.trim().length > 0)

/**
 * Generates a positive integer for amounts in cents.
 */
const arbPositiveCents = fc.integer({ min: 1, max: 999999 })

/**
 * Generates fields for a successful payment audit record.
 */
const arbSuccessFields = fc.record({
  type: fc.constant('success'),
  routingMethod: arbRoutingMethod,
  credentialResolutionPath: arbResolutionPath,
  housePaymentId: arbNonEmptyString,
  houseFeeAmount: fc.integer({ min: 0, max: 99999 }),
  staffPaymentId: arbNonEmptyString,
  staffAmount: fc.integer({ min: 1, max: 99999 }),
  tipAmount: fc.integer({ min: 0, max: 99999 }),
})

/**
 * Generates fields for a failed payment audit record.
 */
const arbFailureFields = fc.record({
  type: fc.constant('failure'),
  routingMethod: arbRoutingMethod,
  credentialResolutionPath: arbResolutionPath,
  failureReason: arbNonEmptyString,
  attemptedAmountCents: arbPositiveCents,
  credentialSource: arbNonEmptyString,
  idempotencyKey: arbNonEmptyString,
})

// ── Property 20: Successful payment audit completeness ────────

describe('Feature: payments-kiosk-overhaul, Property 20: Successful payment audit completeness', () => {
  test('successful payment record has valid ISO 8601 UTC timestamp, routing method, non-empty resolution path, and payment-type-specific fields', () => {
    fc.assert(
      fc.property(
        arbSuccessFields,
        (fields) => {
          const record = buildAuditRecord(fields)

          // Timestamp is a valid ISO 8601 UTC string
          const parsed = new Date(record.timestamp)
          if (isNaN(parsed.getTime())) return false
          if (!record.timestamp.endsWith('Z')) return false

          // Routing method is present and valid
          if (!['staff', 'sibling_staff', 'house'].includes(record.routingMethod)) return false

          // Credential resolution path is a non-empty array
          if (!Array.isArray(record.credentialResolutionPath)) return false
          if (record.credentialResolutionPath.length === 0) return false

          // Payment-type-specific fields for success: housePaymentId and staffPaymentId
          if (!record.housePaymentId || record.housePaymentId.length === 0) return false
          if (!record.staffPaymentId || record.staffPaymentId.length === 0) return false

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('buildAuditRecord preserves all input fields and adds timestamp', () => {
    fc.assert(
      fc.property(
        arbSuccessFields,
        (fields) => {
          const record = buildAuditRecord(fields)

          // All input fields are preserved
          if (record.type !== fields.type) return false
          if (record.routingMethod !== fields.routingMethod) return false
          if (record.housePaymentId !== fields.housePaymentId) return false
          if (record.staffPaymentId !== fields.staffPaymentId) return false
          if (record.staffAmount !== fields.staffAmount) return false
          if (record.houseFeeAmount !== fields.houseFeeAmount) return false
          if (record.tipAmount !== fields.tipAmount) return false
          if (JSON.stringify(record.credentialResolutionPath) !== JSON.stringify(fields.credentialResolutionPath)) return false

          // Timestamp was auto-generated
          if (!record.timestamp) return false

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 21: Failed payment audit completeness ────────────

describe('Feature: payments-kiosk-overhaul, Property 21: Failed payment audit completeness', () => {
  test('failed payment record has non-empty failure reason, positive attempted amount in cents, non-empty credential source, and idempotency key', () => {
    fc.assert(
      fc.property(
        arbFailureFields,
        (fields) => {
          const record = buildAuditRecord(fields)

          // Failure reason is a non-empty string
          if (typeof record.failureReason !== 'string') return false
          if (record.failureReason.length === 0) return false

          // Attempted amount in cents is a positive integer
          if (typeof record.attemptedAmountCents !== 'number') return false
          if (!Number.isInteger(record.attemptedAmountCents)) return false
          if (record.attemptedAmountCents <= 0) return false

          // Credential source is a non-empty string
          if (typeof record.credentialSource !== 'string') return false
          if (record.credentialSource.length === 0) return false

          // Idempotency key is a non-empty string
          if (typeof record.idempotencyKey !== 'string') return false
          if (record.idempotencyKey.length === 0) return false

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('failed payment record has valid ISO 8601 UTC timestamp', () => {
    fc.assert(
      fc.property(
        arbFailureFields,
        (fields) => {
          const record = buildAuditRecord(fields)

          const parsed = new Date(record.timestamp)
          if (isNaN(parsed.getTime())) return false
          if (!record.timestamp.endsWith('Z')) return false

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 22: Append-only audit records ────────────────────

describe('Feature: payments-kiosk-overhaul, Property 22: Append-only audit records', () => {
  /**
   * For Property 22 we test the append-only semantics by using the mocked
   * Amplify data client. appendAuditRecord fetches existing records,
   * appends the new one, and writes back. We verify:
   *   - After N appends, the array length equals N
   *   - No previously stored record is modified or removed
   */

  beforeEach(() => {
    mockPaymentRaw = null
    mockGet.mockClear()
    mockUpdate.mockClear()
  })

  test('after N payment attempts, paymentRaw array length equals N and no records are modified', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        arbRoutingMethod,
        arbResolutionPath,
        async (n, routingMethod, resolutionPath) => {
          // Reset state for this property iteration
          mockPaymentRaw = null
          mockGet.mockClear()
          mockUpdate.mockClear()

          const records = []

          for (let i = 0; i < n; i++) {
            const record = buildAuditRecord({
              type: i % 2 === 0 ? 'success' : 'failure',
              routingMethod,
              credentialResolutionPath: resolutionPath,
              ...(i % 2 === 0
                ? { housePaymentId: `house-${i}`, staffPaymentId: `staff-${i}`, staffAmount: 1000 + i }
                : { failureReason: `error-${i}`, attemptedAmountCents: 500 + i, credentialSource: `src-${i}`, idempotencyKey: `key-${i}` }),
            })
            records.push(record)

            await appendAuditRecord('test-appointment', record)

            // Verify array length after each append
            const currentRaw = JSON.parse(mockPaymentRaw)
            if (!Array.isArray(currentRaw)) return false
            if (currentRaw.length !== i + 1) return false

            // Verify no previously stored records were modified
            for (let j = 0; j < i; j++) {
              const storedRecord = currentRaw[j]
              const originalRecord = records[j]
              if (storedRecord.timestamp !== originalRecord.timestamp) return false
              if (storedRecord.type !== originalRecord.type) return false
              if (storedRecord.routingMethod !== originalRecord.routingMethod) return false
            }
          }

          // Final verification: array length equals N
          const finalRaw = JSON.parse(mockPaymentRaw)
          if (finalRaw.length !== n) return false

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
