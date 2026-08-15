/**
 * Property-Based Tests for Security — Privileged Field Stripping
 *
 * Uses fast-check to validate that unauthenticated requests always have
 * privileged fields removed before business logic executes.
 *
 * Feature: prevent-double-booking
 *
 * Properties tested:
 * - Property 14: Privileged Field Stripping
 *
 * **Validates: Requirements 11.4, 2.4**
 */

import { describe, test, expect } from '@jest/globals';
import fc from 'fast-check';
import { stripPrivilegedFields, PRIVILEGED_FIELDS } from '../app/utils/stripPrivilegedFields';

// ── Generators ────────────────────────────────────────────────

/**
 * Generates an arbitrary value that could be supplied for a privileged field.
 * Includes strings, booleans, numbers, objects, arrays, null, and undefined.
 */
function arbPrivilegedFieldValue() {
  return fc.oneof(
    fc.string(),
    fc.boolean(),
    fc.integer(),
    fc.constant(null),
    fc.constant(undefined),
    fc.constant(true),
    fc.constant(false),
    fc.constant('admin'),
    fc.constant('confirmed'),
    fc.constant('pending'),
    fc.object(),
    fc.array(fc.string())
  );
}

/**
 * Generates a request body object that contains any subset of privileged fields
 * with arbitrary values. Also includes non-privileged fields to ensure they
 * survive stripping.
 */
function arbRequestBodyWithPrivilegedFields() {
  return fc.record({
    // Privileged fields — always present with some value
    createdBy: arbPrivilegedFieldValue(),
    confirmOverlap: arbPrivilegedFieldValue(),
    isManual: arbPrivilegedFieldValue(),
    status: arbPrivilegedFieldValue(),
    // Non-privileged fields that MUST survive stripping
    serviceId: fc.string({ minLength: 1, maxLength: 36 }),
    dateTime: fc.string({ minLength: 1, maxLength: 20 }),
    customer: fc.object(),
    staffId: fc.string({ minLength: 1, maxLength: 36 }),
  });
}

/**
 * Generates a request body with a random SUBSET of privileged fields present.
 * This tests that stripping works even when only some fields are supplied.
 */
function arbRequestBodyWithRandomPrivilegedSubset() {
  return fc.tuple(
    fc.subarray(PRIVILEGED_FIELDS as unknown as string[], { minLength: 1 }),
    arbPrivilegedFieldValue(),
    arbPrivilegedFieldValue(),
    arbPrivilegedFieldValue(),
    arbPrivilegedFieldValue(),
    fc.string({ minLength: 1, maxLength: 36 }), // serviceId
    fc.string({ minLength: 1, maxLength: 20 }), // dateTime
  ).map(([fields, v1, v2, v3, v4, serviceId, dateTime]) => {
    const body: Record<string, unknown> = { serviceId, dateTime };
    const values = [v1, v2, v3, v4];
    fields.forEach((field, i) => {
      body[field] = values[i % values.length];
    });
    return body;
  });
}

// ── Property 14: Privileged Field Stripping ────────────────────

describe('Feature: prevent-double-booking, Property 14: Privileged Field Stripping', () => {
  test('for any unauthenticated request with ALL privileged fields, none remain after stripping', () => {
    fc.assert(
      fc.property(
        arbRequestBodyWithPrivilegedFields(),
        (body) => {
          // Clone the body to avoid generator reuse issues
          const requestBody = { ...body };

          // Strip privileged fields (unauthenticated = not authenticated)
          const result = stripPrivilegedFields(requestBody, false);

          // Verify: NONE of the privileged fields exist on the result
          for (const field of PRIVILEGED_FIELDS) {
            if (field in result) {
              return false;
            }
          }

          // Verify: non-privileged fields survive
          if (!('serviceId' in result)) return false;
          if (!('dateTime' in result)) return false;
          if (!('customer' in result)) return false;
          if (!('staffId' in result)) return false;

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('for any unauthenticated request with a SUBSET of privileged fields, none remain after stripping', () => {
    fc.assert(
      fc.property(
        arbRequestBodyWithRandomPrivilegedSubset(),
        (body) => {
          const requestBody = { ...body };

          const result = stripPrivilegedFields(requestBody, false);

          // Verify: NONE of the privileged fields exist on the result
          for (const field of PRIVILEGED_FIELDS) {
            if (field in result) {
              return false;
            }
          }

          // Verify: non-privileged fields survive
          if (!('serviceId' in result)) return false;
          if (!('dateTime' in result)) return false;

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('for any authenticated request, privileged fields are PRESERVED', () => {
    fc.assert(
      fc.property(
        arbRequestBodyWithPrivilegedFields(),
        (body) => {
          const requestBody = { ...body };

          // Store original values
          const originalCreatedBy = requestBody.createdBy;
          const originalConfirmOverlap = requestBody.confirmOverlap;
          const originalIsManual = requestBody.isManual;
          const originalStatus = requestBody.status;

          // Strip with authenticated = true — fields should NOT be removed
          const result = stripPrivilegedFields(requestBody, true);

          // All privileged fields must still be present with original values
          if (result.createdBy !== originalCreatedBy) return false;
          if (result.confirmOverlap !== originalConfirmOverlap) return false;
          if (result.isManual !== originalIsManual) return false;
          if (result.status !== originalStatus) return false;

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('stripping is idempotent — calling it twice on the same body yields the same result', () => {
    fc.assert(
      fc.property(
        arbRequestBodyWithPrivilegedFields(),
        (body) => {
          const requestBody = { ...body };

          stripPrivilegedFields(requestBody, false);
          const afterFirst = { ...requestBody };

          stripPrivilegedFields(requestBody, false);
          const afterSecond = { ...requestBody };

          // Both calls should produce the same result
          return JSON.stringify(afterFirst) === JSON.stringify(afterSecond);
        }
      ),
      { numRuns: 100 }
    );
  });
});
