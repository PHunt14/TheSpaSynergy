/**
 * Structured Error Logging - Constants
 *
 * Severity hierarchy, domain route mappings, and configuration defaults.
 */

import type { DomainTag, SeverityLevel } from './types';

/**
 * Numeric rank for each severity level.
 * Higher number = higher priority.
 * A log entry is emitted only if its rank >= the configured minimum rank.
 */
export const SEVERITY_HIERARCHY: Record<SeverityLevel, number> = {
  error: 4,
  warn: 3,
  info: 2,
  debug: 1,
};

/**
 * All valid severity levels.
 */
export const VALID_SEVERITY_LEVELS: readonly SeverityLevel[] = [
  'error',
  'warn',
  'info',
  'debug',
];

/**
 * All valid domain tags.
 */
export const VALID_DOMAIN_TAGS: readonly DomainTag[] = [
  'booking',
  'payment',
  'scheduling',
  'notification',
  'auth',
  'general',
];

/**
 * Route prefix to domain tag mapping.
 * Order matters — more specific prefixes should appear before less specific ones.
 * Each entry maps a URL path prefix to a DomainTag.
 */
export const DOMAIN_ROUTE_MAPPINGS: readonly { prefix: string; domain: DomainTag }[] = [
  // Payment routes
  { prefix: '/api/payment/', domain: 'payment' },
  { prefix: '/api/square/', domain: 'payment' },

  // Booking routes
  { prefix: '/api/appointments/', domain: 'booking' },
  { prefix: '/api/booking-blackout/', domain: 'booking' },
  { prefix: '/api/availability/', domain: 'booking' },
  { prefix: '/api/available-dates/', domain: 'booking' },
  { prefix: '/api/eligible-staff/', domain: 'booking' },

  // Scheduling routes
  { prefix: '/api/staff-schedules/', domain: 'scheduling' },
  { prefix: '/api/staff/', domain: 'scheduling' },

  // Notification routes
  { prefix: '/api/send-sms/', domain: 'notification' },
];

/**
 * Default domain tag when no route mapping matches.
 */
export const DEFAULT_DOMAIN: DomainTag = 'general';

// ---------------------------------------------------------------------------
// Configuration defaults
// ---------------------------------------------------------------------------

/** Maximum length of the message field in a log entry */
export const MAX_MESSAGE_LENGTH = 4096;

/** Maximum number of keys allowed in a LogContext object */
export const MAX_CONTEXT_KEYS = 32;

/** Maximum length of a single context key */
export const MAX_KEY_LENGTH = 64;

/** Maximum length of a single context value */
export const MAX_VALUE_LENGTH = 512;

/** Default minimum log level for production/staging environments */
export const DEFAULT_LOG_LEVEL_DEPLOYED: SeverityLevel = 'info';

/** Default minimum log level for local development */
export const DEFAULT_LOG_LEVEL_DEVELOPMENT: SeverityLevel = 'debug';

/** Fallback log level when an invalid LOG_LEVEL value is configured */
export const FALLBACK_LOG_LEVEL: SeverityLevel = 'info';
