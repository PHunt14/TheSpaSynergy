/**
 * Property-Based Tests for the Sanitizer module.
 *
 * Feature: structured-error-logging
 * Uses fast-check for property-based testing with minimum 100 iterations.
 */

import * as fc from 'fast-check';
import { sanitize } from '../../lib/logger/sanitizer.ts';

/**
 * Property 10: Redacted fields tracking
 * Validates: Requirements 10.4
 *
 * For any object passed through the Sanitizer that results in at least one field being
 * redacted, the output SHALL include a `redactedFields` array containing exactly the
 * dot-notation paths of all fields that were redacted, and no other paths.
 */
describe('Feature: structured-error-logging, Property 10: Redacted fields tracking', () => {
  // Sensitive key patterns that trigger [REDACTED]
  const SENSITIVE_SUBSTRINGS = ['token', 'secret', 'password', 'credential'];

  // Email regex matching the sanitizer's logic
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Generate a key that IS sensitive (contains one of the substrings)
  const sensitiveKeyArb = fc.oneof(
    ...SENSITIVE_SUBSTRINGS.map((pattern) =>
      fc.tuple(
        fc.string({ minLength: 0, maxLength: 5, unit: 'grapheme-ascii' }),
        fc.string({ minLength: 0, maxLength: 5, unit: 'grapheme-ascii' })
      ).map(([prefix, suffix]) => `${prefix}${pattern}${suffix}`)
    )
  );

  // Generate a key that is NOT sensitive (does not contain any sensitive substring)
  const nonSensitiveKeyArb = fc.string({ minLength: 1, maxLength: 20, unit: 'grapheme-ascii' }).filter((key) => {
    const lower = key.toLowerCase();
    return !SENSITIVE_SUBSTRINGS.some((p) => lower.includes(p));
  });

  // Generate a non-email, non-phone string value (plain safe value)
  const plainValueArb = fc.string({ minLength: 1, maxLength: 30, unit: 'grapheme-ascii' }).filter((val) => {
    // Not email-like
    if (EMAIL_REGEX.test(val)) return false;
    // Not phone-like: fewer than 7 digits
    const digitCount = (val.match(/\d/g) || []).length;
    if (digitCount >= 7) return false;
    return true;
  });

  // Generate an email-like value
  const emailValueArb = fc.tuple(
    fc.string({ minLength: 1, maxLength: 8, unit: 'grapheme-ascii' }).filter((s) => !s.includes('@') && !s.includes(' ') && s.length >= 1),
    fc.string({ minLength: 1, maxLength: 8, unit: 'grapheme-ascii' }).filter((s) => !s.includes('@') && !s.includes(' ') && !s.includes('.') && s.length >= 1),
    fc.string({ minLength: 2, maxLength: 4, unit: 'grapheme-ascii' }).filter((s) => !s.includes('@') && !s.includes(' ') && !s.includes('.') && s.length >= 2)
  ).map(([local, domain, tld]) => `${local}@${domain}.${tld}`).filter((email) => EMAIL_REGEX.test(email));

  // Generate a phone-like value (7+ digits with optional separators)
  const phoneValueArb = fc.tuple(
    fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 7, maxLength: 12 })
  ).map(([digits]) => digits.join(''));

  it('redactedFields contains exactly the paths of all modified fields (1:1 correspondence)', () => {
    // Generate an object with a guaranteed mix of sensitive and non-sensitive fields
    const objectWithMixArb = fc.record({
      // At least one sensitive key field to guarantee redaction
      sensitiveEntries: fc.array(
        fc.tuple(sensitiveKeyArb, fc.string({ minLength: 1, maxLength: 20 })),
        { minLength: 1, maxLength: 5 }
      ),
      // Some non-sensitive fields with plain values
      plainEntries: fc.array(
        fc.tuple(nonSensitiveKeyArb, plainValueArb),
        { minLength: 0, maxLength: 5 }
      ),
    });

    fc.assert(
      fc.property(objectWithMixArb, ({ sensitiveEntries, plainEntries }) => {
        // Build the input object
        const input = {};
        for (const [key, value] of sensitiveEntries) {
          if (key.length > 0) input[key] = value;
        }
        for (const [key, value] of plainEntries) {
          if (key.length > 0 && !(key in input)) input[key] = value;
        }

        // Skip degenerate case where we end up with no keys
        if (Object.keys(input).length === 0) return true;

        const result = sanitize(input);

        // Verify 1:1 correspondence:
        // Every path in redactedFields must have a modified value in the output
        for (const path of result.redactedFields) {
          const outputValue = result.context[path];
          // Must exist in output
          if (outputValue === undefined) return false;
          // Must be different from original: either [REDACTED], masked email, or masked phone
          // We just verify it was actually modified (is in redactedFields because it changed)
        }

        // Every field that was actually modified must be in redactedFields
        for (const [path, outputValue] of Object.entries(result.context)) {
          // Find the original value for this path
          // Since our test uses flat objects, path === key
          const originalValue = input[path];
          if (originalValue === undefined) continue;

          const originalStr = typeof originalValue === 'string' ? originalValue : String(originalValue);
          const wasModified = outputValue !== originalStr;

          if (wasModified) {
            // Must be in redactedFields
            if (!result.redactedFields.includes(path)) return false;
          } else {
            // Must NOT be in redactedFields
            if (result.redactedFields.includes(path)) return false;
          }
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('redactedFields includes paths for email-masked fields', () => {
    const objectWithEmailArb = fc.record({
      emailEntries: fc.array(
        fc.tuple(nonSensitiveKeyArb, emailValueArb),
        { minLength: 1, maxLength: 3 }
      ),
      plainEntries: fc.array(
        fc.tuple(nonSensitiveKeyArb, plainValueArb),
        { minLength: 0, maxLength: 3 }
      ),
    });

    fc.assert(
      fc.property(objectWithEmailArb, ({ emailEntries, plainEntries }) => {
        const input = {};
        const emailKeys = [];

        for (const [key, value] of emailEntries) {
          if (key.length > 0 && !(key in input)) {
            input[key] = value;
            emailKeys.push(key);
          }
        }
        for (const [key, value] of plainEntries) {
          if (key.length > 0 && !(key in input)) input[key] = value;
        }

        if (emailKeys.length === 0) return true;

        const result = sanitize(input);

        // All email keys should be in redactedFields
        for (const key of emailKeys) {
          if (!result.redactedFields.includes(key)) return false;
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('redactedFields includes paths for phone-masked fields', () => {
    const objectWithPhoneArb = fc.record({
      phoneEntries: fc.array(
        fc.tuple(nonSensitiveKeyArb, phoneValueArb),
        { minLength: 1, maxLength: 3 }
      ),
      plainEntries: fc.array(
        fc.tuple(nonSensitiveKeyArb, plainValueArb),
        { minLength: 0, maxLength: 3 }
      ),
    });

    fc.assert(
      fc.property(objectWithPhoneArb, ({ phoneEntries, plainEntries }) => {
        const input = {};
        const phoneKeys = [];

        for (const [key, value] of phoneEntries) {
          if (key.length > 0 && !(key in input)) {
            input[key] = value;
            phoneKeys.push(key);
          }
        }
        for (const [key, value] of plainEntries) {
          if (key.length > 0 && !(key in input)) input[key] = value;
        }

        if (phoneKeys.length === 0) return true;

        const result = sanitize(input);

        // All phone keys should be in redactedFields (they have 7+ digits so they get masked)
        for (const key of phoneKeys) {
          if (!result.redactedFields.includes(key)) return false;
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('redactedFields does NOT contain paths of unmodified fields', () => {
    const objectWithPlainOnlyArb = fc.array(
      fc.tuple(nonSensitiveKeyArb, plainValueArb),
      { minLength: 1, maxLength: 10 }
    );

    fc.assert(
      fc.property(objectWithPlainOnlyArb, (entries) => {
        const input = {};
        for (const [key, value] of entries) {
          if (key.length > 0) input[key] = value;
        }

        if (Object.keys(input).length === 0) return true;

        const result = sanitize(input);

        // With only plain (non-sensitive, non-email, non-phone) values,
        // redactedFields should be empty
        return result.redactedFields.length === 0;
      }),
      { numRuns: 100 }
    );
  });

  it('redactedFields tracks nested sensitive paths in dot-notation', () => {
    // Generate nested objects with sensitive keys at various depths
    const nestedObjectArb = fc.record({
      topLevelKey: nonSensitiveKeyArb,
      nestedSensitiveKey: sensitiveKeyArb,
      sensitiveValue: fc.string({ minLength: 1, maxLength: 20 }),
      plainKey: nonSensitiveKeyArb,
      plainValue: plainValueArb,
    }).filter(({ topLevelKey, nestedSensitiveKey, plainKey }) => 
      topLevelKey.length > 0 && nestedSensitiveKey.length > 0 && plainKey.length > 0 &&
      topLevelKey !== plainKey
    );

    fc.assert(
      fc.property(nestedObjectArb, ({ topLevelKey, nestedSensitiveKey, sensitiveValue, plainKey, plainValue }) => {
        const input = {
          [topLevelKey]: {
            [nestedSensitiveKey]: sensitiveValue,
          },
          [plainKey]: plainValue,
        };

        const result = sanitize(input);

        const expectedPath = `${topLevelKey}.${nestedSensitiveKey}`;

        // The nested sensitive path should be in redactedFields
        if (!result.redactedFields.includes(expectedPath)) return false;

        // The plain key should NOT be in redactedFields
        if (result.redactedFields.includes(plainKey)) return false;

        // The output value for the sensitive path should be [REDACTED]
        if (result.context[expectedPath] !== '[REDACTED]') return false;

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
