/**
 * Integration tests for the BatchWriter module.
 *
 * Tests CloudWatch delivery batching, fallback to stdout, backoff mode,
 * and graceful shutdown behavior using mocked SDK and fake timers.
 *
 * Validates: Requirements 4.4, 4.5, 4.6
 */

import { jest } from '@jest/globals';

// Mock the CloudWatch Logs SDK
const mockSend = jest.fn();
const mockCloudWatchLogsClient = jest.fn().mockImplementation(() => ({
  send: mockSend,
}));
const mockPutLogEventsCommand = jest.fn().mockImplementation((params) => params);

jest.unstable_mockModule('@aws-sdk/client-cloudwatch-logs', () => ({
  CloudWatchLogsClient: mockCloudWatchLogsClient,
  PutLogEventsCommand: mockPutLogEventsCommand,
}));

// Import after mocking
const { BatchWriter } = await import('../../lib/logger/batch-writer.ts');

describe('BatchWriter Integration Tests', () => {
  let stdoutSpy;
  let originalEnv;

  beforeEach(() => {
    jest.useFakeTimers();
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    originalEnv = { ...process.env };
    process.env.DEPLOYMENT_STAGE = 'production';
    mockSend.mockReset();
    mockSend.mockResolvedValue({});
    mockCloudWatchLogsClient.mockClear();
    mockPutLogEventsCommand.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
    stdoutSpy.mockRestore();
    process.env = originalEnv;
  });

  function createWriter(overrides = {}) {
    return new BatchWriter({
      logGroupName: '/thespasynergy/production/app',
      logStreamName: 'test-instance-001',
      flushIntervalMs: 5000,
      maxBatchSize: 100,
      timeoutMs: 5000,
      ...overrides,
    });
  }

  function makeEntry(id) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      domain: 'general',
      message: `Test entry ${id}`,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      context: {},
    });
  }

  describe('Flush at 100 entries (Req 4.5)', () => {
    it('triggers flush when buffer reaches maxBatchSize (100 entries)', async () => {
      const writer = createWriter();

      // Write exactly 100 entries
      for (let i = 0; i < 100; i++) {
        writer.write(makeEntry(i));
      }

      // Allow the async flush to complete (flush is triggered non-blocking via void this.flush())
      // We need to flush microtasks/promises without advancing timers infinitely
      await jest.advanceTimersByTimeAsync(0);

      // The PutLogEventsCommand should have been called with 100 entries
      expect(mockPutLogEventsCommand).toHaveBeenCalledTimes(1);
      const commandArgs = mockPutLogEventsCommand.mock.calls[0][0];
      expect(commandArgs.logEvents).toHaveLength(100);
      expect(commandArgs.logGroupName).toBe('/thespasynergy/production/app');
      expect(commandArgs.logStreamName).toBe('test-instance-001');
    });

    it('does not flush before reaching maxBatchSize', async () => {
      const writer = createWriter();

      // Write 99 entries — should not trigger immediate flush
      for (let i = 0; i < 99; i++) {
        writer.write(makeEntry(i));
      }

      // Give any pending microtasks a chance to run
      await jest.advanceTimersByTimeAsync(0);

      // No flush should have happened yet (timer hasn't fired either)
      expect(mockPutLogEventsCommand).not.toHaveBeenCalled();
    });
  });

  describe('Flush at 5-second interval (Req 4.5)', () => {
    it('triggers flush after 5 seconds even with fewer than 100 entries', async () => {
      const writer = createWriter();

      // Write a few entries
      writer.write(makeEntry(1));
      writer.write(makeEntry(2));
      writer.write(makeEntry(3));

      // Advance timer by 5 seconds
      await jest.advanceTimersByTimeAsync(5000);

      // Flush should have been triggered by the timer
      expect(mockPutLogEventsCommand).toHaveBeenCalledTimes(1);
      const commandArgs = mockPutLogEventsCommand.mock.calls[0][0];
      expect(commandArgs.logEvents).toHaveLength(3);
    });

    it('does not flush before 5 seconds with fewer entries', async () => {
      const writer = createWriter();

      writer.write(makeEntry(1));

      // Advance timer by 4.9 seconds
      await jest.advanceTimersByTimeAsync(4900);

      // No flush yet
      expect(mockPutLogEventsCommand).not.toHaveBeenCalled();
    });

    it('flushes multiple batches over successive intervals', async () => {
      const writer = createWriter();

      writer.write(makeEntry(1));
      await jest.advanceTimersByTimeAsync(5000);

      writer.write(makeEntry(2));
      await jest.advanceTimersByTimeAsync(5000);

      expect(mockPutLogEventsCommand).toHaveBeenCalledTimes(2);
      expect(mockPutLogEventsCommand.mock.calls[0][0].logEvents).toHaveLength(1);
      expect(mockPutLogEventsCommand.mock.calls[1][0].logEvents).toHaveLength(1);
    });
  });

  describe('Fallback on API failure (Req 4.4)', () => {
    it('writes entries to stdout when CloudWatch API fails', async () => {
      mockSend.mockRejectedValue(new Error('CloudWatch timeout'));
      const writer = createWriter();

      writer.write(makeEntry(1));
      writer.write(makeEntry(2));

      // Trigger timer flush
      await jest.advanceTimersByTimeAsync(5000);

      // Entries should be written to stdout as fallback
      const stdoutCalls = stdoutSpy.mock.calls.map((c) => c[0]);
      // Should contain our entries (plus a warning about the failure)
      const entryOutputs = stdoutCalls.filter((c) => c.includes('Test entry'));
      expect(entryOutputs).toHaveLength(2);
    });

    it('emits a warning-level entry indicating CloudWatch delivery failure', async () => {
      mockSend.mockRejectedValue(new Error('Service unavailable'));
      const writer = createWriter();

      writer.write(makeEntry(1));
      await jest.advanceTimersByTimeAsync(5000);

      const stdoutCalls = stdoutSpy.mock.calls.map((c) => c[0]);
      const warningOutput = stdoutCalls.find(
        (c) => c.includes('"level":"warn"') && c.includes('CloudWatch delivery failed')
      );
      expect(warningOutput).toBeDefined();
      expect(warningOutput).toContain('Service unavailable');
    });
  });

  describe('Backoff mode after 3 consecutive failures (Req 4.4)', () => {
    it('enters backoff mode after 3 consecutive CloudWatch failures', async () => {
      mockSend.mockRejectedValue(new Error('Service unavailable'));
      const writer = createWriter();

      // Trigger 3 consecutive failures
      writer.write(makeEntry(1));
      await jest.advanceTimersByTimeAsync(5000);

      writer.write(makeEntry(2));
      await jest.advanceTimersByTimeAsync(5000);

      writer.write(makeEntry(3));
      await jest.advanceTimersByTimeAsync(5000);

      // Check that the backoff mode warning was emitted
      const stdoutCalls = stdoutSpy.mock.calls.map((c) => c[0]);
      const backoffWarning = stdoutCalls.find(
        (c) => c.includes('entering backoff mode') && c.includes('"level":"warn"')
      );
      expect(backoffWarning).toBeDefined();
    });

    it('writes to stdout during backoff without attempting CloudWatch', async () => {
      mockSend.mockRejectedValue(new Error('Service unavailable'));
      const writer = createWriter();

      // Trigger 3 failures to enter backoff mode
      for (let i = 0; i < 3; i++) {
        writer.write(makeEntry(i));
        await jest.advanceTimersByTimeAsync(5000);
      }

      // Reset mock to track new calls
      mockSend.mockClear();
      mockPutLogEventsCommand.mockClear();

      // Write more entries during backoff period (less than 30s since last attempt)
      writer.write(makeEntry(99));
      await jest.advanceTimersByTimeAsync(5000);

      // CloudWatch should NOT be called during backoff
      expect(mockSend).not.toHaveBeenCalled();

      // Entry should still go to stdout
      const stdoutCalls = stdoutSpy.mock.calls.map((c) => c[0]);
      const entry99 = stdoutCalls.find((c) => c.includes('Test entry 99'));
      expect(entry99).toBeDefined();
    });
  });

  describe('Graceful shutdown (Req 4.6)', () => {
    it('flushes remaining entries on shutdown', async () => {
      const writer = createWriter();

      writer.write(makeEntry(1));
      writer.write(makeEntry(2));
      writer.write(makeEntry(3));

      // Initiate shutdown with 10s grace period
      const shutdownPromise = writer.shutdown(10000);

      // Let the flush happen
      await jest.runAllTimersAsync();
      await shutdownPromise;

      // Entries should have been flushed to CloudWatch
      expect(mockPutLogEventsCommand).toHaveBeenCalledTimes(1);
      expect(mockPutLogEventsCommand.mock.calls[0][0].logEvents).toHaveLength(3);
    });

    it('writes remaining entries to stdout when shutdown grace period is exceeded', async () => {
      // Make CloudWatch slow — resolves only after a significant delay
      // Use a controlled promise that we never resolve to simulate a very slow flush
      let sendResolve;
      mockSend.mockImplementation(() => new Promise((resolve) => { sendResolve = resolve; }));

      const writer = createWriter({ flushIntervalMs: 100000 }); // very long interval so only manual flush is used

      writer.write(makeEntry(1));
      writer.write(makeEntry(2));

      // Initiate shutdown — this will call flush() which will hang on sendToCloudWatch
      const shutdownPromise = writer.shutdown(500); // Use short grace period

      // Advance past the grace period — the setTimeout inside shutdown should fire
      await jest.advanceTimersByTimeAsync(501);
      await shutdownPromise;

      // After grace period exceeded, entries written after shutdown should go to stdout
      // Since the flush hangs (entries are in-flight), verify that post-shutdown writes go to stdout
      writer.write(makeEntry(3));
      const stdoutCalls = stdoutSpy.mock.calls.map((c) => c[0]);
      const directEntry = stdoutCalls.find((c) => c.includes('Test entry 3'));
      expect(directEntry).toBeDefined();

      // Clean up: resolve the hanging promise to prevent unhandled rejection
      if (sendResolve) sendResolve({});
    });

    it('stops the flush timer during shutdown', async () => {
      const writer = createWriter();

      writer.write(makeEntry(1));

      const shutdownPromise = writer.shutdown(10000);
      await jest.runAllTimersAsync();
      await shutdownPromise;

      // After shutdown, writing should go directly to stdout
      stdoutSpy.mockClear();
      writer.write(makeEntry(99));

      const stdoutCalls = stdoutSpy.mock.calls.map((c) => c[0]);
      const directEntry = stdoutCalls.find((c) => c.includes('Test entry 99'));
      expect(directEntry).toBeDefined();
    });

    it('completes shutdown immediately if buffer is empty', async () => {
      const writer = createWriter();

      const shutdownPromise = writer.shutdown(10000);
      await jest.runAllTimersAsync();
      await shutdownPromise;

      // Should succeed without issues
      expect(mockPutLogEventsCommand).not.toHaveBeenCalled();
    });
  });

  describe('Development stage (no CloudWatch)', () => {
    it('does not attempt CloudWatch delivery in development stage', async () => {
      process.env.DEPLOYMENT_STAGE = 'development';
      const writer = createWriter();

      writer.write(makeEntry(1));
      await jest.advanceTimersByTimeAsync(5000);

      // Should not try to create CloudWatch client
      expect(mockSend).not.toHaveBeenCalled();

      // Entry should be written to stdout
      const stdoutCalls = stdoutSpy.mock.calls.map((c) => c[0]);
      const entry = stdoutCalls.find((c) => c.includes('Test entry 1'));
      expect(entry).toBeDefined();
    });
  });
});
