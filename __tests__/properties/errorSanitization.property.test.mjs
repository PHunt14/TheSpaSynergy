/**
 * Property-Based Tests for Error Message Sanitization
 *
 * Uses fast-check to validate that customer-facing error messages
 * never contain forbidden patterns: "Square", "stack", "Error:",
 * raw JSON objects, UUIDs, staffIds, or vendorIds.
 *
 * Feature: payments-kiosk-overhaul, Property 19: Error message sanitization
 *
 * **Validates: Requirements 7.4**
 */

import fc from 'fast-check'
import { sanitizeErrorForCustomer } from '../../lib/payment/errorSanitizer.ts'

// ── Constants ─────────────────────────────────────────────────

const GENERIC_MESSAGE = 'Something went wrong \u2014 please try again'

/**
 * Patterns that must never appear in sanitized output.
 */
const FORBIDDEN_PATTERNS = [
  /square/i,
  /stack/i,
  /Error:/,
  /\{.*".*":.*\}/s,
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  /staff-[a-zA-Z0-9]+/i,
  /vendor-[a-zA-Z0-9]+/i,
]

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a UUID string (common internal identifier format).
 */
const arbUUID = fc.tuple(
  fc.hexaString({ minLength: 8, maxLength: 8 }),
  fc.hexaString({ minLength: 4, maxLength: 4 }),
  fc.hexaString({ minLength: 4, maxLength: 4 }),
  fc.hexaString({ minLength: 4, maxLength: 4 }),
  fc.hexaString({ minLength: 12, maxLength: 12 }),
).map(([a, b, c, d, e]) => `${a}-${b}-${c}-${d}-${e}`)

/**
 * Generates a staffId (e.g., "staff-abc123").
 */
const arbStaffId = fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/)
  .map(s => `staff-${s}`)

/**
 * Generates a vendorId (e.g., "vendor-xyz789").
 */
const arbVendorId = fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/)
  .map(s => `vendor-${s}`)

/**
 * Generates a raw JSON object string.
 */
const arbJsonObject = fc.record({
  key: fc.string({ minLength: 1, maxLength: 10 }).filter(s => /\w+/.test(s)),
  value: fc.string({ minLength: 1, maxLength: 20 }),
}).map(({ key, value }) => `{"${key}":"${value}"}`)

/**
 * Generates a string containing "Square" in various cases.
 */
const arbSquareRef = fc.constantFrom(
  'Square', 'square', 'SQUARE', 'SquareError', 'square_api',
  'Payment failed: Square returned 500',
  'Could not connect to Square services',
)

/**
 * Generates a string containing "stack" in various contexts.
 */
const arbStackTrace = fc.constantFrom(
  'stack trace at line 42',
  'Error stack: module.js:55',
  'Stack overflow in payment handler',
  'at Object.<anonymous> (stack:1:1)',
  'TypeError: something failed\n    at stack',
)

/**
 * Generates a string containing "Error:" prefix.
 */
const arbErrorPrefix = fc.string({ minLength: 1, maxLength: 50 })
  .map(s => `Error: ${s}`)

/**
 * Generates a message that embeds a forbidden pattern within surrounding text.
 */
const arbForbiddenMessage = fc.oneof(
  arbSquareRef,
  arbStackTrace,
  arbErrorPrefix,
  arbJsonObject.map(json => `Failed with response ${json}`),
  arbUUID.map(uuid => `Payment ${uuid} failed`),
  arbStaffId.map(id => `Credentials for ${id} not found`),
  arbVendorId.map(id => `Cannot route to ${id}`),
)

/**
 * Generates a "safe" message that does not contain any forbidden patterns.
 * Uses a restricted alphabet and avoids words that could trigger patterns.
 */
const arbSafeMessage = fc.stringOf(
  fc.constantFrom(
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
    'n', 'o', 'p', 'r', 't', 'u', 'v', 'w', 'x', 'y', 'z',
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    'N', 'O', 'P', 'R', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    ' ', '.', ',', '!', '?', '-', '(', ')', '0', '1', '2', '9',
  ),
  { minLength: 1, maxLength: 100 }
).filter(s => {
  // Ensure the generated message doesn't accidentally match any forbidden pattern
  return !FORBIDDEN_PATTERNS.some(p => p.test(s))
})

