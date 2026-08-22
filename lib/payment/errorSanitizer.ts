/**
 * Error message sanitization utility for customer-facing kiosk displays.
 *
 * Ensures that no raw technical details, third-party vendor names,
 * stack traces, internal identifiers, or JSON objects are exposed
 * to customers.
 *
 * Requirement 7.4: THE Kiosk SHALL never display raw error objects,
 * stack traces, internal system identifiers, or third-party vendor
 * names (e.g., "Square") to the customer.
 */

const GENERIC_ERROR_MESSAGE = 'Something went wrong \u2014 please try again'

/**
 * Forbidden patterns that must never appear in customer-facing error messages.
 * If any pattern matches, the message is replaced with a generic fallback.
 */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /square/i,                                                          // Third-party vendor name
  /stack/i,                                                           // Stack traces
  /Error:/,                                                           // Raw error prefixes
  /\{.*".*":.*\}/s,                                                   // Raw JSON objects
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, // UUIDs
  /staff-[a-zA-Z0-9]+/i,                                              // staffIds
  /vendor-[a-zA-Z0-9]+/i,                                             // vendorIds
]

/**
 * Sanitizes an error message for customer display.
 *
 * - If the input is not a string, returns a generic error message.
 * - If the input contains any forbidden pattern (Square, stack traces,
 *   Error:, JSON objects, UUIDs, staffIds, vendorIds), returns a generic
 *   error message.
 * - Otherwise, returns the original message unchanged.
 *
 * @param message - The raw error message (may be any type)
 * @returns A safe, customer-friendly error string
 */
export function sanitizeErrorForCustomer(message: unknown): string {
  if (typeof message !== 'string') {
    return GENERIC_ERROR_MESSAGE
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(message)) {
      return GENERIC_ERROR_MESSAGE
    }
  }

  return message
}
