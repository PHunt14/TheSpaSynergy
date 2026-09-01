/**
 * Property-Based Tests for Booking Domain Logger
 *
 * Feature: structured-error-logging
 * Property 15: Booking domain logging completeness
 * Library: fast-check
 *
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**
 *
 * For any booking operation event (created, conflict, cancelled, rescheduled, rejected),
 * the corresponding domain logger function SHALL emit a Log_Entry with domain "booking",
 * the correct severity level, and all required fields for that event type present in the context.
 */

import { jest } from '@jest/globals';
import * as fc from 'fast-check';
import {
  logAppointmentCreated,
  logSchedulingConflict,
  logAppointmentCancelled,
  logAppointmentRescheduled,
  logBookingRejected,
} from '../../../lib/logger/domains/booking-logger.ts';

describe('Feature: structured-error-logging, Property 15: Booking domain logging completeness', () => {
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

  // Arbitraries for generating valid booking details.
  // IDs must contain at least one letter so they are never treated as phone
  // numbers by the sanitizer. (A digits-and-dashes string like "0000000-" is
  // legitimately phone-like — 7+ digits with formatting — and would be masked,
  // which is correct sanitizer behavior. The generator must therefore avoid it
  // to test the logger's field passthrough, not the sanitizer's masking.)
  const nonEmptyString = fc
    .tuple(
      fc.stringMatching(/^[a-zA-Z0-9_-]{0,24}$/),
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
      fc.stringMatching(/^[a-zA-Z0-9_-]{0,24}$/),
    )
    .map(([a, letter, b]) => `${a}${letter}${b}`);
  const actorArb = fc.constantFrom('customer', 'staff', 'admin');

  describe('logAppointmentCreated (Req 8.1)', () => {
    const createdDetailsArb = fc.record({
      appointmentId: nonEmptyString,
      vendorId: nonEmptyString,
      serviceId: nonEmptyString,
      staffId: nonEmptyString,
      clientId: nonEmptyString,
      dateTime: nonEmptyString,
    });

    it('emits info-level entry with domain "booking" and all required fields', () => {
      fc.assert(
        fc.property(createdDetailsArb, (details) => {
          stdoutSpy.mockClear();

          logAppointmentCreated(details);

          const output = getLastOutput();
          // Domain must be "booking"
          expect(output.domain).toBe('booking');
          // Severity must be "info"
          expect(output.level).toBe('info');
          // All required fields must be present in context
          expect(output.context.appointmentId).toBe(details.appointmentId);
          expect(output.context.vendorId).toBe(details.vendorId);
          expect(output.context.serviceId).toBe(details.serviceId);
          expect(output.context.staffId).toBe(details.staffId);
          expect(output.context.clientId).toBe(details.clientId);
          expect(output.context.dateTime).toBe(details.dateTime);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('logSchedulingConflict (Req 8.2)', () => {
    const conflictDetailsArb = fc.record({
      proposedAppointmentId: nonEmptyString,
      conflictingAppointmentId: nonEmptyString,
      overlapStart: nonEmptyString,
      overlapEnd: nonEmptyString,
      staffId: nonEmptyString,
      confirmOverlap: fc.boolean(),
    });

    it('emits warn-level entry with domain "booking" and all required fields', () => {
      fc.assert(
        fc.property(conflictDetailsArb, (details) => {
          stdoutSpy.mockClear();

          logSchedulingConflict(details);

          const output = getLastOutput();
          // Domain must be "booking"
          expect(output.domain).toBe('booking');
          // Severity must be "warn"
          expect(output.level).toBe('warn');
          // All required fields must be present in context
          expect(output.context.proposedAppointmentId).toBe(details.proposedAppointmentId);
          expect(output.context.conflictingAppointmentId).toBe(details.conflictingAppointmentId);
          expect(output.context.overlapStart).toBe(details.overlapStart);
          expect(output.context.overlapEnd).toBe(details.overlapEnd);
          expect(output.context.staffId).toBe(details.staffId);
          expect(output.context.confirmOverlap).toBe(String(details.confirmOverlap));
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('logAppointmentCancelled (Req 8.3)', () => {
    const cancelledDetailsArb = fc.record({
      appointmentId: nonEmptyString,
      dateTime: nonEmptyString,
      actor: actorArb,
    });

    it('emits info-level entry with domain "booking" and all required fields', () => {
      fc.assert(
        fc.property(cancelledDetailsArb, (details) => {
          stdoutSpy.mockClear();

          logAppointmentCancelled(details);

          const output = getLastOutput();
          // Domain must be "booking"
          expect(output.domain).toBe('booking');
          // Severity must be "info"
          expect(output.level).toBe('info');
          // All required fields must be present in context
          expect(output.context.appointmentId).toBe(details.appointmentId);
          expect(output.context.dateTime).toBe(details.dateTime);
          expect(output.context.actor).toBe(details.actor);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('logAppointmentRescheduled (Req 8.4)', () => {
    const rescheduledDetailsArb = fc.record({
      appointmentId: nonEmptyString,
      previousDateTime: nonEmptyString,
      newDateTime: nonEmptyString,
      previousStaffId: nonEmptyString,
      actor: actorArb,
    });

    it('emits info-level entry with domain "booking" and all required fields', () => {
      fc.assert(
        fc.property(rescheduledDetailsArb, (details) => {
          stdoutSpy.mockClear();

          logAppointmentRescheduled(details);

          const output = getLastOutput();
          // Domain must be "booking"
          expect(output.domain).toBe('booking');
          // Severity must be "info"
          expect(output.level).toBe('info');
          // All required fields must be present in context
          expect(output.context.appointmentId).toBe(details.appointmentId);
          expect(output.context.previousDateTime).toBe(details.previousDateTime);
          expect(output.context.newDateTime).toBe(details.newDateTime);
          expect(output.context.previousStaffId).toBe(details.previousStaffId);
          expect(output.context.actor).toBe(details.actor);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('logBookingRejected (Req 8.5)', () => {
    const rejectedDetailsArb = fc.record({
      vendorId: nonEmptyString,
      staffId: nonEmptyString,
      requestedDateTime: nonEmptyString,
      serviceId: nonEmptyString,
      rejectionReason: nonEmptyString,
    });

    it('emits warn-level entry with domain "booking" and all required fields', () => {
      fc.assert(
        fc.property(rejectedDetailsArb, (details) => {
          stdoutSpy.mockClear();

          logBookingRejected(details);

          const output = getLastOutput();
          // Domain must be "booking"
          expect(output.domain).toBe('booking');
          // Severity must be "warn"
          expect(output.level).toBe('warn');
          // All required fields must be present in context
          expect(output.context.vendorId).toBe(details.vendorId);
          expect(output.context.staffId).toBe(details.staffId);
          expect(output.context.requestedDateTime).toBe(details.requestedDateTime);
          expect(output.context.serviceId).toBe(details.serviceId);
          expect(output.context.rejectionReason).toBe(details.rejectionReason);
        }),
        { numRuns: 100 }
      );
    });
  });
});
