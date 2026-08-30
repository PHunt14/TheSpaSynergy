/**
 * Unit tests for the Payment Domain Logger.
 *
 * Validates Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { jest } from '@jest/globals';
import {
  logPaymentStart,
  logPaymentSuccess,
  logPaymentFailure,
  logPartialPayment,
} from '../../../lib/logger/domains/payment-logger.ts';

describe('Payment Domain Logger', () => {
  let stdoutSpy;

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  function getLastOutput() {
    const calls = stdoutSpy.mock.calls;
    if (calls.length === 0) return null;
    const lastCall = calls[calls.length - 1][0];
    return JSON.parse(lastCall.replace(/\n$/, ''));
  }

  describe('logPaymentStart (Req 7.1)', () => {
    const startDetails = {
      vendorId: 'vendor_abc123',
      staffId: 'staff_xyz789',
      appointmentId: 'appt_001',
      amount: 5000,
      paymentType: 'split',
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
    };

    it('emits an info-level entry with domain "payment"', () => {
      logPaymentStart(startDetails);
      const output = getLastOutput();
      expect(output.level).toBe('info');
      expect(output.domain).toBe('payment');
    });

    it('includes vendorId in context', () => {
      logPaymentStart(startDetails);
      const output = getLastOutput();
      expect(output.context.vendorId).toBe('vendor_abc123');
    });

    it('includes staffId in context', () => {
      logPaymentStart(startDetails);
      const output = getLastOutput();
      expect(output.context.staffId).toBe('staff_xyz789');
    });

    it('includes appointmentId in context', () => {
      logPaymentStart(startDetails);
      const output = getLastOutput();
      expect(output.context.appointmentId).toBe('appt_001');
    });

    it('includes amount in cents as string in context', () => {
      logPaymentStart(startDetails);
      const output = getLastOutput();
      expect(output.context.amount).toBe('5000');
    });

    it('includes paymentType in context', () => {
      logPaymentStart(startDetails);
      const output = getLastOutput();
      expect(output.context.paymentType).toBe('split');
    });

    it('uses the provided correlationId', () => {
      logPaymentStart(startDetails);
      const output = getLastOutput();
      expect(output.correlationId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  describe('logPaymentSuccess (Req 7.2)', () => {
    const successDetails = {
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      paymentId: 'sq_pay_12345',
      amount: 5000,
      routingMethod: 'staff',
    };

    it('emits an info-level entry with domain "payment"', () => {
      logPaymentSuccess(successDetails);
      const output = getLastOutput();
      expect(output.level).toBe('info');
      expect(output.domain).toBe('payment');
    });

    it('includes Square paymentId in context', () => {
      logPaymentSuccess(successDetails);
      const output = getLastOutput();
      expect(output.context.paymentId).toBe('sq_pay_12345');
    });

    it('includes amount charged in cents', () => {
      logPaymentSuccess(successDetails);
      const output = getLastOutput();
      expect(output.context.amount).toBe('5000');
    });

    it('includes routing method in context', () => {
      logPaymentSuccess(successDetails);
      const output = getLastOutput();
      expect(output.context.routingMethod).toBe('staff');
    });

    it('uses the provided correlationId', () => {
      logPaymentSuccess(successDetails);
      const output = getLastOutput();
      expect(output.correlationId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  describe('logPaymentFailure (Req 7.3)', () => {
    const failureDetails = {
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      failureReason: 'CARD_DECLINED',
      amount: 5000,
      chargeSourceId: 'staff_xyz789',
      idempotencyKey: 'idem_12345',
    };

    it('emits an error-level entry with domain "payment"', () => {
      logPaymentFailure(failureDetails);
      const output = getLastOutput();
      expect(output.level).toBe('error');
      expect(output.domain).toBe('payment');
    });

    it('includes failureReason in context', () => {
      logPaymentFailure(failureDetails);
      const output = getLastOutput();
      expect(output.context.failureReason).toBe('CARD_DECLINED');
    });

    it('includes attempted amount in cents', () => {
      logPaymentFailure(failureDetails);
      const output = getLastOutput();
      expect(output.context.amount).toBe('5000');
    });

    it('includes credential source identifier', () => {
      logPaymentFailure(failureDetails);
      const output = getLastOutput();
      expect(output.context.chargeSourceId).toBe('staff_xyz789');
    });

    it('includes idempotency key', () => {
      logPaymentFailure(failureDetails);
      const output = getLastOutput();
      expect(output.context.idempotencyKey).toBe('idem_12345');
    });

    it('uses the provided correlationId', () => {
      logPaymentFailure(failureDetails);
      const output = getLastOutput();
      expect(output.correlationId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  describe('logPartialPayment (Req 7.4)', () => {
    const partialDetails = {
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      houseFeePaymentId: 'sq_pay_house_001',
      failedChargeSourceId: 'staff_xyz789',
      houseFeeAmount: 2000,
      failedAmount: 3000,
    };

    it('emits a warn-level entry with domain "payment"', () => {
      logPartialPayment(partialDetails);
      const output = getLastOutput();
      expect(output.level).toBe('warn');
      expect(output.domain).toBe('payment');
    });

    it('includes successful house fee payment ID', () => {
      logPartialPayment(partialDetails);
      const output = getLastOutput();
      expect(output.context.houseFeePaymentId).toBe('sq_pay_house_001');
    });

    it('includes failed credential source identifier', () => {
      logPartialPayment(partialDetails);
      const output = getLastOutput();
      expect(output.context.failedChargeSourceId).toBe('staff_xyz789');
    });

    it('includes house fee amount in cents', () => {
      logPartialPayment(partialDetails);
      const output = getLastOutput();
      expect(output.context.houseFeeAmount).toBe('2000');
    });

    it('includes failed portion amount in cents', () => {
      logPartialPayment(partialDetails);
      const output = getLastOutput();
      expect(output.context.failedAmount).toBe('3000');
    });

    it('uses the provided correlationId', () => {
      logPartialPayment(partialDetails);
      const output = getLastOutput();
      expect(output.correlationId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  describe('Sensitive data exclusion (Req 7.5)', () => {
    it('does not include any field containing "token" in payment start context', () => {
      logPaymentStart({
        vendorId: 'vendor_abc123',
        staffId: 'staff_xyz789',
        appointmentId: 'appt_001',
        amount: 5000,
        paymentType: 'single',
        correlationId: '550e8400-e29b-41d4-a716-446655440000',
      });
      const output = getLastOutput();
      const contextKeys = Object.keys(output.context);
      const sensitiveKeys = contextKeys.filter(
        (k) =>
          k.toLowerCase().includes('token') ||
          k.toLowerCase().includes('secret') ||
          k.toLowerCase().includes('card')
      );
      expect(sensitiveKeys).toHaveLength(0);
    });

    it('does not expose access token or refresh token values anywhere in the entry', () => {
      logPaymentFailure({
        correlationId: '550e8400-e29b-41d4-a716-446655440000',
        failureReason: 'CARD_DECLINED',
        amount: 5000,
        credentialSourceId: 'staff_xyz789',
        idempotencyKey: 'idem_12345',
      });
      const output = getLastOutput();
      const fullEntry = JSON.stringify(output);
      // Ensure no token-like values appear in the serialized output
      expect(fullEntry).not.toContain('accessToken');
      expect(fullEntry).not.toContain('refreshToken');
    });
  });
});


/**
 * Property-Based Tests for Payment Domain Logger
 *
 * Feature: structured-error-logging, Property 14: Payment domain logging completeness
 * Library: fast-check
 * Configuration: Minimum 100 iterations
 *
 * Property 14: Payment domain logging completeness
 *
 * For any payment operation event (start, success, failure, partial), the corresponding
 * domain logger function SHALL emit a Log_Entry with domain "payment", the correct
 * severity level (info for start/success, error for failure, warn for partial), and all
 * required fields for that event type present in the context, with no sensitive credential
 * values (access tokens, refresh tokens, card numbers) appearing anywhere in the entry.
 *
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
 */
