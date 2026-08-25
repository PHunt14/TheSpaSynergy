/**
 * Structured Error Logging - BatchWriter
 *
 * Handles buffering and flushing log entries to CloudWatch Logs.
 * Flushes every 5 seconds or at 100 entries (whichever first).
 * Falls back to stdout on CloudWatch failure.
 * Enters backoff mode after 3+ consecutive failures (retries every 30 seconds).
 * Supports graceful shutdown with a configurable grace period.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import type {
  CloudWatchLogsClient as CloudWatchLogsClientType,
  PutLogEventsCommand as PutLogEventsCommandType,
} from '@aws-sdk/client-cloudwatch-logs';

/**
 * Configuration for the BatchWriter.
 */
export interface BatchWriterConfig {
  /** CloudWatch Log Group name (e.g., /thespasynergy/production/app) */
  logGroupName: string;
  /** CloudWatch Log Stream name (unique per instance) */
  logStreamName: string;
  /** Interval in ms between automatic flushes (default: 5000) */
  flushIntervalMs: number;
  /** Maximum entries before triggering a flush (default: 100) */
  maxBatchSize: number;
  /** Timeout in ms for CloudWatch API calls (default: 5000) */
  timeoutMs: number;
}

/** Default configuration values */
const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_MAX_BATCH_SIZE = 100;
const DEFAULT_TIMEOUT_MS = 5000;

/** Number of consecutive failures before entering backoff mode */
const BACKOFF_THRESHOLD = 3;

/** Retry interval during backoff mode (30 seconds) */
const BACKOFF_INTERVAL_MS = 30000;

/**
 * BatchWriter buffers log entries and flushes them to CloudWatch Logs.
 *
 * - Buffers entries in memory
 * - Flushes to CloudWatch on a timer (every flushIntervalMs) or when buffer reaches maxBatchSize
 * - Falls back to stdout on CloudWatch failure
 * - Enters backoff mode after BACKOFF_THRESHOLD consecutive failures
 * - Supports graceful shutdown with a grace period
 *
 * The CloudWatch SDK client is created lazily and only when the deployment stage
 * is "production" or "staging".
 */
export class BatchWriter {
  private config: BatchWriterConfig;
  private buffer: string[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private client: CloudWatchLogsClientType | null = null;
  private clientInitialized = false;
  private consecutiveFailures = 0;
  private inBackoffMode = false;
  private lastBackoffFlushTime = 0;
  private isShuttingDown = false;
  private flushInProgress = false;

  constructor(config: Partial<BatchWriterConfig> & Pick<BatchWriterConfig, 'logGroupName' | 'logStreamName'>) {
    this.config = {
      logGroupName: config.logGroupName,
      logStreamName: config.logStreamName,
      flushIntervalMs: config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
      maxBatchSize: config.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };

    // Start the background flush timer
    this.startFlushTimer();
  }

  /**
   * Enqueue a serialized log line into the buffer.
   * If the buffer reaches maxBatchSize, triggers an immediate flush.
   */
  write(entry: string): void {
    if (this.isShuttingDown) {
      // During shutdown, write directly to stdout
      process.stdout.write(entry + '\n');
      return;
    }

    this.buffer.push(entry);

    if (this.buffer.length >= this.config.maxBatchSize) {
      // Trigger flush without awaiting (non-blocking)
      void this.flush();
    }
  }

  /**
   * Force flush all buffered entries to CloudWatch.
   * On failure, falls back to stdout and increments the failure counter.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    // Prevent concurrent flushes
    if (this.flushInProgress) {
      return;
    }

    this.flushInProgress = true;

    try {
      // Take entries from the buffer
      const entries = this.buffer.splice(0);

      // Check if we're in backoff mode and should skip CloudWatch
      if (this.inBackoffMode) {
        const now = Date.now();
        if (now - this.lastBackoffFlushTime < BACKOFF_INTERVAL_MS) {
          // In backoff mode and not enough time has passed — write to stdout
          this.writeToStdout(entries);
          return;
        }
        // Enough time has passed — try CloudWatch again
        this.lastBackoffFlushTime = now;
      }

      // Attempt to send to CloudWatch
      const success = await this.sendToCloudWatch(entries);

      if (success) {
        // Reset failure counter on success
        this.consecutiveFailures = 0;
        if (this.inBackoffMode) {
          this.inBackoffMode = false;
          this.emitWarning('CloudWatch delivery recovered — exiting backoff mode');
        }
      } else {
        // Failure — fall back to stdout
        this.writeToStdout(entries);
        this.consecutiveFailures++;

        if (this.consecutiveFailures >= BACKOFF_THRESHOLD && !this.inBackoffMode) {
          this.inBackoffMode = true;
          this.lastBackoffFlushTime = Date.now();
          this.emitWarning(
            `CloudWatch delivery failed ${this.consecutiveFailures} consecutive times — entering backoff mode (retry every 30s)`
          );
        }
      }
    } finally {
      this.flushInProgress = false;
    }
  }

  /**
   * Graceful shutdown: stops the flush timer, flushes remaining entries
   * within maxWaitMs (default 10000ms). If flush can't complete within
   * the grace period, writes remaining entries to stdout.
   */
  async shutdown(maxWaitMs = 10000): Promise<void> {
    this.isShuttingDown = true;

    // Stop the flush timer
    this.stopFlushTimer();

    // Attempt to flush remaining entries within the grace period
    if (this.buffer.length > 0) {
      const flushPromise = this.flush();
      const timeoutPromise = new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), maxWaitMs)
      );

