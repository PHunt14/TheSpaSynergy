/**
 * Property-Based Tests for Bundle Booking Double-Booking Prevention
 *
 * Uses fast-check to validate bundle booking conflict detection logic:
 * - All-or-nothing rejection when any staff member has a conflict
 * - Intra-bundle conflict detection for same-staff overlapping services
 * - Sequential buffer enforcement between back-to-back services
 * - Bundle availability requires all staff simultaneously free
 *
 * Feature: prevent-double-booking
 *
 * Properties tested:
 * - Property 9: Bundle All-or-Nothing Rejection
 * - Property 10: Intra-Bundle Conflict Detection
 * - Property 11: Sequential Bundle Buffer Enforcement
 * - Property 12: Bundle Availability Requires All Staff Free
 *
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.6**
 */

import fc from 'fast-check';
import {
  checkBundleConflicts,
  checkIntraBundleConflicts,
  checkSequentialBufferEnforcement,
  type BundleServiceAssignment,
} from '../app/utils/bundleConflictCheck';
import { intervalsOverlap, timeToMinutes } from '../app/utils/overlapDetection';

// ── Generators ────────────────────────────────────────────────

/** Generates a valid time string "HH:MM" within working hours (06:00-22:00). */
function arbTimeString() {
  return fc.integer({ min: 360, max: 1320 }).map(minutesToTime);
}

/** Generates a positive service duration in minutes [15, 120]. */
function arbDuration() {
  return fc.integer({ min: 15, max: 120 });
}

/** Generates buffer time in minutes [0, 30]. */
function arbBuffer() {
  return fc.integer({ min: 0, max: 30 });
}

/** Generates a staff ID string. */
function arbStaffId() {
  return fc.stringMatching(/^staff-[a-z0-9]{3,8}$/);
}

/** Generates a service ID string. */
function arbServiceId() {
  return fc.stringMatching(/^svc-[a-z0-9]{3,8}$/);
}

/** Generates a vendor ID string. */
function arbVendorId() {
  return fc.stringMatching(/^vendor-[a-z0-9]{3,8}$/);
}

/** Generates a date string (YYYY-MM-DD). */
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

/** Converts minutes since midnight to "HH:MM" format. */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Generates a BundleServiceAssignment with a specified staffId and non-overlapping start time. */
function arbAssignment(staffId?: ReturnType<typeof arbStaffId>) {
  return fc.record({
    serviceId: arbServiceId(),
    staffId: staffId || arbStaffId(),
    vendorId: arbVendorId(),
    startMinutes: fc.integer({ min: 360, max: 1200 }),
    duration: arbDuration(),
  }).map(({ serviceId, staffId: sid, vendorId, startMinutes, duration }) => ({
    serviceId,
    staffId: sid,
    vendorId,
    startTime: minutesToTime(startMinutes),
    endTime: minutesToTime(startMinutes + duration),
    duration,
  }));
}

/**
 * Generates a bundle with multiple staff members (2-4 assignments)
 * where each assignment is for a distinct staff member.
 */
function arbMultiStaffBundle() {
  return fc.tuple(
    fc.integer({ min: 2, max: 4 }),
    arbVendorId()
  ).chain(([numStaff, vendorId]) => {
    return fc.tuple(
      ...Array.from({ length: numStaff }, (_, i) =>
        fc.record({
          serviceId: arbServiceId(),
          startMinutes: fc.integer({ min: 360, max: 1200 }),
          duration: arbDuration(),
        }).map(({ serviceId, startMinutes, duration }) => ({
          serviceId,
          staffId: `staff-${String(i + 1).padStart(3, '0')}`,
          vendorId,
          startTime: minutesToTime(startMinutes),
          endTime: minutesToTime(startMinutes + duration),
          duration,
        }))
      )
    );
  });
}

// ── Property 9: Bundle All-or-Nothing Rejection ──────────────────────────────