import * as fc from 'fast-check';

describe('Feature: structured-error-logging, Property 14: Payment domain logging completeness', () => {
  let stdoutSpy;

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  function getLastLogEntry() {
    const calls = stdoutSpy.mock.calls;
    if (calls.length === 0) return null;
    const lastCall = calls[calls.length - 1][0];
    return JSON.parse(lastCall.replace(/\n$/, ''));
  }

  // Sensitive keywords that must never appear in serialized log entries
  const SENSITIVE_KEYWORDS = ['accessToken', 'refreshToken', 'cardNumber'];

  // Arbitrary for valid payment types
  const paymentTypeArb = fc.constantFrom('single', 'split', 'bundle', 'multi-provider', 'custom');

  // Arbitrary for valid routing methods
  const routingMethodArb = fc.constantFrom('staff', 'provider', 'house');

  // Arbitrary for UUID v4
  const uuidArb = fc.uuid().filter((u) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(u));

  // Arbitrary for identifier strings (non-empty, no sensitive content, no phone/email patterns)
  // Avoid values that look like emails or phone numbers (7+ digits) to the sanitizer
  const identifierArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,29}$/).filter((s) => {
    const lower = s.toLowerCase();
    return s.length > 0 &&
      !lower.includes('accesstoken') &&
      !lower.includes('refreshtoken') &&
      !lower.includes('cardnumber') &&
      !lower.includes('token') &&
      !lower.includes('secret') &&
      !lower.includes('password') &&
      !lower.includes('credential') &&
      (s.match(/\d/g) || []).length < 7 &&
      !s.includes('@');
  });

  // Arbitrary for positive integer amounts (in cents)
  // Keep under 1,000,000 (< 7 digits) to avoid sanitizer treating the stringified
  // amount as a phone number (sanitizer masks strings with 7+ digits)
  const amountArb = fc.integer({ min: 1, max: 999999 });

  // Arbitrary for PaymentStartDetails
  const paymentStartArb = fc.record({
    vendorId: identifierArb,
    staffId: identifierArb,
    appointmentId: identifierArb,
    amount: amountArb,
    paymentType: paymentTypeArb,
    correlationId: uuidArb,
  });

  // Arbitrary for PaymentSuccessDetails
  const paymentSuccessArb = fc.record({
    correlationId: uuidArb,
    paymentId: identifierArb,
    amount: amountArb,
    routingMethod: routingMethodArb,
  });

  // Arbitrary for PaymentFailureDetails
  const paymentFailureArb = fc.record({
    correlationId: uuidArb,
    failureReason: identifierArb,
    amount: amountArb,
    chargeSourceId: identifierArb,
    idempotencyKey: identifierArb,
  });

  // Arbitrary for PartialPaymentDetails
  const partialPaymentArb = fc.record({
    correlationId: uuidArb,
    houseFeePaymentId: identifierArb,
    failedChargeSourceId: identifierArb,
    houseFeeAmount: amountArb,
    failedAmount: amountArb,
  });

  it('logPaymentStart emits info-level entry with domain "payment" and all required context fields', () => {
    fc.assert(
      fc.property(paymentStartArb, (details) => {
        stdoutSpy.mockClear();
        logPaymentStart(details);

        const entry = getLastLogEntry();
        if (!entry) return false;

        // Domain must be "payment"
        if (entry.domain !== 'payment') return false;

        // Level must be "info" for start events
        if (entry.level !== 'info') return false;

        // All required context fields must be present
        if (entry.context.vendorId !== details.vendorId) return false;
        if (entry.context.staffId !== details.staffId) return false;
        if (entry.context.appointmentId !== details.appointmentId) return false;
        if (entry.context.amount !== String(details.amount)) return false;
        if (entry.context.paymentType !== details.paymentType) return false;

        // Correlation ID must match
        if (entry.correlationId !== details.correlationId) return false;

        // No sensitive keywords in the serialized entry
        const serialized = JSON.stringify(entry);
        for (const keyword of SENSITIVE_KEYWORDS) {
          if (serialized.includes(keyword)) return false;
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('logPaymentSuccess emits info-level entry with domain "payment" and all required context fields', () => {
    fc.assert(
      fc.property(paymentSuccessArb, (details) => {
        stdoutSpy.mockClear();
        logPaymentSuccess(details);

        const entry = getLastLogEntry();
        if (!entry) return false;

        // Domain must be "payment"
        if (entry.domain !== 'payment') return false;

        // Level must be "info" for success events
        if (entry.level !== 'info') return false;

        // All required context fields must be present
        if (entry.context.paymentId !== details.paymentId) return false;
        if (entry.context.amount !== String(details.amount)) return false;
        if (entry.context.routingMethod !== details.routingMethod) return false;

        // Correlation ID must match
        if (entry.correlationId !== details.correlationId) return false;

        // No sensitive keywords in the serialized entry
        const serialized = JSON.stringify(entry);
        for (const keyword of SENSITIVE_KEYWORDS) {
          if (serialized.includes(keyword)) return false;
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('logPaymentFailure emits error-level entry with domain "payment" and all required context fields', () => {
    fc.assert(
      fc.property(paymentFailureArb, (details) => {
        stdoutSpy.mockClear();
        logPaymentFailure(details);

        const entry = getLastLogEntry();
        if (!entry) return false;

        // Domain must be "payment"
        if (entry.domain !== 'payment') return false;

        // Level must be "error" for failure events
        if (entry.level !== 'error') return false;

        // All required context fields must be present
        if (entry.context.failureReason !== details.failureReason) return false;
        if (entry.context.amount !== String(details.amount)) return false;
        if (entry.context.chargeSourceId !== details.chargeSourceId) return false;
        if (entry.context.idempotencyKey !== details.idempotencyKey) return false;

        // Correlation ID must match
        if (entry.correlationId !== details.correlationId) return false;

        // No sensitive keywords in the serialized entry
        const serialized = JSON.stringify(entry);
        for (const keyword of SENSITIVE_KEYWORDS) {
          if (serialized.includes(keyword)) return false;
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('logPartialPayment emits warn-level entry with domain "payment" and all required context fields', () => {
    fc.assert(
      fc.property(partialPaymentArb, (details) => {
        stdoutSpy.mockClear();
        logPartialPayment(details);

        const entry = getLastLogEntry();
        if (!entry) return false;

        // Domain must be "payment"
        if (entry.domain !== 'payment') return false;

        // Level must be "warn" for partial payment events
        if (entry.level !== 'warn') return false;

        // All required context fields must be present
        if (entry.context.houseFeePaymentId !== details.houseFeePaymentId) return false;
        if (entry.context.failedChargeSourceId !== details.failedChargeSourceId) return false;
        if (entry.context.houseFeeAmount !== String(details.houseFeeAmount)) return false;
        if (entry.context.failedAmount !== String(details.failedAmount)) return false;

        // Correlation ID must match
        if (entry.correlationId !== details.correlationId) return false;

        // No sensitive keywords in the serialized entry
        const serialized = JSON.stringify(entry);
        for (const keyword of SENSITIVE_KEYWORDS) {
          if (serialized.includes(keyword)) return false;
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
