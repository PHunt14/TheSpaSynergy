/**
 * Property-Based Tests for Customer Booking Conflict Enforcement
 *
 * Uses fast-check to validate that customer bookings (unauthenticated)
 * cannot bypass conflict detection by injecting override flags.
 *
 * Feature: prevent-double-booking
 *
 * Properties tested:
 * - Property 5: Customer Booking Conflict Enforcement Ignores Override Flags
 *
 * **Validates: Requirements 1.4, 2.4**
 */

import fc from 'fast-check';
import { stripPrivilegedFields } from '../app/utils/stripPrivilegedFields';
import { detectConflict } from '../app/utils/overlapDetection';

// ── Generators ────────────────────────────────────────────────

/** Generates a valid start time in minutes from midnight [0, 1380) leaving room for duration. */
function arbStartMinutes() {
  return fc.integer({ min: 0, max: 1380 });
}

/** Generates a positive duration in minutes [15, 240]. */
function arbDuration() {
  return fc.integer({ min: 15, max: 240 });
}

/** Generates buffer time in minutes [0, 60]. */
function arbBuffer() {
  return fc.integer({ min: 0, max: 60 });
}

/** Generates a staff ID string. */
function arbStaffId() {
  return fc.stringMatching(/^[a-z0-9-]{5,20}$/);
}

/** Generates a valid date portion in YYYY-MM-DD format. */
function arbDate() {
  return fc.tuple(
    fc.integer({ min: 2024, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 })
  ).map(([year, month, day]) => {
    const m = String(month).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  });
}

