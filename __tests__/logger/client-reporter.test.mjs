/**
 * Unit tests for ClientErrorReporter
 *
 * Tests rate limiting (max 10 per 60s window) and retry queue (max 5 FIFO).
 * Requirements: 6.4, 6.5
 */

import { jest } from '@jest/globals';
import { ClientErrorReporter } from '../../lib/logger/client-reporter.ts';

// Helper to create a valid payload
function makePayload(message = 'Test error') {
  return {
    message,
    url: 'https://example.com/page',
    userAgent: 'Mozilla/5.0 Test',
  };
}

describe('ClientErrorReporter', () => {
  let reporter;
  let fetchMock;

  beforeEach(() => {
    reporter = new ClientErrorReporter();
    // Mock global fetch
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('report() - basic functionality', () => {
    it('should POST payload to /api/log-client-error', async () => {
      const payload = makePayload();
      await reporter.report(payload);

      expect(fetchMock).toHaveBeenCalledWith('/api/log-client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    });

    it('should include optional fields in payload', async () => {
      const payload = {
        ...makePayload(),
        stack: 'Error: test\n  at foo.js:1:1',
        componentStack: '\n  in MyComponent',
      };
      await reporter.report(payload);

      expect(fetchMock).toHaveBeenCalledWith('/api/log-client-error', expect.objectContaining({
        body: JSON.stringify(payload),
      }));
    });
  });

  describe('report() - rate limiting', () => {
    it('should allow up to 10 reports within a 60-second window', async () => {
      for (let i = 0; i < 10; i++) {
        await reporter.report(makePayload(`Error ${i}`));
      }
      expect(fetchMock).toHaveBeenCalledTimes(10);
    });

    it('should silently discard reports beyond 10 in the same window', async () => {
      for (let i = 0; i < 15; i++) {
        await reporter.report(makePayload(`Error ${i}`));
      }
      // Only 10 actual fetch calls should be made
      expect(fetchMock).toHaveBeenCalledTimes(10);
    });

    it('should not throw or log when rate limited', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      for (let i = 0; i < 15; i++) {
        await reporter.report(makePayload(`Error ${i}`));
      }

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('should allow reports again after the window expires', async () => {
      // Use fake timers to control time
      jest.useFakeTimers();

      for (let i = 0; i < 10; i++) {
        await reporter.report(makePayload(`Error ${i}`));
      }
      expect(fetchMock).toHaveBeenCalledTimes(10);

      // Advance time past the 60-second window
      jest.advanceTimersByTime(60_001);

      await reporter.report(makePayload('After window'));
      expect(fetchMock).toHaveBeenCalledTimes(11);

      jest.useRealTimers();
    });
  });

  describe('report() - retry queue', () => {
    it('should queue failed payloads for retry', async () => {
      // First call fails
      fetchMock.mockResolvedValueOnce({ ok: false });
      await reporter.report(makePayload('Failed'));

      // Payload should be queued — next success should retry it
      fetchMock.mockResolvedValue({ ok: true });
      await reporter.report(makePayload('Success'));

      // 1 failed + 1 success + 1 retry of queued = 3 fetch calls
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('should hold up to 5 entries in the retry queue', async () => {
      // All calls fail
      fetchMock.mockResolvedValue({ ok: false });

      for (let i = 0; i < 7; i++) {
        await reporter.report(makePayload(`Error ${i}`));
      }

      // Now succeed — should retry at most 5 queued entries
      fetchMock.mockResolvedValue({ ok: true });
      await reporter.report(makePayload('Success trigger'));

      // 7 failed + 1 success + 5 retries = 13 calls total
      expect(fetchMock).toHaveBeenCalledTimes(13);
    });

    it('should discard oldest entries when queue exceeds 5 (FIFO)', async () => {
      // All calls fail
      fetchMock.mockResolvedValue({ ok: false });

      for (let i = 0; i < 7; i++) {
        await reporter.report(makePayload(`Error ${i}`));
      }

      // Now succeed
      fetchMock.mockResolvedValue({ ok: true });
      await reporter.report(makePayload('Trigger'));

      // The retry calls should be for Error 2-6 (oldest 0,1 discarded)
      // plus the new trigger payload
      const calls = fetchMock.mock.calls;
      const retryBodies = calls.slice(8).map((call) => JSON.parse(call[1].body));

      // The retried payloads should be Error 2 through Error 6
      const retriedMessages = retryBodies.map((b) => b.message);
      expect(retriedMessages).toContain('Error 2');
      expect(retriedMessages).toContain('Error 6');
      expect(retriedMessages).not.toContain('Error 0');
      expect(retriedMessages).not.toContain('Error 1');
    });

    it('should handle network errors gracefully without throwing', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(reporter.report(makePayload())).resolves.toBeUndefined();
    });

    it('should re-queue entries that fail again during flush', async () => {
      // First two calls fail
      fetchMock
        .mockResolvedValueOnce({ ok: false }) // initial report fails
        .mockResolvedValueOnce({ ok: true })  // second report succeeds
        .mockResolvedValueOnce({ ok: false }); // retry of first fails again

      await reporter.report(makePayload('Will fail'));
      await reporter.report(makePayload('Will succeed'));

      // The retry of 'Will fail' failed again, so it's re-queued
      // Next success should try it again
      fetchMock.mockResolvedValue({ ok: true });
      await reporter.report(makePayload('Third'));

      // Verify the originally failed entry was eventually retried
      const allBodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body).message);
      expect(allBodies.filter((m) => m === 'Will fail').length).toBeGreaterThanOrEqual(2);
    });
  });
});


/**
 * Property-Based Test: Property 18 - Client-side rate limiting
 *
 * For any sequence of client-side error events within a 60-second window,
 * the ClientErrorReporter SHALL transmit at most 10 Log_Entries, silently
 * discarding additional events until the next minute window begins.
 *
 * Feature: structured-error-logging, Property 18: Client-side rate limiting
 * Validates: Requirements 6.4
 */

import * as fc from 'fast-check';

describe('Property 18: Client-side rate limiting', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('should transmit at most 10 reports within any 60-second window', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 30 }),
        async (numReports) => {
          // Fresh reporter for each test iteration
          const reporter = new ClientErrorReporter();

          // Mock global.fetch to always succeed
          const fetchMock = jest.fn().mockResolvedValue({ ok: true });
          global.fetch = fetchMock;

          // Call report() N times in rapid succession within the same window
          for (let i = 0; i < numReports; i++) {
            await reporter.report({
              message: `Error ${i}`,
              url: 'https://example.com/page',
              userAgent: 'Mozilla/5.0 Test',
            });
          }

          // Assert: fetch was called at most 10 times
          expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(10);

          // Assert: if numReports <= 10, all should have been sent
          if (numReports <= 10) {
            expect(fetchMock.mock.calls.length).toBe(numReports);
          }
        }
      ),
      { numRuns: 100, verbose: true }
    );
  });

  it('should not throw on excess calls beyond the rate limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 11, max: 30 }),
        async (numReports) => {
          const reporter = new ClientErrorReporter();
          const fetchMock = jest.fn().mockResolvedValue({ ok: true });
          global.fetch = fetchMock;

          // All calls should resolve without throwing
          const results = [];
          for (let i = 0; i < numReports; i++) {
            results.push(reporter.report({
              message: `Error ${i}`,
              url: 'https://example.com/page',
              userAgent: 'Mozilla/5.0 Test',
            }));
          }

          // None of the promises should reject
          await expect(Promise.all(results)).resolves.toBeDefined();
        }
      ),
      { numRuns: 100, verbose: true }
    );
  });

  it('should allow reports again after the 60-second window expires', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 30 }),
        fc.integer({ min: 1, max: 10 }),
        async (firstBatch, secondBatch) => {
          const reporter = new ClientErrorReporter();
          const fetchMock = jest.fn().mockResolvedValue({ ok: true });
          global.fetch = fetchMock;

          // Send firstBatch reports (will be capped at 10)
          for (let i = 0; i < firstBatch; i++) {
            await reporter.report({
              message: `Batch1 Error ${i}`,
              url: 'https://example.com/page',
              userAgent: 'Mozilla/5.0 Test',
            });
          }

          const callsAfterFirstBatch = fetchMock.mock.calls.length;
          expect(callsAfterFirstBatch).toBeLessThanOrEqual(10);

          // Advance time past the 60-second window
          jest.advanceTimersByTime(60_001);

          // Send secondBatch reports in the new window
          for (let i = 0; i < secondBatch; i++) {
            await reporter.report({
              message: `Batch2 Error ${i}`,
              url: 'https://example.com/page',
              userAgent: 'Mozilla/5.0 Test',
            });
          }

          // New window should allow up to 10 more reports
          const callsAfterSecondBatch = fetchMock.mock.calls.length - callsAfterFirstBatch;
          expect(callsAfterSecondBatch).toBeLessThanOrEqual(10);
          expect(callsAfterSecondBatch).toBe(secondBatch);
        }
      ),
      { numRuns: 100, verbose: true }
    );
  });
});
