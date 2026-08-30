/**
 * Structured Error Logging - Logger Core
 *
 * Central logging class that emits single-line JSON entries to stdout.
 * Supports severity filtering, domain validation, context constraints,
 * correlation ID tracking, and environment-aware configuration.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1, 2.2, 2.3, 2.4, 2.5,
 *              11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import type { DomainTag, LogContext, LogEntry, LoggerConfig, SeverityLevel } from './types';
import {
  DEFAULT_LOG_LEVEL_DEPLOYED,
  DEFAULT_LOG_LEVEL_DEVELOPMENT,
  FALLBACK_LOG_LEVEL,
  MAX_CONTEXT_KEYS,
  MAX_KEY_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_VALUE_LENGTH,
  SEVERITY_HIERARCHY,
  VALID_DOMAIN_TAGS,
  VALID_SEVERITY_LEVELS,
} from './constants';
import { sanitize } from './sanitizer';

/**
 * Parses the LOG_LEVEL environment variable into a valid SeverityLevel.
 * Falls back to stage-appropriate default if not set, or "info" if invalid.
 * Returns a warning message if the value is invalid.
 */
export function parseLogLevel(
  envValue: string | undefined,
  stage: LoggerConfig['stage']
): { level: SeverityLevel; warning?: string } {
  if (!envValue) {
    // Default based on stage
    const level =
      stage === 'development' ? DEFAULT_LOG_LEVEL_DEVELOPMENT : DEFAULT_LOG_LEVEL_DEPLOYED;
    return { level };
  }

  const normalized = envValue.trim().toLowerCase();
  if (VALID_SEVERITY_LEVELS.includes(normalized as SeverityLevel)) {
    return { level: normalized as SeverityLevel };
  }

  // Invalid value — fall back to "info" with a warning
  return {
    level: FALLBACK_LOG_LEVEL,
    warning: `Invalid LOG_LEVEL "${envValue}" — falling back to "info"`,
  };
}

/**
 * Parses the LOG_LEVEL_OVERRIDES environment variable into a per-domain map.
 * Format: comma-separated domain=level pairs (e.g., "payment=debug,scheduling=warn").
 * Invalid entries are ignored and returned as warnings.
 */
export function parseLevelOverrides(
  envValue: string | undefined
): { overrides: Partial<Record<DomainTag, SeverityLevel>>; warnings: string[] } {
  const overrides: Partial<Record<DomainTag, SeverityLevel>> = {};
  const warnings: string[] = [];

  if (!envValue || envValue.trim() === '') {
    return { overrides, warnings };
  }

  const entries = envValue.split(',');
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      warnings.push(`Invalid LOG_LEVEL_OVERRIDES entry "${trimmed}" — missing "=" separator`);
      continue;
    }

    const domain = trimmed.slice(0, eqIndex).trim();
    const level = trimmed.slice(eqIndex + 1).trim().toLowerCase();

    if (!VALID_DOMAIN_TAGS.includes(domain as DomainTag)) {
      warnings.push(
        `Invalid LOG_LEVEL_OVERRIDES entry "${trimmed}" — unrecognized domain "${domain}"`
      );
      continue;
    }

    if (!VALID_SEVERITY_LEVELS.includes(level as SeverityLevel)) {
      warnings.push(
        `Invalid LOG_LEVEL_OVERRIDES entry "${trimmed}" — unrecognized level "${level}"`
      );
      continue;
    }

    overrides[domain as DomainTag] = level as SeverityLevel;
  }

  return { overrides, warnings };
}

/**
 * Creates a LoggerConfig from environment variables.
 */
export function createConfigFromEnv(): LoggerConfig {
  const stage = (process.env.DEPLOYMENT_STAGE || 'development') as LoggerConfig['stage'];
  const validStages: LoggerConfig['stage'][] = ['production', 'staging', 'development'];
  const resolvedStage = validStages.includes(stage) ? stage : 'development';

  const { level: minLevel } = parseLogLevel(process.env.LOG_LEVEL, resolvedStage);
  const { overrides } = parseLevelOverrides(process.env.LOG_LEVEL_OVERRIDES);

  // Build full levelOverrides record with global level as fallback
  const levelOverrides = {} as Record<DomainTag, SeverityLevel>;
  for (const tag of VALID_DOMAIN_TAGS) {
    levelOverrides[tag] = overrides[tag] ?? minLevel;
  }

  return {
    minLevel,
    levelOverrides,
    stage: resolvedStage,
  };
}

/**
 * Central Logger class for structured error logging.
 *
 * Emits single-line JSON entries to stdout with severity filtering,
 * domain validation, context constraints, and correlation ID tracking.
 */
export class Logger {
  private config: LoggerConfig;
  private correlationId: string;

  constructor(config: LoggerConfig) {
    this.config = config;
    this.correlationId = crypto.randomUUID();

    // Emit any configuration warnings at startup
    this.emitConfigWarnings();
  }

  /**
   * Emit an error-level log entry.
   */
  error(domain: DomainTag, message: string, context?: LogContext): void {
    this.emit('error', domain, message, context);
  }

