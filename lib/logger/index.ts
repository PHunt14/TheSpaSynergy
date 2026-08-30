/**
 * Structured Error Logging - Barrel Export
 *
 * Provides a pre-configured singleton Logger instance and re-exports all
 * key components for convenient application-wide use.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('booking', 'Appointment created', { appointmentId: '123' });
 *
 * Or use domain-specific helpers:
 *   import { logPaymentStart } from '@/lib/logger';
 *
 * Requirements: 11.1, 11.4, 11.5
 */

// ---------------------------------------------------------------------------
// Core Logger
// ---------------------------------------------------------------------------

export { Logger, createConfigFromEnv, parseLogLevel, parseLevelOverrides } from './logger';

// ---------------------------------------------------------------------------
// Lambda Logger
// ---------------------------------------------------------------------------

export { LambdaLogger } from './lambda-logger';

// ---------------------------------------------------------------------------
// Sanitizer
// ---------------------------------------------------------------------------

export { sanitize, sanitizeEmail, sanitizePhone, isSensitiveKey } from './sanitizer';

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export { withErrorLogging, inferDomain, extractCorrelationId } from './middleware';
export type { RouteHandler } from './middleware';

// ---------------------------------------------------------------------------
// BatchWriter
// ---------------------------------------------------------------------------

export { BatchWriter } from './batch-writer';
export type { BatchWriterConfig } from './batch-writer';

// ---------------------------------------------------------------------------
// Client Error Reporter
// ---------------------------------------------------------------------------

export { ClientErrorReporter } from './client-reporter';
export type { ClientErrorPayload } from './client-reporter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
  SeverityLevel,
  DomainTag,
  LogContext,
  LogEntry,
  LoggerConfig,
  SanitizeResult,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export {
  SEVERITY_HIERARCHY,
  VALID_SEVERITY_LEVELS,
  VALID_DOMAIN_TAGS,
  DOMAIN_ROUTE_MAPPINGS,
  DEFAULT_DOMAIN,
  MAX_MESSAGE_LENGTH,
  MAX_CONTEXT_KEYS,
  MAX_KEY_LENGTH,
  MAX_VALUE_LENGTH,
  DEFAULT_LOG_LEVEL_DEPLOYED,
  DEFAULT_LOG_LEVEL_DEVELOPMENT,
  FALLBACK_LOG_LEVEL,
} from './constants';

// ---------------------------------------------------------------------------
// Domain Loggers
// ---------------------------------------------------------------------------

// Payment domain
export {
  logPaymentStart,
  logPaymentSuccess,
  logPaymentFailure,
  logPartialPayment,
} from './domains/payment-logger';
export type {
  PaymentStartDetails,
  PaymentSuccessDetails,
  PaymentFailureDetails,
  PartialPaymentDetails,
  PaymentType,
  RoutingMethod,
} from './domains/payment-logger';

// Booking domain
export {
  logAppointmentCreated,
  logSchedulingConflict,
  logAppointmentCancelled,
  logAppointmentRescheduled,
  logBookingRejected,
} from './domains/booking-logger';
export type {
  AppointmentCreatedDetails,
  ConflictDetails,
  CancellationDetails,
  RescheduleDetails,
  RejectionDetails,
} from './domains/booking-logger';

// Scheduling domain
export {
  logScheduleChange,
  logStaffAssignment,
  logAssignmentFailure,
  logScheduleDeleted,
} from './domains/scheduling-logger';
export type {
  ScheduleChangeDetails,
  StaffAssignmentDetails,
  AssignmentFailureDetails,
  ScheduleDeletedDetails,
} from './domains/scheduling-logger';

// ---------------------------------------------------------------------------
// Singleton Logger Instance
// ---------------------------------------------------------------------------

import { Logger, createConfigFromEnv } from './logger';

/**
 * Pre-configured singleton Logger instance.
 *
 * Reads configuration from environment variables at module load time:
 * - LOG_LEVEL → determines minimum severity (default: "info" deployed, "debug" dev)
 * - LOG_LEVEL_OVERRIDES → per-domain overrides (e.g., "payment=debug,scheduling=warn")
 * - DEPLOYMENT_STAGE → determines stage (production/staging/development)
 */
const logger = new Logger(createConfigFromEnv());

export { logger };
export default logger;
