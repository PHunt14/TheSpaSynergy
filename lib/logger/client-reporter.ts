/**
 * Structured Error Logging - Client Error Reporter
 *
 * Client-side module for capturing and reporting errors to the server.
 * Runs in the browser — no Node.js imports allowed.
 *
 * Features:
 * - Rate limiting: max 10 reports per 60-second sliding window per session
 * - Retry queue: holds up to 5 failed POSTs in memory (FIFO), retries on next success
 *
 * Requirements: 6.4, 6.5
 */

/**
 * Payload sent from the client to /api/log-client-error.
 */
export interface ClientErrorPayload {
  message: string;
  stack?: string;
  componentStack?: string;
  url: string;
  userAgent: string;
}

/** Maximum reports allowed within the rate limit window */
const MAX_REPORTS_PER_WINDOW = 10;

/** Rate limit window duration in milliseconds (60 seconds) */
const RATE_LIMIT_WINDOW_MS = 60_000;

/** Maximum entries held in the retry queue */
const MAX_RETRY_QUEUE_SIZE = 5;

/** API endpoint for client error reporting */
const CLIENT_ERROR_ENDPOINT = '/api/log-client-error';

/**
 * ClientErrorReporter handles sending error payloads to the server
 * with rate limiting and retry queue semantics.
 */
export class ClientErrorReporter {
  /** Timestamps of reports sent within the current window (for rate limiting) */
  private reportTimestamps: number[] = [];

  /** Queue of failed payloads awaiting retry (FIFO) */
  private retryQueue: ClientErrorPayload[] = [];

  /**
   * Report a client-side error to the server.
   *
   * Rate limiting: silently discards if more than 10 reports have been
   * sent in the last 60 seconds. No error thrown, no console output.
   *
   * Retry queue: on fetch failure, queues the payload (up to 5).
   * On next successful fetch, also sends queued entries.
   * If queue is full, discards oldest entry (FIFO).
   */
  async report(payload: ClientErrorPayload): Promise<void> {
    // Prune expired timestamps from the sliding window
    const now = Date.now();
    this.reportTimestamps = this.reportTimestamps.filter(
      (ts) => now - ts < RATE_LIMIT_WINDOW_MS
    );

    // Check rate limit — silently discard if exceeded
    if (this.reportTimestamps.length >= MAX_REPORTS_PER_WINDOW) {
      return;
    }

    // Record this report's timestamp
    this.reportTimestamps.push(now);

    // Attempt to POST the payload
    const success = await this.sendPayload(payload);

    if (success) {
      // On success, also attempt to flush the retry queue
      await this.flushRetryQueue();
    } else {
      // On failure, add to retry queue
      this.enqueueForRetry(payload);
    }
  }

  /**
   * Send a single payload to the server endpoint.
   * Returns true on success (HTTP 2xx), false on any failure.
   */
  private async sendPayload(payload: ClientErrorPayload): Promise<boolean> {
    try {
      const response = await fetch(CLIENT_ERROR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return response.ok;
    } catch {
      // Network error or endpoint unreachable
      return false;
    }
  }

  /**
   * Attempt to send all queued entries. Entries that fail again
   * are re-queued (preserving FIFO order).
   */
  private async flushRetryQueue(): Promise<void> {
    if (this.retryQueue.length === 0) return;

    // Take a snapshot of the current queue and clear it
    const queue = [...this.retryQueue];
    this.retryQueue = [];

    for (const entry of queue) {
      const success = await this.sendPayload(entry);
      if (!success) {
        // Re-queue failed entries (they go back in order)
        this.enqueueForRetry(entry);
      }
    }
  }

  /**
   * Add a payload to the retry queue. If the queue is already at
   * maximum capacity, discard the oldest entry (FIFO).
   */
  private enqueueForRetry(payload: ClientErrorPayload): void {
    if (this.retryQueue.length >= MAX_RETRY_QUEUE_SIZE) {
      // Discard oldest (front of array)
      this.retryQueue.shift();
    }
    this.retryQueue.push(payload);
  }
}
