/**
 * Structured Error Logging - Sanitizer
 *
 * Synchronous pipeline that scrubs sensitive data from log context before emission.
 * - Redacts fields whose keys contain "token", "secret", "password", or "credential"
 * - Masks email addresses (first char + *** + @domain)
 * - Masks phone numbers (last 4 digits only)
 * - Tracks all redacted field paths in dot-notation
 * - Suppresses entire entry on sanitizer error (Requirement 10.5)
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import type { LogContext, SanitizeResult } from './types';

/** Placeholder for redacted sensitive values */
const REDACTED_PLACEHOLDER = '[REDACTED]';

/** Default maximum recursion depth for nested object scanning */
const DEFAULT_MAX_DEPTH = 10;

/** Case-insensitive substrings that mark a field key as sensitive */
const SENSITIVE_KEY_PATTERNS = ['token', 'secret', 'password', 'credential'];

/** Simple email regex for detection */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Phone regex: matches a run of at least 4 consecutive digits (no backtracking). */
const PHONE_REGEX = /\d{4,}/;

/**
 * Determines if a key is sensitive based on whether it contains
 * "token", "secret", "password", or "credential" (case-insensitive).
 */
export function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => lowerKey.includes(pattern));
}

/**
 * Masks an email address: preserves the first character of the local part
 * and the full domain. E.g., "jane@example.com" → "j***@example.com"
 */
export function sanitizeEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex < 1) {
    // Not a valid email format — return as-is
    return email;
  }
  const firstChar = email[0];
  const domain = email.slice(atIndex);
  return `${firstChar}***${domain}`;
}

/**
 * Masks a phone number: preserves only the last 4 digits.
 * E.g., "555-867-5309" → "***-***-5309"
 *
 * Strategy: find all digit positions, keep only the last 4 digits,
 * replace earlier digits with '*'.
 */
export function sanitizePhone(phone: string): string {
  // Find all digit positions
  const digitPositions: number[] = [];
  for (let i = 0; i < phone.length; i++) {
    if (/\d/.test(phone[i])) {
      digitPositions.push(i);
    }
  }

  if (digitPositions.length <= 4) {
    // 4 or fewer digits — nothing to mask
    return phone;
  }

  // Replace all digits except the last 4 with '*'
  const keepFrom = digitPositions.length - 4;
  const chars = phone.split('');
  for (let i = 0; i < keepFrom; i++) {
    chars[digitPositions[i]] = '*';
  }
  return chars.join('');
}

/**
 * Checks if a string value looks like an email address.
 */
function isEmailLike(value: string): boolean {
  return EMAIL_REGEX.test(value);
}

/**
 * Checks if a string value looks like a phone number.
 * To avoid false positives on IDs, dates, and other alphanumeric strings:
 * - Strings containing letters are never treated as phone numbers
 * - Pure-digit strings need 10+ digits (standard phone length)
 * - Strings with phone formatting chars (dashes, parens, plus, spaces between digits) need 7+ digits
 */
function isPhoneLike(value: string): boolean {
  // If the string contains any letters, it's not a phone number
  if (/[a-zA-Z]/.test(value)) return false;

  const digitCount = (value.match(/\d/g) || []).length;
  const hasPhoneFormatting = /[\-\(\)\+]/.test(value) || /\d\s+\d/.test(value);
  if (!hasPhoneFormatting) {
    if (digitCount < 10) return false;
  } else {
    if (digitCount < 7) return false;
  }
  // Should be mostly digits and phone-related characters
  return PHONE_REGEX.test(value);
}

/**
 * Recursively scans a context object, redacting sensitive fields and masking PII.
 * Returns a flat LogContext (dot-notation keys) and an array of redacted field paths.
 *
 * @param context - The raw context object to sanitize
 * @param maxDepth - Maximum recursion depth (default 10)
 * @returns SanitizeResult with sanitized flat context and redactedFields array
 */
/**
 * Sanitizes a single string value, masking emails and phone numbers.
 * Returns the (possibly masked) value and whether it was redacted.
 */
function sanitizeStringValue(value: string): { value: string; redacted: boolean } {
  if (isEmailLike(value)) {
    return { value: sanitizeEmail(value), redacted: true };
  }
  if (isPhoneLike(value)) {
    return { value: sanitizePhone(value), redacted: true };
  }
  return { value, redacted: false };
}

/**
 * Converts a non-string, non-object primitive to its string representation.
 */
function stringifyPrimitive(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  // number, boolean, bigint, symbol — safe to String()
  return String(value as number | boolean | bigint | symbol);
}

/**
 * Recursively scans a context object, redacting sensitive fields and masking PII.
 * Returns a flat LogContext (dot-notation keys) and an array of redacted field paths.
 *
 * @param context - The raw context object to sanitize
 * @param maxDepth - Maximum recursion depth (default 10)
 * @returns SanitizeResult with sanitized flat context and redactedFields array
 */
export function sanitize(
  context: Record<string, unknown>,
  maxDepth: number = DEFAULT_MAX_DEPTH
): SanitizeResult {
  const flatContext: LogContext = {};
  const redactedFields: string[] = [];

  const handleValue = (path: string, value: unknown, depth: number): void => {
    // Nested objects — recurse
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      walk(value as Record<string, unknown>, path, depth + 1);
      return;
    }

    // Arrays — serialize to string
    if (Array.isArray(value)) {
      flatContext[path] = JSON.stringify(value);
      return;
    }

    // Strings — mask email/phone
    if (typeof value === 'string') {
      const { value: sanitized, redacted } = sanitizeStringValue(value);
      flatContext[path] = sanitized;
      if (redacted) redactedFields.push(path);
      return;
    }

    // Other primitives (number, boolean, null, undefined, etc.)
    flatContext[path] = stringifyPrimitive(value);
  };

  function walk(obj: Record<string, unknown>, prefix: string, depth: number): void {
    if (depth > maxDepth) {
      return;
    }

    for (const key of Object.keys(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;

      // Redact sensitive keys outright
      if (isSensitiveKey(key)) {
        flatContext[path] = REDACTED_PLACEHOLDER;
        redactedFields.push(path);
        continue;
      }

      handleValue(path, obj[key], depth);
    }
  }

  walk(context, '', 0);

  return { context: flatContext, redactedFields };
}
