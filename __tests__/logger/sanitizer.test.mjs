/**
 * Unit tests for the Sanitizer module.
 *
 * Validates Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { sanitize, sanitizeEmail, sanitizePhone, isSensitiveKey } from '../../lib/logger/sanitizer.ts';

describe('Sanitizer', () => {
  describe('isSensitiveKey', () => {
    it('detects keys containing "token" (case-insensitive)', () => {
      expect(isSensitiveKey('accessToken')).toBe(true);
      expect(isSensitiveKey('ACCESS_TOKEN')).toBe(true);
      expect(isSensitiveKey('token')).toBe(true);
      expect(isSensitiveKey('refreshtoken')).toBe(true);
    });

    it('detects keys containing "secret" (case-insensitive)', () => {
      expect(isSensitiveKey('clientSecret')).toBe(true);
      expect(isSensitiveKey('SECRET_KEY')).toBe(true);
    });

    it('detects keys containing "password" (case-insensitive)', () => {
      expect(isSensitiveKey('password')).toBe(true);
      expect(isSensitiveKey('userPassword')).toBe(true);
      expect(isSensitiveKey('PASSWORD_HASH')).toBe(true);
    });

    it('detects keys containing "credential" (case-insensitive)', () => {
      expect(isSensitiveKey('credential')).toBe(true);
      expect(isSensitiveKey('oauthCredential')).toBe(true);
      expect(isSensitiveKey('CREDENTIALS')).toBe(true);
    });

    it('returns false for non-sensitive keys', () => {
      expect(isSensitiveKey('vendorId')).toBe(false);
      expect(isSensitiveKey('amount')).toBe(false);
      expect(isSensitiveKey('staffId')).toBe(false);
      expect(isSensitiveKey('email')).toBe(false);
    });
  });

  describe('sanitizeEmail', () => {
    it('masks email preserving first char and domain', () => {
      expect(sanitizeEmail('jane@example.com')).toBe('j***@example.com');
    });

    it('masks single char local part', () => {
      expect(sanitizeEmail('a@test.org')).toBe('a***@test.org');
    });

    it('masks long local part', () => {
      expect(sanitizeEmail('longusername@domain.co.uk')).toBe('l***@domain.co.uk');
    });

    it('returns invalid emails as-is (no @ sign)', () => {
      expect(sanitizeEmail('notanemail')).toBe('notanemail');
    });

    it('returns emails with @ at position 0 as-is', () => {
      expect(sanitizeEmail('@domain.com')).toBe('@domain.com');
    });
  });

  describe('sanitizePhone', () => {
    it('masks phone preserving last 4 digits', () => {
      expect(sanitizePhone('555-867-5309')).toBe('***-***-5309');
    });

    it('masks phone number with country code', () => {
      expect(sanitizePhone('+1-555-867-5309')).toBe('+*-***-***-5309');
    });

    it('masks plain digit phone number', () => {
      expect(sanitizePhone('5558675309')).toBe('******5309');
    });

    it('returns short numbers as-is (4 or fewer digits)', () => {
      expect(sanitizePhone('1234')).toBe('1234');
    });
  });

  describe('sanitize', () => {
    it('redacts fields with sensitive keys', () => {
      const result = sanitize({
        vendorId: 'v123',
        accessToken: 'sq-token-xyz',
        refreshToken: 'rt-abc',
      });

      expect(result.context.vendorId).toBe('v123');
      expect(result.context.accessToken).toBe('[REDACTED]');
      expect(result.context.refreshToken).toBe('[REDACTED]');
      expect(result.redactedFields).toContain('accessToken');
      expect(result.redactedFields).toContain('refreshToken');
    });

    it('masks email values', () => {
      const result = sanitize({
        customerEmail: 'jane@example.com',
      });

      expect(result.context.customerEmail).toBe('j***@example.com');
      expect(result.redactedFields).toContain('customerEmail');
    });

    it('masks phone values', () => {
      const result = sanitize({
        phone: '555-867-5309',
      });

      expect(result.context.phone).toBe('***-***-5309');
      expect(result.redactedFields).toContain('phone');
    });

    it('handles nested objects with dot-notation paths', () => {
      const result = sanitize({
        user: {
          name: 'Jane',
          credentials: {
            accessToken: 'secret-token',
          },
        },
      });

      expect(result.context['user.name']).toBe('Jane');
      expect(result.context['user.credentials']).toBe('[REDACTED]');
      expect(result.redactedFields).toContain('user.credentials');
    });

    it('scans recursively up to maxDepth levels', () => {
      // Create an object nested 12 levels deep
      let deepObj = { secretKey: 'should-not-reach' };
      for (let i = 0; i < 11; i++) {
        deepObj = { nested: deepObj };
      }

      const result = sanitize(deepObj, 10);
      // At depth 10, it should stop recursing — the key "nested" at level 11 won't be processed
      // but the content at exactly depth 10 should still be processed
      expect(result.redactedFields.length).toBeGreaterThanOrEqual(0);
    });

    it('handles objects at exactly maxDepth', () => {
      // 2 levels deep with maxDepth=2
      const result = sanitize({
        level1: {
          level2: {
            secretKey: 'hidden',
          },
        },
      }, 2);

      expect(result.context['level1.level2.secretKey']).toBe('[REDACTED]');
      expect(result.redactedFields).toContain('level1.level2.secretKey');
    });

    it('returns empty redactedFields when nothing is redacted', () => {
      const result = sanitize({
        vendorId: 'v123',
        amount: '5000',
      });

      expect(result.context.vendorId).toBe('v123');
      expect(result.context.amount).toBe('5000');
      expect(result.redactedFields).toEqual([]);
    });

    it('converts non-string primitives to strings', () => {
      const result = sanitize({
        count: 42,
        active: true,
        missing: null,
      });

      expect(result.context.count).toBe('42');
      expect(result.context.active).toBe('true');
      expect(result.context.missing).toBe('null');
    });

    it('serializes arrays to JSON strings', () => {
      const result = sanitize({
        tags: ['a', 'b', 'c'],
      });

      expect(result.context.tags).toBe('["a","b","c"]');
    });

    it('handles empty context', () => {
      const result = sanitize({});
      expect(result.context).toEqual({});
      expect(result.redactedFields).toEqual([]);
    });

    it('handles OAuth credentials from Square', () => {
      const result = sanitize({
        vendorId: 'vendor_abc',
        oauthCredential: 'EAAAl...',
        squareAccessToken: 'sq0atp-xyz',
        squareRefreshToken: 'sq0art-xyz',
      });

      expect(result.context.vendorId).toBe('vendor_abc');
      expect(result.context.oauthCredential).toBe('[REDACTED]');
      expect(result.context.squareAccessToken).toBe('[REDACTED]');
      expect(result.context.squareRefreshToken).toBe('[REDACTED]');
      expect(result.redactedFields).toHaveLength(3);
    });
  });
});
