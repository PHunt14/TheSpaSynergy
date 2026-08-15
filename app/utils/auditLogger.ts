/**
 * Audit Logger for Booking Endpoints
 *
 * Logs all rejected booking attempts with sufficient context for security audit
 * without including sensitive customer PII in log entries.
 *
 * Logged fields: IP, timestamp, request body hash, rejection reason, user identity (if authenticated)
 *
 * Requirements: 11.8
 */

import { createHash } from 'crypto';

export type RejectionReason =
  | 'conflict'        // 409 — time slot conflict
  | 'validation'      // 400 — input validation failure
  | 'auth'            // 401 — unauthorized access
  | 'rate_limit'      // 429 — rate limit exceeded
  | 'not_found'       // 404 — entity not found
  | 'forbidden'       // 403 — booking disabled
  | 'server_error';   // 500 — internal server error

export interface AuditLogEntry {
  ip: string;
  timestamp: string;
  requestBodyHash: string;
  rejectionReason: RejectionReason;
  statusCode: number;
  userId?: string;
  details?: string;
}

/**
 * Hash the request body using SHA-256 to avoid logging PII
 * while still allowing correlation of entries.
 */
export function hashRequestBody(body: unknown): string {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  return createHash('sha256').update(bodyStr).digest('hex').substring(0, 16);
}

/**
 * Log a rejected booking request for security audit purposes.
 * Excludes sensitive customer PII — uses body hash for correlation instead.
 */
export function logRejection(entry: AuditLogEntry): void {
  const logPayload = {
    level: 'warn',
    event: 'booking_rejection',
    ip: entry.ip,
    timestamp: entry.timestamp,
    requestBodyHash: entry.requestBodyHash,
    rejectionReason: entry.rejectionReason,
    statusCode: entry.statusCode,
    ...(entry.userId && { userId: entry.userId }),
    ...(entry.details && { details: entry.details }),
  };

  // Use structured JSON logging for server-side audit trail
  console.warn(JSON.stringify(logPayload));
}

/**
 * Convenience function: build an audit entry and log it in one call.
 *
 * @param ip - Client IP address
 * @param body - Raw request body (will be hashed, not stored)
 * @param rejectionReason - Category of rejection
 * @param statusCode - HTTP status code returned
 * @param userId - Authenticated user identity (if available)
 * @param details - Non-PII context (e.g., "conflict at 10:00", "invalid dateTime format")
 */
export function auditReject(
  ip: string,
  body: unknown,
  rejectionReason: RejectionReason,
  statusCode: number,
  userId?: string,
  details?: string
): void {
  logRejection({
    ip,
    timestamp: new Date().toISOString(),
    requestBodyHash: hashRequestBody(body),
    rejectionReason,
    statusCode,
    userId,
    details,
  });
}

/**
 * Build a safe error response for unauthenticated users.
 * Returns only generic messages — no stack traces, internal IDs, or database details.
 */
export function safeErrorResponse(
  statusCode: number,
  _internalError?: unknown
): { error: string } {
  switch (statusCode) {
    case 400:
      return { error: 'Validation failed' };
    case 401:
      return { error: 'Unauthorized' };
    case 403:
      return { error: 'Access denied' };
    case 404:
      return { error: 'Not found' };
    case 409:
      return { error: 'This time slot is no longer available' };
    case 429:
      return { error: 'Too many requests. Please try again later.' };
    default:
      return { error: 'An error occurred' };
  }
}

/**
 * Build a slightly more detailed error response for authenticated admin/staff users.
 * Provides operational context (e.g., conflicting time) but still no raw errors or stack traces.
 */
export function staffErrorResponse(
  statusCode: number,
  context?: string
): { error: string; detail?: string } {
  const base = safeErrorResponse(statusCode);
  if (context) {
    return { ...base, detail: context };
  }
  return base;
}
