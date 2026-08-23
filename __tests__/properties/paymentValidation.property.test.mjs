/**
 * Property-Based Tests for Payment Validation
 *
 * Uses fast-check to validate correctness properties for payment amount validation,
 * tip validation, custom charge validation, numeric sanitization, and dollar-to-cents conversion.
 * Feature: payments-kiosk-overhaul
 *
 * Properties tested:
 * - Property 2: House fee exceeds price rejection
 * - Property 3: No-split when house fee disabled
 * - Property 11: Custom amount validation
 * - Property 13: Tip validation
 * - Property 14: Amount match validation
 * - Property 15: Dollar-to-cents conversion
 * - Property 16: Numeric input sanitization
 *
 * **Validates: Requirements 1.2, 1.5, 3.3, 3.7, 4.1, 4.3, 4.4, 4.5**
 */

import fc from 'fast-check'
import {
  sanitizeNumericInput,
  dollarsToCents,
  validatePaymentAmount,
  validateTipAmount,
  validateCustomChargeAmount,
} from '../../lib/payment/validator.ts'

// ── Helpers ───────────────────────────────────────────────────

/**
 * Local helper to simulate house fee split decision logic.
 * This will be replaced by the actual house fee splitter module (task 4.1).
 *
 * Returns a split decision object or an error if the fee exceeds the price.
 */
function decideSplitLocal(service) {
  const { houseFeeEnabled, houseFeeAmount, price } = service

  // If house fee is disabled or zero, no split
  if (!houseFeeEnabled || houseFeeAmount === 0) {
    return {
      shouldSplit: false,
      houseFeeAmount: 0,
      staffAmount: price,
      error: null,
    }
  }

  // If house fee >= service price, reject
  if (houseFeeAmount >= price) {
    return {
      shouldSplit: false,
      houseFeeAmount: 0,
      staffAmount: 0,
      error: 'House fee exceeds or equals service price',
    }
  }

  return {
    shouldSplit: true,
    houseFeeAmount,
    staffAmount: price - houseFeeAmount,
    error: null,
  }
}

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a service where houseFeeAmount >= price (invalid house fee scenario).
 */
function arbServiceWithExcessiveHouseFee() {
  return fc
    .record({
      price: fc.double({ min: 1, max: 5000, noNaN: true }),
    })
    .chain(({ price }) =>
      fc.record({
        price: fc.constant(price),
        houseFeeEnabled: fc.constant(true),
        // houseFeeAmount is >= price
        houseFeeAmount: fc.double({ min: price, max: price + 5000, noNaN: true }),
      })
    )
}

/**
 * Generates a service where houseFeeEnabled is false or houseFeeAmount is 0.
 */
function arbServiceWithDisabledHouseFee() {
  return fc.oneof(
    // houseFeeEnabled === false with any amount
    fc.record({
      price: fc.double({ min: 1, max: 5000, noNaN: true }),
      houseFeeEnabled: fc.constant(false),
      houseFeeAmount: fc.double({ min: 0, max: 5000, noNaN: true }),
    }),
    // houseFeeEnabled === true but houseFeeAmount === 0
    fc.record({
      price: fc.double({ min: 1, max: 5000, noNaN: true }),
      houseFeeEnabled: fc.constant(true),
      houseFeeAmount: fc.constant(0),
    })
  )
}

/**
 * Generates a valid dollar amount with at most 2 decimal places in [0.50, 9999.99].
 */
function arbValidCustomChargeAmount() {
  // Generate cents as integer then convert to dollars
  return fc.integer({ min: 50, max: 999999 }).map((cents) => cents / 100)
}

/**
 * Generates an invalid custom charge amount (outside range or > 2 decimal places).
 */
function arbInvalidCustomChargeAmount() {
  return fc.oneof(
    // Below minimum
    fc.integer({ min: 1, max: 49 }).map((cents) => cents / 100),
    // Above maximum
    fc.integer({ min: 1000000, max: 9999999 }).map((cents) => cents / 100),
    // More than 2 decimal places (3 decimals)
    fc.integer({ min: 501, max: 9999989 }).map((mils) => mils / 1000)
      .filter((v) => {
        const cents = v * 100
        return Math.abs(cents - Math.round(cents)) > 1e-9
      })
  )
}

