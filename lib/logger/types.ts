/**
 * Structured Error Logging - Shared Types
 *
 * Defines all interfaces and types used across the logger module.
 */

/**
 * Severity levels ordered from highest to lowest priority:
 * error (4) > warn (3) > info (2) > debug (1)
 */
export type SeverityLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * Business domain tags for categorizing log entries.
 * Each log entry is tagged with exactly one domain.
 */
export type DomainTag =
  | 'booking'
  | 'payment'
  | 'scheduling'
  | 'notification'
  | 'auth'
  | 'general';

/**
 * Flat key-value metadata attached to a log entry.
 * Keys are max 64 characters, values are max 512 characters.
 * Maximum of 32 keys per context object.
 */
export interface LogContext {
  [key: string]: string;
}

/**
 * A single structured log record emitted as single-line JSON.
 */
export interface LogEntry {
  /** ISO 8601 UTC timestamp with millisecond precision */
  timestamp: string;
  /** Severity level of this entry */
  level: SeverityLevel;
  /** Business domain this entry belongs to */
  domain: DomainTag;
  /** Human-readable message, max 4096 characters, newlines escaped */
  message: string;
  /** UUID v4 linking all entries within a single request */
  correlationId: string;
  /** Flat key-value metadata */
  context: LogContext;
}

/**
 * Configuration for the Logger instance.
 */
export interface LoggerConfig {
  /** Minimum severity level for emission */
  minLevel: SeverityLevel;
  /** Per-domain severity level overrides */
  levelOverrides: Record<DomainTag, SeverityLevel>;
  /** Deployment stage determines CloudWatch delivery */
  stage: 'production' | 'staging' | 'development';
  /** Optional CloudWatch configuration (only used in production/staging) */
  cloudwatch?: {
    logGroupName: string;
    logStreamName: string;
  };
}

/**
 * Result of running context data through the Sanitizer.
 */
export interface SanitizeResult {
  /** Sanitized context with sensitive values redacted/masked */
  context: LogContext;
  /** Dot-notation paths of all fields that were redacted */
  redactedFields: string[];
}
