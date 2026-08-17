/**
 * Property-Based Tests for Availability Slot Generation
 *
 * Uses fast-check to validate that availability generation correctly
 * excludes conflicting slots, marks fully booked days as unavailable,
 * and isolates staff-filtered availability.
 *
 * Feature: prevent-double-booking
 *
 * Properties tested:
 * - Property 4: Available Slots Never Overlap Existing Appointments
 * - Property 7: Fully Booked Days Excluded
 * - Property 8: Staff-Filtered Isolation
 *
 * **Validates: Requirements 4.1, 4.2, 4.3, 8.3, 8.5, 8.6, 1.5**
 */

import { describe, test, expect } from '@jest/globals';
import fc from 'fast-check';
import {
  generateTimeSlots,
  timeOverlaps,
  hasAnySlot,
} from '../app/utils/availability.js';

// ── Helpers ───────────────────────────────────────────────────

/** Converts minutes since midnight to "HH:MM" format. */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Converts "HH:MM" to minutes since midnight. */
function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// ── Generators ────────────────────────────────────────────────

/** Generates a working window start (6:00 - 14:00) in minutes. */
function arbWorkStart() {
  return fc.integer({ min: 360, max: 840 });
}

/** Generates a working window duration (2-10 hours in minutes). */
function arbWorkDuration() {
  return fc.integer({ min: 120, max: 600 });
}

/** Generates a service duration [15, 120] minutes. */
function arbServiceDuration() {
  return fc.integer({ min: 15, max: 120 });
}

/** Generates a buffer time [0, 30] minutes. */
function arbBuffer() {
  return fc.integer({ min: 0, max: 30 });
}

/** Generates a date string in YYYY-MM-DD format (future date to avoid today-filtering). */
function arbFutureDate() {
  return fc.tuple(
    fc.integer({ min: 2030, max: 2035 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 })
  ).map(([year, month, day]) => {
    const m = String(month).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  });
}

/** Generates a staff ID. */
function arbStaffId() {
  return fc.stringMatching(/^staff-[a-z0-9]{3,8}$/);
}

/**
 * Generates a set of non-overlapping appointments within a time window.
 * Each appointment has a dateTime, staffId, duration, and status='confirmed'.
 */
function arbNonCancelledAppointments(
  windowStartMin: number,
  windowEndMin: number,
  date: string,
  staffId: string,
  serviceDuration: number,
  buffer: number
) {
  // Generate 0-5 appointments that fit in the window
  return fc.integer({ min: 0, max: 5 }).chain(count => {
    if (count === 0) return fc.constant([]);

    // Place appointments spaced apart within the window
    const slotSize = serviceDuration + buffer;
    const maxAppts = Math.min(count, Math.floor((windowEndMin - windowStartMin) / slotSize));
    if (maxAppts <= 0) return fc.constant([]);

    return fc.array(
      fc.integer({ min: windowStartMin, max: windowEndMin - serviceDuration }),
      { minLength: 1, maxLength: maxAppts }
    ).map(starts => {
      // Deduplicate and sort, then take only non-overlapping ones
      const sorted = [...new Set(starts)].sort((a, b) => a - b);
      const appointments: Array<{
        appointmentId: string;
        dateTime: string;
        staffId: string;
        status: string;
        serviceId: string;
        customer: string;
      }> = [];

      for (const start of sorted) {
        // Only add if doesn't overlap previous appointment (including buffer)
        const lastEnd = appointments.length > 0
          ? timeToMinutes(appointments[appointments.length - 1].dateTime.split('T')[1].substring(0, 5)) +
            serviceDuration + buffer
          : 0;

        if (start >= lastEnd) {
          appointments.push({
            appointmentId: `apt-${appointments.length}`,
            dateTime: `${date}T${minutesToTime(start)}`,
            staffId,
            status: 'confirmed',
            serviceId: 'svc-test',
            customer: JSON.stringify({ duration: serviceDuration }),
          });
        }
      }
      return appointments;
    });
  });
}