/** Generates a dateTime string for a given start minute and date. */
function minutesToDateTime(date: string, minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${date}T${hh}:${mm}`;
}

/**
 * Generates an arbitrary `createdBy` value that a malicious client might send.
 * Includes various string values, null, and undefined.
 */
function arbCreatedByValue() {
  return fc.oneof(
    fc.constant('admin'),
    fc.constant('staff-user-123'),
    fc.constant('owner'),
    fc.string({ minLength: 1, maxLength: 50 }),
    fc.constant(null),
    fc.constant(undefined)
  );
}

/**
 * Generates a confirmOverlap value — always true (the attack vector).
 * Also includes truthy values that could be used to bypass.
 */
function arbConfirmOverlapValue() {
  return fc.oneof(
    fc.constant(true),
    fc.constant('true'),
    fc.constant(1),
    fc.constant('yes')
  );
}

/**
 * Generates a service ID for appointments.
 */
function arbServiceId() {
  return fc.stringMatching(/^[a-z0-9-]{5,20}$/);
}

// ── Property 5: Customer Booking Conflict Enforcement Ignores Override Flags ──

describe('Feature: prevent-double-booking, Property 5: Customer Booking Conflict Enforcement Ignores Override Flags', () => {
  test('unauthenticated requests with confirmOverlap: true still get conflicts rejected after stripping', () => {
    fc.assert(
      fc.property(
        arbStaffId(),
        arbDate(),
        arbStartMinutes(),
        arbDuration(),
        arbBuffer(),
        arbServiceId(),
        arbConfirmOverlapValue(),
        (staffId, date, existingStart, duration, buffer, serviceId, confirmOverlapValue) => {
          // Create an existing confirmed appointment
          const existingDateTime = minutesToDateTime(date, existingStart);
          const existingAppointments = [
            {
              appointmentId: 'existing-apt-001',
              staffId,
              dateTime: existingDateTime,
              status: 'confirmed',
              serviceId,
              customer: JSON.stringify({ duration }),
            },
          ];

          const serviceDurationMap: Record<string, number> = { [serviceId]: duration };

          // Construct a malicious customer request that overlaps exactly with the existing appointment
          // (same time = guaranteed overlap)
          const requestBody: Record<string, unknown> = {
            serviceId,
            staffId,
            dateTime: existingDateTime,
            duration,
            customer: { name: 'Test Customer', duration },
            confirmOverlap: confirmOverlapValue, // Attempting to bypass conflict check
          };

          // Step 1: Strip privileged fields (unauthenticated request)
          const stripped = stripPrivilegedFields({ ...requestBody }, false);

          // Verify confirmOverlap was stripped
          if ('confirmOverlap' in stripped) {
            return false;
          }

          // Step 2: Run conflict detection — should ALWAYS detect the conflict
          const conflict = detectConflict(
            staffId,
            existingDateTime,
            duration,
            buffer,
            existingAppointments,
            serviceDurationMap
          );

          // The conflict MUST be detected regardless of the original confirmOverlap value
          return conflict !== null;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('unauthenticated requests with createdBy field still get conflicts rejected after stripping', () => {
    fc.assert(
      fc.property(
        arbStaffId(),
        arbDate(),
        arbStartMinutes(),
        arbDuration(),
        arbBuffer(),
        arbServiceId(),
        arbCreatedByValue(),
        (staffId, date, existingStart, duration, buffer, serviceId, createdByValue) => {
          // Create an existing confirmed appointment
          const existingDateTime = minutesToDateTime(date, existingStart);
          const existingAppointments = [
            {
              appointmentId: 'existing-apt-002',
              staffId,
              dateTime: existingDateTime,
              status: 'confirmed',
              serviceId,
              customer: JSON.stringify({ duration }),
            },
          ];

          const serviceDurationMap: Record<string, number> = { [serviceId]: duration };

          // Construct a malicious customer request with createdBy to impersonate staff
          const requestBody: Record<string, unknown> = {
            serviceId,
            staffId,
            dateTime: existingDateTime,
            duration,
            customer: { name: 'Test Customer', duration },
            createdBy: createdByValue, // Attempting to impersonate admin/staff
          };

          // Step 1: Strip privileged fields (unauthenticated request)
          const stripped = stripPrivilegedFields({ ...requestBody }, false);

          // Verify createdBy was stripped
          if ('createdBy' in stripped) {
            return false;
          }

          // Step 2: Run conflict detection — should ALWAYS detect the conflict
          const conflict = detectConflict(
            staffId,
            existingDateTime,
            duration,
            buffer,
            existingAppointments,
            serviceDurationMap
          );

          // The conflict MUST be detected regardless of the original createdBy value
          return conflict !== null;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('unauthenticated requests with BOTH confirmOverlap and createdBy still get conflicts rejected', () => {
    fc.assert(
      fc.property(
        arbStaffId(),
        arbDate(),
        arbStartMinutes(),
        arbDuration(),
        arbBuffer(),
        arbServiceId(),
        arbConfirmOverlapValue(),
        arbCreatedByValue(),
        (staffId, date, existingStart, duration, buffer, serviceId, confirmOverlapValue, createdByValue) => {
          // Create an existing confirmed appointment
          const existingDateTime = minutesToDateTime(date, existingStart);
          const existingAppointments = [
            {
              appointmentId: 'existing-apt-003',
              staffId,
              dateTime: existingDateTime,
              status: 'confirmed',
              serviceId,
              customer: JSON.stringify({ duration }),
            },
          ];

          const serviceDurationMap: Record<string, number> = { [serviceId]: duration };

          // Construct a malicious customer request with BOTH privileged fields
          const requestBody: Record<string, unknown> = {
            serviceId,
            staffId,
            dateTime: existingDateTime,
            duration,
            customer: { name: 'Test Customer', duration },
            confirmOverlap: confirmOverlapValue, // Attempting to bypass conflict
            createdBy: createdByValue,           // Attempting to impersonate
          };

          // Step 1: Strip privileged fields (unauthenticated request)
          const stripped = stripPrivilegedFields({ ...requestBody }, false);

          // Verify BOTH privileged fields were stripped
          if ('confirmOverlap' in stripped || 'createdBy' in stripped) {
            return false;
          }

          // Step 2: Run conflict detection — should ALWAYS detect the conflict
          const conflict = detectConflict(
            staffId,
            existingDateTime,
            duration,
            buffer,
            existingAppointments,
            serviceDurationMap
          );

          // The conflict MUST be detected — override flags have NO effect
          return conflict !== null;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('overlapping (but not identical) time slots are also rejected regardless of override flags', () => {
    fc.assert(
      fc.property(
        arbStaffId(),
        arbDate(),
        arbStartMinutes(),
        arbDuration(),
        arbBuffer(),
        arbServiceId(),
        arbConfirmOverlapValue(),
        arbCreatedByValue(),
        (staffId, date, existingStart, duration, buffer, serviceId, confirmOverlapValue, createdByValue) => {
          // Create an existing confirmed appointment
          const existingDateTime = minutesToDateTime(date, existingStart);
          const existingAppointments = [
            {
              appointmentId: 'existing-apt-004',
              staffId,
              dateTime: existingDateTime,
              status: 'confirmed',
              serviceId,
              customer: JSON.stringify({ duration }),
            },
          ];

          const serviceDurationMap: Record<string, number> = { [serviceId]: duration };

          // New appointment starts 1 minute after the existing one — guaranteed overlap
          // since (existingStart + 1) < (existingStart + duration + buffer) for any duration >= 1
          const newStart = existingStart + 1;
          // Guard: make sure newStart doesn't exceed 1439
          if (newStart > 1439) return true; // skip edge case gracefully
          const newDateTime = minutesToDateTime(date, newStart);

          // Construct malicious request with override flags
          const requestBody: Record<string, unknown> = {
            serviceId,
            staffId,
            dateTime: newDateTime,
            duration,
            customer: { name: 'Test Customer', duration },
            confirmOverlap: confirmOverlapValue,
            createdBy: createdByValue,
          };

          // Step 1: Strip privileged fields
          const stripped = stripPrivilegedFields({ ...requestBody }, false);

          // Verify privileged fields were stripped
          if ('confirmOverlap' in stripped || 'createdBy' in stripped) {
            return false;
          }

          // Step 2: Run conflict detection for the overlapping time
          const conflict = detectConflict(
            staffId,
            newDateTime,
            duration,
            buffer,
            existingAppointments,
            serviceDurationMap
          );

          // The conflict MUST be detected — the new appointment overlaps the existing one
          // newStart (existingStart + 1) is within [existingStart, existingStart + duration + buffer)
          return conflict !== null;
        }
      ),
      { numRuns: 100 }
    );
  });
});
