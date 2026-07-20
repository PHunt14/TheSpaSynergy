/**
 * Property-Based Tests: Split Payment Correctness
 *
 * Feature: bundle-split-payments
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { validateCustomSplit, dollarsToCents, centsToDollars, calculateEqualSplit } from '../../app/utils/splitCalculator.ts';
import { calculateBundlePaymentSplit } from '../../app/utils/bundlePaymentSplit.js';
import { scaleVendorAllocations } from '../../app/utils/vendorRevenueScaler.ts';

/**
 * Property 2: Custom Split Validation Correctness
 *
 * For any array of payer amounts in cents and any bundle total in cents,
 * validateCustomSplit SHALL accept the configuration if and only if:
 * (a) the sum of all payer amounts equals the total exactly, and
 * (b) each individual payer amount is at least 50 cents.
 * For any configuration where conditions are not met, validation SHALL reject
 * and report the specific violation.
 *
 * Feature: bundle-split-payments, Property 2: Custom Split Validation Correctness
 * Validates: Requirements 3.2, 3.3
 */
describe('Property 2: Custom Split Validation Correctness', () => {
  it('should accept any configuration where sum equals total and each amount >= 50 cents', () => {
    fc.assert(
      fc.property(
        // Generate a valid custom split: payerCount in [2,10], each amount >= 50
        fc.integer({ min: 2, max: 10 }).chain((payerCount) =>
          fc.tuple(
            fc.constant(payerCount),
            // Generate an array of amounts each >= 50 cents
            fc.array(fc.integer({ min: 50, max: 100000 }), {
              minLength: payerCount,
              maxLength: payerCount,
            })
          )
        ),
        ([payerCount, payerAmountsCents]) => {
          // The total is exactly the sum of the amounts (guaranteed valid)
          const totalCents = payerAmountsCents.reduce((sum, a) => sum + a, 0);

          const result = validateCustomSplit({ totalCents, payerAmountsCents });

          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
          expect(result.remainingCents).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject when sum of amounts does not equal total', () => {
    fc.assert(
      fc.property(
        // Generate payer amounts where sum != total
        fc.integer({ min: 2, max: 10 }).chain((payerCount) =>
          fc.tuple(
            // Generate amounts each >= 50
            fc.array(fc.integer({ min: 50, max: 100000 }), {
              minLength: payerCount,
              maxLength: payerCount,
            }),
            // Generate a non-zero offset to make total != sum
            fc.integer({ min: 1, max: 10000 }).chain((offset) =>
              fc.oneof(fc.constant(offset), fc.constant(-offset))
            )
          )
        ),
        ([payerAmountsCents, offset]) => {
          const sum = payerAmountsCents.reduce((s, a) => s + a, 0);
          // Total that doesn't match the sum
          const totalCents = sum + offset;

          // Only test when totalCents is positive (valid bundle total)
          fc.pre(totalCents > 0);

          const result = validateCustomSplit({ totalCents, payerAmountsCents });

          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(typeof result.error).toBe('string');
          expect(result.error.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject when any individual amount is below 50 cents', () => {
    fc.assert(
      fc.property(
        // Generate a configuration where at least one amount is < 50
        fc.integer({ min: 2, max: 10 }).chain((payerCount) =>
          fc.tuple(
            fc.constant(payerCount),
            // Index of the payer that will have amount < 50
            fc.integer({ min: 0, max: payerCount - 1 }),
            // The invalid amount (0 to 49 cents)
            fc.integer({ min: 0, max: 49 }),
            // Other payer amounts (valid, >= 50)
            fc.array(fc.integer({ min: 50, max: 100000 }), {
              minLength: payerCount - 1,
              maxLength: payerCount - 1,
            })
          )
        ),
        ([payerCount, invalidIndex, invalidAmount, otherAmounts]) => {
          // Build the payer amounts array with one invalid amount
          const payerAmountsCents = [];
          let otherIdx = 0;
          for (let i = 0; i < payerCount; i++) {
            if (i === invalidIndex) {
              payerAmountsCents.push(invalidAmount);
            } else {
              payerAmountsCents.push(otherAmounts[otherIdx++]);
            }
          }

          // Set total to exact sum so only the minimum violation triggers
          const totalCents = payerAmountsCents.reduce((sum, a) => sum + a, 0);

          const result = validateCustomSplit({ totalCents, payerAmountsCents });

          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(typeof result.error).toBe('string');
          // Error should mention the minimum or the specific payer
          expect(result.error.toLowerCase()).toContain('minimum');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should report remaining cents when sum does not match total', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }).chain((payerCount) =>
          fc.tuple(
            fc.array(fc.integer({ min: 50, max: 100000 }), {
              minLength: payerCount,
              maxLength: payerCount,
            }),
            // Positive offset means total > sum (underpayment)
            fc.integer({ min: 1, max: 10000 })
          )
        ),
        ([payerAmountsCents, offset]) => {
          const sum = payerAmountsCents.reduce((s, a) => s + a, 0);
          // Total is greater than the sum of amounts (underpayment scenario)
          const totalCents = sum + offset;

          const result = validateCustomSplit({ totalCents, payerAmountsCents });

          expect(result.valid).toBe(false);
          expect(result.remainingCents).toBe(offset);
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Property 4: Dollar-Cent Conversion Round Trip
 *
 * For any dollar amount with exactly 2 decimal places (representable as N/100
 * for integer N), converting to cents via dollarsToCents and back via centsToDollars
 * SHALL produce the original value.
 *
 * Additionally, starting from any integer cent value, converting to dollars via
 * centsToDollars and back via dollarsToCents SHALL return the original cent value.
 *
 * Feature: bundle-split-payments, Property 4: Dollar-Cent Conversion Round Trip
 * Validates: Requirements 8.1, 8.5
 */
describe('Feature: bundle-split-payments, Property 4: Dollar-Cent Conversion Round Trip', () => {
  // Generate integer cent values (0 to 9,999,999) then derive dollar amounts with exactly 2 decimals
  const centValueArb = fc.integer({ min: 0, max: 9_999_999 });

  it('cents → dollars → cents round-trip preserves original cent value', () => {
    fc.assert(
      fc.property(centValueArb, (cents) => {
        const dollars = centsToDollars(cents);
        const backToCents = dollarsToCents(parseFloat(dollars));
        expect(backToCents).toBe(cents);
      }),
      { numRuns: 100 }
    );
  });

  it('dollars (with exactly 2 decimal places) → cents → dollars round-trip preserves original value', () => {
    fc.assert(
      fc.property(centValueArb, (n) => {
        // Derive a dollar amount with exactly 2 decimal places: N / 100
        const dollars = n / 100;
        const dollarsStr = dollars.toFixed(2);
        const dollarsValue = parseFloat(dollarsStr);

        const cents = dollarsToCents(dollarsValue);
        const backToDollars = centsToDollars(cents);

        expect(backToDollars).toBe(dollarsStr);
      }),
      { numRuns: 100 }
    );
  });

  it('dollarsToCents produces an integer for any 2-decimal dollar amount', () => {
    fc.assert(
      fc.property(centValueArb, (n) => {
        const dollars = parseFloat((n / 100).toFixed(2));
        const cents = dollarsToCents(dollars);
        expect(Number.isInteger(cents)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});


/**
 * Property 3: Vendor Revenue Integrity Across Split Payments
 *
 * For any bundle configuration (services, vendors, discounts, house fees)
 * and any valid split configuration (2–10 payers with amounts summing to total),
 * when each payer's vendor allocations are calculated by proportionally scaling
 * the full bundle's vendor allocation, the sum of all per-payer vendor allocations
 * for each vendor SHALL equal that vendor's allocation from a single full payment,
 * with zero cent deviation.
 *
 * Feature: bundle-split-payments, Property 3: Vendor Revenue Integrity Across Split Payments
 * Validates: Requirements 4.3, 6.1, 6.2, 6.3, 6.4
 */

describe('Feature: bundle-split-payments, Property 3: Vendor Revenue Integrity Across Split Payments', () => {
  // Arbitrary to generate a random service with vendor, price, and house fee
  const serviceArb = fc.record({
    price: fc.integer({ min: 100, max: 50000 }).map((cents) => cents / 100), // $1.00 – $500.00
    vendorId: fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e'), { minLength: 5, maxLength: 8 }),
    houseFeeEnabled: fc.boolean(),
    houseFeeAmount: fc.integer({ min: 0, max: 2000 }).map((cents) => cents / 100), // $0.00 – $20.00
  });

  // Generate a bundle configuration with 1-5 services
  const bundleConfigArb = fc.record({
    services: fc.array(serviceArb, { minLength: 1, maxLength: 5 }),
    houseVendorId: fc.constant('house-vendor-001'),
  });

  it('equal split: sum of per-payer vendor allocations equals full allocation for each vendor', () => {
    fc.assert(
      fc.property(
        bundleConfigArb,
        fc.integer({ min: 2, max: 10 }),
        (bundleConfig, payerCount) => {
          const { services, houseVendorId } = bundleConfig;

          // Calculate full bundle allocation
          const fullResult = calculateBundlePaymentSplit({
            services,
            discountAmount: 0,
            houseVendorId,
          });

          // Skip trivial cases where there are no payments
          fc.pre(fullResult.bundlePayments.length > 0);
          fc.pre(fullResult.total > 0);

          const totalCents = dollarsToCents(fullResult.total);
          fc.pre(totalCents > 0);

          // Calculate equal split
          const { payerAmounts } = calculateEqualSplit({ totalCents, payerCount });

          // For each payer, scale vendor allocations
          // Pass allPayerSharesCents for correct remainder calculation
          // when payers have different amounts (due to remainder distribution)
          const perPayerAllocations = payerAmounts.map((payerShareCents, payerIndex) =>
            scaleVendorAllocations(
              fullResult.bundlePayments,
              payerShareCents,
              totalCents,
              payerIndex,
              payerCount,
              payerAmounts
            )
          );

          // Sum per-vendor allocations across all payers
          const vendorSums = new Map();
          for (const allocations of perPayerAllocations) {
            for (const { vendorId, amountCents, isHouseFee } of allocations) {
              const key = `${vendorId}:${isHouseFee}`;
              vendorSums.set(key, (vendorSums.get(key) || 0) + amountCents);
            }
          }

          // Assert each vendor's sum equals their full allocation in cents
          for (const payment of fullResult.bundlePayments) {
            const key = `${payment.vendorId}:${payment.isHouseFee}`;
            const expectedCents = dollarsToCents(payment.amount);
            const actualCents = vendorSums.get(key) || 0;
            expect(actualCents).toBe(expectedCents);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('custom (unequal) split: sum of per-payer vendor allocations equals full allocation for each vendor', () => {
    fc.assert(
      fc.property(
        bundleConfigArb,
        fc.integer({ min: 2, max: 10 }).chain((payerCount) =>
          fc.tuple(
            fc.constant(payerCount),
            // Generate random weights for each payer, then scale to totalCents
            fc.array(fc.integer({ min: 1, max: 100 }), {
              minLength: payerCount,
              maxLength: payerCount,
            })
          )
        ),
        (bundleConfig, [payerCount, weights]) => {
          const { services, houseVendorId } = bundleConfig;

          // Calculate full bundle allocation
          const fullResult = calculateBundlePaymentSplit({
            services,
            discountAmount: 0,
            houseVendorId,
          });

          // Skip trivial cases
          fc.pre(fullResult.bundlePayments.length > 0);
          fc.pre(fullResult.total > 0);

          const totalCents = dollarsToCents(fullResult.total);
          fc.pre(totalCents >= payerCount); // Each payer needs at least 1 cent

          // Create custom split from weights
          const totalWeight = weights.reduce((s, w) => s + w, 0);
          const payerAmounts = [];
          let allocated = 0;
          for (let i = 0; i < payerCount - 1; i++) {
            const amount = Math.floor((weights[i] / totalWeight) * totalCents);
            payerAmounts.push(amount);
            allocated += amount;
          }
          // Last payer gets remainder to ensure exact sum
          payerAmounts.push(totalCents - allocated);

          // Verify all amounts are non-negative
          fc.pre(payerAmounts.every((a) => a >= 0));

          // For each payer, scale vendor allocations using the allPayerSharesCents path
          const perPayerAllocations = payerAmounts.map((payerShareCents, payerIndex) =>
            scaleVendorAllocations(
              fullResult.bundlePayments,
              payerShareCents,
              totalCents,
              payerIndex,
              payerCount,
              payerAmounts // Pass all payer shares for custom split
            )
          );

          // Sum per-vendor allocations across all payers
          const vendorSums = new Map();
          for (const allocations of perPayerAllocations) {
            for (const { vendorId, amountCents, isHouseFee } of allocations) {
              const key = `${vendorId}:${isHouseFee}`;
              vendorSums.set(key, (vendorSums.get(key) || 0) + amountCents);
            }
          }

          // Assert each vendor's sum equals their full allocation in cents
          for (const payment of fullResult.bundlePayments) {
            const key = `${payment.vendorId}:${payment.isHouseFee}`;
            const expectedCents = dollarsToCents(payment.amount);
            const actualCents = vendorSums.get(key) || 0;
            expect(actualCents).toBe(expectedCents);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('with discount: vendor revenue integrity holds across split payments', () => {
    fc.assert(
      fc.property(
        bundleConfigArb,
        fc.integer({ min: 2, max: 10 }),
        // Discount as a percentage of subtotal (0-50%)
        fc.integer({ min: 0, max: 50 }),
        (bundleConfig, payerCount, discountPct) => {
          const { services, houseVendorId } = bundleConfig;

          // Calculate subtotal and derive discount amount
          const subtotal = services.reduce((sum, s) => sum + s.price, 0);
          const discountAmount = Math.round(subtotal * discountPct) / 100;

          // Calculate full bundle allocation with discount
          const fullResult = calculateBundlePaymentSplit({
            services,
            discountAmount,
            houseVendorId,
          });

          // Skip trivial cases
          fc.pre(fullResult.bundlePayments.length > 0);
          fc.pre(fullResult.total > 0);

          const totalCents = dollarsToCents(fullResult.total);
          fc.pre(totalCents > 0);

          // Calculate equal split
          const { payerAmounts } = calculateEqualSplit({ totalCents, payerCount });

          // For each payer, scale vendor allocations
          // Pass allPayerSharesCents for correct remainder calculation
          const perPayerAllocations = payerAmounts.map((payerShareCents, payerIndex) =>
            scaleVendorAllocations(
              fullResult.bundlePayments,
              payerShareCents,
              totalCents,
              payerIndex,
              payerCount,
              payerAmounts
            )
          );

          // Sum per-vendor allocations across all payers
          const vendorSums = new Map();
          for (const allocations of perPayerAllocations) {
            for (const { vendorId, amountCents, isHouseFee } of allocations) {
              const key = `${vendorId}:${isHouseFee}`;
              vendorSums.set(key, (vendorSums.get(key) || 0) + amountCents);
            }
          }

          // Assert each vendor's sum equals their full allocation in cents
          for (const payment of fullResult.bundlePayments) {
            const key = `${payment.vendorId}:${payment.isHouseFee}`;
            const expectedCents = dollarsToCents(payment.amount);
            const actualCents = vendorSums.get(key) || 0;
            expect(actualCents).toBe(expectedCents);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


import { distributeRefund } from '../../app/utils/splitCalculator.ts';

/**
 * Property 5: Refund Distribution Conservation
 *
 * For any refund amount in cents and any set of paid payers (each with their
 * original payment amount), when the refund is distributed proportionally based
 * on each payer's original share, the sum of all individual refund amounts SHALL
 * equal the total refund amount exactly (with remainder cents assigned to the
 * first eligible payer). Any payer whose calculated refund would be less than
 * 1 cent SHALL be skipped, with their portion redistributed.
 *
 * Feature: bundle-split-payments, Property 5: Refund Distribution Conservation
 * Validates: Requirements 9.2, 9.6
 */
describe('Feature: bundle-split-payments, Property 5: Refund Distribution Conservation', () => {
  // Generator for a set of 2-10 paid payers, each with amountCents >= 50
  const paidPayersArb = fc.integer({ min: 2, max: 10 }).chain((payerCount) =>
    fc.array(fc.integer({ min: 50, max: 500000 }), {
      minLength: payerCount,
      maxLength: payerCount,
    }).map((amounts) =>
      amounts.map((amountCents, i) => ({ payerIndex: i, amountCents }))
    )
  );

  it('sum of distributed refund amounts equals total refund amount exactly', () => {
    fc.assert(
      fc.property(
        paidPayersArb.chain((payers) => {
          const totalPaidCents = payers.reduce((sum, p) => sum + p.amountCents, 0);
          // Refund amount must be between 1 and total paid
          return fc.tuple(
            fc.constant(payers),
            fc.integer({ min: 1, max: totalPaidCents })
          );
        }),
        ([paidPayers, refundAmountCents]) => {
          const result = distributeRefund(refundAmountCents, paidPayers);

          // Sum of all distributed refund amounts must equal the total refund exactly
          const totalDistributed = result.reduce((sum, r) => sum + r.refundAmountCents, 0);
          expect(totalDistributed).toBe(refundAmountCents);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('payers with proportional refund less than 1 cent are excluded from result', () => {
    fc.assert(
      fc.property(
        // Generate a scenario likely to produce sub-cent refunds:
        // one large payer and several tiny payers, with a small refund
        fc.tuple(
          fc.integer({ min: 2, max: 10 }),
          fc.integer({ min: 50000, max: 500000 }), // large payer amount
          fc.integer({ min: 50, max: 100 })         // small payer amount
        ).chain(([payerCount, largeAmount, smallAmount]) => {
          const payers = [
            { payerIndex: 0, amountCents: largeAmount },
            ...Array.from({ length: payerCount - 1 }, (_, i) => ({
              payerIndex: i + 1,
              amountCents: smallAmount,
            })),
          ];
          const totalPaidCents = payers.reduce((sum, p) => sum + p.amountCents, 0);
          // Use a small refund amount that may produce < 1 cent for small payers
          const maxRefund = Math.min(totalPaidCents, Math.max(1, Math.floor(largeAmount / 100)));
          return fc.tuple(
            fc.constant(payers),
            fc.integer({ min: 1, max: Math.max(1, maxRefund) })
          );
        }),
        ([paidPayers, refundAmountCents]) => {
          const result = distributeRefund(refundAmountCents, paidPayers);

          // All returned refund amounts must be >= 1 cent
          for (const r of result) {
            expect(r.refundAmountCents).toBeGreaterThanOrEqual(1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all returned refund amounts are at least 1 cent', () => {
    fc.assert(
      fc.property(
        paidPayersArb.chain((payers) => {
          const totalPaidCents = payers.reduce((sum, p) => sum + p.amountCents, 0);
          return fc.tuple(
            fc.constant(payers),
            fc.integer({ min: 1, max: totalPaidCents })
          );
        }),
        ([paidPayers, refundAmountCents]) => {
          const result = distributeRefund(refundAmountCents, paidPayers);

          // Every individual refund in the result must be >= 1 cent
          for (const r of result) {
            expect(r.refundAmountCents).toBeGreaterThanOrEqual(1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('conservation holds even when some payers are skipped due to sub-cent refunds', () => {
    fc.assert(
      fc.property(
        // Specifically craft a scenario with one very large payer and many small payers
        // with a tiny refund to force sub-cent skipping
        fc.tuple(
          fc.integer({ min: 3, max: 10 }),
          fc.integer({ min: 100000, max: 500000 }),  // large payer: $1000-$5000
          fc.integer({ min: 50, max: 200 })          // small payers: $0.50-$2.00
        ).map(([count, largeAmount, smallAmount]) => {
          const payers = [
            { payerIndex: 0, amountCents: largeAmount },
            ...Array.from({ length: count - 1 }, (_, i) => ({
              payerIndex: i + 1,
              amountCents: smallAmount,
            })),
          ];
          // Refund of just 1-10 cents — small payers' share will be < 1 cent
          const totalPaidCents = payers.reduce((sum, p) => sum + p.amountCents, 0);
          const refundAmountCents = Math.min(count - 1, totalPaidCents); // small enough to trigger skipping
          return { payers, refundAmountCents };
        }),
        ({ payers, refundAmountCents }) => {
          fc.pre(refundAmountCents >= 1);

          const result = distributeRefund(refundAmountCents, payers);

          // Even with skipped payers, total distributed must equal refundAmountCents
          const totalDistributed = result.reduce((sum, r) => sum + r.refundAmountCents, 0);
          expect(totalDistributed).toBe(refundAmountCents);

          // All amounts in result must be >= 1 cent
          for (const r of result) {
            expect(r.refundAmountCents).toBeGreaterThanOrEqual(1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
