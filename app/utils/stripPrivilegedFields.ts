/**
 * Strips privileged fields from unauthenticated booking request bodies.
 *
 * When a request is not authenticated (getCurrentUser() returns null), the
 * following fields MUST be removed from the body before any business logic
 * executes:
 *   - createdBy
 *   - confirmOverlap
 *   - isManual
 *   - status
 *
 * This prevents malicious clients from bypassing double-booking protection
 * or injecting privileged state.
 *
 * Requirements: 11.4, 2.4, 1.4
 */

/** The set of field names considered privileged for booking requests. */
export const PRIVILEGED_FIELDS = ['createdBy', 'confirmOverlap', 'isManual', 'status'] as const;

export type PrivilegedField = (typeof PRIVILEGED_FIELDS)[number];

/**
 * Strips privileged fields from a request body if the user is not authenticated.
 *
 * @param body - The raw request body object (mutated in place).
 * @param isAuthenticated - Whether the current user is authenticated.
 * @returns The sanitized body with privileged fields removed (same reference).
 */
export function stripPrivilegedFields<T extends Record<string, unknown>>(
  body: T,
  isAuthenticated: boolean
): T {
  if (!isAuthenticated) {
    for (const field of PRIVILEGED_FIELDS) {
      delete body[field];
    }
  }
  return body;
}
