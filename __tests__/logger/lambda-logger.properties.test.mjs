/**
 * Property-Based Tests for LambdaLogger
 *
 * Feature: structured-error-logging
 * Library: fast-check
 */

import { jest } from '@jest/globals';
import * as fc from 'fast-check';
import { LambdaLogger } from '../../lib/logger/lambda-logger.ts';

/**
 * Property 17: Lambda logger format consistency
 *
 * For any log entry emitted by the LambdaLogger, the output SHALL be a valid
 * single-line JSON object in the same format as the main Logger (matching Property 1),
 * with the AWS request ID used as the correlationId.
 *
 * **Validates: Requirements 12.1, 12.3**
 */
describe('Feature: structured-error-logging, Property 17: Lambda logger format consistency', () => {
  const VALID_LEVELS = ['error', 'warn', 'info', 'debug'];
  const VALID_DOMAINS = ['booking', 'payment', 'scheduling', 'notification', 'auth', 'general'];

  // ISO 8601 UTC with millisecond precision
  const ISO_8601_MS_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  // Arbitrary for function names (safe strings, no sensitive patterns)
  const functionNameArb = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz-_0123456789'.split('')),
    { minLength: 1, maxLength: 50 }
  );

  // Arbitrary for AWS request IDs (UUID-like strings)
  const awsRequestIdArb = fc.uuid();

  // Arbitrary for severity levels
  const severityArb = fc.constantFrom(...VALID_LEVELS);

  // Arbitrary for messages (safe strings, no sensitive keys/emails/phones)
  const messageArb = fc.string({ minLength: 1, maxLength: 200 }).filter((s) => {
    return !s.includes('@') && !/\d{7,}/.test(s.replace(/\D/g, ''));
  });

  // Arbitrary for context objects with string values (avoid sensitive keys/PII)
  const contextArb = fc.dictionary(
    fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'.split('')),
      { minLength: 1, maxLength: 30 }
    ).filter((k) => {
      const lower = k.toLowerCase();
      return !lower.includes('token') &&
        !lower.includes('secret') &&
        !lower.includes('password') &&
        !lower.includes('credential');
    }),
    fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.'.split('')),
      { minLength: 0, maxLength: 100 }
    ).filter((v) => {
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

  it('emits valid single-line JSON with all required fields and correlationId === awsRequestId', () => {
    fc.assert(
      fc.property(
        functionNameArb,
        awsRequestIdArb,
        severityArb,
        messageArb,
        contextArb,
        (functionName, awsRequestId, level, message, context) => {
          // Clear captured output
          stdoutCapture.mockClear();

          // Create LambdaLogger with generated values
          const logger = new LambdaLogger(functionName, awsRequestId);

          // Call the logger method for the given severity level
          logger[level](message, context);

          // Verify stdout was written to
          expect(stdoutCapture).toHaveBeenCalled();

          const rawOutput = stdoutCapture.mock.calls[0][0];

          // Assert: output is a single line (ends with \n, no other newlines)
          expect(rawOutput.endsWith('\n')).toBe(true);
          const jsonLine = rawOutput.slice(0, -1);
          expect(jsonLine).not.toContain('\n');
          expect(jsonLine).not.toContain('\r');

          // Assert: output is valid JSON
          const entry = JSON.parse(jsonLine);

          // Assert: has all required fields
          expect(entry).toHaveProperty('timestamp');
          expect(entry).toHaveProperty('level');
          expect(entry).toHaveProperty('domain');
          expect(entry).toHaveProperty('message');
          expect(entry).toHaveProperty('correlationId');
          expect(entry).toHaveProperty('context');

          // Assert: timestamp is ISO 8601 UTC with ms precision
          expect(entry.timestamp).toMatch(ISO_8601_MS_REGEX);

          // Assert: level is a valid severity level
          expect(VALID_LEVELS).toContain(entry.level);
          expect(entry.level).toBe(level);

          // Assert: domain is "notification" (LambdaLogger always uses notification)
          expect(entry.domain).toBe('notification');
          expect(VALID_DOMAINS).toContain(entry.domain);

          // Assert: message is a string
          expect(typeof entry.message).toBe('string');

          // Assert: correlationId === the provided awsRequestId
          expect(entry.correlationId).toBe(awsRequestId);

          // Assert: context is an object with all string values
          expect(typeof entry.context).toBe('object');
          expect(entry.context).not.toBeNull();
          expect(Array.isArray(entry.context)).toBe(false);

          for (const [key, value] of Object.entries(entry.context)) {
            expect(typeof key).toBe('string');
            expect(typeof value).toBe('string');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('emits valid JSON even when no context is provided', () => {
    fc.assert(
      fc.property(
        functionNameArb,
        awsRequestIdArb,
        severityArb,
        messageArb,
        (functionName, awsRequestId, level, message) => {
          stdoutCapture.mockClear();

          const logger = new LambdaLogger(functionName, awsRequestId);
          logger[level](message);

          expect(stdoutCapture).toHaveBeenCalled();

          const rawOutput = stdoutCapture.mock.calls[0][0];
          const jsonLine = rawOutput.slice(0, -1);
          const entry = JSON.parse(jsonLine);

          // All structural invariants hold even without context
          expect(entry.timestamp).toMatch(ISO_8601_MS_REGEX);
          expect(VALID_LEVELS).toContain(entry.level);
          expect(entry.domain).toBe('notification');
          expect(entry.correlationId).toBe(awsRequestId);
          expect(typeof entry.context).toBe('object');
          expect(entry.context).not.toBeNull();

          for (const value of Object.values(entry.context)) {
            expect(typeof value).toBe('string');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('maintains format consistency across all severity levels for same input', () => {
    fc.assert(
      fc.property(
        functionNameArb,
        awsRequestIdArb,
        messageArb,
        contextArb,
        (functionName, awsRequestId, message, context) => {
          const logger = new LambdaLogger(functionName, awsRequestId);

          for (const level of VALID_LEVELS) {
            stdoutCapture.mockClear();

            logger[level](message, context);

            expect(stdoutCapture).toHaveBeenCalled();

            const rawOutput = stdoutCapture.mock.calls[0][0];
            const jsonLine = rawOutput.slice(0, -1);

            // Must be parseable JSON
            const entry = JSON.parse(jsonLine);

            // Structural invariants hold for every level
            expect(entry.timestamp).toMatch(ISO_8601_MS_REGEX);
            expect(entry.level).toBe(level);
            expect(entry.domain).toBe('notification');
            expect(entry.correlationId).toBe(awsRequestId);
            expect(typeof entry.context).toBe('object');
            expect(entry.context).not.toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
