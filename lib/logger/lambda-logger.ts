/**
 * Structured Error Logging - LambdaLogger
 *
 * Lightweight Logger variant for AWS Lambda functions (send-email, send-sms).
 * Writes single-line JSON to stdout in the same format as the main Logger.
 * CloudWatch automatically picks up Lambda stdout — no SDK dependency needed.
 *
 * Key behaviors:
 * - Uses AWS request ID as correlation ID
 * - Uses "notification" domain for all entries
 * - Applies Sanitizer to context before emission
 * - Never throws — catches all internal errors and emits fallback entries
 * - Provides helper methods for common Lambda logging patterns
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7
 */

import type { DomainTag, LogContext, LogEntry, SeverityLevel } from './types';
import { sanitize, sanitizeEmail, sanitizePhone } from './sanitizer';
import {
  MAX_CONTEXT_KEYS,
  MAX_KEY_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_VALUE_LENGTH,
  VALID_SEVERITY_LEVELS,
} from './constants';

/**
 * LambdaLogger — a lightweight, stdout-only logger for AWS Lambda functions.
 *
 * Emits single-line JSON entries in the same format as the main Logger,
 * using the AWS request ID as the correlation ID and "notification" as the domain.
 */
export class LambdaLogger {
  private readonly functionName: string;
  private readonly awsRequestId: string;
  private readonly domain: DomainTag = 'notification';

  constructor(functionName: string, awsRequestId: string) {
    this.functionName = functionName;
    this.awsRequestId = awsRequestId;
  }

  /**
   * Emit an error-level log entry.
   */
  error(message: string, context?: LogContext): void {
    this.emit('error', message, context);
  }

  /**
   * Emit a warn-level log entry.
   */
  warn(message: string, context?: LogContext): void {
    this.emit('warn', message, context);
  }

  /**
   * Emit an info-level log entry.
   */
  info(message: string, context?: LogContext): void {
    this.emit('info', message, context);
  }

  /**
   * Emit a debug-level log entry.
   */
  debug(message: string, context?: LogContext): void {
    this.emit('debug', message, context);
  }

  // ---------------------------------------------------------------------------
  // Helper methods for common Lambda logging patterns
  // ---------------------------------------------------------------------------

  /**
   * Log an error with function name, error details, and event field summary.
   * The event field summary includes only field names and value lengths (no values)
   * to prevent PII leakage.
   *
   * Requirement 12.2
   */
  logError(error: unknown, event?: Record<string, unknown>): void {
    try {
      const errMessage = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack ?? '' : '';

      const context: LogContext = {
        functionName: this.functionName,
        errorMessage: errMessage,
        stackTrace: errStack,
      };

      // Build event field summary: field names + value lengths only, no values
      if (event) {
        const summary = this.buildEventFieldSummary(event);
        context.eventFieldSummary = summary;
      }

      this.emit('error', `Lambda error in ${this.functionName}: ${errMessage}`, context);
    } catch {
      // Never throw — emit fallback
      this.emitFallback('error', `Failed to log error in ${this.functionName}`);
    }
  }

  /**
   * Log a successful operation with function name, status, and masked recipient.
   *
   * Requirement 12.5
   */
  logSuccess(status: string, recipient: string): void {
    try {
      const maskedRecipient = this.maskRecipient(recipient);

      const context: LogContext = {
        functionName: this.functionName,
        status,
        recipient: maskedRecipient,
      };

      this.emit('info', `Lambda ${this.functionName} completed: ${status}`, context);
    } catch {
      // Never throw — emit fallback
      this.emitFallback('info', `Failed to log success in ${this.functionName}`);
    }
  }

