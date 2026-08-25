/**
 * Payment Domain Logger
 *
 * Provides type-safe logging functions for payment operations.
 * All entries are tagged with domain "payment" and include required
 * context fields without sensitive credential values.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import type { LogContext } from '../types';
import { Logger, createConfigFromEnv } from '../logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Payment type classification */
export type PaymentType = 'single' | 'split' | 'bundle' | 'multi-provider' | 'custom';

/** Routing method for successful payments */
export type RoutingMethod = 'staff' | 'provider' | 'house';

/** Details required when a payment operation begins (Req 7.1) */
export interface PaymentStartDetails {
  /** Vendor initiating the payment */
  vendorId: string;
  /** Staff member associated with the payment */
  staffId: string;
  /** Appointment ID or custom charge session ID */
  appointmentId: string;
  /** Amount in cents */
  amount: number;
  /** Type of payment operation */
  paymentType: PaymentType;
  /** Correlation ID to link all entries for this payment request */
  correlationId: string;
}

/** Details required when a payment operation succeeds (Req 7.2) */
export interface PaymentSuccessDetails {
  /** Correlation ID linking to the payment start entry */
  correlationId: string;
  /** Square-returned payment ID */
  paymentId: string;
  /** Amount charged in cents */
  amount: number;
  /** How the payment was routed */
  routingMethod: RoutingMethod;
}

/** Details required when a payment operation fails (Req 7.3) */
export interface PaymentFailureDetails {
  /** Correlation ID linking to the payment start entry */
  correlationId: string;
  /** Failure reason from the Square API error response */
  failureReason: string;
  /** Attempted amount in cents */
  amount: number;
  /** Charge source identifier (staffId, vendorId, or house provider ID used for the charge) */
  chargeSourceId: string;
  /** Deterministic idempotency key sent to Square */
  idempotencyKey: string;
}

/** Details required when a partial payment occurs (Req 7.4) */
export interface PartialPaymentDetails {
  /** Correlation ID linking to the payment start entry */
  correlationId: string;
  /** Successful house fee payment ID */
  houseFeePaymentId: string;
  /** Failed portion's target charge source identifier */
  failedChargeSourceId: string;
  /** House fee amount charged in cents */
  houseFeeAmount: number;
  /** Failed portion amount in cents */
  failedAmount: number;
}

// ---------------------------------------------------------------------------
// Module-level logger instance
// ---------------------------------------------------------------------------

const logger = new Logger(createConfigFromEnv());

// ---------------------------------------------------------------------------
// Domain logging functions
// ---------------------------------------------------------------------------

/**
 * Logs the start of a payment operation.
 * Severity: info
 *
 * Validates: Requirements 7.1
 */
export function logPaymentStart(details: PaymentStartDetails): void {
  logger.setCorrelationId(details.correlationId);

  const context: LogContext = {
    vendorId: details.vendorId,
    staffId: details.staffId,
    appointmentId: details.appointmentId,
    amount: String(details.amount),
    paymentType: details.paymentType,
  };

  logger.info('payment', 'Payment operation started', context);
}

/**
 * Logs a successful payment operation.
 * Severity: info
 *
 * Validates: Requirements 7.2
 */
export function logPaymentSuccess(details: PaymentSuccessDetails): void {
  logger.setCorrelationId(details.correlationId);

  const context: LogContext = {
    paymentId: details.paymentId,
    amount: String(details.amount),
    routingMethod: details.routingMethod,
  };

  logger.info('payment', 'Payment operation succeeded', context);
}

/**
 * Logs a failed payment operation.
 * Severity: error
 *
 * Validates: Requirements 7.3
 */
export function logPaymentFailure(details: PaymentFailureDetails): void {
  logger.setCorrelationId(details.correlationId);

  const context: LogContext = {
    failureReason: details.failureReason,
    amount: String(details.amount),
    chargeSourceId: details.chargeSourceId,
    idempotencyKey: details.idempotencyKey,
  };

  logger.error('payment', 'Payment operation failed', context);
}

/**
 * Logs a partial payment (house fee succeeds, subsequent charge fails).
 * Severity: warn
 *
 * Validates: Requirements 7.4
 */
export function logPartialPayment(details: PartialPaymentDetails): void {
  logger.setCorrelationId(details.correlationId);

  const context: LogContext = {
    houseFeePaymentId: details.houseFeePaymentId,
    failedChargeSourceId: details.failedChargeSourceId,
    houseFeeAmount: String(details.houseFeeAmount),
    failedAmount: String(details.failedAmount),
  };

  logger.warn('payment', 'Partial payment: house fee succeeded but subsequent charge failed', context);
}