/**
 * Generates non-string values that the sanitizer should handle gracefully.
 */
const arbNonString = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.double(),
  fc.boolean(),
  fc.array(fc.string()),
  fc.record({ message: fc.string() }),
)

// ── Helpers ───────────────────────────────────────────────────

/**
 * Checks that a sanitized output does not contain any forbidden pattern.
 */
function outputIsSafe(output) {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(output)) {
      return false
    }
  }
  return true
}

// ── Property 19: Error message sanitization ───────────────────

describe('Feature: payments-kiosk-overhaul, Property 19: Error message sanitization', () => {
  test('messages containing "Square" are sanitized to generic message', () => {
    fc.assert(
      fc.property(arbSquareRef, (message) => {
        const result = sanitizeErrorForCustomer(message)
        return result === GENERIC_MESSAGE
      }),
      { numRuns: 100 }
    )
  })

  test('messages containing "stack" are sanitized to generic message', () => {
    fc.assert(
      fc.property(arbStackTrace, (message) => {
        const result = sanitizeErrorForCustomer(message)
        return result === GENERIC_MESSAGE
      }),
      { numRuns: 100 }
    )
  })

  test('messages containing "Error:" are sanitized to generic message', () => {
    fc.assert(
      fc.property(arbErrorPrefix, (message) => {
        const result = sanitizeErrorForCustomer(message)
        return result === GENERIC_MESSAGE
      }),
      { numRuns: 100 }
    )
  })

  test('messages containing raw JSON objects are sanitized to generic message', () => {
    fc.assert(
      fc.property(arbJsonObject, (json) => {
        const message = `Response: ${json}`
        const result = sanitizeErrorForCustomer(message)
        return result === GENERIC_MESSAGE
      }),
      { numRuns: 100 }
    )
  })

  test('messages containing UUIDs are sanitized to generic message', () => {
    fc.assert(
      fc.property(arbUUID, (uuid) => {
        const message = `Transaction ${uuid} failed`
        const result = sanitizeErrorForCustomer(message)
        return result === GENERIC_MESSAGE
      }),
      { numRuns: 100 }
    )
  })

  test('messages containing staffIds are sanitized to generic message', () => {
    fc.assert(
      fc.property(arbStaffId, (staffId) => {
        const message = `Cannot find credentials for ${staffId}`
        const result = sanitizeErrorForCustomer(message)
        return result === GENERIC_MESSAGE
      }),
      { numRuns: 100 }
    )
  })

  test('messages containing vendorIds are sanitized to generic message', () => {
    fc.assert(
      fc.property(arbVendorId, (vendorId) => {
        const message = `Routing failed for ${vendorId}`
        const result = sanitizeErrorForCustomer(message)
        return result === GENERIC_MESSAGE
      }),
      { numRuns: 100 }
    )
  })

  test('any message with a forbidden pattern never leaks through to output', () => {
    fc.assert(
      fc.property(arbForbiddenMessage, (message) => {
        const result = sanitizeErrorForCustomer(message)
        return outputIsSafe(result)
      }),
      { numRuns: 100 }
    )
  })

  test('non-string inputs are sanitized to generic message', () => {
    fc.assert(
      fc.property(arbNonString, (input) => {
        const result = sanitizeErrorForCustomer(input)
        return result === GENERIC_MESSAGE
      }),
      { numRuns: 100 }
    )
  })

  test('safe messages pass through unchanged', () => {
    fc.assert(
      fc.property(arbSafeMessage, (message) => {
        const result = sanitizeErrorForCustomer(message)
        return result === message
      }),
      { numRuns: 100 }
    )
  })

  test('output of sanitizer is always a string and never contains forbidden patterns', () => {
    fc.assert(
      fc.property(
        fc.oneof(arbForbiddenMessage, arbSafeMessage, arbNonString.map(String)),
        (input) => {
          const result = sanitizeErrorForCustomer(input)
          return typeof result === 'string' && outputIsSafe(result)
        }
      ),
      { numRuns: 100 }
    )
  })
})