  /**
   * Log a validation failure with function name and list of missing/invalid params.
   *
   * Requirement 12.7
   */
  logValidationFailure(missingParams: string[]): void {
    try {
      const context: LogContext = {
        functionName: this.functionName,
        missingParams: missingParams.join(', '),
      };

      this.emit(
        'warn',
        `Lambda ${this.functionName} validation failure: missing parameters [${missingParams.join(', ')}]`,
        context
      );
    } catch {
      // Never throw — emit fallback
      this.emitFallback('warn', `Failed to log validation failure in ${this.functionName}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Private methods
  // ---------------------------------------------------------------------------

  /**
   * Core emission logic: validates, constrains, sanitizes context, and writes JSON to stdout.
   * Never throws — all internal errors result in fallback entries.
   */
  private emit(level: SeverityLevel, message: string, context?: LogContext): void {
    try {
      // 1. Validate severity level
      if (!VALID_SEVERITY_LEVELS.includes(level)) {
        this.emitFallback('error', `Invalid severity level "${level}" in LambdaLogger`);
        return;
      }

      // 2. Enforce message constraints — escape CR/LF as the literal sequence "\n"
      const LITERAL_NEWLINE = String.raw`\n`;
      let sanitizedMessage = message ?? '';
      sanitizedMessage = sanitizedMessage
        .replaceAll('\r\n', LITERAL_NEWLINE)
        .replaceAll('\n', LITERAL_NEWLINE)
        .replaceAll('\r', LITERAL_NEWLINE);
      if (sanitizedMessage.length > MAX_MESSAGE_LENGTH) {
        sanitizedMessage = sanitizedMessage.slice(0, MAX_MESSAGE_LENGTH);
      }

      // 3. Enforce context constraints
      const rawContext: LogContext = context ?? {};
      const constrainedContext = this.constrainContext(rawContext);

      // 4. Apply sanitizer (Requirement 12.6)
      let finalContext: LogContext;
      try {
        const sanitizeResult = sanitize(constrainedContext as Record<string, unknown>);
        finalContext = sanitizeResult.context;
        if (sanitizeResult.redactedFields.length > 0) {
          finalContext.redactedFields = sanitizeResult.redactedFields.join(',');
        }
      } catch {
        // Sanitizer error: suppress original entry, emit fallback
        this.emitFallback(
          'error',
          'Sanitizer error: failed to sanitize log context. Original entry suppressed.'
        );
        return;
      }

      // 5. Build and emit the log entry
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        domain: this.domain,
        message: sanitizedMessage,
        correlationId: this.awsRequestId,
        context: finalContext,
      };

      process.stdout.write(JSON.stringify(entry) + '\n');
    } catch {
      // Never throw — emit fallback on any unexpected error
      this.emitFallback(level, `LambdaLogger internal error while emitting: ${message}`);
    }
  }

  /**
   * Emit a minimal fallback entry when the normal emission path fails.
   * This ensures we always produce output and never throw.
   */
  private emitFallback(level: SeverityLevel, message: string): void {
    try {
      const fallbackEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        domain: this.domain,
        message: message.slice(0, MAX_MESSAGE_LENGTH),
        correlationId: this.awsRequestId,
        context: { functionName: this.functionName },
      };
      process.stdout.write(JSON.stringify(fallbackEntry) + '\n');
    } catch {
      // Absolute last resort — write minimal JSON to stdout
      try {
        process.stdout.write(
          `{"timestamp":"${new Date().toISOString()}","level":"error","domain":"notification","message":"LambdaLogger critical failure","correlationId":"${this.awsRequestId}","context":{}}\n`
        );
      } catch {
        // Truly nothing we can do — swallow silently
      }
    }
  }

  /**
   * Enforce context constraints:
   * - Max 32 keys
   * - Key max 64 chars (truncated)
   * - Value max 512 chars (truncated)
   */
  private constrainContext(context: LogContext): LogContext {
    const keys = Object.keys(context);
    const limitedKeys = keys.slice(0, MAX_CONTEXT_KEYS);

    const constrained: LogContext = {};
    for (const key of limitedKeys) {
      const truncatedKey = key.length > MAX_KEY_LENGTH ? key.slice(0, MAX_KEY_LENGTH) : key;
      const rawValue = context[key];
      const stringValue = rawValue ?? '';
      const truncatedValue =
        stringValue.length > MAX_VALUE_LENGTH ? stringValue.slice(0, MAX_VALUE_LENGTH) : stringValue;
      constrained[truncatedKey] = truncatedValue;
    }

    return constrained;
  }

  /**
   * Build a summary of event fields: field names and value lengths only, no values.
   * Prevents PII leakage while providing debugging context.
   *
   * Example output: "to(23), subject(15), htmlBody(1024)"
   */
  private buildEventFieldSummary(event: Record<string, unknown>): string {
    try {
      const entries: string[] = [];
      for (const [key, value] of Object.entries(event)) {
        entries.push(`${key}(${this.valueLength(value)})`);
      }
      return entries.join(', ');
    } catch {
      return '(unable to summarize event)';
    }
  }

  /**
   * Computes a rough character length for a value without producing
   * "[object Object]" for objects.
   */
  private valueLength(value: unknown): number {
    if (value == null) return 0;
    if (typeof value === 'string') return value.length;
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value).length;
      } catch {
        return 0;
      }
    }
    return String(value as number | boolean | bigint | symbol).length;
  }

  /**
   * Mask a recipient identifier (email or phone).
   * Uses sanitizeEmail for email-like strings, sanitizePhone for phone-like strings.
   */
  private maskRecipient(recipient: string): string {
    try {
      // Check if it looks like an email
      if (recipient.includes('@')) {
        return sanitizeEmail(recipient);
      }
      // Check if it looks like a phone number (has digits)
      const digitCount = (recipient.match(/\d/g) || []).length;
      if (digitCount >= 4) {
        return sanitizePhone(recipient);
      }
      // Fallback: mask most of the string
      if (recipient.length <= 2) {
        return '***';
      }
      return recipient[0] + '***' + recipient.at(-1);
    } catch {
      return '***';
    }
  }
}
