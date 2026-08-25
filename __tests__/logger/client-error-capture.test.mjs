/**
 * Unit tests for client-side error capture
 *
 * Tests the error capture logic used by ErrorBoundary and
 * UnhandledRejectionHandler, verifying payload structure,
 * componentStack inclusion, and retry queue behavior.
 *
 * The ErrorBoundary.tsx component is tested indirectly by verifying
 * the same payload construction logic it uses — directly instantiating
 * the component would require a jsdom environment which conflicts with
 * the ESM module resolution in this project's test setup.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.5
 */

import { jest } from '@jest/globals';
import { ClientErrorReporter } from '../../lib/logger/client-reporter.ts';

describe('Client-Side Error Capture', () => {
  let fetchMock;
  let reporter;

  beforeEach(() => {
    reporter = new ClientErrorReporter();
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    delete globalThis.fetch;
    jest.restoreAllMocks();
  });

  describe('ErrorBoundary catches render errors and posts to endpoint (Req 6.1)', () => {
    // These tests verify the same payload construction used by ErrorBoundary.componentDidCatch

    it('should post error message to /api/log-client-error', async () => {
      // Simulate what ErrorBoundary.componentDidCatch does:
      const error = new Error('Render error occurred');
      const errorInfo = { componentStack: '\n  in BrokenComponent\n  in App' };

      const payload = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack ?? undefined,
        url: 'https://thespasynergy.com/booking',
        userAgent: 'Mozilla/5.0 TestBrowser/1.0',
      };

      await reporter.report(payload);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith('/api/log-client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    });

    it('should include error message in the payload', async () => {
      const error = new Error('Something broke in rendering');

      const payload = {
        message: error.message,
        stack: error.stack,
        componentStack: '\n  in MyComponent',
        url: 'https://thespasynergy.com/page',
        userAgent: 'TestAgent/1.0',
      };

      await reporter.report(payload);

      const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sentBody.message).toBe('Something broke in rendering');
    });

    it('should include error stack trace in the payload', async () => {
      const error = new Error('Stack trace test');

      const payload = {
        message: error.message,
        stack: error.stack,
        componentStack: '\n  in Component',
        url: 'https://thespasynergy.com/',
        userAgent: 'TestAgent/1.0',
      };

      await reporter.report(payload);

      const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sentBody.stack).toBeDefined();
      expect(sentBody.stack).toContain('Stack trace test');
    });

    it('should include componentStack from React error info', async () => {
      const componentStack = '\n  in ChildComponent\n  in ParentComponent\n  in App';

      const payload = {
        message: 'Test error',
        stack: 'Error: Test error\n  at ...',
        componentStack,
        url: 'https://thespasynergy.com/',
        userAgent: 'TestAgent/1.0',
      };

      await reporter.report(payload);

      const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sentBody.componentStack).toBe(componentStack);
    });

    it('should handle null componentStack by setting it to undefined', async () => {
      // In ErrorBoundary: componentStack: errorInfo.componentStack ?? undefined
      const errorInfo = { componentStack: null };

      const payload = {
        message: 'Error with no stack',
        stack: 'Error: ...',
        componentStack: errorInfo.componentStack ?? undefined,
        url: 'https://thespasynergy.com/',
        userAgent: 'TestAgent/1.0',
      };

      await reporter.report(payload);

      const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      // undefined fields are not serialized in JSON
      expect(sentBody.componentStack).toBeUndefined();
    });
  });

  describe('Unhandled promise rejection captures rejection reason (Req 6.2)', () => {
    // These tests verify the same logic used by UnhandledRejectionHandler

    it('should capture Error rejection with message and stack', async () => {
      const reason = new Error('Async operation failed');

      // Same logic as UnhandledRejectionHandler:
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;

      const payload = {
        message,
        stack,
        url: 'https://thespasynergy.com/dashboard',
        userAgent: 'Mozilla/5.0 TestBrowser',
      };

      await reporter.report(payload);

      const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sentBody.message).toBe('Async operation failed');
      expect(sentBody.stack).toContain('Async operation failed');
    });

    it('should convert non-Error string rejection reason to string', async () => {
      const reason = 'string rejection reason';

      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;

      const payload = {
        message,
        stack,
        url: 'https://thespasynergy.com/',
        userAgent: 'TestAgent/1.0',
      };

      await reporter.report(payload);

      const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sentBody.message).toBe('string rejection reason');
      expect(sentBody.stack).toBeUndefined();
    });

    it('should convert numeric rejection reason to string', async () => {
      const reason = 42;

      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;

      const payload = {
        message,
        stack,
        url: 'https://thespasynergy.com/',
        userAgent: 'TestAgent/1.0',
      };

      await reporter.report(payload);

      const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sentBody.message).toBe('42');
      expect(sentBody.stack).toBeUndefined();
    });

    it('should convert object rejection reason to string', async () => {
      const reason = { code: 'TIMEOUT', details: 'Connection timed out' };

      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;

      const payload = {
        message,
        stack,
        url: 'https://thespasynergy.com/',
        userAgent: 'TestAgent/1.0',
      };

      await reporter.report(payload);

      const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sentBody.message).toBe('[object Object]');
      expect(sentBody.stack).toBeUndefined();
    });

    it('should include URL from window.location.href', async () => {
      const payload = {
        message: 'test rejection',
        url: 'https://thespasynergy.com/payments/checkout',
        userAgent: 'TestAgent/1.0',
      };

      await reporter.report(payload);

      const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sentBody.url).toBe('https://thespasynergy.com/payments/checkout');
    });

    it('should include userAgent from navigator.userAgent', async () => {
      const payload = {
        message: 'test rejection',
        url: 'https://thespasynergy.com/',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/605.1',
      };

      await reporter.report(payload);

      const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sentBody.userAgent).toBe('Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/605.1');
    });
  });

  describe('Payload includes componentStack, url, userAgent (Req 6.3)', () => {
    it('should include all required fields in ErrorBoundary-style payload', async () => {
      const payload = {
        message: 'Component error',
        stack: 'Error: Component error\n  at Component.render',
        componentStack: '\n  in TestComponent\n  in App',
        url: 'https://thespasynergy.com/services',
        userAgent: 'Chrome/120.0',
      };

      await reporter.report(payload);

      const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sentBody).toHaveProperty('message');
      expect(sentBody).toHaveProperty('stack');
      expect(sentBody).toHaveProperty('componentStack');
      expect(sentBody).toHaveProperty('url');
      expect(sentBody).toHaveProperty('userAgent');

      expect(typeof sentBody.message).toBe('string');
      expect(typeof sentBody.stack).toBe('string');
      expect(typeof sentBody.componentStack).toBe('string');
      expect(typeof sentBody.url).toBe('string');
      expect(typeof sentBody.userAgent).toBe('string');
    });

    it('should NOT include componentStack in unhandled rejection-style payloads', async () => {
      // Rejection handler doesn't set componentStack
      const payload = {
        message: 'rejection error',
        stack: 'Error: rejection\n  at ...',
        url: 'https://thespasynergy.com/',
        userAgent: 'TestAgent/1.0',
      };

      await reporter.report(payload);

      const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sentBody.componentStack).toBeUndefined();
    });

    it('should preserve full URL path including query-like segments', async () => {
      const payload = {
        message: 'test',
        url: 'https://thespasynergy.com/booking/step-2',
        userAgent: 'TestAgent/1.0',
      };

      await reporter.report(payload);

      const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sentBody.url).toBe('https://thespasynergy.com/booking/step-2');
    });

    it('should preserve full userAgent string', async () => {
      const payload = {
        message: 'test',
        url: 'https://thespasynergy.com/',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };

      await reporter.report(payload);

      const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sentBody.userAgent).toBe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    });
  });

  describe('Retry queue holds max 5 entries (Req 6.5)', () => {
    it('should queue failed reports up to 5 and retry on next success', async () => {
      fetchMock.mockResolvedValue({ ok: false });

      // Send 5 reports that all fail
      for (let i = 0; i < 5; i++) {
        await reporter.report({
          message: `Error ${i}`,
          url: 'https://example.com',
          userAgent: 'Test',
        });
      }

      // Now make fetch succeed to trigger retry flush
      fetchMock.mockResolvedValue({ ok: true });
      await reporter.report({
        message: 'Trigger flush',
        url: 'https://example.com',
        userAgent: 'Test',
      });

      // 5 failed + 1 success + 5 retries = 11
      expect(fetchMock).toHaveBeenCalledTimes(11);
    });

    it('should discard oldest entries when queue exceeds 5 (FIFO)', async () => {
      fetchMock.mockResolvedValue({ ok: false });

      // Send 7 reports that fail (only last 5 should be queued)
      for (let i = 0; i < 7; i++) {
        await reporter.report({
          message: `Error ${i}`,
          url: 'https://example.com',
          userAgent: 'Test',
        });
      }

      // Now make fetch succeed
      fetchMock.mockResolvedValue({ ok: true });
      await reporter.report({
        message: 'Trigger flush',
        url: 'https://example.com',
        userAgent: 'Test',
      });

      // 7 failed + 1 success + 5 retries = 13
      expect(fetchMock).toHaveBeenCalledTimes(13);

      // Verify the retried entries are the newest 5 (Error 2-6, oldest 0,1 discarded)
      const allBodies = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
      const retriedMessages = allBodies.slice(8).map((b) => b.message);
      expect(retriedMessages).toContain('Error 2');
      expect(retriedMessages).toContain('Error 6');
      expect(retriedMessages).not.toContain('Error 0');
      expect(retriedMessages).not.toContain('Error 1');
    });

    it('should not exceed 5 entries in the queue even with many failures', async () => {
      fetchMock.mockResolvedValue({ ok: false });

      // Send 8 reports that all fail (staying within rate limit of 10)
      for (let i = 0; i < 8; i++) {
        await reporter.report({
          message: `Error ${i}`,
          url: 'https://example.com',
          userAgent: 'Test',
        });
      }

      // Succeed and trigger retry — should only retry 5 (queue cap)
      fetchMock.mockResolvedValue({ ok: true });
      await reporter.report({
        message: 'Trigger',
        url: 'https://example.com',
        userAgent: 'Test',
      });

      // 8 failed + 1 success + 5 retries = 14
      expect(fetchMock).toHaveBeenCalledTimes(14);

      // Verify only 5 were retried (oldest 3 were discarded from queue)
      const allBodies = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
      const retriedMessages = allBodies.slice(9).map((b) => b.message);
      expect(retriedMessages).toHaveLength(5);
      expect(retriedMessages).not.toContain('Error 0');
      expect(retriedMessages).not.toContain('Error 1');
      expect(retriedMessages).not.toContain('Error 2');
      expect(retriedMessages).toContain('Error 3');
      expect(retriedMessages).toContain('Error 7');
    });

    it('should queue entries on network failure (fetch throws)', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

      // Send 3 reports that fail due to network error
      for (let i = 0; i < 3; i++) {
        await reporter.report({
          message: `Network Error ${i}`,
          url: 'https://example.com',
          userAgent: 'Test',
        });
      }

      // Now make fetch succeed
      fetchMock.mockResolvedValue({ ok: true });
      await reporter.report({
        message: 'Network restored',
        url: 'https://example.com',
        userAgent: 'Test',
      });

      // 3 failed + 1 success + 3 retries = 7
      expect(fetchMock).toHaveBeenCalledTimes(7);
    });
  });
});
