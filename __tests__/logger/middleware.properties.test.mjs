/**
 * Property-Based Tests for Error Logging Middleware
 *
 * Feature: structured-error-logging
 * Library: fast-check
 */

import { jest } from '@jest/globals';
import * as fc from 'fast-check';
import { inferDomain, extractCorrelationId, withErrorLogging } from '../../lib/logger/middleware.ts';

/**
 * Property 7: Route path to domain inference
 *
 * For any API route path, the `inferDomain` function SHALL return the correct
 * DomainTag according to the mapping table (payment for /api/payment/* and
 * /api/square/*, booking for /api/appointments/*, /api/booking-blackout/*,
 * /api/availability/*, /api/available-dates/*, /api/eligible-staff/*,
 * scheduling for /api/staff-schedules/* and /api/staff/*, notification for
 * /api/send-sms/*, and general for all unmatched paths).
 *
 * **Validates: Requirements 5.2, 5.3**
 */
describe('Feature: structured-error-logging, Property 7: Route path to domain inference', () => {
  /**
   * Known prefix-to-domain mapping table.
   * Order matches the DOMAIN_ROUTE_MAPPINGS in constants.ts.
   */
  const DOMAIN_MAPPINGS = [
    { prefix: '/api/payment/', domain: 'payment' },
    { prefix: '/api/square/', domain: 'payment' },
    { prefix: '/api/appointments/', domain: 'booking' },
    { prefix: '/api/booking-blackout/', domain: 'booking' },
    { prefix: '/api/availability/', domain: 'booking' },
    { prefix: '/api/available-dates/', domain: 'booking' },
    { prefix: '/api/eligible-staff/', domain: 'booking' },
    { prefix: '/api/staff-schedules/', domain: 'scheduling' },
    { prefix: '/api/staff/', domain: 'scheduling' },
    { prefix: '/api/send-sms/', domain: 'notification' },
  ];

  const ALL_KNOWN_PREFIXES = DOMAIN_MAPPINGS.map((m) => m.prefix);

  /**
   * Arbitrary for a random path suffix (simulates sub-routes, IDs, nested paths).
   * Generates URL-safe path segments.
   */
  const pathSuffixArb = fc.array(
    fc.stringOf(
      fc.constantFrom(
        ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'.split('')
      ),
      { minLength: 1, maxLength: 20 }
    ),
    { minKeys: 0, maxLength: 4 }
  ).map((segments) => segments.join('/'));

  it('returns correct domain for any path starting with a known prefix + random suffix', () => {
    // For each known prefix, generate random suffixes and verify the mapping
    const mappingArb = fc.constantFrom(...DOMAIN_MAPPINGS);

    fc.assert(
      fc.property(mappingArb, pathSuffixArb, (mapping, suffix) => {
        const fullPath = mapping.prefix + suffix;
        const result = inferDomain(fullPath);
        expect(result).toBe(mapping.domain);
      }),
      { numRuns: 100 }
    );
  });

  it('returns "general" for any path that does NOT start with a known prefix', () => {
    /**
     * Generate random paths that don't start with any known prefix.
     * Strategy: generate paths that begin with segments NOT in the mapping table.
     */
    const unmatchedPrefixArb = fc.oneof(
      // Paths starting with /api/ but with an unknown segment
      fc.stringOf(
        fc.constantFrom(
          ...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')
        ),
        { minLength: 1, maxLength: 20 }
      ).filter((segment) => {
        // Ensure it doesn't collide with any known prefix after /api/
        const testPath = `/api/${segment}/`;
        return !ALL_KNOWN_PREFIXES.some((p) => testPath.startsWith(p));
      }).map((segment) => `/api/${segment}/something`),

      // Paths not starting with /api/ at all
      fc.stringOf(
        fc.constantFrom(
          ...'abcdefghijklmnopqrstuvwxyz0123456789/-_'.split('')
        ),
        { minLength: 1, maxLength: 50 }
      ).filter((path) => {
        const testPath = path.startsWith('/') ? path : '/' + path;
        return !ALL_KNOWN_PREFIXES.some((p) => testPath.startsWith(p));
      }).map((path) => path.startsWith('/') ? path : '/' + path),

      // Root and common non-API paths
      fc.constantFrom(
        '/',
        '/dashboard',
        '/login',
        '/api',
        '/api/',
        '/about',
        '/settings/profile',
        '/admin/users',
        '/health',
        '/api/health',
        '/api/unknown-route/test'
      )
    );

    fc.assert(
      fc.property(unmatchedPrefixArb, (path) => {
        const result = inferDomain(path);
        expect(result).toBe('general');
      }),
      { numRuns: 100 }
    );
  });

  it('correctly handles exact prefix matches (prefix itself without additional path)', () => {
    // The prefixes end with '/' so the prefix alone is a valid match
    const prefixArb = fc.constantFrom(...ALL_KNOWN_PREFIXES);

    fc.assert(
      fc.property(prefixArb, (prefix) => {
        const expectedDomain = DOMAIN_MAPPINGS.find((m) => m.prefix === prefix).domain;
        const result = inferDomain(prefix);
        expect(result).toBe(expectedDomain);
      }),
      { numRuns: 100 }
    );
  });

  it('correctly handles nested paths beyond the prefix', () => {
    // Generate deeply nested paths under known prefixes
    const nestedPathArb = fc.tuple(
      fc.constantFrom(...DOMAIN_MAPPINGS),
      fc.array(
        fc.stringOf(
          fc.constantFrom(
            ...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')
          ),
          { minLength: 1, maxLength: 15 }
        ),
        { minLength: 2, maxLength: 6 }
      )
    ).map(([mapping, segments]) => ({
      path: mapping.prefix + segments.join('/'),
      expectedDomain: mapping.domain,
    }));

    fc.assert(
      fc.property(nestedPathArb, ({ path, expectedDomain }) => {
        const result = inferDomain(path);
        expect(result).toBe(expectedDomain);
      }),
      { numRuns: 100 }
    );
  });

  it('prioritizes /api/staff-schedules/ over /api/staff/ for paths starting with staff-schedules', () => {
    /**
     * Since /api/staff/ is a prefix of /api/staff-schedules/, order matters.
     * /api/staff-schedules/ must be checked before /api/staff/ in the mapping.
     * This property ensures that paths under staff-schedules get "scheduling"
     * and not accidentally matched by /api/staff/.
     */
    fc.assert(
      fc.property(pathSuffixArb, (suffix) => {
        const staffSchedulesPath = '/api/staff-schedules/' + suffix;
        const result = inferDomain(staffSchedulesPath);
        expect(result).toBe('scheduling');
      }),
      { numRuns: 100 }
    );
  });
});


