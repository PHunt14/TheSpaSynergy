/**
 * Property-Based Tests for Scheduling Domain Logger
 *
 * Feature: structured-error-logging, Property 16: Scheduling domain logging completeness
 * Library: fast-check
 *
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
 *
 * Property: For any scheduling operation event (created/updated, auto-assignment success,
 * auto-assignment failure, deleted), the corresponding domain logger function SHALL emit
 * a Log_Entry with domain "scheduling", the correct severity level, and all required
 * fields for that event type present in the context.
 */

import { jest } from '@jest/globals';
import * as fc from 'fast-check';
import {
  logScheduleChange,
  logStaffAssignment,
  logAssignmentFailure,
  logScheduleDeleted,
} from '../../../lib/logger/domains/scheduling-logger.ts';

describe('Feature: structured-error-logging, Property 16: Scheduling domain logging completeness', () => {
  let stdoutSpy;

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  function getLastOutput() {
    const calls = stdoutSpy.mock.calls;
    if (calls.length === 0) return null;
    const lastCall = calls[calls.length - 1][0];
    return JSON.parse(lastCall.replace(/\n$/, ''));
  }

  // --- Arbitraries ---

  // Non-empty string without sensitive patterns or PII-like content.
  // Avoids triggering sanitizer redaction (keys with token/secret/password/credential,
  // values with email patterns or 7+ digits which trigger phone masking).
  const safeStringArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => {
    const lower = s.toLowerCase();
    return (
      !lower.includes('token') &&
      !lower.includes('secret') &&
      !lower.includes('password') &&
      !lower.includes('credential') &&
      !s.includes('@') &&
      !/\d{7,}/.test(s.replace(/\D/g, '')) &&
      s.trim().length > 0
    );
  });

  // Date string arbitrary that won't trigger phone masking.
  // Uses "YYYY-Mnn-Dnn" format with short month/day names to keep digit count < 7.
  // E.g., "Jan-05" or "Mar-28" — avoids ISO format with 8+ digits.
  const dateStringArb = fc.tuple(
    fc.constantFrom('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'),
    fc.integer({ min: 1, max: 28 }),
    fc.integer({ min: 24, max: 30 })
  ).map(([month, day, year]) => `${month}-${String(day).padStart(2, '0')}-${year}`);

  // Change type: created or updated
  const changeTypeArb = fc.constantFrom('created', 'updated');

  // Non-negative integer as string for eligibleCandidatesCount (keep < 7 digits)
  const countStringArb = fc.nat({ max: 999 }).map(String);

  // Unavailable reason arbitrary
  const unavailableReasonArb = fc.constantFrom(
    'no_available_staff',
    'all_staff_busy',
    'outside_business_hours',
    'no_qualified_provider',
    'schedule_conflict'
  );

  // Assignment rule name arbitrary
  const assignmentRuleArb = fc.constantFrom(
    'round_robin',
    'least_booked',
    'preferred_provider',
    'first_available',
    'skill_match'
  );

  // --- Property Tests ---

  /**
   * Requirement 9.1: Schedule Change (created/updated)
   * Emits info-level with domain "scheduling" and all required fields:
   * staffId, vendorId, changeType, startDate, endDate
   */
  it('logScheduleChange emits info-level entry with domain "scheduling" and all required fields', () => {
    fc.assert(
      fc.property(
        safeStringArb,
        safeStringArb,
        changeTypeArb,
        dateStringArb,
        dateStringArb,
        (staffId, vendorId, changeType, startDate, endDate) => {
          stdoutSpy.mockClear();

          logScheduleChange({ staffId, vendorId, changeType, startDate, endDate });

          const output = getLastOutput();

          // Domain must be "scheduling"
          expect(output.domain).toBe('scheduling');

          // Severity must be "info"
          expect(output.level).toBe('info');

          // All required context fields must be present with correct values
          expect(output.context.staffId).toBe(staffId);
          expect(output.context.vendorId).toBe(vendorId);
          expect(output.context.changeType).toBe(changeType);
          expect(output.context.startDate).toBe(startDate);
          expect(output.context.endDate).toBe(endDate);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Requirement 9.2: Staff Assignment (auto-assignment success)
   * Emits info-level with domain "scheduling" and all required fields:
   * appointmentId, staffId, vendorId, eligibleCandidatesCount, assignmentRuleName
   */
  it('logStaffAssignment emits info-level entry with domain "scheduling" and all required fields', () => {
    fc.assert(
      fc.property(
        safeStringArb,
        safeStringArb,
        safeStringArb,
        countStringArb,
        assignmentRuleArb,
        (appointmentId, staffId, vendorId, eligibleCandidatesCount, assignmentRuleName) => {
          stdoutSpy.mockClear();

          logStaffAssignment({
            appointmentId,
            staffId,
            vendorId,
            eligibleCandidatesCount,
            assignmentRuleName,
          });

          const output = getLastOutput();

          // Domain must be "scheduling"
          expect(output.domain).toBe('scheduling');

          // Severity must be "info"
          expect(output.level).toBe('info');

          // All required context fields must be present with correct values
          expect(output.context.appointmentId).toBe(appointmentId);
          expect(output.context.staffId).toBe(staffId);
          expect(output.context.vendorId).toBe(vendorId);
          expect(output.context.eligibleCandidatesCount).toBe(eligibleCandidatesCount);
          expect(output.context.assignmentRuleName).toBe(assignmentRuleName);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Requirement 9.3: Assignment Failure (auto-assignment failure)
   * Emits warn-level with domain "scheduling" and all required fields:
   * vendorId, serviceId, requestedDateTime, eligibleCandidatesCount, unavailableReason
   */
  it('logAssignmentFailure emits warn-level entry with domain "scheduling" and all required fields', () => {
    fc.assert(
      fc.property(
        safeStringArb,
        safeStringArb,
        dateStringArb,
        countStringArb,
        unavailableReasonArb,
        (vendorId, serviceId, requestedDateTime, eligibleCandidatesCount, unavailableReason) => {
          stdoutSpy.mockClear();

          logAssignmentFailure({
            vendorId,
            serviceId,
            requestedDateTime,
            eligibleCandidatesCount,
            unavailableReason,
          });

          const output = getLastOutput();

          // Domain must be "scheduling"
          expect(output.domain).toBe('scheduling');

          // Severity must be "warn" (failure case)
          expect(output.level).toBe('warn');

          // All required context fields must be present with correct values
          expect(output.context.vendorId).toBe(vendorId);
          expect(output.context.serviceId).toBe(serviceId);
          expect(output.context.requestedDateTime).toBe(requestedDateTime);
          expect(output.context.eligibleCandidatesCount).toBe(eligibleCandidatesCount);
          expect(output.context.unavailableReason).toBe(unavailableReason);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Requirement 9.4: Schedule Deleted
   * Emits info-level with domain "scheduling" and all required fields:
   * staffId, vendorId, startDate, endDate
   */
  it('logScheduleDeleted emits info-level entry with domain "scheduling" and all required fields', () => {
    fc.assert(
      fc.property(
        safeStringArb,
        safeStringArb,
        dateStringArb,
        dateStringArb,
        (staffId, vendorId, startDate, endDate) => {
          stdoutSpy.mockClear();

          logScheduleDeleted({ staffId, vendorId, startDate, endDate });

          const output = getLastOutput();

          // Domain must be "scheduling"
          expect(output.domain).toBe('scheduling');

          // Severity must be "info"
          expect(output.level).toBe('info');

          // All required context fields must be present with correct values
          expect(output.context.staffId).toBe(staffId);
          expect(output.context.vendorId).toBe(vendorId);
          expect(output.context.startDate).toBe(startDate);
          expect(output.context.endDate).toBe(endDate);
        }
      ),
      { numRuns: 100 }
    );
  });
});
