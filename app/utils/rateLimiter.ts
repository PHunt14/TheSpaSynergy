/**
 * In-memory sliding window counter rate limiter.
 * Suitable for single-instance deployment (Next.js server).
 *
 * Implements a sliding window approach: tracks request timestamps within
 * the configured window and counts them to determine if the limit is exceeded.
 */

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number; // seconds until the client can retry
}

// In-memory store: key -> list of request timestamps
const store = new Map<string, RateLimitEntry>();

// Periodic cleanup interval (every 5 minutes) to prevent memory leaks
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      // Remove entries where all timestamps are older than the max window (60s)
      const maxWindowMs = 60 * 1000;
      entry.timestamps = entry.timestamps.filter((ts) => now - ts < maxWindowMs);
      if (entry.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  // Unref so it doesn't keep the process alive
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

/**
 * Check if a request is allowed under the rate limit.
 *
 * @param key - Unique identifier for the rate limit bucket (e.g., IP address or user ID)
 * @param limit - Maximum number of requests allowed within the window
 * @param windowMs - Time window in milliseconds
 * @returns { allowed: boolean, retryAfter?: number }
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  startCleanup();

  const now = Date.now();
  let entry = store.get(key);

  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Remove timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);

  if (entry.timestamps.length >= limit) {
    // Rate limit exceeded — calculate when the oldest request in window expires
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow + windowMs - now;
    const retryAfter = Math.ceil(retryAfterMs / 1000);
    return { allowed: false, retryAfter: Math.max(retryAfter, 1) };
  }

  // Allow the request and record the timestamp
  entry.timestamps.push(now);
  return { allowed: true };
}

/**
 * Extract the client IP address from request headers.
 * Checks x-forwarded-for, x-real-ip, and falls back to "unknown".
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can be a comma-separated list; take the first one
    return forwarded.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  return 'unknown';
}

/**
 * Create an HTTP 429 response with the Retry-After header.
 */
export function rateLimitResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please try again later.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
      },
    }
  );
}

// Export for testing purposes
export function _resetStore() {
  store.clear();
}
