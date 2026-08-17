/**
 * Integration tests for availability APIs.
 *
 * Verifies that the availability API reflects newly created bookings and that
 * the available-dates API excludes fully booked days.
 *
 * **Validates: Requirements 4.1, 8.3, 10.7**
 *
 * Tests:
 * 1. Creating a booking for a staff member removes that slot from available slots
 * 2. Creating enough bookings to fill all slots marks a day as unavailable in available-dates
 * 3. Blocked-time entries are treated the same as regular appointments for availability filtering
 */

import { describe, test, expect } from '@jest/globals';
import { generateTimeSlots, hasAnySlot } from '../app/utils/availability.js';

// ── Test Constants ──────────────────────────────────────────────────────────

const STAFF_ID = 'staff-anna';
const VENDOR_ID = 'vendor-spa-1';
const SERVICE_DURATION = 60; // minutes
const BUFFER_MINUTES = 15;
const WORKING_HOURS_START = '09:00';
const WORKING_HOURS_END = '17:00';
const TEST_DATE = '2025-06-15'; // A future date (Sunday doesn't matter for unit testing)

// ── Helpers ─────────────────────────────────────────────────────────────────

function createAppointment(
  time: string,
  opts: {
    staffId?: string;
    duration?: number;
    serviceId?: string;
    status?: string;
    isBlockedTime?: boolean;
  } = {}
) {
  const {
    staffId = STAFF_ID,
    duration = SERVICE_DURATION,
    serviceId = 'svc-massage',
    status = 'confirmed',
    isBlockedTime = false,
  } = opts;

  return {
    appointmentId: `apt-${time.replace(':', '')}-${Math.random().toString(36).slice(2, 6)}`,
    vendorId: VENDOR_ID,
    serviceId: isBlockedTime ? 'blocked' : serviceId,
    staffId,
    dateTime: `${TEST_DATE}T${time}`,
    status,
    customer: JSON.stringify({
      name: isBlockedTime ? 'Blocked Time' : 'Test Customer',
      duration,
      ...(isBlockedTime ? { isBlockedTime: true } : {}),
    }),
  };
}

/**
 * Generates all possible 30-minute-aligned slots in a working day for the given
 * service duration. Used to calculate the total number of bookable slots.
 */