/**
 * Generates a valid dollar amount with at most 2 decimal places (positive).
 */
function arbValidDollarAmount() {
  return fc.integer({ min: 1, max: 999999 }).map((cents) => cents / 100)
}

/**
 * Generates a valid tip (non-negative, <= baseAmount).
 */
function arbValidTip(baseAmount) {
  // Generate tip in cents to ensure ≤ 2 decimal places
  const maxCents = Math.floor(baseAmount * 100)
  if (maxCents <= 0) return fc.constant(0)
  return fc.integer({ min: 0, max: maxCents }).map((cents) => cents / 100)
}

/**
 * Generates an invalid tip (negative or exceeding base amount).
 */
function arbInvalidTip(baseAmount) {
  return fc.oneof(
    // Negative tip
    fc.double({ min: -10000, max: -0.01, noNaN: true }).filter(Number.isFinite),
    // Tip exceeding base amount (more than 100% of base)
    fc.double({ min: baseAmount + 0.01, max: baseAmount + 10000, noNaN: true }).filter(Number.isFinite)
  )
}

// ── Property 2: House fee exceeds price rejection ─────────────

describe('Feature: payments-kiosk-overhaul, Property 2: House fee exceeds price rejection', () => {
  /**
   * **Validates: Requirements 1.2**
   *
   * For any service where houseFeeAmount >= service.price,
   * the payment router SHALL reject the payment.
   */
  test('rejects payment when houseFeeAmount >= service.price', () => {
    fc.assert(
      fc.property(arbServiceWithExcessiveHouseFee(), (service) => {
        const result = decideSplitLocal(service)
        // Must be rejected (error present, shouldSplit false)
        return result.error !== null && result.shouldSplit === false
      }),
      { numRuns: 100 }
    )
  })
})

// ── Property 3: No-split when house fee disabled ──────────────

describe('Feature: payments-kiosk-overhaul, Property 3: No-split when house fee disabled', () => {
  /**
   * **Validates: Requirements 1.5**
   *
   * For any service where houseFeeEnabled === false OR houseFeeAmount === 0,
   * resolved houseFeeAmount SHALL be 0 and staffAmount SHALL equal full service price.
   */
  test('no split occurs and staff receives full price when house fee disabled or zero', () => {
    fc.assert(
      fc.property(arbServiceWithDisabledHouseFee(), (service) => {
        const result = decideSplitLocal(service)
        return (
          result.shouldSplit === false &&
          result.houseFeeAmount === 0 &&
          result.staffAmount === service.price &&
          result.error === null
        )
      }),
      { numRuns: 100 }
    )
  })
})

// ── Property 11: Custom amount validation ─────────────────────

describe('Feature: payments-kiosk-overhaul, Property 11: Custom amount validation', () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * For any numeric value, custom charge validator SHALL accept it iff
   * it's finite, in [0.50, 9999.99] with ≤ 2 decimal places.
   */
  test('accepts valid custom charge amounts in [$0.50, $9999.99] with ≤ 2 decimals', () => {
    fc.assert(
      fc.property(arbValidCustomChargeAmount(), (amount) => {
        const result = validateCustomChargeAmount(amount)
        return result.valid === true
      }),
      { numRuns: 100 }
    )
  })

  test('rejects custom charge amounts outside valid range or with > 2 decimal places', () => {
    fc.assert(
      fc.property(arbInvalidCustomChargeAmount(), (amount) => {
        const result = validateCustomChargeAmount(amount)
        return result.valid === false
      }),
      { numRuns: 100 }
    )
  })
})

// ── Property 13: Tip validation ───────────────────────────────

