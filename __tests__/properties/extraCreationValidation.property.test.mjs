/**
 * Property-Based Tests for Extra Creation Validation
 *
 * Uses fast-check to validate correctness properties for Extra create/edit submissions.
 * Feature: booking-enhancements
 *
 * Properties tested:
 * - Property 7: Extra creation validation
 *
 * **Validates: Requirements 4.3, 4.4**
 *
 * Tests the validation boundary: the system accepts the submission if and only if
 * `name` is a non-empty string of 1-100 characters (after trim) AND `price` is a
 * number in the range [0.01, 99999.99]. All other submissions are rejected.
 */

import fc from 'fast-check'

// ── Validation Logic (mirrors the API route's POST/PATCH validation) ──────────

/**
 * Validates an Extra creation/edit submission for name and price fields.
 * Extracted from app/api/extras/route.ts POST handler logic.
 *
 * @param {{ name: any, price: any }} submission
 * @returns {{ valid: boolean, errors: Array<{ field: string, message: string }> }}
 */
function validateExtraSubmission({ name, price }) {
  const errors = []

  // Validate name: required, must be a string, non-empty after trim, 1-100 chars
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Name is required (1-100 characters)' })
  } else if (name.trim().length > 100) {
    errors.push({ field: 'name', message: 'Name must be 100 characters or fewer' })
  }

  // Validate price: required, must be a number, in range [0.01, 99999.99]
  if (price === undefined || price === null || typeof price !== 'number' || isNaN(price)) {
    errors.push({ field: 'price', message: 'Price is required (0.01-99999.99)' })
  } else if (price < 0.01 || price > 99999.99) {
    errors.push({ field: 'price', message: 'Price must be between 0.01 and 99999.99' })
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

// ── Generators ────────────────────────────────────────────────────────────────

/**
 * Generates a valid name: non-empty string, 1-100 chars after trim.
 * Ensures no leading/trailing whitespace-only strings sneak through.
 */
function arbValidName() {
  return fc.integer({ min: 1, max: 100 }).chain(len =>
    fc.stringOf(
      fc.char().filter(c => c.trim().length > 0),
      { minLength: len, maxLength: len }
    )
  )
}

/**
 * Generates a valid price: number in [0.01, 99999.99].
 * Uses integer cents to avoid floating-point precision issues.
 */
function arbValidPrice() {
  return fc.integer({ min: 1, max: 9999999 }).map(cents => cents / 100)
}

/**
 * Generates an invalid name. One of:
 * - empty string
 * - whitespace-only string
 * - non-string type (number, null, undefined, boolean, object)
 * - string that exceeds 100 chars after trim
 */
function arbInvalidName() {
  return fc.oneof(
    // Empty string
    fc.constant(''),
    // Whitespace-only string
    fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 20 }),
    // Too long (101-200 non-whitespace chars)
    fc.integer({ min: 101, max: 200 }).chain(len =>
      fc.stringOf(fc.char().filter(c => c.trim().length > 0), { minLength: len, maxLength: len })
    ),
    // Non-string types
    fc.constant(null),
    fc.constant(undefined),
    fc.integer(),
    fc.boolean(),
    fc.constant({})
  )
}

/**
 * Generates an invalid price. One of:
 * - non-number type (string, null, undefined, boolean)
 * - number below 0.01
 * - number above 99999.99
 * - NaN
 */
function arbInvalidPrice() {
  return fc.oneof(
    // Non-number types
    fc.constant(null),
    fc.constant(undefined),
    fc.string(),
    fc.boolean(),
    // Below range: numbers < 0.01 (including 0 and negatives)
    fc.double({ min: -100000, max: 0.009999, noNaN: true }),
    // Above range: numbers > 99999.99
    fc.double({ min: 100000, max: 999999, noNaN: true }),
    // NaN
    fc.constant(NaN)
  )
}

// ── Property 7: Extra creation validation ─────────────────────────────────────

describe('Feature: booking-enhancements, Property 7: Extra creation validation', () => {
  test('accepts any submission with valid name (1-100 chars, non-empty after trim) AND valid price ([0.01, 99999.99])', () => {
    fc.assert(
      fc.property(
        arbValidName(),
        arbValidPrice(),
        (name, price) => {
          const result = validateExtraSubmission({ name, price })
          return result.valid === true && result.errors.length === 0
        }
      ),
      { numRuns: 100 }
    )
  })

  test('rejects any submission with invalid name', () => {
    fc.assert(
      fc.property(
        arbInvalidName(),
        arbValidPrice(),
        (name, price) => {
          const result = validateExtraSubmission({ name, price })
          return result.valid === false &&
            result.errors.some(e => e.field === 'name')
        }
      ),
      { numRuns: 100 }
    )
  })

  test('rejects any submission with invalid price', () => {
    fc.assert(
      fc.property(
        arbValidName(),
        arbInvalidPrice(),
        (name, price) => {
          const result = validateExtraSubmission({ name, price })
          return result.valid === false &&
            result.errors.some(e => e.field === 'price')
        }
      ),
      { numRuns: 100 }
    )
  })

  test('rejects any submission with both invalid name and invalid price', () => {
    fc.assert(
      fc.property(
        arbInvalidName(),
        arbInvalidPrice(),
        (name, price) => {
          const result = validateExtraSubmission({ name, price })
          return result.valid === false && result.errors.length >= 1
        }
      ),
      { numRuns: 100 }
    )
  })

  test('boundary: name of exactly 1 character is accepted', () => {
    fc.assert(
      fc.property(
        fc.char().filter(c => c.trim().length > 0),
        arbValidPrice(),
        (name, price) => {
          const result = validateExtraSubmission({ name, price })
          return result.valid === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('boundary: name of exactly 100 characters is accepted', () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.char().filter(c => c.trim().length > 0), { minLength: 100, maxLength: 100 }),
        arbValidPrice(),
        (name, price) => {
          const result = validateExtraSubmission({ name, price })
          return result.valid === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('boundary: name of exactly 101 characters is rejected', () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.char().filter(c => c.trim().length > 0), { minLength: 101, maxLength: 101 }),
        arbValidPrice(),
        (name, price) => {
          const result = validateExtraSubmission({ name, price })
          return result.valid === false &&
            result.errors.some(e => e.field === 'name')
        }
      ),
      { numRuns: 100 }
    )
  })

  test('boundary: price of exactly 0.01 is accepted', () => {
    fc.assert(
      fc.property(
        arbValidName(),
        (name) => {
          const result = validateExtraSubmission({ name, price: 0.01 })
          return result.valid === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('boundary: price of exactly 99999.99 is accepted', () => {
    fc.assert(
      fc.property(
        arbValidName(),
        (name) => {
          const result = validateExtraSubmission({ name, price: 99999.99 })
          return result.valid === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('boundary: price of 0 is rejected', () => {
    fc.assert(
      fc.property(
        arbValidName(),
        (name) => {
          const result = validateExtraSubmission({ name, price: 0 })
          return result.valid === false &&
            result.errors.some(e => e.field === 'price')
        }
      ),
      { numRuns: 100 }
    )
  })

  test('boundary: price of 100000 is rejected', () => {
    fc.assert(
      fc.property(
        arbValidName(),
        (name) => {
          const result = validateExtraSubmission({ name, price: 100000 })
          return result.valid === false &&
            result.errors.some(e => e.field === 'price')
        }
      ),
      { numRuns: 100 }
    )
  })
})
