/**
 * Input Sanitization for Booking Endpoints
 *
 * Sanitizes all string inputs before persistence to prevent stored XSS
 * and enforce consistent formatting.
 *
 * Operations applied in order:
 * 1. HTML entity encoding: <, >, &, ", ' → &lt;, &gt;, &amp;, &quot;, &#39;
 * 2. Trim leading/trailing whitespace
 * 3. Normalize internal whitespace (collapse multiple spaces/tabs to single space)
 * 4. Truncate at max length
 *
 * Requirements: 11.5
 */

/** Maximum lengths for various string fields */
export const MAX_LENGTHS = {
  name: 100,
  notes: 500,
  description: 500,
} as const;

/**
 * Encodes HTML entities to prevent XSS when values are rendered in UI.
 * Characters encoded: < > & " '
 */
export function encodeHtmlEntities(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitizes a text input string by applying all sanitization steps:
 * 1. Encode HTML entities
 * 2. Trim leading/trailing whitespace
 * 3. Normalize internal whitespace (collapse runs of spaces/tabs to single space)
 * 4. Truncate at maxLength
 *
 * Returns empty string for null/undefined inputs.
 *
 * @param text - Raw text input to sanitize
 * @param maxLength - Maximum allowed length for the output (default: 500)
 * @returns Sanitized string
 */
export function sanitizeInput(text: unknown, maxLength: number = MAX_LENGTHS.notes): string {
  if (text == null) {
    return '';
  }

  if (typeof text === 'object') {
    return '';
  }

  let sanitized = String(text);

  // 1. Encode HTML entities (must happen before whitespace normalization
  //    so that entity characters like & in &amp; aren't double-encoded)
  sanitized = encodeHtmlEntities(sanitized);

  // 2. Trim leading/trailing whitespace
  sanitized = sanitized.trim();

  // 3. Normalize internal whitespace: collapse multiple spaces/tabs to single space
  sanitized = sanitized.replace(/\s+/g, ' ');

  // 4. Truncate at max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  return sanitized;
}

/**
 * Sanitizes a customer name field.
 * Applies full sanitization with max length of 100 characters.
 */
export function sanitizeCustomerName(name: unknown): string {
  return sanitizeInput(name, MAX_LENGTHS.name);
}

/**
 * Sanitizes a notes/description field.
 * Applies full sanitization with max length of 500 characters.
 */
export function sanitizeNotes(notes: unknown): string {
  return sanitizeInput(notes, MAX_LENGTHS.notes);
}

/**
 * Sanitizes all customer-facing string fields in a customer object.
 * Returns a new object with sanitized string fields, preserving non-string fields.
 */
export function sanitizeCustomerFields(customer: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...customer };

  if (customer.name !== undefined) {
    sanitized.name = sanitizeCustomerName(customer.name);
  }

  if (customer.notes !== undefined) {
    sanitized.notes = sanitizeNotes(customer.notes);
  }

  return sanitized;
}
