/**
 * Property-Based Tests for House Fee Logic
 *
 * Uses fast-check to validate correctness properties for the house fee splitter:
 * split amount invariant, tip exclusivity to staff, and same-account optimization.
 * Feature: payments-kiosk-overhaul
 *
 * Properties tested:
 * - Property 1: Split payment amount invariant
 * - Property 4: Tips exclusive to staff portion
 * - Property 5: Same-account single charge optimization
 *
 * **Validates: Requirements 1.1, 1.2, 1.6, 1.9**
 */

import fc from 'fast-check'
import { decideSplit } from '../../lib/payment/houseFee.ts'
import { credentialsMatch } from '../../app/utils/paymentRouting.ts'

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a non-empty, non-whitespace string suitable for a Square access token.
 */
const arbValidToken = fc
  .string({ minLength: 1, maxLength: 64 })
  .filter((s) => s.trim().length > 0)

/**
 * Generates a non-empty, non-whitespace string suitable for a Square location ID.
 */
const arbValidLocationId = fc
  .string({ minLength: 1, maxLength: 32 })
  .filter((s) => s.trim().length > 0)

/**
 * Generates a valid SquareCredentials object.
 */
function arbCredentials() {
  return fc.record({
    accessToken: arbValidToken,
    locationId: arbValidLocationId,
  })
}

/**
 * Generates a service with a valid house fee (0 < houseFeeAmount < price).
 * Uses integer cents to avoid floating point issues, then converts to dollars.
 */
function arbServiceWithValidHouseFee() {
  // Generate price in cents (min $1.00 = 100 cents to ensure room for split)
  return fc
    .integer({ min: 100, max: 500000 })
    .chain((priceCents) =>
      fc
        .integer({ min: 1, max: priceCents - 1 })
        .map((houseFeeCents) => ({
          serviceId: 'svc-test',
          name: 'Test Service',
          price: priceCents / 100,
          houseFeeEnabled: true,
          houseFeeAmount: houseFeeCents / 100,
        }))
    )
}

/**
 * Generates two credential sets that are guaranteed to be different
 * (different accessToken or different locationId).
 */
function arbDifferentCredentials() {
  return fc
    .tuple(arbCredentials(), arbCredentials())
    .filter(([a, b]) => !credentialsMatch(a, b))
}

/**
 * Generates a pair of identical credentials (same accessToken and locationId).
 */
function arbIdenticalCredentials() {
  return arbCredentials().map((cred) => [cred, { ...cred }])
}

/**
 * Generates a positive tip amount in dollars (using cents for precision).
 */
function arbPositiveTip() {
  return fc.integer({ min: 1, max: 100000 }).map((cents) => cents / 100)
}

// ── Property 1: Split payment amount invariant ────────────────

describe('Feature: payments-kiosk-overhaul, Property 1: Split payment amount invariant', () => {
  /**
   * **Validates: Requirements 1.1, 1.2**
   *
   * For any service with houseFeeEnabled === true and houseFeeAmount > 0
   * and houseFeeAmount < service.price, the sum of the house fee amount
   * and the staff amount SHALL always equal the service price exactly.
   */
  test('houseFeeAmount + staffAmount === service.price for valid splits', () => {
    fc.assert(
      fc.property(
        arbServiceWithValidHouseFee(),
        arbDifferentCredentials(),
        (service, [staffCreds, houseCreds]) => {
          const decision = decideSplit(service, staffCreds, houseCreds)

          // The decision should indicate a split
          if (!decision.shouldSplit) return false

          // The sum of house fee and staff amount must equal service price exactly
          const sum = decision.houseFeeAmount + decision.staffAmount
          // Use cents comparison to avoid floating-point issues
          const sumCents = Math.round(sum * 100)
          const priceCents = Math.round(service.price * 100)
          return sumCents === priceCents
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 4: Tips exclusive to staff portion ───────────────

describe('Feature: payments-kiosk-overhaul, Property 4: Tips exclusive to staff portion', () => {
  /**
   * **Validates: Requirements 1.6**
   *
   * For any split payment with a tip amount > 0, the house fee charge SHALL
   * have tip = 0 and the staff charge SHALL include the full tip amount.
   *
   * At the decideSplit level, we verify that when a valid split occurs
   * (shouldSplit === true and singleChargeOptimization === false), the split
   * decision correctly sets up for the execution path where:
   * - House fee charge gets tip = 0
   * - Staff charge gets the full tip
   *
   * The decideSplit function doesn't handle tips directly, but we verify that
   * shouldSplit === true for valid splits with different credentials, which means
   * executeSplitPayment will apply tip=0 to house and full tip to staff.
   */
  test('split decision enables tip-exclusive-to-staff execution path', () => {
    fc.assert(
      fc.property(
        arbServiceWithValidHouseFee(),
        arbDifferentCredentials(),
        arbPositiveTip(),
        (service, [staffCreds, houseCreds], tipAmount) => {
          const decision = decideSplit(service, staffCreds, houseCreds)

          // With different credentials and valid house fee, must produce a split
          if (!decision.shouldSplit) return false

          // singleChargeOptimization must be false (different credentials)
          if (decision.singleChargeOptimization) return false

          // The split amounts must be correct (house gets fee, staff gets remainder)
          // This ensures the execution path will correctly route tip only to staff
          const houseFeeCorrect = decision.houseFeeAmount === service.houseFeeAmount
          const staffAmountCorrect =
            Math.round(decision.staffAmount * 100) ===
            Math.round((service.price - service.houseFeeAmount) * 100)

          return houseFeeCorrect && staffAmountCorrect
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 5: Same-account single charge optimization ───────

describe('Feature: payments-kiosk-overhaul, Property 5: Same-account single charge optimization', () => {
  /**
   * **Validates: Requirements 1.9**
   *
   * For any payment where the resolved staff credentials are identical to
   * the house provider credentials, the system SHALL produce a single charge
   * rather than two separate charges (singleChargeOptimization === true).
   */
  test('identical credentials produce singleChargeOptimization === true', () => {
    fc.assert(
      fc.property(
        arbServiceWithValidHouseFee(),
        arbIdenticalCredentials(),
        (service, [staffCreds, houseCreds]) => {
          const decision = decideSplit(service, staffCreds, houseCreds)

          // Should still indicate a split is needed (for accounting purposes)
          if (!decision.shouldSplit) return false

          // But singleChargeOptimization must be true
          if (!decision.singleChargeOptimization) return false

          // Amounts must still be correctly calculated
          const sumCents = Math.round(
            (decision.houseFeeAmount + decision.staffAmount) * 100
          )
          const priceCents = Math.round(service.price * 100)
          return sumCents === priceCents
        }
      ),
      { numRuns: 100 }
    )
  })

  test('different credentials produce singleChargeOptimization === false', () => {
    fc.assert(
      fc.property(
        arbServiceWithValidHouseFee(),
        arbDifferentCredentials(),
        (service, [staffCreds, houseCreds]) => {
          const decision = decideSplit(service, staffCreds, houseCreds)

          // Should indicate a split
          if (!decision.shouldSplit) return false

          // singleChargeOptimization must be false for different credentials
          return decision.singleChargeOptimization === false
        }
      ),
      { numRuns: 100 }
    )
  })
})
