import { Client, Environment } from 'square';
import {
  SquareCredentials,
  Service,
  credentialsMatch,
} from '@/app/utils/paymentRouting';
import { dollarsToCents } from './validator';

/**
 * House Fee Splitter Module
 *
 * Determines whether a payment should be split between house and staff,
 * and executes the two-charge flow with proper error handling.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.9
 */

/**
 * Error thrown when a split decision cannot be made due to invalid configuration.
 */
export class SplitDecisionError extends Error {
  public code: string;

  constructor(message: string) {
    super(message);
    this.name = 'SplitDecisionError';
    this.code = 'HOUSE_FEE_EXCEEDS_PRICE';
  }
}

/**
 * Result of the split decision — determines whether to split and what amounts.
 */
export interface SplitDecision {
  shouldSplit: boolean;
  houseFeeAmount: number; // in dollars
  staffAmount: number; // in dollars
  singleChargeOptimization: boolean; // true when credentials are identical
}

/**
 * Result of executing a split payment (or single-charge optimized payment).
 */
export interface SplitPaymentResult {
  success: boolean;
  housePaymentId?: string;
  staffPaymentId?: string;
  houseFeeAmount: number;
  staffAmount: number;
  tipAmount: number;
  partial?: boolean; // true if house succeeded but staff failed
  error?: string;
}

/**
 * Determines whether a payment should be split based on service configuration
 * and credential comparison.
 *
 * - If `houseFeeEnabled === false` or `houseFeeAmount === 0`:
 *   No split; full amount goes to staff.
 * - If `houseFeeAmount >= service.price`:
 *   Throws SplitDecisionError (Requirement 1.2).
 * - If staff and house credentials match:
 *   Single charge optimization (Requirement 1.9).
 * - Otherwise:
 *   Standard two-charge split.
 *
 * This function is pure — no async, no side effects.
 */
export function decideSplit(
  service: Service,
  staffCredentials: SquareCredentials,
  houseCredentials: SquareCredentials,
): SplitDecision {
  // Requirement 1.5: No split when house fee disabled or zero
  if (!service.houseFeeEnabled || service.houseFeeAmount === 0) {
    return {
      shouldSplit: false,
      houseFeeAmount: 0,
      staffAmount: service.price,
      singleChargeOptimization: false,
    };
  }

  // Requirement 1.2: Reject when house fee >= service price
  if (service.houseFeeAmount >= service.price) {
    throw new SplitDecisionError(
      `House fee ($${service.houseFeeAmount}) must be less than service price ($${service.price})`,
    );
  }

  const staffAmount = service.price - service.houseFeeAmount;

  // Requirement 1.9: Single charge when credentials are identical
  if (credentialsMatch(staffCredentials, houseCredentials)) {
    return {
      shouldSplit: true,
      houseFeeAmount: service.houseFeeAmount,
      staffAmount,
      singleChargeOptimization: true,
    };
  }

  // Standard two-charge split
  return {
    shouldSplit: true,
    houseFeeAmount: service.houseFeeAmount,
    staffAmount,
    singleChargeOptimization: false,
  };
}

/**
 * Executes a split payment (or single-charge optimized payment) against
 * the Square Payments API.
 *
 * Flow:
 * 1. If singleChargeOptimization → single charge for full amount + tip
 * 2. Otherwise → charge house fee first (tip=0), then staff portion (with tip)
 * 3. If house charge fails → reject entire payment (Requirement 1.8)
 * 4. If house succeeds + staff fails → return partial (Requirement 1.4)
 * 5. Both succeed → return success
 *
 * Requirement 1.6: Tips apply exclusively to staff portion.
 * Requirement 5.3: Distinct idempotency keys via `-house` / `-staff` suffixes.
 */
export async function executeSplitPayment(
  sourceId: string,
  decision: SplitDecision,
  staffCredentials: SquareCredentials,
  houseCredentials: SquareCredentials,
  tipAmount: number,
  idempotencyKeyBase: string,
): Promise<SplitPaymentResult> {
  const env = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT || 'sandbox';
  const environment = env === 'production' ? Environment.Production : Environment.Sandbox;

  // Single charge optimization: one charge for everything
  if (decision.singleChargeOptimization) {
    return executeSingleCharge(
      sourceId,
      decision,
      staffCredentials,
      tipAmount,
      idempotencyKeyBase,
      environment,
    );
  }

  // Standard two-charge split
  return executeTwoChargeSplit(
    sourceId,
    decision,
    staffCredentials,
    houseCredentials,
    tipAmount,
    idempotencyKeyBase,
    environment,
  );
}