describe('Feature: prevent-double-booking, Property 9: Bundle All-or-Nothing Rejection', () => {
  test('if any staff member has a conflict, checkBundleConflicts rejects the entire bundle', () => {
    fc.assert(
      fc.property(
        arbMultiStaffBundle(),
        arbBuffer(),
        arbDate(),
        fc.integer({ min: 0, max: 3 }), // index of staff to conflict with
        (assignments, buffer, date, conflictTargetIdx) => {
          const targetIdx = conflictTargetIdx % assignments.length;
          const targetAssignment = assignments[targetIdx];

          // Create an existing appointment that directly overlaps with the target staff
          const existingAppointments = [
            {
              appointmentId: 'existing-conflict-001',
              staffId: targetAssignment.staffId,
              dateTime: `${date}T${targetAssignment.startTime}`,
              status: 'confirmed',
              serviceId: 'svc-existing',
              customer: JSON.stringify({ duration: targetAssignment.duration }),
            },
          ];

          const serviceDurationMap: Record<string, number> = {
            'svc-existing': targetAssignment.duration,
          };

          const result = checkBundleConflicts(
            assignments,
            existingAppointments,
            serviceDurationMap,
            buffer,
            date
          );

          // The bundle MUST be rejected (hasConflict = true) since at least one
          // staff member has an external conflict
          return result.hasConflict === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('bundle with no external conflicts and no intra-bundle conflicts passes', () => {
    fc.assert(
      fc.property(
        arbBuffer(),
        arbDate(),
        fc.integer({ min: 2, max: 4 }),
        (buffer, date, numStaff) => {
          // Create well-separated assignments for distinct staff members
          const assignments: BundleServiceAssignment[] = [];
          for (let i = 0; i < numStaff; i++) {
            const startMinutes = 480 + i * 180; // 08:00, 11:00, 14:00, etc.
            assignments.push({
              serviceId: `svc-${i}`,
              staffId: `staff-distinct-${i}`,
              vendorId: 'vendor-1',
              startTime: minutesToTime(startMinutes),
              endTime: minutesToTime(startMinutes + 60),
              duration: 60,
            });
          }

          // No existing appointments
          const result = checkBundleConflicts(assignments, [], {}, buffer, date);

          // Should pass since all staff are distinct and well-separated
          return result.hasConflict === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 10: Intra-Bundle Conflict Detection ─────────────────────────────

describe('Feature: prevent-double-booking, Property 10: Intra-Bundle Conflict Detection', () => {
  test('two services assigned to same staff at overlapping times are rejected even without external conflicts', () => {
    fc.assert(
      fc.property(
        arbStaffId(),
        arbVendorId(),
        fc.integer({ min: 360, max: 1100 }), // first service start
        arbDuration(),
        arbDuration(),
        arbBuffer(),
        (staffId, vendorId, firstStart, duration1, duration2, buffer) => {
          // Second service starts during the first service's occupied window (including buffer)
          // This guarantees overlap: secondStart < firstStart + duration1 + buffer
          const maxSecondStart = firstStart + duration1 + buffer - 1;
          const secondStart = firstStart + 1; // starts 1 minute after first starts → guaranteed overlap

          // Guard: second service must fit in the day
          if (secondStart + duration2 > 1440) return true;

          const assignments: BundleServiceAssignment[] = [
            {
              serviceId: 'svc-a',
              staffId,
              vendorId,
              startTime: minutesToTime(firstStart),
              endTime: minutesToTime(firstStart + duration1),
              duration: duration1,
            },
            {
              serviceId: 'svc-b',
              staffId,
              vendorId,
              startTime: minutesToTime(secondStart),
              endTime: minutesToTime(secondStart + duration2),
              duration: duration2,
            },
          ];

          const result = checkIntraBundleConflicts(assignments, buffer);

          // The overlap detection should detect this: 
          // Service A window: [firstStart, firstStart + duration1 + buffer)
          // Service B window: [secondStart, secondStart + duration2 + buffer)
          // Since secondStart = firstStart + 1, and firstStart + duration1 + buffer >= firstStart + 15 + 0 = firstStart + 15 > secondStart,
          // they always overlap.
          return result.hasConflict === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('services assigned to different staff members never trigger intra-bundle conflict', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 360, max: 1100 }),
        arbDuration(),
        arbDuration(),
        arbBuffer(),
        arbVendorId(),
        (firstStart, duration1, duration2, buffer, vendorId) => {
          // Even with perfectly overlapping times, different staff = no intra-bundle conflict
          const assignments: BundleServiceAssignment[] = [
            {
              serviceId: 'svc-a',
              staffId: 'staff-alpha',
              vendorId,
              startTime: minutesToTime(firstStart),
              endTime: minutesToTime(firstStart + duration1),
              duration: duration1,
            },
            {
              serviceId: 'svc-b',
              staffId: 'staff-beta',
              vendorId,
              startTime: minutesToTime(firstStart),
              endTime: minutesToTime(firstStart + duration2),
              duration: duration2,
            },
          ];

          const result = checkIntraBundleConflicts(assignments, buffer);

          // Different staff → no intra-bundle conflict
          return result.hasConflict === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('same staff with non-overlapping times (respecting buffer) passes intra-bundle check', () => {
    fc.assert(
      fc.property(
        arbStaffId(),
        arbVendorId(),
        fc.integer({ min: 360, max: 900 }), // first service start
        arbDuration(),
        arbDuration(),
        arbBuffer(),
        (staffId, vendorId, firstStart, duration1, duration2, buffer) => {
          // Second service starts AFTER first service's full window (duration + buffer)
          const secondStart = firstStart + duration1 + buffer;

          // Guard: second service must fit in the day
          if (secondStart + duration2 + buffer > 1440) return true;

          const assignments: BundleServiceAssignment[] = [
            {
              serviceId: 'svc-a',
              staffId,
              vendorId,
              startTime: minutesToTime(firstStart),
              endTime: minutesToTime(firstStart + duration1),
              duration: duration1,
            },
            {
              serviceId: 'svc-b',
              staffId,
              vendorId,
              startTime: minutesToTime(secondStart),
              endTime: minutesToTime(secondStart + duration2),
              duration: duration2,
            },
          ];

          const result = checkIntraBundleConflicts(assignments, buffer);

          // Non-overlapping (second starts exactly at boundary) → no conflict
          return result.hasConflict === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 11: Sequential Bundle Buffer Enforcement ────────────────────────

describe('Feature: prevent-double-booking, Property 11: Sequential Bundle Buffer Enforcement', () => {
  test('sequential services where next start < previous start + duration + buffer are rejected', () => {
    fc.assert(
      fc.property(
        arbStaffId(),
        arbVendorId(),
        fc.integer({ min: 360, max: 900 }), // first service start
        arbDuration(),
        arbDuration(),
        fc.integer({ min: 1, max: 30 }), // buffer > 0 to guarantee violation
        (staffId, vendorId, firstStart, duration1, duration2, buffer) => {
          // Second service starts exactly 1 minute before the required time
          // Required: nextStart >= firstStart + duration1 + buffer
          // We set nextStart = firstStart + duration1 + buffer - 1 (violates by 1 minute)
          const violatingStart = firstStart + duration1 + buffer - 1;

          // Guard: violating start must be > firstStart (otherwise it's within the service itself)
          if (violatingStart <= firstStart) return true;
          // Guard: second service must fit in the day
          if (violatingStart + duration2 > 1440) return true;

          const assignments: BundleServiceAssignment[] = [
            {
              serviceId: 'svc-first',
              staffId,
              vendorId,
              startTime: minutesToTime(firstStart),
              endTime: minutesToTime(firstStart + duration1),
              duration: duration1,
            },
            {
              serviceId: 'svc-second',
              staffId,
              vendorId,
              startTime: minutesToTime(violatingStart),
              endTime: minutesToTime(violatingStart + duration2),
              duration: duration2,
            },
          ];

          const result = checkSequentialBufferEnforcement(assignments, buffer);

          // Sequential buffer is violated (next starts too early)
          return result.hasConflict === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('sequential services where next start >= previous start + duration + buffer pass', () => {
    fc.assert(
      fc.property(
        arbStaffId(),
        arbVendorId(),
        fc.integer({ min: 360, max: 800 }), // first service start
        arbDuration(),
        arbDuration(),
        arbBuffer(),
        fc.integer({ min: 0, max: 30 }), // extra gap beyond required minimum
        (staffId, vendorId, firstStart, duration1, duration2, buffer, extraGap) => {
          // Second service starts at or after the required minimum time
          const requiredStart = firstStart + duration1 + buffer;
          const secondStart = requiredStart + extraGap;

          // Guard: second service must fit in the day
          if (secondStart + duration2 > 1440) return true;

          const assignments: BundleServiceAssignment[] = [
            {
              serviceId: 'svc-first',
              staffId,
              vendorId,
              startTime: minutesToTime(firstStart),
              endTime: minutesToTime(firstStart + duration1),
              duration: duration1,
            },
            {
              serviceId: 'svc-second',
              staffId,
              vendorId,
              startTime: minutesToTime(secondStart),
              endTime: minutesToTime(secondStart + duration2),
              duration: duration2,
            },
          ];

          const result = checkSequentialBufferEnforcement(assignments, buffer);

          // Buffer requirement is satisfied
          return result.hasConflict === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('three sequential services to same staff must each maintain buffer', () => {
    fc.assert(
      fc.property(
        arbStaffId(),
        arbVendorId(),
        fc.integer({ min: 360, max: 600 }),
        fc.integer({ min: 15, max: 60 }),
        fc.integer({ min: 15, max: 60 }),
        fc.integer({ min: 15, max: 60 }),
        fc.integer({ min: 1, max: 20 }),
        (staffId, vendorId, firstStart, dur1, dur2, dur3, buffer) => {
          // Properly spaced: each subsequent service starts after previous + duration + buffer
          const secondStart = firstStart + dur1 + buffer;
          const thirdStart = secondStart + dur2 + buffer;

          // Guard: all services must fit in the day
          if (thirdStart + dur3 > 1440) return true;

          const assignments: BundleServiceAssignment[] = [
            {
              serviceId: 'svc-1',
              staffId,
              vendorId,
              startTime: minutesToTime(firstStart),
              endTime: minutesToTime(firstStart + dur1),
              duration: dur1,
            },
            {
              serviceId: 'svc-2',
              staffId,
              vendorId,
              startTime: minutesToTime(secondStart),
              endTime: minutesToTime(secondStart + dur2),
              duration: dur2,
            },
            {
              serviceId: 'svc-3',
              staffId,
              vendorId,
              startTime: minutesToTime(thirdStart),
              endTime: minutesToTime(thirdStart + dur3),
              duration: dur3,
            },
          ];

          const result = checkSequentialBufferEnforcement(assignments, buffer);

          // All buffers are respected
          return result.hasConflict === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 12: Bundle Availability Requires All Staff Free ─────────────────

describe('Feature: prevent-double-booking, Property 12: Bundle Availability Requires All Staff Free', () => {
  test('if any staff member has a conflicting appointment, the slot is not valid for the bundle', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }), // number of staff
        fc.integer({ min: 360, max: 1100 }), // bundle start time
        arbDuration(),
        arbBuffer(),
        arbDate(),
        fc.integer({ min: 0, max: 3 }), // which staff to block
        (numStaff, bundleStart, duration, buffer, date, blockedStaffIdx) => {
          const targetIdx = blockedStaffIdx % numStaff;

          // Create assignments for the bundle — all at the same start time
          const assignments: BundleServiceAssignment[] = [];
          for (let i = 0; i < numStaff; i++) {
            assignments.push({
              serviceId: `svc-bundle-${i}`,
              staffId: `staff-bundle-${i}`,
              vendorId: 'vendor-bundle',
              startTime: minutesToTime(bundleStart),
              endTime: minutesToTime(bundleStart + duration),
              duration,
            });
          }

          // Block the target staff member with an existing appointment at the same time
          const blockedStaffId = `staff-bundle-${targetIdx}`;
          const existingAppointments = [
            {
              appointmentId: 'apt-blocker',
              staffId: blockedStaffId,
              dateTime: `${date}T${minutesToTime(bundleStart)}`,
              status: 'confirmed',
              serviceId: 'svc-blocker',
              customer: JSON.stringify({ duration }),
            },
          ];

          const serviceDurationMap: Record<string, number> = {
            'svc-blocker': duration,
          };

          // Run the bundle conflict check — should detect the external conflict
          const result = checkBundleConflicts(
            assignments,
            existingAppointments,
            serviceDurationMap,
            buffer,
            date
          );

          // The bundle slot is NOT valid because at least one staff member is busy
          return result.hasConflict === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('bundle slot is valid only when ALL required staff members are free', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }),
        fc.integer({ min: 360, max: 1000 }),
        arbDuration(),
        arbBuffer(),
        arbDate(),
        (numStaff, bundleStart, duration, buffer, date) => {
          // Create bundle assignments — all different staff
          const assignments: BundleServiceAssignment[] = [];
          for (let i = 0; i < numStaff; i++) {
            assignments.push({
              serviceId: `svc-free-${i}`,
              staffId: `staff-free-${i}`,
              vendorId: 'vendor-free',
              startTime: minutesToTime(bundleStart),
              endTime: minutesToTime(bundleStart + duration),
              duration,
            });
          }

          // Existing appointments are for OTHER staff not in the bundle
          const existingAppointments = [
            {
              appointmentId: 'apt-other',
              staffId: 'staff-unrelated-xyz',
              dateTime: `${date}T${minutesToTime(bundleStart)}`,
              status: 'confirmed',
              serviceId: 'svc-other',
              customer: JSON.stringify({ duration }),
            },
          ];

          const serviceDurationMap: Record<string, number> = {
            'svc-other': duration,
          };

          const result = checkBundleConflicts(
            assignments,
            existingAppointments,
            serviceDurationMap,
            buffer,
            date
          );

          // All bundle staff are free → slot is valid
          return result.hasConflict === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('partially conflicting schedule: only appointments overlapping the bundle time matter', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 3 }),
        fc.integer({ min: 480, max: 900 }), // bundle starts between 08:00 and 15:00
        arbDuration(),
        arbBuffer(),
        arbDate(),
        (numStaff, bundleStart, duration, buffer, date) => {
          // Create bundle assignments — all different staff
          const assignments: BundleServiceAssignment[] = [];
          for (let i = 0; i < numStaff; i++) {
            assignments.push({
              serviceId: `svc-partial-${i}`,
              staffId: `staff-partial-${i}`,
              vendorId: 'vendor-partial',
              startTime: minutesToTime(bundleStart),
              endTime: minutesToTime(bundleStart + duration),
              duration,
            });
          }

          // Existing appointment for staff-partial-0 that is WELL BEFORE the bundle time
          // (non-overlapping: ends + buffer before bundle starts)
          const earlyAppointmentStart = bundleStart - duration - buffer - 30; // 30 extra minutes gap
          if (earlyAppointmentStart < 0) return true; // guard

          const existingAppointments = [
            {
              appointmentId: 'apt-early',
              staffId: 'staff-partial-0',
              dateTime: `${date}T${minutesToTime(earlyAppointmentStart)}`,
              status: 'confirmed',
              serviceId: 'svc-early',
              customer: JSON.stringify({ duration }),
            },
          ];

          const serviceDurationMap: Record<string, number> = {
            'svc-early': duration,
          };

          const result = checkBundleConflicts(
            assignments,
            existingAppointments,
            serviceDurationMap,
            buffer,
            date
          );

          // The early appointment does NOT overlap the bundle time → slot is valid
          return result.hasConflict === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});
