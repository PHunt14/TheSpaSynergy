/**
 * Property-Based Tests for Boolean Type Validation (isNewClient)
 *
 * Uses fast-check to validate that the isNewClient field accepts only
 * literal boolean values (true or false) and rejects all other types.
 *
 * Feature: booking-enhancements, Property 9: Boolean type validation for isNewClient
 *
 * **Validates: Requirements 5.2, 5.9**
 */

import fc from 'fast-check'
import { validateIsNewClient } from '../../app/utils/bookingValidation.js'

// ── Generators ────────────────────────────────────────────────

/**
 * Generates literal boolean values (true or false).
 */
function arbLiteralBoolean() {
  return fc.boolean()
}

/**
 * Generates string representations of booleans that should be rejected.
 */
function arbBooleanStrings() {
  return fc.oneof(
    fc.constant('true'),
    fc.constant('false'),
    fc.constant('True'),
    fc.constant('False'),
    fc.constant('TRUE'),
    fc.constant('FALSE'),
    fc.constant('yes'),
    fc.constant('no'),
    fc.constant('Yes'),
    fc.constant('No'),
    fc.constant('YES'),
    fc.constant('NO'),
    fc.constant('1'),
    fc.constant('0')
  )
}

/**
 * Generates numeric values (integers and floats) that should be rejected.
 */
function arbNumericValues() {
  return fc.oneof(
    fc.integer(),
    fc.float(),
    fc.constant(0),
    fc.constant(1),
    fc.constant(-1),
    fc.constant(NaN),
    fc.constant(Infinity)
  )
}

/**
 * Generates null/undefined values that should be rejected.
 */
function arbNullish() {
  return fc.oneof(
    fc.constant(null),
    fc.constant(undefined)
  )
}

/**
 * Generates arbitrary non-boolean values (strings, numbers, objects, arrays, null, undefined).
 */
function arbNonBoolean() {
  return fc.oneof(
    arbBooleanStrings(),
    arbNumericValues(),
    arbNullish(),
    fc.string(),
    fc.object(),
    fc.array(fc.anything())
  )
}

// ── Property 9: Boolean type validation for isNewClient ───────

describe('Feature: booking-enhancements, Property 9: Boolean type validation for isNewClient', () => {
  test('literal boolean values (true or false) are always accepted', () => {
    fc.assert(
      fc.property(
        arbLiteralBoolean(),
        (value) => {
          const result = validateIsNewClient(value)
          return result.valid === true && result.error === null
        }
      ),
      { numRuns: 100 }
    )
  })

  test('string representations of booleans are always rejected', () => {
    fc.assert(
      fc.property(
        arbBooleanStrings(),
        (value) => {
          const result = validateIsNewClient(value)
          return result.valid === false && result.error !== null
        }
      ),
      { numRuns: 100 }
    )
  })

  test('numeric values are always rejected', () => {
    fc.assert(
      fc.property(
        arbNumericValues(),
        (value) => {
          const result = validateIsNewClient(value)
          return result.valid === false && result.error !== null
        }
      ),
      { numRuns: 100 }
    )
  })

  test('null and undefined are always rejected', () => {
    fc.assert(
      fc.property(
        arbNullish(),
        (value) => {
          const result = validateIsNewClient(value)
          return result.valid === false && result.error !== null
        }
      ),
      { numRuns: 100 }
    )
  })

  test('any non-boolean value is rejected', () => {
    fc.assert(
      fc.property(
        arbNonBoolean(),
        (value) => {
          const result = validateIsNewClient(value)
          return result.valid === false && result.error !== null
        }
      ),
      { numRuns: 100 }
    )
  })

  test('accepted if and only if value is literal true or false', () => {
    fc.assert(
      fc.property(
        fc.anything(),
        (value) => {
          const result = validateIsNewClient(value)
          const isLiteralBoolean = value === true || value === false
          return result.valid === isLiteralBoolean
        }
      ),
      { numRuns: 100 }
    )
  })
})
