/**
 * Payment Validator Module
 *
 * Validates all payment inputs before processing.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 3.3
 */

export interface PaymentValidationInput {
  amount: number;
  tipAmount?: number;
  expectedAmount: number; // from service price or custom charge
  houseFeeAmount?: number;
  servicePrice?: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: {
    message: string;
    expected?: number;
    received?: number;
    difference?: number;
  };
}

/**
 * Sanitizes numeric input by rejecting NaN, Infinity, -Infinity, and negative zero.
 * Returns the number if valid, or null if invalid.
 *
 * Requirement 4.5: Sanitize all numeric input fields by rejecting values that are
 * not finite numbers (NaN, Infinity, negative zero).
 */
export function sanitizeNumericInput(value: unknown): number | null {
  if (typeof value !== 'number') {
    return null;
  }

  if (!Number.isFinite(value)) {
    return null;
  }

  // Reject negative zero
  if (value === 0 && 1 / value === -Infinity) {
    return null;
  }

  return value;
}

/**
 * Converts a dollar amount to cents using integer arithmetic.
 * Uses Math.round(amount * 100) to prevent floating-point rounding errors.
 *
 * Requirement 4.3: Convert all dollar amounts to cents using integer arithmetic.
 */
export function dollarsToCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Validates that the submitted payment amount matches the expected amount
 * within a tolerance of $0.01 and is within reasonable bounds ($0.50–$9999.99).
 *
 * Requirement 4.1: Verify that the requested amount matches the expected amount
 * within a tolerance of $0.01.
 * Requirement 4.2: If the amount does not match, reject with expected, received,
 * and difference.
 * Requirement 4.5: Enforce reasonable payment bounds to prevent typos or attacks.
 */
export function validatePaymentAmount(input: PaymentValidationInput): ValidationResult {
  const { amount, expectedAmount } = input;

  // Sanitize both values
  const sanitizedAmount = sanitizeNumericInput(amount);
  const sanitizedExpected = sanitizeNumericInput(expectedAmount);

  if (sanitizedAmount === null) {
    return {
      valid: false,
      error: {
        message: 'Invalid payment amount',
      },
    };
  }

  if (sanitizedExpected === null) {
    return {
      valid: false,
      error: {
        message: 'Invalid expected amount',
      },
    };
  }

  // Enforce reasonable bounds: $0.50 minimum, $9999.99 maximum
  if (sanitizedAmount < 0.50) {
    return {
      valid: false,
      error: {
        message: 'Payment amount must be at least $0.50',
        received: sanitizedAmount,
      },
    };
  }

  if (sanitizedAmount > 9999.99) {
    return {
      valid: false,
      error: {
        message: 'Payment amount cannot exceed $9999.99',
        received: sanitizedAmount,
      },
    };
  }

  const difference = Math.abs(sanitizedAmount - sanitizedExpected);

  if (difference > 0.01) {
    return {
      valid: false,
      error: {
        message: `Payment amount doesn't match — please refresh`,
        expected: sanitizedExpected,
        received: sanitizedAmount,
        difference,
      },
    };
  }

  return { valid: true };
}

/**
 * Validates that a tip amount is non-negative and does not exceed 100% of the
 * base amount.
 *
 * Requirement 4.4 / 3.7: Validate that the tip is a non-negative number not
 * exceeding 100% of the base amount.
 */
export function validateTipAmount(tip: number, baseAmount: number): ValidationResult {
  const sanitizedTip = sanitizeNumericInput(tip);
  const sanitizedBase = sanitizeNumericInput(baseAmount);

  if (sanitizedTip === null) {
    return {
      valid: false,
      error: {
        message: 'Invalid tip amount',
      },
    };
  }

  if (sanitizedBase === null) {
    return {
      valid: false,
      error: {
        message: 'Invalid base amount',
      },
    };
  }

  if (sanitizedTip < 0) {
    return {
      valid: false,
      error: {
        message: 'Tip amount cannot be negative',
        received: sanitizedTip,
      },
    };
  }

  if (sanitizedTip > sanitizedBase) {
    return {
      valid: false,
      error: {
        message: 'Tip amount cannot exceed 100% of the base amount',
        expected: sanitizedBase,
        received: sanitizedTip,
        difference: sanitizedTip - sanitizedBase,
      },
    };
  }

  return { valid: true };
}

/**
 * Validates a custom charge amount is within the acceptable range ($0.50–$9999.99)
 * and has no more than two decimal places.
 *
 * Requirement 3.3: Validate that the custom amount is a positive number between
 * $0.50 and $9999.99 with no more than two decimal places.
 */
export function validateCustomChargeAmount(amount: number): ValidationResult {
  const sanitizedAmount = sanitizeNumericInput(amount);

  if (sanitizedAmount === null) {
    return {
      valid: false,
      error: {
        message: 'Invalid custom charge amount',
      },
    };
  }

  if (sanitizedAmount < 0.50) {
    return {
      valid: false,
      error: {
        message: 'Custom charge amount must be at least $0.50',
        received: sanitizedAmount,
      },
    };
  }

  if (sanitizedAmount > 9999.99) {
    return {
      valid: false,
      error: {
        message: 'Custom charge amount cannot exceed $9999.99',
        received: sanitizedAmount,
      },
    };
  }

  // Check for more than 2 decimal places
  // Multiply by 100 and check if the result is an integer
  const cents = sanitizedAmount * 100;
  if (Math.abs(cents - Math.round(cents)) > 1e-9) {
    return {
      valid: false,
      error: {
        message: 'Custom charge amount cannot have more than two decimal places',
        received: sanitizedAmount,
      },
    };
  }

  return { valid: true };
}