/**
 * Executes a single charge when staff and house credentials are identical.
 * The full amount (staffAmount + houseFeeAmount + tip) goes to one account.
 */
async function executeSingleCharge(
  sourceId: string,
  decision: SplitDecision,
  credentials: SquareCredentials,
  tipAmount: number,
  idempotencyKeyBase: string,
  environment: Environment,
): Promise<SplitPaymentResult> {
  const squareClient = new Client({
    accessToken: credentials.accessToken,
    environment,
  });

  const totalAmountCents = dollarsToCents(decision.staffAmount + decision.houseFeeAmount);
  const tipCents = dollarsToCents(tipAmount);

  try {
    const { result } = await squareClient.paymentsApi.createPayment({
      sourceId,
      idempotencyKey: `${idempotencyKeyBase}-staff`,
      amountMoney: { amount: BigInt(totalAmountCents), currency: 'USD' },
      tipMoney: { amount: BigInt(tipCents), currency: 'USD' },
      locationId: credentials.locationId,
    });

    const paymentId = result.payment?.id;

    return {
      success: true,
      housePaymentId: paymentId,
      staffPaymentId: paymentId,
      houseFeeAmount: decision.houseFeeAmount,
      staffAmount: decision.staffAmount,
      tipAmount,
    };
  } catch (error: any) {
    const details = error?.errors?.[0]?.detail || error?.message || 'Payment failed';
    return {
      success: false,
      houseFeeAmount: decision.houseFeeAmount,
      staffAmount: decision.staffAmount,
      tipAmount,
      error: details,
    };
  }
}

/**
 * Executes the two-charge split: house fee first, then staff portion.
 *
 * Requirement 1.8: If house fee fails, reject entire payment.
 * Requirement 1.4: If house succeeds + staff fails, return partial.
 * Requirement 1.6: House fee tip = 0; staff gets the full tip.
 */
async function executeTwoChargeSplit(
  sourceId: string,
  decision: SplitDecision,
  staffCredentials: SquareCredentials,
  houseCredentials: SquareCredentials,
  tipAmount: number,
  idempotencyKeyBase: string,
  environment: Environment,
): Promise<SplitPaymentResult> {
  const houseClient = new Client({
    accessToken: houseCredentials.accessToken,
    environment,
  });

  const houseFeeAmountCents = dollarsToCents(decision.houseFeeAmount);

  // Step 1: Charge house fee (tip = 0)
  let housePaymentId: string | undefined;
  try {
    const { result } = await houseClient.paymentsApi.createPayment({
      sourceId,
      idempotencyKey: `${idempotencyKeyBase}-house`,
      amountMoney: { amount: BigInt(houseFeeAmountCents), currency: 'USD' },
      tipMoney: { amount: BigInt(0), currency: 'USD' },
      locationId: houseCredentials.locationId,
    });
    housePaymentId = result.payment?.id;
  } catch (error: any) {
    // Requirement 1.8: House fee fails → reject entirely, do not attempt staff charge
    const details = error?.errors?.[0]?.detail || error?.message || 'House fee payment failed';
    return {
      success: false,
      houseFeeAmount: decision.houseFeeAmount,
      staffAmount: decision.staffAmount,
      tipAmount,
      error: details,
    };
  }

  // Step 2: Charge staff portion (with full tip)
  const staffClient = new Client({
    accessToken: staffCredentials.accessToken,
    environment,
  });

  const staffAmountCents = dollarsToCents(decision.staffAmount);
  const tipCents = dollarsToCents(tipAmount);

  try {
    const { result } = await staffClient.paymentsApi.createPayment({
      sourceId,
      idempotencyKey: `${idempotencyKeyBase}-staff`,
      amountMoney: { amount: BigInt(staffAmountCents), currency: 'USD' },
      tipMoney: { amount: BigInt(tipCents), currency: 'USD' },
      locationId: staffCredentials.locationId,
    });

    const staffPaymentId = result.payment?.id;

    return {
      success: true,
      housePaymentId,
      staffPaymentId,
      houseFeeAmount: decision.houseFeeAmount,
      staffAmount: decision.staffAmount,
      tipAmount,
    };
  } catch (error: any) {
    // Requirement 1.4: House succeeded but staff failed → partial
    const details = error?.errors?.[0]?.detail || error?.message || 'Staff payment failed';
    return {
      success: false,
      housePaymentId,
      houseFeeAmount: decision.houseFeeAmount,
      staffAmount: decision.staffAmount,
      tipAmount,
      partial: true,
      error: details,
    };
  }
}