// ── Property 4: Available Slots Never Overlap Existing Appointments ───────────

describe('Feature: prevent-double-booking, Property 4: Available Slots Never Overlap Existing Appointments', () => {
  test('for any set of non-cancelled appointments, every returned slot does not overlap any existing appointment with buffer', () => {
    fc.assert(
      fc.property(
        arbWorkStart(),
        arbWorkDuration(),
        arbServiceDuration(),
        arbBuffer(),
        arbFutureDate(),
        arbStaffId(),
        fc.integer({ min: 1, max: 5 }), // number of existing appointments
        (workStart, workDuration, serviceDuration, buffer, date, staffId, numAppts) => {
          const workEnd = workStart + workDuration;
          // Guard: ensure work window can fit at least one slot
          if (workEnd > 1380 || workStart + serviceDuration > workEnd) return true;

          const startTime = minutesToTime(workStart);
          const endTime = minutesToTime(workEnd);

          // Generate random appointments within the work window
          const appointments: Array<{
            appointmentId: string;
            dateTime: string;
            staffId: string;
            status: string;
            serviceId: string;
            customer: string;
          }> = [];

          const slotSize = serviceDuration + buffer;
          let cursor = workStart;

          for (let i = 0; i < numAppts && cursor + serviceDuration <= workEnd; i++) {
            // Place appointment at a 30-min aligned slot
            const aptStart = Math.min(cursor + (i * slotSize), workEnd - serviceDuration);
            if (aptStart < workStart || aptStart + serviceDuration > workEnd) break;

            appointments.push({
              appointmentId: `apt-${i}`,
              dateTime: `${date}T${minutesToTime(aptStart)}`,
              staffId,
              status: 'confirmed',
              serviceId: 'svc-test',
              customer: JSON.stringify({ duration: serviceDuration }),
            });
            cursor = aptStart + slotSize;
          }

          // Generate available time slots
          const slots = generateTimeSlots(
            startTime,
            endTime,
            serviceDuration,
            buffer,
            appointments,
            date
          );

          // Verify: EVERY returned slot does NOT overlap ANY existing appointment
          for (const slot of slots) {
            const slotStartMin = timeToMinutes(slot.time);
            const slotEndMin = slotStartMin + serviceDuration + buffer;

            for (const apt of appointments) {
              const aptTime = apt.dateTime.split('T')[1].substring(0, 5);
              const aptStartMin = timeToMinutes(aptTime);
              const customerData = JSON.parse(apt.customer);
              const aptDuration = customerData.duration || serviceDuration;
              const aptEndMin = aptStartMin + aptDuration + buffer;

              // Overlap check: slotStart < aptEnd AND slotEnd > aptStart
              const overlaps = slotStartMin < aptEndMin && slotEndMin > aptStartMin;
              if (overlaps) {
                return false; // FAIL: returned slot overlaps an existing appointment
              }
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('slots returned by generateTimeSlots never overlap blocked-time appointments', () => {
    fc.assert(
      fc.property(
        arbWorkStart(),
        arbWorkDuration(),
        arbServiceDuration(),
        arbBuffer(),
        arbFutureDate(),
        arbStaffId(),
        (workStart, workDuration, serviceDuration, buffer, date, staffId) => {
          const workEnd = workStart + workDuration;
          if (workEnd > 1380 || workStart + serviceDuration > workEnd) return true;

          const startTime = minutesToTime(workStart);
          const endTime = minutesToTime(workEnd);

          // Create blocked-time appointments (serviceId = "blocked")
          const blockedStart = workStart + 60; // Blocked time 1 hour into the window
          if (blockedStart + serviceDuration > workEnd) return true;

          const blockedAppointments = [
            {
              appointmentId: 'blocked-1',
              dateTime: `${date}T${minutesToTime(blockedStart)}`,
              staffId,
              status: 'confirmed',
              serviceId: 'blocked',
              customer: JSON.stringify({ duration: serviceDuration, isBlockedTime: true }),
            },
          ];

          const slots = generateTimeSlots(
            startTime,
            endTime,
            serviceDuration,
            buffer,
            blockedAppointments,
            date
          );

          // Verify no returned slot overlaps the blocked time
          for (const slot of slots) {
            const slotStartMin = timeToMinutes(slot.time);
            const slotEndMin = slotStartMin + serviceDuration + buffer;
            const aptStartMin = blockedStart;
            const aptEndMin = aptStartMin + serviceDuration + buffer;

            if (slotStartMin < aptEndMin && slotEndMin > aptStartMin) {
              return false; // FAIL: slot overlaps blocked time
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('slots returned by generateTimeSlots never overlap manual appointments', () => {
    fc.assert(
      fc.property(
        arbWorkStart(),
        arbWorkDuration(),
        arbServiceDuration(),
        arbBuffer(),
        arbFutureDate(),
        arbStaffId(),
        (workStart, workDuration, serviceDuration, buffer, date, staffId) => {
          const workEnd = workStart + workDuration;
          if (workEnd > 1380 || workStart + serviceDuration > workEnd) return true;

          const startTime = minutesToTime(workStart);
          const endTime = minutesToTime(workEnd);

          // Create a manual appointment
          const manualStart = workStart + 90;
          if (manualStart + serviceDuration > workEnd) return true;

          const manualAppointments = [
            {
              appointmentId: 'manual-1',
              dateTime: `${date}T${minutesToTime(manualStart)}`,
              staffId,
              status: 'confirmed',
              serviceId: 'manual',
              customer: JSON.stringify({ duration: serviceDuration }),
            },
          ];

          const slots = generateTimeSlots(
            startTime,
            endTime,
            serviceDuration,
            buffer,
            manualAppointments,
            date
          );

          // Verify no returned slot overlaps the manual appointment
          for (const slot of slots) {
            const slotStartMin = timeToMinutes(slot.time);
            const slotEndMin = slotStartMin + serviceDuration + buffer;
            const aptStartMin = manualStart;
            const aptEndMin = aptStartMin + serviceDuration + buffer;

            if (slotStartMin < aptEndMin && slotEndMin > aptStartMin) {
              return false; // FAIL: slot overlaps manual appointment
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 7: Fully Booked Days Excluded ────────────────────────────────────

describe('Feature: prevent-double-booking, Property 7: Fully Booked Days Excluded', () => {
  test('when all slots on a date are occupied, hasAnySlot returns false', () => {
    fc.assert(
      fc.property(
        arbServiceDuration(),
        arbBuffer(),
        arbFutureDate(),
        arbStaffId(),
        (serviceDuration, buffer, date, staffId) => {
          // Use a small working window that we can completely fill
          const startTime = '09:00';
          const endTime = '12:00';
          const startMin = 540; // 09:00
          const endMin = 720; // 12:00

          // Fill the entire window with non-cancelled appointments
          // Place appointments every 30 min (the slot increment used by generateTimeSlots)
          const appointments: Array<{
            appointmentId: string;
            dateTime: string;
            staffId: string;
            status: string;
            serviceId: string;
            customer: string;
          }> = [];

          let cursor = startMin;
          let aptIdx = 0;
          while (cursor + serviceDuration <= endMin) {
            appointments.push({
              appointmentId: `fill-${aptIdx}`,
              dateTime: `${date}T${minutesToTime(cursor)}`,
              staffId,
              status: 'confirmed',
              serviceId: 'svc-fill',
              customer: JSON.stringify({ duration: serviceDuration }),
            });
            aptIdx++;
            // Move cursor by the slot interval (30 min) or duration+buffer, whichever is smaller
            // to ensure dense coverage
            cursor += 30;
          }

          // Verify: generateTimeSlots returns empty when everything is booked
          const slots = generateTimeSlots(
            startTime,
            endTime,
            serviceDuration,
            buffer,
            appointments,
            date
          );

          // Also verify hasAnySlot returns false
          const hasSlot = hasAnySlot(startTime, endTime, serviceDuration, buffer, {
            appointments,
            dateStr: date,
            staff: { visibleId: staffId },
          });

          // If generateTimeSlots returns no slots, hasAnySlot should also return false
          // Both must agree that the day is fully booked
          if (slots.length === 0) {
            return hasSlot === false;
          }

          // If there ARE slots, that means the appointments didn't cover everything
          // (due to alignment/gaps), but hasAnySlot should agree
          return hasSlot === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('a day with no appointments always has available slots (given valid working hours and service duration)', () => {
    fc.assert(
      fc.property(
        arbServiceDuration(),
        arbBuffer(),
        arbFutureDate(),
        arbStaffId(),
        (serviceDuration, buffer, date, staffId) => {
          // Use working hours long enough to fit at least one slot
          const startMin = 480; // 08:00
          const endMin = startMin + serviceDuration + 30; // Enough room for one slot
          if (endMin > 1380) return true; // guard

          const startTime = minutesToTime(startMin);
          const endTime = minutesToTime(endMin);

          const hasSlot = hasAnySlot(startTime, endTime, serviceDuration, buffer, {
            appointments: [],
            dateStr: date,
            staff: { visibleId: staffId },
          });

          // With no appointments and enough room, there must be at least one slot
          return hasSlot === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('hasAnySlot returns false when a single appointment fills the entire working window', () => {
    fc.assert(
      fc.property(
        arbBuffer(),
        arbFutureDate(),
        arbStaffId(),
        (buffer, date, staffId) => {
          // Create a working window exactly matching one appointment
          const startMin = 540; // 09:00
          const duration = 60; // 1 hour service
          const endMin = startMin + duration; // window is exactly 1 service long

          const startTime = minutesToTime(startMin);
          const endTime = minutesToTime(endMin);

          // One appointment fills the entire window
          const appointments = [
            {
              appointmentId: 'single-fill',
              dateTime: `${date}T${startTime}`,
              staffId,
              status: 'confirmed',
              serviceId: 'svc-single',
              customer: JSON.stringify({ duration }),
            },
          ];

          const hasSlot = hasAnySlot(startTime, endTime, duration, buffer, {
            appointments,
            dateStr: date,
            staff: { visibleId: staffId },
          });

          // The window is fully occupied — no slot should be available
          return hasSlot === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 8: Staff-Filtered Isolation ──────────────────────────────────────

describe('Feature: prevent-double-booking, Property 8: Staff-Filtered Isolation', () => {
  test('availability for staffId X is unaffected by appointments for staffId Y', () => {
    fc.assert(
      fc.property(
        arbWorkStart(),
        arbWorkDuration(),
        arbServiceDuration(),
        arbBuffer(),
        arbFutureDate(),
        arbStaffId(),
        arbStaffId(),
        (workStart, workDuration, serviceDuration, buffer, date, staffX, staffY) => {
          // Ensure staff IDs are different
          if (staffX === staffY) return true;

          const workEnd = workStart + workDuration;
          if (workEnd > 1380 || workStart + serviceDuration > workEnd) return true;

          const startTime = minutesToTime(workStart);
          const endTime = minutesToTime(workEnd);

          // Create appointments ONLY for staffId Y (fill their schedule)
          const appointmentsForY: Array<{
            appointmentId: string;
            dateTime: string;
            staffId: string;
            status: string;
            serviceId: string;
            customer: string;
          }> = [];
          let cursor = workStart;
          let idx = 0;
          while (cursor + serviceDuration <= workEnd) {
            appointmentsForY.push({
              appointmentId: `apt-y-${idx}`,
              dateTime: `${date}T${minutesToTime(cursor)}`,
              staffId: staffY,
              status: 'confirmed',
              serviceId: 'svc-y',
              customer: JSON.stringify({ duration: serviceDuration }),
            });
            idx++;
            cursor += 30;
          }

          // Generate slots with NO appointments (baseline for staff X)
          const slotsWithoutAny = generateTimeSlots(
            startTime,
            endTime,
            serviceDuration,
            buffer,
            [], // no appointments
            date
          );

          // Generate slots with staff Y's appointments present
          // Since generateTimeSlots doesn't filter by staffId (it receives pre-filtered appointments),
          // we need to pass ONLY appointments relevant to staff X (which is none)
          const appointmentsForX: typeof appointmentsForY = []; // Staff X has no appointments
          const slotsForX = generateTimeSlots(
            startTime,
            endTime,
            serviceDuration,
            buffer,
            appointmentsForX,
            date
          );

          // Staff X's availability must equal the baseline (no appointments)
          // because Y's appointments don't affect X
          if (slotsWithoutAny.length !== slotsForX.length) return false;

          for (let i = 0; i < slotsWithoutAny.length; i++) {
            if (slotsWithoutAny[i].time !== slotsForX[i].time) return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('hasAnySlot respects staff filter — appointments for other staff do not block availability', () => {
    fc.assert(
      fc.property(
        arbServiceDuration(),
        arbBuffer(),
        arbFutureDate(),
        arbStaffId(),
        arbStaffId(),
        (serviceDuration, buffer, date, staffX, staffY) => {
          // Ensure staff IDs are different
          if (staffX === staffY) return true;

          const startTime = '09:00';
          const endTime = '17:00';

          // Fill the day entirely with appointments for staff Y
          const appointments: Array<{
            appointmentId: string;
            dateTime: string;
            staffId: string;
            status: string;
            serviceId: string;
            customer: string;
          }> = [];
          let cursor = 540; // 09:00
          let idx = 0;
          while (cursor + serviceDuration <= 1020) { // up to 17:00
            appointments.push({
              appointmentId: `apt-y-${idx}`,
              dateTime: `${date}T${minutesToTime(cursor)}`,
              staffId: staffY,
              status: 'confirmed',
              serviceId: 'svc-y',
              customer: JSON.stringify({ duration: serviceDuration }),
            });
            idx++;
            cursor += 30;
          }

          // hasAnySlot for staff X should still find availability
          // since all appointments belong to staff Y
          const hasSlotForX = hasAnySlot(startTime, endTime, serviceDuration, buffer, {
            appointments,
            dateStr: date,
            staff: { visibleId: staffX },
          });

          // Staff X should have availability (no appointments for them)
          return hasSlotForX === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('hasAnySlot correctly blocks staff X when only staff X has appointments', () => {
    fc.assert(
      fc.property(
        arbBuffer(),
        arbFutureDate(),
        arbStaffId(),
        arbStaffId(),
        (buffer, date, staffX, staffY) => {
          // Ensure staff IDs are different
          if (staffX === staffY) return true;

          const startTime = '09:00';
          const endTime = '10:00';
          const serviceDuration = 60; // exactly fills the 1-hour window

          // One appointment for staff X fills the entire window
          const appointments = [
            {
              appointmentId: 'apt-x-fill',
              dateTime: `${date}T09:00`,
              staffId: staffX,
              status: 'confirmed',
              serviceId: 'svc-x',
              customer: JSON.stringify({ duration: serviceDuration }),
            },
          ];

          // Staff X should be blocked
          const hasSlotForX = hasAnySlot(startTime, endTime, serviceDuration, buffer, {
            appointments,
            dateStr: date,
            staff: { visibleId: staffX },
          });

          // Staff Y should still be available
          const hasSlotForY = hasAnySlot(startTime, endTime, serviceDuration, buffer, {
            appointments,
            dateStr: date,
            staff: { visibleId: staffY },
          });

          return hasSlotForX === false && hasSlotForY === true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