      const result = await Promise.race([
        flushPromise.then(() => 'done' as const),
        timeoutPromise,
      ]);

      if (result === 'timeout') {
        // Grace period exceeded — write remaining to stdout
        if (this.buffer.length > 0) {
          const remaining = this.buffer.splice(0);
          this.writeToStdout(remaining);
          this.emitWarning(
            `Shutdown grace period exceeded — wrote ${remaining.length} remaining entries to stdout`
          );
        }
      }
    }
  }

  /**
   * Lazily initialize the CloudWatch Logs client.
   * Only creates the client if the stage is production or staging.
   * Returns null if initialization fails or stage is development.
   */
  private async getClient(): Promise<CloudWatchLogsClientType | null> {
    if (this.clientInitialized) {
      return this.client;
    }

    this.clientInitialized = true;

    const stage = process.env.DEPLOYMENT_STAGE || 'development';
    if (stage !== 'production' && stage !== 'staging') {
      // Development mode — no CloudWatch client
      this.client = null;
      return null;
    }

    try {
      const { CloudWatchLogsClient } = await import('@aws-sdk/client-cloudwatch-logs');
      this.client = new CloudWatchLogsClient({});
      return this.client;
    } catch (error) {
      // SDK initialization failed — fall back to stdout-only mode
      this.emitWarning(
        `Failed to initialize CloudWatch SDK: ${error instanceof Error ? error.message : String(error)}`
      );
      this.client = null;
      return null;
    }
  }

  /**
   * Send log entries to CloudWatch via PutLogEvents.
   * Uses AbortSignal.timeout for the configured timeout.
   * Returns true on success, false on failure.
   */
  private async sendToCloudWatch(entries: string[]): Promise<boolean> {
    const client = await this.getClient();

    if (!client) {
      // No client available (development mode or init failure) — return false to trigger stdout fallback
      return false;
    }

    try {
      const { PutLogEventsCommand } = await import('@aws-sdk/client-cloudwatch-logs');

      const logEvents = entries.map((entry) => ({
        timestamp: Date.now(),
        message: entry,
      }));

      const command = new PutLogEventsCommand({
        logGroupName: this.config.logGroupName,
        logStreamName: this.config.logStreamName,
        logEvents,
      });

      await client.send(command, {
        abortSignal: AbortSignal.timeout(this.config.timeoutMs),
      });

      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.emitWarning(`CloudWatch delivery failed: ${reason}`);
      return false;
    }
  }

  /**
   * Write entries directly to stdout as a fallback.
   */
  private writeToStdout(entries: string[]): void {
    for (const entry of entries) {
      process.stdout.write(entry + '\n');
    }
  }

  /**
   * Emit a warning-level log entry to stdout indicating a CloudWatch delivery issue.
   */
  private emitWarning(message: string): void {
    const warningEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      domain: 'general',
      message,
      correlationId: '00000000-0000-0000-0000-000000000000',
      context: { source: 'BatchWriter' },
    });
    process.stdout.write(warningEntry + '\n');
  }

  /**
   * Start the periodic flush timer.
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.config.flushIntervalMs);

    // Allow the process to exit even if the timer is running
    if (this.flushTimer && typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
      this.flushTimer.unref();
    }
  }

  /**
   * Stop the periodic flush timer.
   */
  private stopFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