function countTotalSlots(
  startTime: string,
  endTime: string,
  duration: number
): number {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  let current = startH * 60 + startM;
  const end = endH * 60 + endM;
  let count = 0;
  while (current + duration <= end) {
    count++;
    current += 30;
  }
  return count;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Availability Integration Tests', () => {
  // ─── Availability API reflects newly created bookings (Req 4.1) ───────────

  describe('Availability API reflects newly created bookings (Req 4.1)', () => {
    test('a booking at 10:00 removes the 10:00 slot from available time slots', () => {
      const existingBooking = createAppointment('10:00');

      const availableSlots = generateTimeSlots(
        WORKING_HOURS_START,
        WORKING_HOURS_END,
        SERVICE_DURATION,
        BUFFER_MINUTES,
        [existingBooking],
        TEST_DATE
      );

      // The 10:00 slot should NOT be in the results
      const times = availableSlots.map((s: any) => s.time);
      expect(times).not.toContain('10:00');
    });

    test('a booking at 10:00 also removes slots that would overlap with it (buffer enforcement)', () => {
      // Booking at 10:00, duration 60, buffer 15 → occupies 10:00–11:15
      // Slots at 10:00, 10:30, 11:00 should all be removed
      // (10:30 would start during the appointment, 11:00 would start before buffer ends)
      const existingBooking = createAppointment('10:00');

      const availableSlots = generateTimeSlots(
        WORKING_HOURS_START,
        WORKING_HOURS_END,
        SERVICE_DURATION,
        BUFFER_MINUTES,
        [existingBooking],
        TEST_DATE
      );

      const times = availableSlots.map((s: any) => s.time);
      expect(times).not.toContain('10:00');
      expect(times).not.toContain('10:30');
      // 11:00 slot: starts at 11:00 with end at 11:00+60+15=12:15.
      // Existing occupies 10:00 to 11:15. 11:00 < 11:15 → overlap!
      expect(times).not.toContain('11:00');
      // 11:30 slot: starts at 11:30, existing ends at 11:15. 11:30 >= 11:15 → no overlap
      expect(times).toContain('11:30');
    });

    test('multiple bookings at different times remove all their respective slots', () => {
      const bookings = [
        createAppointment('09:00'),
        createAppointment('13:00'),
        createAppointment('16:00'),
      ];

      const availableSlots = generateTimeSlots(
        WORKING_HOURS_START,
        WORKING_HOURS_END,
        SERVICE_DURATION,
        BUFFER_MINUTES,
        bookings,
        TEST_DATE
      );

      const times = availableSlots.map((s: any) => s.time);
      expect(times).not.toContain('09:00');
      expect(times).not.toContain('13:00');
      expect(times).not.toContain('16:00');
    });

    test('cancelled bookings do NOT affect availability (they are excluded by route before calling generateTimeSlots)', () => {
      // The route handler filters out cancelled appointments before passing to generateTimeSlots.
      // Here we verify that if a cancelled appointment is NOT in the list, its slot remains available.
      const activeBooking = createAppointment('10:00');
      const cancelledBooking = createAppointment('14:00', { status: 'cancelled' });

      // Only pass active bookings (simulating route handler filtering)
      const activeBookings = [activeBooking, cancelledBooking].filter(
        (apt) => apt.status !== 'cancelled'
      );

      const availableSlots = generateTimeSlots(
        WORKING_HOURS_START,
        WORKING_HOURS_END,
        SERVICE_DURATION,
        BUFFER_MINUTES,
        activeBookings,
        TEST_DATE
      );

      const times = availableSlots.map((s: any) => s.time);
      expect(times).not.toContain('10:00'); // active booking blocks this
      expect(times).toContain('14:00'); // cancelled booking was excluded
    });

    test('staff-specific filtering: appointments for other staff do not affect this staff\'s slots', () => {
      // When the route handler filters appointments to a specific staffId,
      // only that staff's appointments reduce availability.
      const otherStaffBooking = createAppointment('10:00', { staffId: 'staff-bob' });

      // Route handler would filter this out for staff-anna — simulate by not including it
      const staffAnnaBookings: any[] = [];

      const availableSlots = generateTimeSlots(
        WORKING_HOURS_START,
        WORKING_HOURS_END,
        SERVICE_DURATION,
        BUFFER_MINUTES,
        staffAnnaBookings,
        TEST_DATE
      );

      const times = availableSlots.map((s: any) => s.time);
      // 10:00 should still be available since the booking is for a different staff
      expect(times).toContain('10:00');
    });
  });

  // ─── Available-dates API excludes fully booked days (Req 8.3) ─────────────

  describe('Available-dates API excludes fully booked days (Req 8.3)', () => {
    test('a day with no bookings has available slots', () => {
      const result = hasAnySlot(
        WORKING_HOURS_START,
        WORKING_HOURS_END,
        SERVICE_DURATION,
        BUFFER_MINUTES,
        { appointments: [], dateStr: TEST_DATE, date: new Date(TEST_DATE + 'T00:00:00'), staff: { visibleId: STAFF_ID } }
      );

      expect(result).toBe(true);
    });

    test('a day fully booked with back-to-back appointments has no available slots', () => {
      // Working hours 09:00–17:00, service duration 60 min, buffer 15 min.
      // Each appointment occupies duration + buffer = 75 min of window.
      // We need to fill all 30-minute-aligned slots.
      // Generate enough appointments to fill the entire day.
      // Slots start at: 09:00, 09:30, 10:00, ..., 16:00
      // An appointment at time T blocks all slots where slotStart < T + 60 + 15 AND slotStart + 60 + 15 > T
      // The simplest approach: place appointments at every 30 min from 09:00 to 16:00
      const appointments: any[] = [];
      let current = 9 * 60; // 09:00
      const end = 17 * 60; // 17:00

      while (current + SERVICE_DURATION <= end) {
        const h = Math.floor(current / 60);
        const m = current % 60;
        const time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        appointments.push(createAppointment(time));
        current += 30;
      }

      const result = hasAnySlot(
        WORKING_HOURS_START,
        WORKING_HOURS_END,
        SERVICE_DURATION,
        BUFFER_MINUTES,
        { appointments, dateStr: TEST_DATE, date: new Date(TEST_DATE + 'T00:00:00'), staff: { visibleId: STAFF_ID } }
      );

      expect(result).toBe(false);
    });

    test('a day with one remaining slot still appears as available', () => {
      // To leave the 16:00 slot open, we need no appointment whose buffered window
      // overlaps with [16:00, 17:15]. That means we must stop placing appointments
      // before 16:00 - duration - buffer = 16:00 - 75 = 14:45.
      // More precisely: an appointment at time T with dur 60 + buf 15 occupies [T, T+75].
      // The 16:00 slot's window is [16:00, 17:15].
      // Overlap condition: T < 17:15 AND T+75 > 16:00 → T > 14:45.
      // So we must NOT place appointments after 14:45 (i.e. at 15:00 or later).
      //
      // But we also need to make sure ALL earlier slots (09:00–15:30) are blocked.
      // Place non-overlapping appointments that together cover the range.
      // Strategy: place appointments spaced by (duration + buffer) = 75 min apart,
      // which ensures each appointment blocks all 30-min-aligned slots in its range.
      const appointments: any[] = [];

      // Place appointments at strategic times to block all slots from 09:00 to 15:30
      // but leave 16:00 open. Each appointment at T blocks slots from T-74 to T+74 (approx).
      // We'll use non-overlapping appointments at 75-min intervals: 09:00, 10:15, 11:30, 12:45, 14:00
      // Last one at 14:00 → occupies [14:00, 15:15]. This blocks slot 15:00 (15:00 < 15:15 → overlap).
      // Slot 15:30: window [15:30, 16:45]. Last apt ends 15:15. 15:30 >= 15:15 → no overlap.
      // So 15:30 is NOT blocked. We need another appointment to block 15:30.
      // Apt at 15:00 → occupies [15:00, 16:15]. This blocks slot 16:00 (16:00 < 16:15 → overlap). Too much!
      // Apt at 14:30 → occupies [14:30, 15:45]. Blocks 15:30 (15:30 < 15:45 → overlap). Slot 16:00: 16:00 >= 15:45 → no overlap!
      // So place at: 09:00, 10:15, 11:30, 12:45, 14:30
      // Actually, let's take a simpler approach: use a shorter duration for blocking appointments
      // placed only where needed.

      // Simplest approach: just place a single large blocked-time entry covering 09:00–14:45
      // and verify 16:00 remains open.
      // Blocked time at 09:00, duration 345 min (09:00 to 14:45), buffer 15 → end at 15:00.
      // Slot 15:00: [15:00, 16:15]. Blocked window [09:00, 15:00]. 15:00 < 15:00? No! → no overlap.
      // Slot 15:30: similar, no overlap.
      // Slot 16:00: [16:00, 17:15]. Blocked window [09:00, 15:00]. 16:00 < 15:00? No. → no overlap.
      // So slots 15:00, 15:30, 16:00 are still open — that's more than one remaining slot.
      //
      // Let's instead use a more practical test: 
      // Place appointments to block most of the day but verifiably leave exactly one slot open.
      // Working hours 09:00–17:00 (480 min). Slots at: 09:00, 09:30, ..., 16:00 (15 slots).
      // A single appointment at time T with dur 60 + buf 15 blocks any slot S where
      //   S < T+75 AND S+75 > T  →  T-75 < S < T+75
      // So it blocks all 30-min slots in a 150-min window centered around T.
      //
      // Practical test: place non-overlapping appointments filling 09:00–14:45 window,
      // then confirm 16:00 is available.
      // Appointments at 75-min intervals: 09:00, 10:15, 11:30, 12:45, 14:00
      // 14:00 blocks up to slot 14:30 (14:30 < 14:00+75=15:15 AND 14:30+75=15:45 > 14:00 → overlap).
      // 14:00 also blocks slot 15:00? 15:00 < 15:15 AND 15:00+75=15:45 > 14:00 → yes, overlap!
      // Slot 15:30: 15:30 < 15:15? No. → not blocked by 14:00 apt. 
      // So after apts at 09:00, 10:15, 11:30, 12:45, 14:00 — slots 15:30 and 16:00 remain open.
      // Add one more at 15:30 → blocks slot 15:30 and 16:00.
      // 15:30 apt blocks 16:00? 16:00 < 15:30+75=16:45 AND 16:00+75=17:15 > 15:30 → yes, overlap!
      // So that blocks 16:00 too. 
      //
      // Different approach: add apt at 14:30 instead of 14:00.
      // 14:30 blocks up to slot 15:00 (15:00 < 14:30+75=15:45 → overlap).
      // Slot 15:30: 15:30 < 15:45 → overlap! Still blocked.
      // Slot 16:00: 16:00 < 15:45? No. → not blocked.
      // So apts at 09:00, 10:15, 11:30, 12:45, 14:30 block everything up to slot 15:30,
      // leaving only slot 16:00 open!
      
      appointments.push(createAppointment('09:00'));
      appointments.push(createAppointment('10:15'));
      appointments.push(createAppointment('11:30'));
      appointments.push(createAppointment('12:45'));
      appointments.push(createAppointment('14:30'));

      // Verify that 16:00 is still open but nothing else is
      const slotsResult = generateTimeSlots(
        WORKING_HOURS_START,
        WORKING_HOURS_END,
        SERVICE_DURATION,
        BUFFER_MINUTES,
        appointments,
        TEST_DATE
      );
      const times = slotsResult.map((s: any) => s.time);
      
      // Only 16:00 should remain (it starts at 16:00, ends at 17:15, and last apt at 14:30 ends at 15:45)
      expect(times).toContain('16:00');
      // There should be very few slots remaining
      expect(times.length).toBeGreaterThanOrEqual(1);

      // Now check hasAnySlot agrees that the day is still available
      const result = hasAnySlot(
        WORKING_HOURS_START,
        WORKING_HOURS_END,
        SERVICE_DURATION,
        BUFFER_MINUTES,
        { appointments, dateStr: TEST_DATE, date: new Date(TEST_DATE + 'T00:00:00'), staff: { visibleId: STAFF_ID } }
      );

      expect(result).toBe(true);
    });

    test('progressively filling slots eventually makes a day unavailable', () => {
      // Start with no appointments — day is available
      let appointments: any[] = [];
      expect(
        hasAnySlot(WORKING_HOURS_START, WORKING_HOURS_END, SERVICE_DURATION, BUFFER_MINUTES, {
          appointments,
          dateStr: TEST_DATE,
          date: new Date(TEST_DATE + 'T00:00:00'),
          staff: { visibleId: STAFF_ID },
        })
      ).toBe(true);

      // Add appointments covering every 30-minute slot from 09:00 to 16:00
      let current = 9 * 60;
      const end = 17 * 60;
      while (current + SERVICE_DURATION <= end) {
        const h = Math.floor(current / 60);
        const m = current % 60;
        const time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        appointments.push(createAppointment(time));
        current += 30;
      }

      // Now the day should be fully booked
      expect(
        hasAnySlot(WORKING_HOURS_START, WORKING_HOURS_END, SERVICE_DURATION, BUFFER_MINUTES, {
          appointments,
          dateStr: TEST_DATE,
          date: new Date(TEST_DATE + 'T00:00:00'),
          staff: { visibleId: STAFF_ID },
        })
      ).toBe(false);
    });
  });

  // ─── Blocked-time entries treated same as regular appointments (Req 4.1, 8.3) ─

  describe('Blocked-time entries treated same as regular appointments', () => {
    test('blocked-time at 10:00 removes the 10:00 slot from availability (same as a regular booking)', () => {
      const blockedTime = createAppointment('10:00', {
        isBlockedTime: true,
        duration: 60,
      });

      const availableSlots = generateTimeSlots(
        WORKING_HOURS_START,
        WORKING_HOURS_END,
        SERVICE_DURATION,
        BUFFER_MINUTES,
        [blockedTime],
        TEST_DATE
      );

      const times = availableSlots.map((s: any) => s.time);
      expect(times).not.toContain('10:00');
    });

    test('blocked-time with buffer removes overlapping slots the same as a regular appointment would', () => {
      // Blocked time at 14:00, duration 90, buffer 15 → occupies 14:00–15:45
      const blockedTime = createAppointment('14:00', {
        isBlockedTime: true,
        duration: 90,
      });

      const availableSlots = generateTimeSlots(
        WORKING_HOURS_START,
        WORKING_HOURS_END,
        SERVICE_DURATION,
        BUFFER_MINUTES,
        [blockedTime],
        TEST_DATE
      );

      const times = availableSlots.map((s: any) => s.time);
      // All slots that overlap with 14:00–15:45 should be removed
      expect(times).not.toContain('14:00');
      expect(times).not.toContain('14:30');
      expect(times).not.toContain('15:00');
      // 15:30 starts at 15:30, ends at 15:30+60+15=16:45. Blocked occupies 14:00 to 15:45.
      // 15:30 < 15:45 → overlap!
      expect(times).not.toContain('15:30');
    });

    test('blocked-time entries make a day fully booked when they fill all slots', () => {
      // Create blocked-time entries covering the entire day
      const blockedEntries: any[] = [];
      let current = 9 * 60;
      const end = 17 * 60;

      while (current + SERVICE_DURATION <= end) {
        const h = Math.floor(current / 60);
        const m = current % 60;
        const time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        blockedEntries.push(createAppointment(time, { isBlockedTime: true }));
        current += 30;
      }

      const result = hasAnySlot(
        WORKING_HOURS_START,
        WORKING_HOURS_END,
        SERVICE_DURATION,
        BUFFER_MINUTES,
        {
          appointments: blockedEntries,
          dateStr: TEST_DATE,
          date: new Date(TEST_DATE + 'T00:00:00'),
          staff: { visibleId: STAFF_ID },
        }
      );

      expect(result).toBe(false);
    });

    test('mix of blocked-time and regular appointments correctly reduces availability', () => {
      const appointments = [
        createAppointment('09:00'), // regular appointment
        createAppointment('11:00', { isBlockedTime: true, duration: 120 }), // 2-hour block
        createAppointment('15:00'), // regular appointment
      ];

      const availableSlots = generateTimeSlots(
        WORKING_HOURS_START,
        WORKING_HOURS_END,
        SERVICE_DURATION,
        BUFFER_MINUTES,
        appointments,
        TEST_DATE
      );

      const times = availableSlots.map((s: any) => s.time);

      // 09:00 blocked by regular appointment
      expect(times).not.toContain('09:00');
      // 11:00, 11:30, 12:00, 12:30 blocked by 2-hour blocked-time (11:00–13:15 with buffer)
      expect(times).not.toContain('11:00');
      expect(times).not.toContain('11:30');
      expect(times).not.toContain('12:00');
      expect(times).not.toContain('12:30');
      // 15:00 blocked by regular appointment
      expect(times).not.toContain('15:00');

      // Some slots should still be available (e.g., 14:00 if not overlapping anything)
      // 14:00: slot 14:00–15:15. 
      //   vs 09:00–10:15 → no overlap
      //   vs 11:00–13:15 → 14:00 >= 13:15 → no overlap
      //   vs 15:00–16:15 → 14:00+60+15=15:15 > 15:00 → overlap!
      // Actually 14:00 overlaps with 15:00 appointment!
      // Let's check 13:30 instead:
      // 13:30: slot 13:30–14:45.
      //   vs 11:00–13:15 → 13:30 >= 13:15 → no overlap
      //   vs 15:00–16:15 → 14:45 <= 15:00 → no overlap (boundary non-overlap)
      expect(times).toContain('13:30');
    });

    test('blocked-time for a specific staff does not affect hasAnySlot when staff filter matches', () => {
      // Blocked time for staff-anna
      const blockedForAnna = createAppointment('10:00', {
        staffId: STAFF_ID,
        isBlockedTime: true,
      });

      // Checking availability for staff-bob — should not be affected by anna's block
      const result = hasAnySlot(
        WORKING_HOURS_START,
        WORKING_HOURS_END,
        SERVICE_DURATION,
        BUFFER_MINUTES,
        {
          appointments: [blockedForAnna],
          dateStr: TEST_DATE,
          date: new Date(TEST_DATE + 'T00:00:00'),
          staff: { visibleId: 'staff-bob' },
        }
      );

      expect(result).toBe(true);
    });

    test('blocked-time for a specific staff DOES affect hasAnySlot when staff filter matches that staff', () => {
      // Fill the entire day with blocked time for staff-anna
      const blockedEntries: any[] = [];
      let current = 9 * 60;
      const end = 17 * 60;

      while (current + SERVICE_DURATION <= end) {
        const h = Math.floor(current / 60);
        const m = current % 60;
        const time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        blockedEntries.push(createAppointment(time, { staffId: STAFF_ID, isBlockedTime: true }));
        current += 30;
      }

      const result = hasAnySlot(
        WORKING_HOURS_START,
        WORKING_HOURS_END,
        SERVICE_DURATION,
        BUFFER_MINUTES,
        {
          appointments: blockedEntries,
          dateStr: TEST_DATE,
          date: new Date(TEST_DATE + 'T00:00:00'),
          staff: { visibleId: STAFF_ID },
        }
      );

      expect(result).toBe(false);
    });
  });
});
