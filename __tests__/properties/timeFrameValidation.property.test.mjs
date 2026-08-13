/**
 * Property-Based Tests for Time Frame API Validation
 *
 * Uses fast-check to validate correctness properties for time frame
 * input validation logic.
 * Feature: booking-enhancements, Property 8: Time frame API validation
 *
 * **Validates: Requirements 5.1, 5.4**
 */

import fc from 'fast-check'
import { validateTimeFrame } from '../../app/utils/bookingValidation.js'

// ── Constants ─────────────────────────────────────────────────

const VALID_TIME_FRAMES = ['morning', 'afternoon', 'evening']

// ── Generators ────────────────────────────────────────────────

/**
 * Generates one of the three valid time frame values.
 */
function arbValidTimeFrame() {
  return fc.constantFrom(...VALID_TIME_FRAMES)
}

/**
 * Generates an arbitrary string that is NOT one of the valid time frames.
 * Includes case variations, whitespace, empty strings, and random strings.
 */
function arbInvalidTimeFrame() {
  return fc.string().filter((s) => !VALID_TIME_FRAMES.includes(s))
}

/**
 * Generates case-variant versions of valid time frame values that should be
 * rejected (e.g., "Morning", "AFTERNOON", "Evening").
 */
function arbCaseVariantTimeFrame() {
  return fc.constantFrom(
    'Morning', 'MORNING', 'mOrNiNg',
    'Afternoon', 'AFTERNOON', 'aFtErNoOn',
    'Evening', 'EVENING', 'eVeNiNg'
  )
}

// ── Property 8: Time frame API validation ─────────────────────

describe('Feature: booking-enhancements, Property 8: Time frame API validation', () => {
  test('valid time frames are accepted: any value in {"morning", "afternoon", "evening"} returns { valid: true }', () => {
    fc.assert(
      fc.property(
        arbValidTimeFrame(),
        (timeFrame) => {
          const result = validateTimeFrame(timeFrame)
          return result.valid === true && result.error === null
        }
      ),
      { numRuns: 100 }
    )
  })

  test('invalid arbitrary strings are rejected: any string not in the valid set returns { valid: false } with an error message', () => {
    fc.assert(
      fc.property(
        arbInvalidTimeFrame(),
        (timeFrame) => {
          const result = validateTimeFrame(timeFrame)
          return result.valid === false && typeof result.error === 'string' && result.error.length > 0
        }
      ),
      { numRuns: 100 }
    )
  })

  test('case variations of valid values are rejected (case-sensitive comparison)', () => {
    fc.assert(
      fc.property(
        arbCaseVariantTimeFrame(),
        (timeFrame) => {
          const result = validateTimeFrame(timeFrame)
          return result.valid === false && typeof result.error === 'string' && result.error.length > 0
        }
      ),
      { numRuns: 100 }
    )
  })

  test('acceptance is if and only if the value is exactly one of the valid time frames', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (value) => {
          const result = validateTimeFrame(value)
          const shouldBeValid = VALID_TIME_FRAMES.includes(value)
          return result.valid === shouldBeValid
        }
      ),
      { numRuns: 100 }
    )
  })
})
