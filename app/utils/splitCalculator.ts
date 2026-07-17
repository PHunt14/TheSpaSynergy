/**
 * Split Calculator Utility
 *
 * Pure functions for dividing a bundle total among multiple payers
 * with cent-level precision. All arithmetic uses integer cents to
 * avoid floating-point precision errors.
 */

export interface EqualSplitInput {
  totalCents: number;
  payerCount: number;
}

export interface EqualSplitResult {
  payerAmounts: number[]; // array of cents per payer
}

export interface CustomSplitInput {
  totalCents: number;
  payerAmountsCents: number[];
}

export interface CustomSplitValidation {
  valid: boolean;
  error?: string;
  remainingCents?: number;
}

/**
 * Divides totalCents equally among payerCount payers.
 * Uses integer floor division; remainder cents are distributed
 * one per payer starting from payer index 0.
 *
 * Edge cases:
 * - totalCents === 0: all payers get 0
 * - totalCents < payerCount: first (totalCents) payers get 1 cent, rest get 0
 */
export function calculateEqualSplit(input: EqualSplitInput): EqualSplitResult {
  const { totalCents, payerCount } = input;

  if (totalCents === 0) {
    return { payerAmounts: Array(payerCount).fill(0) };
  }

  const baseAmount = Math.floor(totalCents / payerCount);
  const remainder = totalCents % payerCount;

  const payerAmounts: number[] = [];
  for (let i = 0; i < payerCount; i++) {
    payerAmounts.push(i < remainder ? baseAmount + 1 : baseAmount);
  }

  return { payerAmounts };
}

/**
 * Validates that custom payer amounts sum to totalCents exactly
 * and that each individual amount is at least 50 cents (Square minimum).
 */
export function validateCustomSplit(input: CustomSplitInput): CustomSplitValidation {
  const { totalCents, payerAmountsCents } = input;

  // Check each amount meets minimum
  for (let i = 0; i < payerAmountsCents.length; i++) {
    if (payerAmountsCents[i] < 50) {
      return {
        valid: false,
        error: `Payer ${i + 1} amount is below the minimum of 50 cents`,
        remainingCents: totalCents - payerAmountsCents.reduce((sum, a) => sum + a, 0),
      };
    }
  }

  // Check sum equals total
  const sum = payerAmountsCents.reduce((acc, amount) => acc + amount, 0);
  if (sum !== totalCents) {
    return {
      valid: false,
      error: sum < totalCents
        ? `Amounts do not cover the total. Remaining: ${totalCents - sum} cents`
        : `Amounts exceed the total by ${sum - totalCents} cents`,
      remainingCents: totalCents - sum,
    };
  }

  return { valid: true, remainingCents: 0 };
}

/**
 * Converts a dollar amount to integer cents using Math.round.
 * This avoids floating-point issues like 19.99 * 100 = 1998.9999...
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Converts integer cents back to a dollar string with exactly 2 decimal places.
 */
export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Distributes a refund amount proportionally across paid payers based on their
 * original payment share.
 *
 * Algorithm:
 * 1. For each paid payer, calculate proportional refund as
 *    Math.floor(refundAmountCents * payer.amountCents / totalPaidCents)
 * 2. Skip any payer whose calculated refund is < 1 cent; reallocate their portion
 * 3. Assign remainder cents (due to floor rounding) to the first eligible payer
 *
 * @param refundAmountCents - Total refund amount in cents (must be > 0)
 * @param paidPayers - Array of paid payers with their original payment amounts
 * @returns Array of eligible payers with their refund amounts
 */
export function distributeRefund(
  refundAmountCents: number,
  paidPayers: { payerIndex: number; amountCents: number }[]
): { payerIndex: number; refundAmountCents: number }[] {
  if (paidPayers.length === 0 || refundAmountCents <= 0) {
    return [];
  }

  const totalPaidCents = paidPayers.reduce((sum, p) => sum + p.amountCents, 0);

  if (totalPaidCents === 0) {
    return [];
  }

  // Calculate proportional refund for each paid payer
  const rawRefunds: { payerIndex: number; refundAmountCents: number }[] = [];
  let distributedCents = 0;

  for (const p of paidPayers) {
    const proportionalRefund = Math.floor(refundAmountCents * p.amountCents / totalPaidCents);
    rawRefunds.push({
      payerIndex: p.payerIndex,
      refundAmountCents: proportionalRefund,
    });
    distributedCents += proportionalRefund;
  }

  // Calculate remainder from rounding
  let remainderCents = refundAmountCents - distributedCents;

  // Skip payers whose refund < 1 cent and reallocate their portion
  const eligibleRefunds: { payerIndex: number; refundAmountCents: number }[] = [];
  let reallocateCents = 0;

  for (const r of rawRefunds) {
    if (r.refundAmountCents < 1) {
      reallocateCents += r.refundAmountCents;
    } else {
      eligibleRefunds.push({ ...r });
    }
  }

  // Add remainder + reallocated cents to first eligible payer
  if (eligibleRefunds.length > 0) {
    eligibleRefunds[0].refundAmountCents += remainderCents + reallocateCents;
  } else {
    // All payers had < 1 cent proportional refund (e.g., refund is very small relative to total).
    // Assign the entire refund to the payer with the largest original payment (first by index if tied).
    const sortedPayers = [...paidPayers].sort((a, b) => b.amountCents - a.amountCents);
    eligibleRefunds.push({
      payerIndex: sortedPayers[0].payerIndex,
      refundAmountCents: refundAmountCents,
    });
  }

  return eligibleRefunds;
}
