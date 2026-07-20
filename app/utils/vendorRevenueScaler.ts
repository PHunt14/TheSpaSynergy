/**
 * Vendor Revenue Scaler Utility
 *
 * Scales full bundle vendor allocations proportionally to a single payer's
 * share of the total. Ensures that summing across all payers for each vendor
 * produces the exact full allocation with zero cent deviation.
 *
 * Uses the remainder-to-last-payer approach: non-final payers get the floor
 * of proportional scaling, and the final payer absorbs any remainder.
 */

import { dollarsToCents } from './splitCalculator';

export interface ScaledVendorAllocation {
  vendorId: string;
  amountCents: number;
  isHouseFee: boolean;
}

export interface BundlePaymentEntry {
  vendorId: string;
  amount: number; // in DOLLARS (from calculateBundlePaymentSplit)
  isHouseFee: boolean;
}

/**
 * Scales the full bundle vendor allocation proportionally to a payer's share.
 *
 * For non-final payers (payerIndex < payerCount - 1):
 *   vendorShare = Math.floor(vendorAmountCents * payerShareCents / totalCents)
 *
 * For the final payer (payerIndex === payerCount - 1):
 *   vendorShare = vendorAmountCents - sum of all other payers' floor amounts
 *   This ensures the sum across all payers equals the full vendor allocation exactly.
 *
 * @param fullBundlePayments - Vendor allocations from calculateBundlePaymentSplit (amounts in dollars)
 * @param payerShareCents - This payer's portion of the bundle total, in cents
 * @param totalCents - The full bundle total in cents
 * @param payerIndex - 0-based index of this payer
 * @param payerCount - Total number of payers
 * @param allPayerSharesCents - Optional array of all payer shares in cents (required for
 *   correct remainder calculation in custom splits where payers have different amounts)
 */
export function scaleVendorAllocations(
  fullBundlePayments: BundlePaymentEntry[],
  payerShareCents: number,
  totalCents: number,
  payerIndex: number,
  payerCount: number,
  allPayerSharesCents?: number[]
): ScaledVendorAllocation[] {
  // Edge case: if totalCents is 0, all allocations are 0
  if (totalCents === 0) {
    return fullBundlePayments.map(({ vendorId, isHouseFee }) => ({
      vendorId,
      amountCents: 0,
      isHouseFee,
    }));
  }

  const isFinalPayer = payerIndex === payerCount - 1;

  return fullBundlePayments.map(({ vendorId, amount, isHouseFee }) => {
    const vendorAmountCents = dollarsToCents(amount);

    let amountCents: number;

    if (!isFinalPayer) {
      // Non-final payer: simple floor of proportional share
      amountCents = Math.floor(vendorAmountCents * payerShareCents / totalCents);
    } else {
      // Final payer: absorbs remainder to ensure exact totals
      // Calculate what all other payers got for this vendor
      const sumOfOtherPayers = computeSumOfOtherPayers(
        vendorAmountCents,
        totalCents,
        payerCount,
        payerShareCents,
        allPayerSharesCents
      );
      amountCents = vendorAmountCents - sumOfOtherPayers;
    }

    return { vendorId, amountCents, isHouseFee };
  });
}

/**
 * Computes the sum of floor-scaled amounts for all payers except the final one.
 *
 * If allPayerSharesCents is provided (custom split), uses each payer's actual share.
 * Otherwise (equal split), uses the same payerShareCents for all non-final payers.
 */
function computeSumOfOtherPayers(
  vendorAmountCents: number,
  totalCents: number,
  payerCount: number,
  payerShareCents: number,
  allPayerSharesCents?: number[]
): number {
  let sum = 0;

  if (allPayerSharesCents && allPayerSharesCents.length === payerCount) {
    // Custom split: each payer may have a different share
    for (let i = 0; i < payerCount - 1; i++) {
      sum += Math.floor(vendorAmountCents * allPayerSharesCents[i] / totalCents);
    }
  } else {
    // Equal split: all non-final payers have the same share
    const floorAmount = Math.floor(vendorAmountCents * payerShareCents / totalCents);
    sum = (payerCount - 1) * floorAmount;
  }

  return sum;
}
