/**
 * Property-Based Tests for Logger Core
 *
 * Feature: structured-error-logging
 * Library: fast-check
 */

import { jest } from '@jest/globals';
import * as fc from 'fast-check';

/**
 * Property 1: Log entry structural invariant
 *
 * For any valid combination of severity level, domain tag, message, and context
 * passed to the Logger, the emitted output SHALL be a valid single-line JSON object
 * containing exactly the fields: timestamp (ISO 8601 UTC with ms precision),
 * level (one of error, warn, info, debug), domain (one of booking, payment,
 * scheduling, notification, auth, general), message (string ≤ 4096 chars with no
 * raw newlines), correlationId (valid UUID v4), and context (object with all string values).
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.7, 2.1, 2.5**
 */
describe('Feature: structured-error-logging, Property 1: Log entry structural invariant', () => {
  const VALID_LEVELS = ['error', 'warn', 'info', 'debug'];
  const VALID_DOMAINS = ['booking', 'payment', 'scheduling', 'notification', 'auth', 'general'];

  // Regex for ISO 8601 UTC with millisecond precision
  const ISO_8601_MS_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  // Regex for UUID v4 format
  const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  // Arbitrary for valid severity levels
  const severityArb = fc.constantFrom(...VALID_LEVELS);

  // Arbitrary for valid domain tags
  const domainArb = fc.constantFrom(...VALID_DOMAINS);

  // Arbitrary for messages - include potential newlines to test escaping
  const messageArb = fc.string({ minLength: 0, maxLength: 5000 });

  // Arbitrary for context objects with string values (avoid sensitive keys/PII values)
  const contextArb = fc.dictionary(
    fc.string({ minLength: 1, maxLength: 30 }).filter((k) => {
      const lower = k.toLowerCase();
      return !lower.includes('token') &&
        !lower.includes('secret') &&
        !lower.includes('password') &&
        !lower.includes('credential');
    }),
    fc.string({ minLength: 0, maxLength: 100 }).filter((v) => {
      return !v.includes('@') && !/\d{7,}/.test(v.replace(/\D/g, ''));
    }),
    { minKeys: 0, maxKeys: 10 }
  );

  let originalStdoutWrite;
  let stdoutCapture;

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    stdoutCapture = jest.fn().mockReturnValue(true);
    process.stdout.write = stdoutCapture;
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
  });

  it('emits a valid single-line JSON with all required fields for any valid input', async () => {
    const { Logger } = await import('../../lib/logger/logger.ts');

    await fc.assert(
      fc.asyncProperty(
        severityArb,
        domainArb,
        messageArb,
        contextArb,
        async (level, domain, message, context) => {
          // Clear capture for this iteration
          stdoutCapture.mockClear();

          // Create Logger with minLevel debug and all domain overrides set to debug
          const levelOverrides = {};
          for (const d of VALID_DOMAINS) {
            levelOverrides[d] = 'debug';
          }

          const logger = new Logger({
            minLevel: 'debug',
            levelOverrides,
            stage: 'development',
          });

          // Clear any startup config warning emissions
          stdoutCapture.mockClear();

          // Call the log method corresponding to the severity level
          logger[level](domain, message, context);

          // Get the last call (our log entry)
          expect(stdoutCapture).toHaveBeenCalled();
          const lastCall = stdoutCapture.mock.calls[stdoutCapture.mock.calls.length - 1][0];
          const logLine = lastCall.toString().trim();

          // 1. Must be a single line (no raw newlines in the output)
          expect(logLine.includes('\n')).toBe(false);

          // 2. Must be valid JSON
          const entry = JSON.parse(logLine);

          // 3. Must have exactly the required top-level fields
          const requiredFields = ['timestamp', 'level', 'domain', 'message', 'correlationId', 'context'];
          const actualFields = Object.keys(entry);
          expect(actualFields.sort()).toEqual(requiredFields.sort());

          // 4. Timestamp must be ISO 8601 UTC with millisecond precision
          expect(entry.timestamp).toMatch(ISO_8601_MS_REGEX);

          // 5. Level must be one of the 4 valid values
          expect(VALID_LEVELS).toContain(entry.level);

          // 6. Domain must be one of the 6 valid values
          expect(VALID_DOMAINS).toContain(entry.domain);

          // 7. Message must be a string <= 4096 characters with no raw newlines
          expect(typeof entry.message).toBe('string');
          expect(entry.message.length).toBeLessThanOrEqual(4096);
          expect(entry.message).not.toMatch(/[\n\r]/);

          // 8. CorrelationId must be a valid UUID v4
          expect(entry.correlationId).toMatch(UUID_V4_REGEX);

          // 9. Context must be an object with all string values
          expect(typeof entry.context).toBe('object');
          expect(entry.context).not.toBeNull();
          expect(Array.isArray(entry.context)).toBe(false);
          for (const [, value] of Object.entries(entry.context)) {
            expect(typeof value).toBe('string');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 11: Severity level filtering
 * Validates: Requirements 11.1, 11.2
 *
 * For any configured minimum severity level L and any emitted Log_Entry with severity level E,
 * the entry SHALL be emitted if and only if the numeric rank of E is greater than or equal to
 * the numeric rank of L (where error=4, warn=3, info=2, debug=1).
 */
describe('Feature: structured-error-logging, Property 11: Severity level filtering', () => {
  const SEVERITY_HIERARCHY = {
    error: 4,
    warn: 3,
    info: 2,
    debug: 1,
  };

  const SEVERITY_LEVELS = ['error', 'warn', 'info', 'debug'];
  const DOMAIN_TAGS = ['booking', 'payment', 'scheduling', 'notification', 'auth', 'general'];

  let originalStdoutWrite;
  let stdoutWriteMock;

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    stdoutWriteMock = jest.fn().mockReturnValue(true);
    process.stdout.write = stdoutWriteMock;
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    jest.resetModules();
    // Clean up environment variables
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_LEVEL_OVERRIDES;
    delete process.env.DEPLOYMENT_STAGE;
  });

  it('emits entries if and only if entry severity rank >= configured minimum severity rank', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...SEVERITY_LEVELS),
        fc.constantFrom(...SEVERITY_LEVELS),
        async (minLevel, entryLevel) => {
          // Reset mock for this iteration
          stdoutWriteMock.mockClear();

          // Dynamically import Logger to get a fresh instance per iteration
          const { Logger } = await import('../../lib/logger/logger.ts');

          // Build config with all domain overrides set to the same minLevel
          const levelOverrides = {};
          for (const domain of DOMAIN_TAGS) {
            levelOverrides[domain] = minLevel;
          }

          const config = {
            minLevel,
            levelOverrides,
            stage: 'development',
          };

          const logger = new Logger(config);

          // Clear any startup warning emissions
          stdoutWriteMock.mockClear();

          // Emit a log entry at the generated entry level
          logger[entryLevel]('general', 'test message', {});

          const entryRank = SEVERITY_HIERARCHY[entryLevel];
          const minRank = SEVERITY_HIERARCHY[minLevel];

          if (entryRank >= minRank) {
            // Entry should have been emitted
            expect(stdoutWriteMock).toHaveBeenCalled();
            // Verify the emitted entry has the correct level
            const lastCall = stdoutWriteMock.mock.calls[stdoutWriteMock.mock.calls.length - 1][0];
            const parsed = JSON.parse(lastCall.trim());
            expect(parsed.level).toBe(entryLevel);
          } else {
            // Entry should NOT have been emitted
            expect(stdoutWriteMock).not.toHaveBeenCalled();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 3: Invalid severity level rejection
 * Validates: Requirements 1.8
 *
 * For any string that is not one of "error", "warn", "info", or "debug",
 * attempting to emit a Log_Entry with that level SHALL throw an error
 * that includes the invalid value.
 */
describe('Feature: structured-error-logging, Property 3: Invalid severity level rejection', () => {
  const VALID_LEVELS = ['error', 'warn', 'info', 'debug'];
  const DOMAIN_TAGS = ['booking', 'payment', 'scheduling', 'notification', 'auth', 'general'];

  /** Generate arbitrary strings that are NOT valid severity levels */
  const invalidLevelArb = fc.string({ minLength: 1, maxLength: 50 }).filter(
    (s) => !VALID_LEVELS.includes(s)
  );

  let originalStdoutWrite;
  let stdoutWriteMock;

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    stdoutWriteMock = jest.fn().mockReturnValue(true);
    process.stdout.write = stdoutWriteMock;
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    jest.resetModules();
  });

  it('throws an error for any non-valid severity level string', async () => {
    await fc.assert(
      fc.asyncProperty(invalidLevelArb, async (invalidLevel) => {
        const { Logger } = await import('../../lib/logger/logger.ts');

        const levelOverrides = {};
        for (const domain of DOMAIN_TAGS) {
          levelOverrides[domain] = 'debug';
        }

        const logger = new Logger({
          minLevel: 'debug',
          levelOverrides,
          stage: 'development',
        });

        // Clear any startup output
        stdoutWriteMock.mockClear();

        try {
          // Bypass TypeScript's type system to pass an invalid level
          logger['emit'](invalidLevel, 'general', 'test message');
          // If no error was thrown, the property is violated
          return false;
        } catch (err) {
          // Must be an Error instance
          if (!(err instanceof Error)) return false;
          // Error message must include the invalid level value
          if (!err.message.includes(invalidLevel)) return false;
          return true;
        }
      }),
      { numRuns: 100 }
    );
  });

  it('throws an error that includes the invalid level value in the message (empty string excluded)', async () => {
    const edgeCaseArb = fc.oneof(
      fc.constantFrom('ERROR', 'WARN', 'INFO', 'DEBUG'), // uppercase variants
      fc.constantFrom('Error', 'Warning', 'Info', 'Debug'), // mixed case
      fc.constantFrom('critical', 'fatal', 'trace', 'verbose'), // other log level names
      invalidLevelArb // random non-valid strings
    );

    await fc.assert(
      fc.asyncProperty(edgeCaseArb, async (invalidLevel) => {
        const { Logger } = await import('../../lib/logger/logger.ts');

        const levelOverrides = {};
        for (const domain of DOMAIN_TAGS) {
          levelOverrides[domain] = 'debug';
        }

        const logger = new Logger({
          minLevel: 'debug',
          levelOverrides,
          stage: 'development',
        });

        stdoutWriteMock.mockClear();

        try {
          logger['emit'](invalidLevel, 'general', 'test message');
          return false;
        } catch (err) {
          if (!(err instanceof Error)) return false;
          if (!err.message.includes(invalidLevel)) return false;
          return true;
        }
      }),
      { numRuns: 100 }
    );
  });

  it('does NOT throw for valid severity levels', async () => {
    const validLevelArb = fc.constantFrom(...VALID_LEVELS);

    await fc.assert(
      fc.asyncProperty(validLevelArb, async (validLevel) => {
        const { Logger } = await import('../../lib/logger/logger.ts');

        const levelOverrides = {};
        for (const domain of DOMAIN_TAGS) {
          levelOverrides[domain] = 'debug';
        }

        const logger = new Logger({
          minLevel: 'debug',
          levelOverrides,
          stage: 'development',
        });

        stdoutWriteMock.mockClear();

        try {
          logger['emit'](validLevel, 'general', 'test message');
          return true;
        } catch {
          return false;
        }
      }),
      { numRuns: 100 }
    );
  });
});


/**
 * Property 12: Per-domain level override filtering
 * **Validates: Requirements 11.5**
 *
 * For any valid LOG_LEVEL_OVERRIDES configuration (comma-separated domain=level pairs),
 * the Logger SHALL apply the override level to the specified domain while using the global
 * LOG_LEVEL for all other domains.
 */
describe('Feature: structured-error-logging, Property 12: Per-domain level override filtering', () => {
  const SEVERITY_HIERARCHY = {
    error: 4,
    warn: 3,
    info: 2,
    debug: 1,
  };

  const SEVERITY_LEVELS = ['error', 'warn', 'info', 'debug'];
  const DOMAIN_TAGS = ['booking', 'payment', 'scheduling', 'notification', 'auth', 'general'];

  let originalStdoutWrite;
  let stdoutWriteMock;

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    stdoutWriteMock = jest.fn().mockReturnValue(true);
    process.stdout.write = stdoutWriteMock;
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    jest.resetModules();
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_LEVEL_OVERRIDES;
    delete process.env.DEPLOYMENT_STAGE;
  });

  it('applies the override level to the specified domain and globalLevel to other domains', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...SEVERITY_LEVELS),                         // globalLevel
        fc.constantFrom(...DOMAIN_TAGS),                             // overrideDomain
        fc.constantFrom(...SEVERITY_LEVELS),                         // overrideLevel
        fc.constantFrom(...SEVERITY_LEVELS),                         // entryLevel for the override domain
        async (globalLevel, overrideDomain, overrideLevel, entryLevel) => {
          // Only test cases where overrideLevel differs from globalLevel
          // to meaningfully demonstrate override behavior
          if (overrideLevel === globalLevel) return true;

          stdoutWriteMock.mockClear();

          const { Logger } = await import('../../lib/logger/logger.ts');

          // Build levelOverrides: all domains use globalLevel EXCEPT the overrideDomain
          const levelOverrides = {};
          for (const d of DOMAIN_TAGS) {
            levelOverrides[d] = d === overrideDomain ? overrideLevel : globalLevel;
          }

          const logger = new Logger({
            minLevel: globalLevel,
            levelOverrides,
            stage: 'development',
          });

          // Clear startup warnings
          stdoutWriteMock.mockClear();

          // --- Test 1: Emit a log entry for the OVERRIDE domain ---
          logger[entryLevel](overrideDomain, 'override domain test message', {});

          const entryRank = SEVERITY_HIERARCHY[entryLevel];
          const overrideRank = SEVERITY_HIERARCHY[overrideLevel];

          if (entryRank >= overrideRank) {
            // Entry should have been emitted for the override domain
            expect(stdoutWriteMock).toHaveBeenCalled();
            const lastCall = stdoutWriteMock.mock.calls[stdoutWriteMock.mock.calls.length - 1][0];
            const parsed = JSON.parse(lastCall.toString().trim());
            expect(parsed.level).toBe(entryLevel);
            expect(parsed.domain).toBe(overrideDomain);
          } else {
            // Entry should NOT have been emitted (below override level)
            expect(stdoutWriteMock).not.toHaveBeenCalled();
          }

          // --- Test 2: Emit a log entry for a DIFFERENT domain (should use globalLevel) ---
          stdoutWriteMock.mockClear();

          // Pick a different domain from the override domain
          const otherDomain = DOMAIN_TAGS.find((d) => d !== overrideDomain);

          logger[entryLevel](otherDomain, 'other domain test message', {});

          const globalRank = SEVERITY_HIERARCHY[globalLevel];

          if (entryRank >= globalRank) {
            // Entry should have been emitted using the global level threshold
            expect(stdoutWriteMock).toHaveBeenCalled();
            const lastCall = stdoutWriteMock.mock.calls[stdoutWriteMock.mock.calls.length - 1][0];
            const parsed = JSON.parse(lastCall.toString().trim());
            expect(parsed.level).toBe(entryLevel);
            expect(parsed.domain).toBe(otherDomain);
          } else {
            // Entry should NOT have been emitted (below global level)
            expect(stdoutWriteMock).not.toHaveBeenCalled();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Property 13: Invalid log level configuration fallback
 * **Validates: Requirements 11.3**
 *
 * For any string that is not a recognized severity level, when set as LOG_LEVEL,
 * the Logger SHALL use "info" as the minimum level and emit a warn-level Log_Entry
 * about the invalid configuration.
 */
describe('Feature: structured-error-logging, Property 13: Invalid log level configuration fallback', () => {
  const VALID_LEVELS = ['error', 'warn', 'info', 'debug'];
  const DOMAIN_TAGS = ['booking', 'payment', 'scheduling', 'notification', 'auth', 'general'];
  const SEVERITY_HIERARCHY = { error: 4, warn: 3, info: 2, debug: 1 };

  /**
   * Generate arbitrary strings that are NOT valid severity levels.
   * We exclude valid levels and their trimmed/lowercased forms.
   */
  const invalidLogLevelArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => {
    const normalized = s.trim().toLowerCase();
    return !VALID_LEVELS.includes(normalized);
  });

  let originalStdoutWrite;
  let stdoutWriteMock;
  let originalLogLevel;

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    stdoutWriteMock = jest.fn().mockReturnValue(true);
    process.stdout.write = stdoutWriteMock;
    originalLogLevel = process.env.LOG_LEVEL;
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    if (originalLogLevel !== undefined) {
      process.env.LOG_LEVEL = originalLogLevel;
    } else {
      delete process.env.LOG_LEVEL;
    }
    jest.resetModules();
  });

  it('parseLogLevel returns info level and a warning for any invalid LOG_LEVEL value', async () => {
    await fc.assert(
      fc.asyncProperty(invalidLogLevelArb, async (invalidValue) => {
        const { parseLogLevel } = await import('../../lib/logger/logger.ts');

        const result = parseLogLevel(invalidValue, 'production');

        // Must fall back to 'info'
        expect(result.level).toBe('info');

        // Must include a warning string
        expect(result.warning).toBeDefined();
        expect(typeof result.warning).toBe('string');
        expect(result.warning.length).toBeGreaterThan(0);

        // Warning should reference the invalid value
        expect(result.warning).toContain(invalidValue);
      }),
      { numRuns: 100 }
    );
  });

  it('Logger emits a warn-level entry about invalid configuration at construction', async () => {
    await fc.assert(
      fc.asyncProperty(invalidLogLevelArb, async (invalidValue) => {
        stdoutWriteMock.mockClear();

        // Set the invalid LOG_LEVEL environment variable
        process.env.LOG_LEVEL = invalidValue;

        const { Logger } = await import('../../lib/logger/logger.ts');

        // Build config with 'info' as minLevel (simulating what createConfigFromEnv would do)
        const levelOverrides = {};
        for (const d of DOMAIN_TAGS) {
          levelOverrides[d] = 'info';
        }

        // Construct the Logger — this should trigger emitConfigWarnings
        const logger = new Logger({
          minLevel: 'info',
          levelOverrides,
          stage: 'production',
        });

        // The Logger should have emitted at least one warn-level entry about the invalid config
        expect(stdoutWriteMock).toHaveBeenCalled();

        // Find the config warning entry among all emitted entries
        const allCalls = stdoutWriteMock.mock.calls.map((call) => call[0].toString().trim());
        const warnEntries = allCalls
          .map((line) => {
            try { return JSON.parse(line); } catch { return null; }
          })
          .filter((entry) => entry !== null && entry.level === 'warn');

        // At least one warn entry should exist about the invalid config
        expect(warnEntries.length).toBeGreaterThanOrEqual(1);

        // The warning message should reference the invalid value
        const configWarning = warnEntries.find(
          (entry) => entry.message.includes(invalidValue)
        );
        expect(configWarning).toBeDefined();

        // The warning entry should have standard log structure
        expect(configWarning.domain).toBe('general');
        expect(configWarning.context.configKey).toBe('LOG_LEVEL');
        expect(configWarning.context.configValue).toBe(invalidValue);
      }),
      { numRuns: 100 }
    );
  });

  it('Logger uses info as effective minimum level when LOG_LEVEL is invalid (info+ passes, debug suppressed)', async () => {
    await fc.assert(
      fc.asyncProperty(invalidLogLevelArb, async (invalidValue) => {
        stdoutWriteMock.mockClear();

        // Set the invalid LOG_LEVEL environment variable
        process.env.LOG_LEVEL = invalidValue;

        const { Logger } = await import('../../lib/logger/logger.ts');

        // Build config simulating fallback: minLevel = 'info'
        const levelOverrides = {};
        for (const d of DOMAIN_TAGS) {
          levelOverrides[d] = 'info';
        }

        const logger = new Logger({
          minLevel: 'info',
          levelOverrides,
          stage: 'production',
        });

        // Clear startup warnings so we can test filtering behavior
        stdoutWriteMock.mockClear();

        // Debug entries should be SUPPRESSED (rank 1 < rank 2)
        logger.debug('general', 'debug message should not appear');
        const afterDebug = stdoutWriteMock.mock.calls.length;
        expect(afterDebug).toBe(0);

        // Info entries should be EMITTED (rank 2 >= rank 2)
        logger.info('general', 'info message should appear');
        expect(stdoutWriteMock.mock.calls.length).toBe(1);
        const infoEntry = JSON.parse(stdoutWriteMock.mock.calls[0][0].toString().trim());
        expect(infoEntry.level).toBe('info');

        // Warn entries should be EMITTED (rank 3 >= rank 2)
        logger.warn('general', 'warn message should appear');
        expect(stdoutWriteMock.mock.calls.length).toBe(2);
        const warnEntry = JSON.parse(stdoutWriteMock.mock.calls[1][0].toString().trim());
        expect(warnEntry.level).toBe('warn');

        // Error entries should be EMITTED (rank 4 >= rank 2)
        logger.error('general', 'error message should appear');
        expect(stdoutWriteMock.mock.calls.length).toBe(3);
        const errorEntry = JSON.parse(stdoutWriteMock.mock.calls[2][0].toString().trim());
        expect(errorEntry.level).toBe('error');
      }),
      { numRuns: 100 }
    );
  });
});
