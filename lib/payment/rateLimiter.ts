/**
 * Simple in-memory rate limiter for payment API routes.
 * 
 * IMPORTANT: This is an in-memory store that does NOT persist across serverless invocations.
 * For production deployments:
 * - Use API Gateway throttling (if on AWS API Gateway)
 * - Use Vercel rate limiting (if on Vercel)
 * - Use Redis/DynamoDB-backed rate limiter
 * - Use a dedicated rate limiting service
 * 
 * This utility is suitable for:
 * - Local development
 * - Single-instance deployments
 * - Testing
 * 
 * Requirement 11.1: Rate limit payment endpoints to prevent brute-force and DoS attacks.
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const requestStore = new Map<string, RateLimitEntry>();

/**
 * Check if a request should be rate limited.
 * 
 * @param key - Unique identifier (e.g., IP address, user ID)
 * @param maxRequests - Maximum requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns Object with { allowed: boolean, remaining: number, resetTime: number }
 */
export function checkRateLimit(key: string, maxRequests: number = 10, windowMs: number = 10000) {
  const now = Date.now();
  const entry = requestStore.get(key);

  if (!entry || now > entry.resetTime) {
    // Window expired or first request
    requestStore.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetTime: now + windowMs };
  }

  // Window still active
  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetTime: entry.resetTime };
  }

  // Increment counter
  entry.count += 1;
  return { allowed: true, remaining: maxRequests - entry.count, resetTime: entry.resetTime };
}

/**
 * Extract client IP from Next.js request headers.
 * Handles X-Forwarded-For (CloudFront, Vercel) and other proxies.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    // X-Forwarded-For can contain multiple IPs; use the first one
    return forwarded.split(',')[0].trim();
  }
  return headers.get('x-real-ip') || headers.get('client-ip') || 'unknown';
}

/**
 * Middleware-style rate limit checker.
 * Returns a Response if rate limited, otherwise null.
 * 
 * Automatically bypasses rate limiting in test environments (NODE_ENV=test or Jest running).
 */
export function rateLimitMiddleware(
  clientIp: string,
  maxRequests: number = 10,
  windowMs: number = 10000
): Response | null {
  // Bypass rate limiting during tests to avoid interfering with test execution
  // Jest sets NODE_ENV to 'test' and global.it is defined
  if (process.env.NODE_ENV === 'test' || typeof global.it === 'function') {
    return null;
  }

  const result = checkRateLimit(clientIp, maxRequests, windowMs);

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        message: `Too many payment requests. Please try again in ${retryAfter} seconds.`,
        retryAfter,
      }),
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(result.resetTime),
        },
      }
    );
  }

  return null;
}

/**
 * Clean up old entries periodically to prevent memory leaks.
 * Call this once per minute or on startup.
 */
export function cleanupRateLimitStore() {
  const now = Date.now();
  let removed = 0;

  for (const [key, entry] of requestStore.entries()) {
    if (now > entry.resetTime) {
      requestStore.delete(key);
      removed += 1;
    }
  }

  if (removed > 0) {
    console.log(`[RateLimit] Cleaned up ${removed} expired entries`);
  }
}

// Run cleanup every minute
if (typeof window === 'undefined') {
  // Only in Node.js environment
  setInterval(cleanupRateLimitStore, 60000);
}