  /**
   * Emit a warn-level log entry.
   */
  warn(domain: DomainTag, message: string, context?: LogContext): void {
    this.emit('warn', domain, message, context);
  }

  /**
   * Emit an info-level log entry.
   */
  info(domain: DomainTag, message: string, context?: LogContext): void {
    this.emit('info', domain, message, context);
  }

  /**
   * Emit a debug-level log entry.
   */
  debug(domain: DomainTag, message: string, context?: LogContext): void {
    this.emit('debug', domain, message, context);
  }

  /**
   * Set the correlation ID for this Logger instance.
   */
  setCorrelationId(id: string): void {
    this.correlationId = id;
  }

  /**
   * Get the current correlation ID.
   */
  getCorrelationId(): string {
    return this.correlationId;
  }

  /**
   * Flush buffered entries. Placeholder for future BatchWriter integration.
   */
  async flush(): Promise<void> {
    // No-op placeholder — will be used by BatchWriter later
  }

  /**
   * Core emission logic: validates inputs, applies constraints, sanitizes context,
   * checks severity filtering, and writes JSON to stdout.
   */
  private emit(
    level: SeverityLevel,
    domain: DomainTag,
    message: string,
    context?: LogContext
  ): void {
    // 1. Validate severity level
    if (!VALID_SEVERITY_LEVELS.includes(level)) {
      throw new Error(
        `Invalid severity level "${level}". Must be one of: ${VALID_SEVERITY_LEVELS.join(', ')}`
      );
    }

    // 2. Validate/fallback domain
    let resolvedDomain: DomainTag = domain;
    let contextAdditions: LogContext = {};

    if (!VALID_DOMAIN_TAGS.includes(domain as DomainTag)) {
      resolvedDomain = 'general';
      contextAdditions = { unsupportedDomain: String(domain) };
    }

    // 3. Enforce message constraints
    let sanitizedMessage = message ?? '';
    // Escape newlines as literal \n sequences
    sanitizedMessage = sanitizedMessage.replaceAll('\r\n', '\\n').replaceAll('\n', '\\n').replaceAll('\r', '\\n');
    // Truncate to max length
    if (sanitizedMessage.length > MAX_MESSAGE_LENGTH) {
      sanitizedMessage = sanitizedMessage.slice(0, MAX_MESSAGE_LENGTH);
    }

    // 4. Enforce context constraints and merge additions
    const rawContext: LogContext = { ...(context ?? {}), ...contextAdditions };
    const constrainedContext = this.constrainContext(rawContext);

    // 5. Apply sanitizer
    let finalContext: LogContext;
    try {
      const sanitizeResult = sanitize(constrainedContext as Record<string, unknown>);
      finalContext = sanitizeResult.context;
      // Add redactedFields to context if any were redacted
      if (sanitizeResult.redactedFields.length > 0) {
        finalContext.redactedFields = sanitizeResult.redactedFields.join(',');
      }
    } catch {
      // Sanitizer error: suppress original entry (Requirement 10.5)
      // Emit a separate error about the sanitization failure
      const fallbackEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'error',
        domain: 'general',
        message: 'Sanitizer error: failed to sanitize log context. Original entry suppressed.',
        correlationId: this.correlationId,
        context: {},
      };
      process.stdout.write(JSON.stringify(fallbackEntry) + '\n');
      return;
    }

    // 6. Check severity level filtering
    const effectiveMinLevel = this.config.levelOverrides[resolvedDomain] ?? this.config.minLevel;
    const entryRank = SEVERITY_HIERARCHY[level];
    const minRank = SEVERITY_HIERARCHY[effectiveMinLevel];

    if (entryRank < minRank) {
      // Entry is below configured minimum — suppress
      return;
    }

    // 7. Build and emit the log entry
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      domain: resolvedDomain,
      message: sanitizedMessage,
      correlationId: this.correlationId,
      context: finalContext,
    };

    process.stdout.write(JSON.stringify(entry) + '\n');
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
   * Emit any configuration warnings detected during Logger construction.
   * Re-parses env vars to detect invalid values and emits warn-level entries.
   */
  private emitConfigWarnings(): void {
    // Check LOG_LEVEL validity
    const logLevelResult = parseLogLevel(process.env.LOG_LEVEL, this.config.stage);
    if (logLevelResult.warning) {
      // Emit the warning directly to stdout to avoid recursive filtering issues
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'warn',
        domain: 'general',
        message: logLevelResult.warning,
        correlationId: this.correlationId,
        context: { configKey: 'LOG_LEVEL', configValue: process.env.LOG_LEVEL ?? '' },
      };
      process.stdout.write(JSON.stringify(entry) + '\n');
    }

    // Check LOG_LEVEL_OVERRIDES validity
    const overridesResult = parseLevelOverrides(process.env.LOG_LEVEL_OVERRIDES);
    for (const warning of overridesResult.warnings) {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'warn',
        domain: 'general',
        message: warning,
        correlationId: this.correlationId,
        context: { configKey: 'LOG_LEVEL_OVERRIDES', configValue: process.env.LOG_LEVEL_OVERRIDES ?? '' },
      };
      process.stdout.write(JSON.stringify(entry) + '\n');
    }
  }
}
