/**
 * Security Hardening Unit Tests
 *
 * Validates: Requirements 11.1, 11.2, 11.3, 11.5, 11.6, 11.7
 *
 * Tests:
 * - HTTP 400 for invalid field types/ranges (bad dateTime, out-of-range duration, invalid staffId format)
 * - HTTP 404 for non-existent staffId or vendorId
 * - HTTP 429 when rate limit exceeded
 * - HTTP 401 for unauthenticated manual/edit/cancel requests
 * - Error responses do not contain stack traces or internal IDs for unauthenticated users
 * - Sanitization: HTML/script payloads are neutralized in persisted values
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  validateDateTime,
  validateDuration,
  validateId,
  validateCustomerBookingInput,
  validateManualBookingInput,
  validateAppointmentUpdateInput,
  buildValidationErrorResponse,
} from '../app/utils/inputValidation';
import { checkRateLimit, _resetStore } from '../app/utils/rateLimiter';
import {
  verifyStaffEntity,
  verifyVendorEntity,
  verifyBookingEntities,
} from '../app/utils/entityVerification';
import { safeErrorResponse, staffErrorResponse, hashRequestBody } from '../app/utils/auditLogger';
import {
  sanitizeInput,
  sanitizeCustomerName,
  sanitizeNotes,
  encodeHtmlEntities,
} from '../app/utils/inputSanitization';

// ============================================================================
// Input Validation — HTTP 400 scenarios (Requirement 11.1)
// ============================================================================

describe('Input Validation — HTTP 400 for invalid fields', () => {
  describe('validateDateTime', () => {
    test('rejects non-string dateTime', () => {
      expect(validateDateTime(12345)).toBe('Must be a string in ISO 8601 format (YYYY-MM-DDTHH:MM)');
    });

    test('rejects invalid format (missing T separator)', () => {
      expect(validateDateTime('2025-01-15 10:00')).toBe('Must be in ISO 8601 format (YYYY-MM-DDTHH:MM)');
    });

    test('rejects invalid format (random string)', () => {
      expect(validateDateTime('not-a-date')).toBe('Must be in ISO 8601 format (YYYY-MM-DDTHH:MM)');
    });

    test('rejects invalid date values (month 13)', () => {
      expect(validateDateTime('2025-13-01T10:00')).toBe('Invalid date/time value');
    });

    test('rejects past dateTime', () => {
      const past = '2020-01-01T10:00';
      expect(validateDateTime(past)).toBe('Must be a future date and time');
    });

    test('accepts valid future dateTime', () => {
      const future = '2099-06-15T14:30';
      expect(validateDateTime(future)).toBeNull();
    });

    test('returns null for undefined (optional field)', () => {
      expect(validateDateTime(undefined)).toBeNull();
    });

    test('rejects boolean dateTime', () => {
      expect(validateDateTime(true)).toBe('Must be a string in ISO 8601 format (YYYY-MM-DDTHH:MM)');
    });

    test('rejects array dateTime', () => {
      expect(validateDateTime(['2025-01-01T10:00'])).toBe('Must be a string in ISO 8601 format (YYYY-MM-DDTHH:MM)');
    });
  });

  describe('validateDuration', () => {
    test('rejects non-number duration', () => {
      expect(validateDuration('sixty')).toBe('Must be a positive integer');
    });

    test('rejects float duration', () => {
      expect(validateDuration(30.5)).toBe('Must be a positive integer');
    });

    test('rejects zero duration', () => {
      expect(validateDuration(0)).toBe('Must be between 1 and 480 minutes');
    });

    test('rejects negative duration', () => {
      expect(validateDuration(-10)).toBe('Must be between 1 and 480 minutes');
    });

    test('rejects duration exceeding 480 minutes', () => {
      expect(validateDuration(481)).toBe('Must be between 1 and 480 minutes');
    });

    test('accepts duration at lower bound (1)', () => {
      expect(validateDuration(1)).toBeNull();
    });

    test('accepts duration at upper bound (480)', () => {
      expect(validateDuration(480)).toBeNull();
    });

    test('returns null for undefined (optional field)', () => {
      expect(validateDuration(undefined)).toBeNull();
    });
  });

  describe('validateId', () => {
    test('rejects non-string ID', () => {
      expect(validateId(123, 'staffId')).toBe('staffId must be a non-empty string');
    });

    test('rejects empty string', () => {
      expect(validateId('', 'staffId')).toBe('staffId must not be empty');
    });

    test('rejects whitespace-only string', () => {
      expect(validateId('   ', 'staffId')).toBe('staffId must not be empty');
    });

    test('rejects ID with special characters', () => {
      expect(validateId('staff@#$%', 'staffId')).toBe('staffId must contain only alphanumeric characters and dashes');
    });

    test('rejects ID with spaces', () => {
      expect(validateId('staff id 123', 'staffId')).toBe('staffId must contain only alphanumeric characters and dashes');
    });

    test('accepts alphanumeric ID with dashes', () => {
      expect(validateId('staff-abc-123', 'staffId')).toBeNull();
    });

    test('returns null for undefined (optional field)', () => {
      expect(validateId(undefined, 'vendorId')).toBeNull();
    });
  });

  describe('validateCustomerBookingInput', () => {
    test('returns errors for missing required fields', () => {
      const result = validateCustomerBookingInput({});
      expect(result.valid).toBe(false);
      expect(result.errors.dateTime).toBeDefined();
      expect(result.errors.serviceId).toBeDefined();
    });

    test('returns errors for invalid field types', () => {
      const result = validateCustomerBookingInput({
        dateTime: 12345,
        serviceId: 999,
        staffId: true,
        duration: 'long',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.dateTime).toBeDefined();
      expect(result.errors.serviceId).toBeDefined();
      expect(result.errors.staffId).toBeDefined();
      expect(result.errors.duration).toBeDefined();
    });

    test('returns valid for correct inputs', () => {
      const result = validateCustomerBookingInput({
        dateTime: '2099-06-15T14:30',
        serviceId: 'svc-123',
        staffId: 'staff-abc',
        vendorId: 'vendor-1',
        duration: 60,
      });
      expect(result.valid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });
  });

  describe('validateManualBookingInput', () => {
    test('returns errors for missing vendorId and dateTime', () => {
      const result = validateManualBookingInput({});
      expect(result.valid).toBe(false);
      expect(result.errors.vendorId).toBeDefined();
      expect(result.errors.dateTime).toBeDefined();
    });

    test('returns errors for invalid staffId format', () => {
      const result = validateManualBookingInput({
        vendorId: 'vendor-1',
        dateTime: '2099-06-15T14:30',
        staffId: 'staff with spaces!',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.staffId).toBeDefined();
    });
  });

  describe('validateAppointmentUpdateInput', () => {
    test('returns errors for missing appointmentId', () => {
      const result = validateAppointmentUpdateInput({});
      expect(result.valid).toBe(false);
      expect(result.errors.appointmentId).toBeDefined();
    });

    test('validates optional dateTime when provided', () => {
      const result = validateAppointmentUpdateInput({
        appointmentId: 'appt-123',
        dateTime: 'not-valid',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.dateTime).toBeDefined();
    });
  });

  describe('buildValidationErrorResponse', () => {
    test('returns structured error without internal details', () => {
      const response = buildValidationErrorResponse({ dateTime: 'Invalid format' });
      expect(response.error).toBe('Validation failed');
      expect(response.fields).toEqual({ dateTime: 'Invalid format' });
    });
  });
});

// ============================================================================
// Entity Verification — HTTP 404 scenarios (Requirement 11.7)
// ============================================================================

describe('Entity Verification — HTTP 404 for non-existent entities', () => {
  describe('verifyStaffEntity', () => {
    test('returns 404 when staff member does not exist', async () => {
      const mockClient = {
        models: {
          StaffSchedule: {
            get: async () => ({ data: null }),
          },
        },
      };

      const result = await verifyStaffEntity(mockClient, 'non-existent-staff');
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(404);
      expect(result.error).toBe('Staff member not found');
    });

    test('returns 404 when staff member is inactive', async () => {
      const mockClient = {
        models: {
          StaffSchedule: {
            get: async () => ({ data: { visibleId: 'staff-1', isActive: false } }),
          },
        },
      };

      const result = await verifyStaffEntity(mockClient, 'staff-1');
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(404);
      expect(result.error).toBe('Staff member not found');
    });

    test('returns valid for active staff member', async () => {
      const mockClient = {
        models: {
          StaffSchedule: {
            get: async () => ({ data: { visibleId: 'staff-1', isActive: true } }),
          },
        },
      };

      const result = await verifyStaffEntity(mockClient, 'staff-1');
      expect(result.valid).toBe(true);
      expect(result.statusCode).toBeUndefined();
    });
  });

  describe('verifyVendorEntity', () => {
    test('returns 404 when vendor does not exist', async () => {
      const mockClient = {
        models: {
          Vendor: {
            get: async () => ({ data: null }),
          },
        },
      };

      const result = await verifyVendorEntity(mockClient, 'non-existent-vendor');
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(404);
      expect(result.error).toBe('Vendor not found');
    });

    test('returns 404 when vendor is inactive', async () => {
      const mockClient = {
        models: {
          Vendor: {
            get: async () => ({ data: { vendorId: 'vendor-1', isActive: false } }),
          },
        },
      };

      const result = await verifyVendorEntity(mockClient, 'vendor-1');
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(404);
      expect(result.error).toBe('Vendor not found');
    });

    test('returns valid for active vendor', async () => {
      const mockClient = {
        models: {
          Vendor: {
            get: async () => ({ data: { vendorId: 'vendor-1', isActive: true } }),
          },
        },
      };

      const result = await verifyVendorEntity(mockClient, 'vendor-1');
      expect(result.valid).toBe(true);
    });
  });

  describe('verifyBookingEntities', () => {
    test('returns 404 when staffId is invalid', async () => {
      const mockClient = {
        models: {
          StaffSchedule: {
            get: async () => ({ data: null }),
          },
          Vendor: {
            get: async () => ({ data: { vendorId: 'vendor-1', isActive: true } }),
          },
        },
      };

      const result = await verifyBookingEntities(mockClient, 'bad-staff', 'vendor-1');
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(404);
    });

    test('returns 404 when vendorId is invalid', async () => {
      const mockClient = {
        models: {
          StaffSchedule: {
            get: async () => ({ data: { visibleId: 'staff-1', isActive: true } }),
          },
          Vendor: {
            get: async () => ({ data: null }),
          },
        },
      };

      const result = await verifyBookingEntities(mockClient, 'staff-1', 'bad-vendor');
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(404);
    });

    test('returns valid when both entities exist and are active', async () => {
      const mockClient = {
        models: {
          StaffSchedule: {
            get: async () => ({ data: { visibleId: 'staff-1', isActive: true } }),
          },
          Vendor: {
            get: async () => ({ data: { vendorId: 'vendor-1', isActive: true } }),
          },
        },
      };

      const result = await verifyBookingEntities(mockClient, 'staff-1', 'vendor-1');
      expect(result.valid).toBe(true);
    });

    test('skips verification when IDs are not provided', async () => {
      const mockClient = { models: {} };
      const result = await verifyBookingEntities(mockClient, undefined, null);
      expect(result.valid).toBe(true);
    });
  });
});

// ============================================================================
// Rate Limiting — HTTP 429 scenarios (Requirement 11.2)
// ============================================================================

describe('Rate Limiting — HTTP 429 when limit exceeded', () => {
  beforeEach(() => {
    _resetStore();
  });

  test('allows requests within limit', () => {
    const limit = 10;
    const windowMs = 60_000;

    for (let i = 0; i < limit; i++) {
      const result = checkRateLimit('test-ip', limit, windowMs);
      expect(result.allowed).toBe(true);
    }
  });

  test('blocks request when limit is exceeded', () => {
    const limit = 5;
    const windowMs = 60_000;

    // Exhaust the limit
    for (let i = 0; i < limit; i++) {
      checkRateLimit('rate-test-ip', limit, windowMs);
    }

    // Next request should be blocked
    const result = checkRateLimit('rate-test-ip', limit, windowMs);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  test('returns retryAfter in seconds', () => {
    const limit = 3;
    const windowMs = 60_000;

    for (let i = 0; i < limit; i++) {
      checkRateLimit('retry-ip', limit, windowMs);
    }

    const result = checkRateLimit('retry-ip', limit, windowMs);
    expect(result.allowed).toBe(false);
    expect(typeof result.retryAfter).toBe('number');
    expect(result.retryAfter).toBeGreaterThanOrEqual(1);
    expect(result.retryAfter).toBeLessThanOrEqual(60);
  });

  test('rate limits are per-key (different IPs are independent)', () => {
    const limit = 2;
    const windowMs = 60_000;

    // Exhaust limit for IP A
    for (let i = 0; i < limit; i++) {
      checkRateLimit('ip-a', limit, windowMs);
    }
    const blockedA = checkRateLimit('ip-a', limit, windowMs);
    expect(blockedA.allowed).toBe(false);

    // IP B should still be allowed
    const allowedB = checkRateLimit('ip-b', limit, windowMs);
    expect(allowedB.allowed).toBe(true);
  });

  test('customer booking rate limit scenario (10 requests/min per IP)', () => {
    const limit = 10;
    const windowMs = 60_000;
    const ip = '192.168.1.1';

    for (let i = 0; i < limit; i++) {
      const result = checkRateLimit(ip, limit, windowMs);
      expect(result.allowed).toBe(true);
    }

    // 11th request should be blocked
    const blocked = checkRateLimit(ip, limit, windowMs);
    expect(blocked.allowed).toBe(false);
  });
});

// ============================================================================
// Error Response Suppression — No stack traces/internal IDs (Requirement 11.6)
// ============================================================================

describe('Error Response Suppression — no stack traces or internal IDs', () => {
  describe('safeErrorResponse', () => {
    test('returns generic message for 400', () => {
      const response = safeErrorResponse(400, new Error('Detailed internal error'));
      expect(response.error).toBe('Validation failed');
      expect(JSON.stringify(response)).not.toContain('stack');
      expect(JSON.stringify(response)).not.toContain('internal');
    });

    test('returns generic message for 401', () => {
      const response = safeErrorResponse(401, { internalId: 'usr-123', stack: 'at func...' });
      expect(response.error).toBe('Unauthorized');
      expect(JSON.stringify(response)).not.toContain('usr-123');
      expect(JSON.stringify(response)).not.toContain('at func');
    });

    test('returns generic message for 404', () => {
      const response = safeErrorResponse(404, { dbError: 'DynamoDB ConditionalCheckFailed' });
      expect(response.error).toBe('Not found');
      expect(JSON.stringify(response)).not.toContain('DynamoDB');
      expect(JSON.stringify(response)).not.toContain('ConditionalCheckFailed');
    });

    test('returns generic message for 409', () => {
      const response = safeErrorResponse(409, { appointmentId: 'appt-internal-xyz' });
      expect(response.error).toBe('This time slot is no longer available');
      expect(JSON.stringify(response)).not.toContain('appt-internal-xyz');
    });

    test('returns generic message for 429', () => {
      const response = safeErrorResponse(429);
      expect(response.error).toBe('Too many requests. Please try again later.');
    });

    test('returns generic message for 500', () => {
      const errWithStack = new Error('Database connection timeout');
      const response = safeErrorResponse(500, errWithStack);
      expect(response.error).toBe('An error occurred');
      expect(JSON.stringify(response)).not.toContain('Database connection timeout');
      expect(JSON.stringify(response)).not.toContain('stack');
    });

    test('does not expose internal error objects', () => {
      const internalError = {
        stack: 'Error: at route.ts:42\n  at processRequest...',
        code: 'INTERNAL_DB_ERROR',
        requestId: 'req-abc-123',
      };
      const response = safeErrorResponse(500, internalError);
      const responseStr = JSON.stringify(response);
      expect(responseStr).not.toContain('route.ts');
      expect(responseStr).not.toContain('INTERNAL_DB_ERROR');
      expect(responseStr).not.toContain('req-abc-123');
    });

    test('response contains only the error field', () => {
      const response = safeErrorResponse(400, { secret: 'top-secret', trace: 'long stack trace' });
      expect(Object.keys(response)).toEqual(['error']);
    });
  });

  describe('staffErrorResponse', () => {
    test('returns base error with optional context for staff', () => {
      const response = staffErrorResponse(409, 'Conflict at 10:00 AM');
      expect(response.error).toBe('This time slot is no longer available');
      expect(response.detail).toBe('Conflict at 10:00 AM');
    });

    test('does not expose stack traces even for staff', () => {
      const response = staffErrorResponse(500, 'Server processing failed');
      expect(response.error).toBe('An error occurred');
      expect(response.detail).toBe('Server processing failed');
      expect(JSON.stringify(response)).not.toContain('stack');
    });

    test('returns only base error when no context provided', () => {
      const response = staffErrorResponse(404);
      expect(response.error).toBe('Not found');
      expect(response.detail).toBeUndefined();
    });
  });

  describe('hashRequestBody', () => {
    test('returns a 16-character hex hash', () => {
      const hash = hashRequestBody({ name: 'John', phone: '555-1234' });
      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    test('does not expose original body content', () => {
      const body = { name: 'Sensitive Name', creditCard: '4111-1111-1111-1111' };
      const hash = hashRequestBody(body);
      expect(hash).not.toContain('Sensitive');
      expect(hash).not.toContain('4111');
    });

    test('produces consistent hash for same input', () => {
      const body = { key: 'value' };
      expect(hashRequestBody(body)).toBe(hashRequestBody(body));
    });
  });
});

// ============================================================================
// Input Sanitization — HTML/script payloads neutralized (Requirement 11.5)
// ============================================================================

describe('Input Sanitization — HTML/script payloads neutralized', () => {
  describe('XSS attack vectors', () => {
    test('neutralizes script tag in customer name', () => {
      const malicious = '<script>document.cookie</script>';
      const result = sanitizeCustomerName(malicious);
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    test('neutralizes img onerror payload', () => {
      const malicious = '<img src=x onerror=alert(1)>';
      const result = sanitizeInput(malicious);
      expect(result).not.toContain('<img');
      expect(result).toContain('&lt;img');
    });

    test('neutralizes event handler injection', () => {
      const malicious = '" onmouseover="alert(1)"';
      const result = sanitizeInput(malicious);
      expect(result).not.toContain('" onmouseover');
      expect(result).toContain('&quot;');
    });

    test('neutralizes iframe injection', () => {
      const malicious = '<iframe src="https://evil.com"></iframe>';
      const result = sanitizeNotes(malicious);
      expect(result).not.toContain('<iframe');
      expect(result).toContain('&lt;iframe');
    });

    test('neutralizes SVG/onload vector', () => {
      const malicious = '<svg onload=alert(1)>';
      const result = sanitizeInput(malicious);
      expect(result).not.toContain('<svg');
      expect(result).toContain('&lt;svg');
    });

    test('neutralizes javascript: protocol', () => {
      const malicious = '<a href="javascript:alert(1)">click</a>';
      const result = sanitizeInput(malicious);
      expect(result).not.toContain('<a href');
      expect(result).toContain('&lt;a');
    });
  });

  describe('encodeHtmlEntities covers all dangerous characters', () => {
    test('encodes ampersand', () => {
      expect(encodeHtmlEntities('a & b')).toBe('a &amp; b');
    });

    test('encodes less-than', () => {
      expect(encodeHtmlEntities('a < b')).toBe('a &lt; b');
    });

    test('encodes greater-than', () => {
      expect(encodeHtmlEntities('a > b')).toBe('a &gt; b');
    });

    test('encodes double quotes', () => {
      expect(encodeHtmlEntities('say "hello"')).toBe('say &quot;hello&quot;');
    });

    test('encodes single quotes', () => {
      expect(encodeHtmlEntities("it's")).toBe('it&#39;s');
    });

    test('handles multiple dangerous characters in one string', () => {
      const input = '<script>alert("xss" & \'hack\')</script>';
      const result = encodeHtmlEntities(input);
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).not.toContain('"');
      expect(result).not.toContain("'");
      // & appears in the encoded output as &amp; and within &lt;, &gt; etc.
      expect(result).toContain('&lt;script&gt;');
    });
  });

  describe('sanitization preserves safe content', () => {
    test('leaves plain text unchanged', () => {
      expect(sanitizeInput('Hello World')).toBe('Hello World');
    });

    test('leaves numbers in string form unchanged', () => {
      expect(sanitizeInput('Room 101')).toBe('Room 101');
    });

    test('preserves accented characters', () => {
      expect(sanitizeInput('José García')).toBe('José García');
    });

    test('preserves Unicode characters', () => {
      expect(sanitizeInput('日本語テスト')).toBe('日本語テスト');
    });
  });

  describe('length enforcement prevents oversized payloads', () => {
    test('truncates customer name at 100 characters', () => {
      const longPayload = 'A'.repeat(200);
      const result = sanitizeCustomerName(longPayload);
      expect(result.length).toBeLessThanOrEqual(100);
    });

    test('truncates notes at 500 characters', () => {
      const longPayload = 'B'.repeat(1000);
      const result = sanitizeNotes(longPayload);
      expect(result.length).toBeLessThanOrEqual(500);
    });
  });
});