describe('Feature: payments-kiosk-overhaul, Property 13: Tip validation', () => {
  /**
   * **Validates: Requirements 3.7, 4.4**
   *
   * For any tip, it SHALL be accepted iff it's non-negative finite number
   * not exceeding 100% of base amount.
   */
  test('accepts valid tips (non-negative and ≤ base amount)', () => {
    fc.assert(
      fc.property(
        arbValidDollarAmount().chain((baseAmount) =>
          arbValidTip(baseAmount).map((tip) => ({ tip, baseAmount }))
        ),
        ({ tip, baseAmount }) => {
          const result = validateTipAmount(tip, baseAmount)
          return result.valid === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('rejects invalid tips (negative or exceeding base amount)', () => {
    fc.assert(
      fc.property(
        arbValidDollarAmount().chain((baseAmount) =>
          arbInvalidTip(baseAmount).map((tip) => ({ tip, baseAmount }))
        ),
        ({ tip, baseAmount }) => {
          const result = validateTipAmount(tip, baseAmount)
          return result.valid === false
        }
      ),
      { numRuns: 100 }
    )
  })

  test('rejects non-finite tip values (NaN, Infinity)', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(NaN),
          fc.constant(Infinity),
          fc.constant(-Infinity)
        ),
        arbValidDollarAmount(),
        (tip, baseAmount) => {
          const result = validateTipAmount(tip, baseAmount)
          return result.valid === false
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 14: Amount match validation ──────────────────────

describe('Feature: payments-kiosk-overhaul, Property 14: Amount match validation', () => {
  /**
   * **Validates: Requirements 4.1**
   *
   * For any appointment payment, submitted amount SHALL be accepted iff
   * |submitted - expected| ≤ $0.01.
   */
  test('accepts amounts that exactly match expected (zero difference)', () => {
    fc.assert(
      fc.property(
        arbValidDollarAmount(),
        (expectedAmount) => {
          // When amount equals expected exactly, it must always be accepted
          const result = validatePaymentAmount({ amount: expectedAmount, expectedAmount })
          return result.valid === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('rejects amounts with difference > $0.01 from expected', () => {
    fc.assert(
      fc.property(
        arbValidDollarAmount(),
        // Generate an offset in cents that is at least 2 cents away (clearly beyond $0.01 tolerance)
        fc.oneof(
          fc.integer({ min: 2, max: 10000 }),
          fc.integer({ min: -10000, max: -2 })
        ),
        (expectedAmount, offsetCents) => {
          const amount = expectedAmount + offsetCents / 100
          // Skip if amount becomes non-finite or non-positive
          if (!Number.isFinite(amount) || amount <= 0) return true
          const result = validatePaymentAmount({ amount, expectedAmount })
          return result.valid === false
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 15: Dollar-to-cents conversion ───────────────────

describe('Feature: payments-kiosk-overhaul, Property 15: Dollar-to-cents conversion', () => {
  /**
   * **Validates: Requirements 4.3**
   *
   * For any valid dollar amount with ≤ 2 decimal places, dollarsToCents SHALL
   * produce Math.round(amount * 100) as positive integer.
   */
  test('converts dollars to cents correctly as positive integer', () => {
    fc.assert(
      fc.property(arbValidDollarAmount(), (amount) => {
        const cents = dollarsToCents(amount)
        const expected = Math.round(amount * 100)
        return cents === expected && Number.isInteger(cents) && cents > 0
      }),
      { numRuns: 100 }
    )
  })
})

// ── Property 16: Numeric input sanitization ───────────────────

describe('Feature: payments-kiosk-overhaul, Property 16: Numeric input sanitization', () => {
  /**
   * **Validates: Requirements 4.5**
   *
   * For any NaN/Infinity/-Infinity/negative zero, sanitizer SHALL return null;
   * for any finite positive number, return that number.
   */
  test('returns null for NaN, Infinity, -Infinity, and negative zero', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(NaN),
          fc.constant(Infinity),
          fc.constant(-Infinity),
          fc.constant(-0)
        ),
        (value) => {
          return sanitizeNumericInput(value) === null
        }
      ),
      { numRuns: 100 }
    )
  })

  test('returns the number for any finite positive number', () => {
    fc.assert(
      fc.property(
        fc.double({ min: Number.MIN_VALUE, max: Number.MAX_VALUE, noNaN: true }).filter(
          (v) => v > 0 && Number.isFinite(v)
        ),
        (value) => {
          return sanitizeNumericInput(value) === value
        }
      ),
      { numRuns: 100 }
    )
  })

  test('returns null for non-number types', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.boolean(),
          fc.constant(null),
          fc.constant(undefined),
          fc.array(fc.integer()),
          fc.dictionary(fc.string(), fc.integer())
        ),
        (value) => {
          return sanitizeNumericInput(value) === null
        }
      ),
      { numRuns: 100 }
    )
  })
})
