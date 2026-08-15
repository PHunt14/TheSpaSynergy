/**
 * Unit tests for input sanitization utility.
 *
 * Validates: Requirements 11.5
 *
 * Tests:
 * - HTML entity encoding: <, >, &, ", ' are encoded
 * - Whitespace trimming (leading/trailing)
 * - Internal whitespace normalization (collapse multiple spaces/tabs)
 * - Length truncation at max limit
 * - Null/undefined handling
 * - Combined sanitization scenarios
 * - sanitizeCustomerName uses 100 char limit
 * - sanitizeNotes uses 500 char limit
 * - sanitizeCustomerFields sanitizes object properties
 */

import { describe, test, expect } from '@jest/globals';
import {
  encodeHtmlEntities,
  sanitizeInput,
  sanitizeCustomerName,
  sanitizeNotes,
  sanitizeCustomerFields,
  MAX_LENGTHS,
} from '../../app/utils/inputSanitization';

describe('Input Sanitization', () => {
  describe('encodeHtmlEntities', () => {
    test('encodes < to &lt;', () => {
      expect(encodeHtmlEntities('<')).toBe('&lt;');
    });

    test('encodes > to &gt;', () => {
      expect(encodeHtmlEntities('>')).toBe('&gt;');
    });

    test('encodes & to &amp;', () => {
      expect(encodeHtmlEntities('&')).toBe('&amp;');
    });

    test('encodes " to &quot;', () => {
      expect(encodeHtmlEntities('"')).toBe('&quot;');
    });

    test("encodes ' to &#39;", () => {
      expect(encodeHtmlEntities("'")).toBe('&#39;');
    });

    test('encodes all special characters in a string', () => {
      expect(encodeHtmlEntities('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });

    test('leaves normal text unchanged', () => {
      expect(encodeHtmlEntities('Hello World')).toBe('Hello World');
    });

    test('handles empty string', () => {
      expect(encodeHtmlEntities('')).toBe('');
    });
  });

  describe('sanitizeInput', () => {
    test('returns empty string for null', () => {
      expect(sanitizeInput(null)).toBe('');
    });

    test('returns empty string for undefined', () => {
      expect(sanitizeInput(undefined)).toBe('');
    });

    test('trims leading whitespace', () => {
      expect(sanitizeInput('   hello')).toBe('hello');
    });

    test('trims trailing whitespace', () => {
      expect(sanitizeInput('hello   ')).toBe('hello');
    });

    test('normalizes internal multiple spaces to single space', () => {
      expect(sanitizeInput('hello    world')).toBe('hello world');
    });

    test('normalizes tabs to single space', () => {
      expect(sanitizeInput('hello\t\tworld')).toBe('hello world');
    });

    test('normalizes mixed whitespace (spaces and tabs)', () => {
      expect(sanitizeInput('hello  \t  world')).toBe('hello world');
    });

    test('encodes HTML entities', () => {
      expect(sanitizeInput('<b>bold</b>')).toBe('&lt;b&gt;bold&lt;/b&gt;');
    });

    test('truncates at max length', () => {
      const longString = 'a'.repeat(600);
      const result = sanitizeInput(longString, 500);
      expect(result.length).toBe(500);
    });

    test('does not truncate when within limit', () => {
      const shortString = 'hello';
      expect(sanitizeInput(shortString, 500)).toBe('hello');
    });

    test('handles script tags by encoding them', () => {
      const xss = '<script>alert("xss")</script>';
      const result = sanitizeInput(xss);
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    test('converts numbers to string', () => {
      expect(sanitizeInput(42)).toBe('42');
    });

    test('applies all operations in correct order', () => {
      // Input with HTML, extra whitespace, leading/trailing spaces
      const input = '  <b>Hello</b>    World  ';
      const result = sanitizeInput(input);
      // Should encode HTML, trim, and normalize whitespace
      expect(result).toBe('&lt;b&gt;Hello&lt;/b&gt; World');
    });
  });

  describe('sanitizeCustomerName', () => {
    test('uses max length of 100', () => {
      const longName = 'a'.repeat(150);
      const result = sanitizeCustomerName(longName);
      expect(result.length).toBe(100);
    });

    test('sanitizes HTML in name', () => {
      expect(sanitizeCustomerName('John <script>alert(1)</script> Doe')).toBe(
        'John &lt;script&gt;alert(1)&lt;/script&gt; Doe'
      );
    });

    test('trims and normalizes whitespace in name', () => {
      expect(sanitizeCustomerName('  John    Doe  ')).toBe('John Doe');
    });

    test('returns empty string for null/undefined', () => {
      expect(sanitizeCustomerName(null)).toBe('');
      expect(sanitizeCustomerName(undefined)).toBe('');
    });
  });

  describe('sanitizeNotes', () => {
    test('uses max length of 500', () => {
      const longNotes = 'a'.repeat(600);
      const result = sanitizeNotes(longNotes);
      expect(result.length).toBe(500);
    });

    test('sanitizes HTML in notes', () => {
      expect(sanitizeNotes('Note: <img src=x onerror=alert(1)>')).toContain('&lt;img');
    });

    test('trims and normalizes whitespace in notes', () => {
      expect(sanitizeNotes('  First note.    Second note.  ')).toBe('First note. Second note.');
    });
  });

  describe('sanitizeCustomerFields', () => {
    test('sanitizes name field', () => {
      const customer = { name: '  <b>John</b>  ', phone: '123' };
      const result = sanitizeCustomerFields(customer);
      expect(result.name).toBe('&lt;b&gt;John&lt;/b&gt;');
      expect(result.phone).toBe('123'); // non-target fields unchanged
    });

    test('sanitizes notes field', () => {
      const customer = { name: 'John', notes: '<script>x</script>' };
      const result = sanitizeCustomerFields(customer);
      expect(result.notes).toBe('&lt;script&gt;x&lt;/script&gt;');
    });

    test('preserves non-string fields', () => {
      const customer = { name: 'John', duration: 60, isNewClient: true };
      const result = sanitizeCustomerFields(customer);
      expect(result.duration).toBe(60);
      expect(result.isNewClient).toBe(true);
    });

    test('handles missing name and notes gracefully', () => {
      const customer = { phone: '555-1234' };
      const result = sanitizeCustomerFields(customer);
      expect(result.phone).toBe('555-1234');
      expect(result.name).toBeUndefined();
      expect(result.notes).toBeUndefined();
    });
  });

  describe('MAX_LENGTHS constants', () => {
    test('name max length is 100', () => {
      expect(MAX_LENGTHS.name).toBe(100);
    });

    test('notes max length is 500', () => {
      expect(MAX_LENGTHS.notes).toBe(500);
    });

    test('description max length is 500', () => {
      expect(MAX_LENGTHS.description).toBe(500);
    });
  });
});
