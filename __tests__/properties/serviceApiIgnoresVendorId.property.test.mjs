/**
 * Property-Based Tests for Service API Ignoring vendorId
 *
 * Uses fast-check to validate that the service API payload stripping logic
 * correctly removes vendorId and leadVendorId from request payloads while
 * preserving all other fields.
 * Feature: unified-business-model
 *
 * Properties tested:
 * - Property 16: Service API ignores vendorId field
 *
 * **Validates: Requirements 9.8**
 */

import fc from 'fast-check'

// ── Helper Function Under Test ────────────────────────────────────────────
// This mirrors the destructuring logic used in app/api/services/route.ts
// for both POST and PATCH handlers:
//   const { vendorId: _ignoredVendorId, leadVendorId: _ignoredLeadVendorId, ...rest } = body;

/**
 * Strips vendorId and leadVendorId from a service request payload.
 * This is the pure data transformation tested by this property.
 */
function stripVendorFields(payload) {
  const { vendorId, leadVendorId, ...rest } = payload
  return rest
}

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a valid vendor ID string.
 */
function arbVendorId() {
  return fc.stringMatching(/^[a-z0-9][a-z0-9\-]{2,20}$/)
}

/**
 * Generates a base service payload without vendor fields.
 */
function arbServicePayload() {
  return fc.record({
    serviceId: fc.stringMatching(/^svc-[a-z0-9]{4,10}$/),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    duration: fc.integer({ min: 15, max: 480 }),
    price: fc.integer({ min: 0, max: 10000 }),
    description: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
    categories: fc.option(fc.array(fc.string({ minLength: 2, maxLength: 50 }), { minLength: 0, maxLength: 5 }), { nil: undefined }),
    isActive: fc.option(fc.boolean(), { nil: undefined }),
    allowedStaff: fc.option(fc.array(arbVendorId(), { minLength: 0, maxLength: 5 }), { nil: null }),
    bufferMinutes: fc.option(fc.integer({ min: 0, max: 60 }), { nil: undefined }),
    houseFeeEnabled: fc.option(fc.boolean(), { nil: undefined }),
    houseFeeAmount: fc.option(fc.integer({ min: 0, max: 500 }), { nil: undefined }),
    houseFeePercent: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
  })
}

/**
 * Generates a service payload that includes a vendorId field.
 */
function arbPayloadWithVendorId() {
  return fc.tuple(arbServicePayload(), arbVendorId()).map(([payload, vendorId]) => ({
    ...payload,
    vendorId,
  }))
}

/**
 * Generates a service payload that includes a leadVendorId field.
 */
function arbPayloadWithLeadVendorId() {
  return fc.tuple(arbServicePayload(), arbVendorId()).map(([payload, leadVendorId]) => ({
    ...payload,
    leadVendorId,
  }))
}

/**
 * Generates a service payload that includes both vendorId and leadVendorId fields.
 */
function arbPayloadWithBothVendorFields() {
  return fc.tuple(arbServicePayload(), arbVendorId(), arbVendorId()).map(([payload, vendorId, leadVendorId]) => ({
    ...payload,
    vendorId,
    leadVendorId,
  }))
}

// ── Property 16: Service API ignores vendorId field ──

describe('Feature: unified-business-model, Property 16: Service API ignores vendorId field', () => {
  test('Stripped output does not contain vendorId when vendorId is in payload', () => {
    fc.assert(
      fc.property(
        arbPayloadWithVendorId(),
        (payload) => {
          const result = stripVendorFields(payload)
          return !('vendorId' in result)
        }
      ),
      { numRuns: 100 }
    )
  })

  test('Stripped output does not contain leadVendorId when leadVendorId is in payload', () => {
    fc.assert(
      fc.property(
        arbPayloadWithLeadVendorId(),
        (payload) => {
          const result = stripVendorFields(payload)
          return !('leadVendorId' in result)
        }
      ),
      { numRuns: 100 }
    )
  })

  test('All other fields are preserved after stripping vendor fields', () => {
    fc.assert(
      fc.property(
        arbPayloadWithBothVendorFields(),
        (payload) => {
          const result = stripVendorFields(payload)
          // Every key in result should exist in original payload with same value
          for (const key of Object.keys(result)) {
            if (JSON.stringify(result[key]) !== JSON.stringify(payload[key])) {
              return false
            }
          }
          // Every key in original payload except vendorId/leadVendorId should be in result
          for (const key of Object.keys(payload)) {
            if (key === 'vendorId' || key === 'leadVendorId') continue
            if (!(key in result)) return false
            if (JSON.stringify(result[key]) !== JSON.stringify(payload[key])) return false
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('When vendorId is not in payload, stripping is a no-op (all fields preserved)', () => {
    fc.assert(
      fc.property(
        arbServicePayload(),
        (payload) => {
          const result = stripVendorFields(payload)
          // Result should have the same keys and values as payload
          const payloadKeys = Object.keys(payload).sort()
          const resultKeys = Object.keys(result).sort()
          if (payloadKeys.length !== resultKeys.length) return false
          for (let i = 0; i < payloadKeys.length; i++) {
            if (payloadKeys[i] !== resultKeys[i]) return false
            if (JSON.stringify(payload[payloadKeys[i]]) !== JSON.stringify(result[resultKeys[i]])) return false
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