/**
 * Property 5: Correlation ID consistency within a request
 *
 * For any API request processed through the middleware, all Log_Entries emitted
 * during that request SHALL share the same correlationId, and that correlationId
 * SHALL be a valid UUID v4, and that same value SHALL appear in the response
 * X-Correlation-ID header.
 *
 * **Validates: Requirements 3.1, 3.2, 3.5**
 */
describe('Feature: structured-error-logging, Property 5: Correlation ID consistency within a request', () => {
  const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  // Valid HTTP methods for generating requests
  const httpMethodArb = fc.constantFrom('GET', 'POST', 'PUT', 'PATCH', 'DELETE');

  // Generate random API paths (some matching known domains, some not)
  const pathSegmentArb = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')),
    { minLength: 1, maxLength: 20 }
  );

  const pathArb = fc.tuple(
    fc.constantFrom(
      '/api/payment/',
      '/api/square/',
      '/api/appointments/',
      '/api/booking-blackout/',
      '/api/availability/',
      '/api/available-dates/',
      '/api/eligible-staff/',
      '/api/staff-schedules/',
      '/api/staff/',
      '/api/send-sms/',
      '/api/unknown/',
      '/api/'
    ),
    pathSegmentArb
  ).map(([prefix, segment]) => `${prefix}${segment}`);

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

  it('all log entries emitted during a request share the same correlationId which is a valid UUID v4 and matches the response header', async () => {
    await fc.assert(
      fc.asyncProperty(
        httpMethodArb,
        pathArb,
        async (method, path) => {
          // Clear captures for this iteration
          stdoutCapture.mockClear();

          // Create a handler that throws to trigger error logging
          const handler = async () => {
            throw new Error('Test error for property validation');
          };

          const wrapped = withErrorLogging(handler);

          const url = `http://localhost${path}`;
          const request = new Request(url, { method });

          // Invoke the wrapped handler
          const response = await wrapped(request);

          // Collect all log entries emitted during this request
          const logEntries = stdoutCapture.mock.calls
            .map((call) => {
              try {
                return JSON.parse(call[0].toString().trim());
              } catch {
                return null;
              }
            })
            .filter((entry) => entry !== null);

          // There should be at least one log entry (the error log)
          expect(logEntries.length).toBeGreaterThanOrEqual(1);

          // Extract all correlationIds from the log entries
          const correlationIds = logEntries.map((entry) => entry.correlationId);

          // Assert: all entries share the same correlationId
          const uniqueIds = [...new Set(correlationIds)];
          expect(uniqueIds.length).toBe(1);

          const correlationId = uniqueIds[0];

          // Assert: the correlationId is a valid UUID v4
          expect(correlationId).toMatch(UUID_V4_REGEX);

          // Assert: the response X-Correlation-ID header matches the correlationId from the logs
          const responseCorrelationId = response.headers.get('X-Correlation-ID');
          expect(responseCorrelationId).toBe(correlationId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('correlation ID in response header is valid UUID v4 for both successful and error responses', async () => {
    await fc.assert(
      fc.asyncProperty(
        httpMethodArb,
        pathArb,
        fc.boolean(),
        async (method, path, shouldThrow) => {
          stdoutCapture.mockClear();

          const handler = shouldThrow
            ? async () => { throw new Error('Simulated failure'); }
            : async () => new Response(JSON.stringify({ ok: true }), { status: 200 });

          const wrapped = withErrorLogging(handler);

          const url = `http://localhost${path}`;
          const request = new Request(url, { method });

          const response = await wrapped(request);

          // Response must always have X-Correlation-ID header
          const responseCorrelationId = response.headers.get('X-Correlation-ID');
          expect(responseCorrelationId).toBeTruthy();

          // The correlationId must always be a valid UUID v4
          expect(responseCorrelationId).toMatch(UUID_V4_REGEX);

          // If error occurred, all log entries must share the same correlationId as the header
          if (shouldThrow) {
            const logEntries = stdoutCapture.mock.calls
              .map((call) => {
                try {
                  return JSON.parse(call[0].toString().trim());
                } catch {
                  return null;
                }
              })
              .filter((entry) => entry !== null);

            expect(logEntries.length).toBeGreaterThanOrEqual(1);

            for (const entry of logEntries) {
              expect(entry.correlationId).toBe(responseCorrelationId);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


/** UUID v4 validation regex */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Property 6: Correlation ID header pass-through
 *
 * For any request containing an X-Correlation-ID header with a valid UUID v4 value,
 * the Logger SHALL use that exact value as the correlationId.
 * For any request containing an X-Correlation-ID header with an invalid (non-UUID v4) value,
 * the Logger SHALL generate a new valid UUID v4 correlationId and store the original invalid
 * value in context under the key "originalCorrelationId".
 *
 * **Validates: Requirements 3.3, 3.4**
 */
describe('Feature: structured-error-logging, Property 6: Correlation ID header pass-through', () => {
  /**
   * Arbitrary that generates valid UUID v4 strings.
   * UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
   * where y is one of [8, 9, a, b]
   */
  const validUuidV4Arb = fc.tuple(
    fc.hexaString({ minLength: 8, maxLength: 8 }),
    fc.hexaString({ minLength: 4, maxLength: 4 }),
    fc.hexaString({ minLength: 3, maxLength: 3 }),
    fc.constantFrom('8', '9', 'a', 'b'),
    fc.hexaString({ minLength: 3, maxLength: 3 }),
    fc.hexaString({ minLength: 12, maxLength: 12 })
  ).map(([p1, p2, p3, variant, p4, p5]) => `${p1}-${p2}-4${p3}-${variant}${p4}-${p5}`);

  /**
   * Arbitrary that generates strings which are NOT valid UUID v4.
   * Filters out whitespace-only strings because the Fetch Headers API
   * trims header values, making whitespace-only effectively "no header".
   * Includes various invalid patterns:
   * - Random strings
   * - UUID-like but wrong version digit
   * - UUID-like but wrong variant
   * - Short/partial values
   */
  const invalidUuidArb = fc.oneof(
    // Random non-UUID strings
    fc.string({ minLength: 1, maxLength: 100 }).filter(s => !UUID_V4_REGEX.test(s) && s.trim().length > 0),
    // UUID-like with wrong version digit (not 4)
    fc.tuple(
      fc.hexaString({ minLength: 8, maxLength: 8 }),
      fc.hexaString({ minLength: 4, maxLength: 4 }),
      fc.constantFrom('1', '2', '3', '5', '6', '7', '8', '9', '0', 'a', 'b', 'c', 'd', 'e', 'f'),
      fc.hexaString({ minLength: 3, maxLength: 3 }),
      fc.constantFrom('8', '9', 'a', 'b'),
      fc.hexaString({ minLength: 3, maxLength: 3 }),
      fc.hexaString({ minLength: 12, maxLength: 12 })
    ).map(([p1, p2, ver, p3, variant, p4, p5]) => `${p1}-${p2}-${ver}${p3}-${variant}${p4}-${p5}`),
    // UUID-like with wrong variant digit (not 8, 9, a, b)
    fc.tuple(
      fc.hexaString({ minLength: 8, maxLength: 8 }),
      fc.hexaString({ minLength: 4, maxLength: 4 }),
      fc.hexaString({ minLength: 3, maxLength: 3 }),
      fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', 'c', 'd', 'e', 'f'),
      fc.hexaString({ minLength: 3, maxLength: 3 }),
      fc.hexaString({ minLength: 12, maxLength: 12 })
    ).map(([p1, p2, p3, variant, p4, p5]) => `${p1}-${p2}-4${p3}-${variant}${p4}-${p5}`),
    // Short strings that look nothing like a UUID
    fc.constantFrom('abc', '123', 'not-a-uuid', 'hello-world', '---', 'INVALID')
  ).filter(s => !UUID_V4_REGEX.test(s) && s.trim().length > 0);

  it('uses the exact header value as correlationId when X-Correlation-ID is a valid UUID v4', () => {
    fc.assert(
      fc.property(validUuidV4Arb, (validUuid) => {
        const request = new Request('http://localhost/api/test', {
          headers: { 'X-Correlation-ID': validUuid },
        });

        const result = extractCorrelationId(request);

        // The correlationId must be the exact provided value
        expect(result.correlationId).toBe(validUuid);

        // No originalCorrelationId should be set (header was valid)
        expect(result.originalCorrelationId).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it('generates a new valid UUID v4 and stores original when X-Correlation-ID is invalid', () => {
    fc.assert(
      fc.property(invalidUuidArb, (invalidValue) => {
        const request = new Request('http://localhost/api/test', {
          headers: { 'X-Correlation-ID': invalidValue },
        });

        const result = extractCorrelationId(request);

        // Get the value as normalized by the Headers API (which trims whitespace)
        const normalizedValue = request.headers.get('X-Correlation-ID');

        // The correlationId must be a valid UUID v4 (newly generated)
        expect(result.correlationId).toMatch(UUID_V4_REGEX);

        // The correlationId must NOT be the invalid original value
        expect(result.correlationId).not.toBe(normalizedValue);

        // The original invalid value must be stored in originalCorrelationId
        expect(result.originalCorrelationId).toBe(normalizedValue);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Arbitrary for non-empty invalid UUIDs that survive HTTP header normalization.
   * The Fetch/Headers API trims whitespace from header values, so whitespace-only
   * strings become empty (treated as "no header"). We filter those out.
   */
  const nonEmptyInvalidUuidArb = fc.oneof(
    // Random non-UUID strings with at least one non-whitespace char
    fc.string({ minLength: 1, maxLength: 100 }).filter(s => !UUID_V4_REGEX.test(s) && s.trim().length > 0),
    // UUID-like with wrong version digit
    fc.tuple(
      fc.hexaString({ minLength: 8, maxLength: 8 }),
      fc.hexaString({ minLength: 4, maxLength: 4 }),
      fc.constantFrom('1', '2', '3', '5', '6', '7', '8', '9', '0', 'a', 'b', 'c', 'd', 'e', 'f'),
      fc.hexaString({ minLength: 3, maxLength: 3 }),
      fc.constantFrom('8', '9', 'a', 'b'),
      fc.hexaString({ minLength: 3, maxLength: 3 }),
      fc.hexaString({ minLength: 12, maxLength: 12 })
    ).map(([p1, p2, ver, p3, variant, p4, p5]) => `${p1}-${p2}-${ver}${p3}-${variant}${p4}-${p5}`),
    // Short non-whitespace strings
    fc.constantFrom('abc', '123', 'not-a-uuid', 'hello-world', '---', 'INVALID')
  ).filter(s => !UUID_V4_REGEX.test(s) && s.trim().length > 0);

  it('generated correlationId for invalid headers is always a fresh UUID v4', () => {
    fc.assert(
      fc.property(nonEmptyInvalidUuidArb, (invalidValue) => {
        const request1 = new Request('http://localhost/api/test', {
          headers: { 'X-Correlation-ID': invalidValue },
        });
        const request2 = new Request('http://localhost/api/test', {
          headers: { 'X-Correlation-ID': invalidValue },
        });

        const result1 = extractCorrelationId(request1);
        const result2 = extractCorrelationId(request2);

        // Both should be valid UUID v4
        expect(result1.correlationId).toMatch(UUID_V4_REGEX);
        expect(result2.correlationId).toMatch(UUID_V4_REGEX);

        // Both should store the original invalid value (as normalized by Headers API)
        const normalizedValue = new Request('http://localhost', {
          headers: { 'X-Correlation-ID': invalidValue },
        }).headers.get('X-Correlation-ID');

        expect(result1.originalCorrelationId).toBe(normalizedValue);
        expect(result2.originalCorrelationId).toBe(normalizedValue);
      }),
      { numRuns: 100 }
    );
  });
});
