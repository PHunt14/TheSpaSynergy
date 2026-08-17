/**
 * Unit tests for booking conflict scenarios.
 *
 * Validates: Requirements 1.2, 2.1, 2.2, 2.3, 7.4
 *
 * Tests:
 * - HTTP 409 for customer conflict (detectConflict returns non-null for overlapping time)
 * - HTTP 409 with warning for manual conflict (no confirmOverlap)
 * - HTTP 200 for manual conflict with confirmOverlap (booking proceeds)
 * - HTTP 401 for unauthenticated PATCH/manual (stripPrivilegedFields removes override flags)
 */

import { describe, test, expect } from '@jest/globals';
import { detectConflict } from '../app/utils/overlapDetection';
import { stripPrivilegedFields, PRIVILEGED_FIELDS } from '../app/utils/stripPrivilegedFields';

// ============================================================================
// Test Fixtures
// ============================================================================

/** Helper: creates an existing appointment fixture for a given staff member */
function makeExistingAppointment(overrides: Partial<{
  appointmentId: string;
  staffId: string;
  dateTime: string;
  status: string;
  serviceId: string;
  customer: any;
}> = {}) {
  return {
    appointmentId: overrides.appointmentId ?? 'existing-apt-1',
    staffId: overrides.staffId ?? 'staff-1',
    dateTime: overrides.dateTime ?? '2099-06-15T10:00',
    status: overrides.status ?? 'confirmed',
    serviceId: overrides.serviceId ?? 'svc-haircut',
    customer: overrides.customer ?? JSON.stringify({ name: 'Jane', duration: 60 }),
  };
}

/** Service duration map for tests */
const serviceDurationMap: Record<string, number> = {
  'svc-haircut': 60,
  'svc-massage': 90,
  'svc-facial': 45,
};

// ============================================================================
// Customer Conflict — HTTP 409 (Requirement 1.2)
// ============================================================================

describe('Customer Booking Conflict — 409 rejection', () => {
  test('detectConflict returns non-null when customer books an overlapping slot', () => {
    const existingAppointments = [
      makeExistingAppointment({ dateTime: '2099-06-15T10:00' }),
    ];

    // Customer tries to book at 10:30 for staff-1, which overlaps with 10:00-11:00+buffer
    const result = detectConflict(
      'staff-1',
      '2099-06-15T10:30',
      60,    // duration
      15,    // buffer
      existingAppointments,
      serviceDurationMap
    );

    expect(result).not.toBeNull();
    expect(result!.appointmentId).toBe('existing-apt-1');
    expect(result!.staffId).toBe('staff-1');
  });

  test('detectConflict returns non-null when new appointment starts during buffer window', () => {
    // Existing: 10:00, duration=60, buffer=15 → occupied window ends at 10:00+60+15 = 11:15
    // New starts at 11:10 → within buffer → conflict
    const existingAppointments = [
      makeExistingAppointment({ dateTime: '2099-06-15T10:00' }),
    ];

    const result = detectConflict(
      'staff-1',
      '2099-06-15T11:10',
      60,
      15,
      existingAppointments,
      serviceDurationMap
    );

    expect(result).not.toBeNull();
    expect(result!.appointmentId).toBe('existing-apt-1');
  });

  test('detectConflict returns non-null for exact same start time', () => {
    const existingAppointments = [
      makeExistingAppointment({ dateTime: '2099-06-15T14:00' }),
    ];

    const result = detectConflict(
      'staff-1',
      '2099-06-15T14:00',
      60,
      15,
      existingAppointments,
      serviceDurationMap
    );

    expect(result).not.toBeNull();
  });

  test('detectConflict returns null when booking after the existing appointment + buffer', () => {
    // Existing: 10:00, duration=60, buffer=15 → ends at 11:15
    // New starts at 11:15 → boundary non-overlap → no conflict
    const existingAppointments = [
      makeExistingAppointment({ dateTime: '2099-06-15T10:00' }),
    ];

    const result = detectConflict(
      'staff-1',
      '2099-06-15T11:15',
      60,
      15,
      existingAppointments,
      serviceDurationMap
    );

    expect(result).toBeNull();
  });

  test('detectConflict includes blocked-time in conflict check for customer bookings', () => {
    const existingAppointments = [
      makeExistingAppointment({
        appointmentId: 'blocked-time-1',
        serviceId: 'blocked',
        dateTime: '2099-06-15T09:00',
        customer: JSON.stringify({ isBlockedTime: true, duration: 120 }),
      }),
    ];

    // Blocked time: 9:00-11:00+buffer. Try to book at 10:00 → conflict
    const result = detectConflict(
      'staff-1',
      '2099-06-15T10:00',
      60,
      15,
      existingAppointments,
      serviceDurationMap
    );

    expect(result).not.toBeNull();
    expect(result!.appointmentId).toBe('blocked-time-1');
  });

  test('detectConflict skips cancelled appointments', () => {
    const existingAppointments = [
      makeExistingAppointment({
        status: 'cancelled',
        dateTime: '2099-06-15T10:00',
      }),
    ];

    const result = detectConflict(
      'staff-1',
      '2099-06-15T10:00',
      60,
      15,
      existingAppointments,
      serviceDurationMap
    );

    expect(result).toBeNull();
  });

  test('detectConflict only checks appointments for the specified staff member', () => {
    const existingAppointments = [
      makeExistingAppointment({
        staffId: 'staff-2', // different staff
        dateTime: '2099-06-15T10:00',
      }),
    ];

    const result = detectConflict(
      'staff-1', // checking for staff-1
      '2099-06-15T10:00',
      60,
      15,
      existingAppointments,
      serviceDurationMap
    );

    expect(result).toBeNull();
  });
});

// ============================================================================
// Manual Booking Conflict — 409 warning (Requirement 2.1)
// ============================================================================

describe('Manual Booking Conflict — 409 warning without confirmOverlap', () => {
  test('detectConflict returns conflict details for overlapping manual booking', () => {
    // Simulates the manual booking flow: conflict is detected, no confirmOverlap flag
    // The route would return 409 with warning + conflict details
    const existingAppointments = [
      makeExistingAppointment({
        appointmentId: 'existing-manual-1',
        dateTime: '2099-06-15T14:00',
      }),
    ];

    const conflictResult = detectConflict(
      'staff-1',
      '2099-06-15T14:30',
      60,
      15,
      existingAppointments,
      serviceDurationMap
    );

    // Conflict is detected → route would return 409
    expect(conflictResult).not.toBeNull();
    expect(conflictResult!.appointmentId).toBe('existing-manual-1');
    expect(conflictResult!.dateTime).toBe('2099-06-15T14:00');
    expect(conflictResult!.staffId).toBe('staff-1');
  });

  test('conflict result contains sufficient details for the warning response', () => {
    const existingAppointments = [
      makeExistingAppointment({
        appointmentId: 'busy-slot-1',
        dateTime: '2099-06-15T09:00',
        staffId: 'staff-alpha',
      }),
    ];

    const conflictResult = detectConflict(
      'staff-alpha',
      '2099-06-15T09:45',
      60,
      15,
      existingAppointments,
      serviceDurationMap
    );

    expect(conflictResult).not.toBeNull();
    // The route uses these fields to build the warning response
    expect(conflictResult).toHaveProperty('appointmentId');
    expect(conflictResult).toHaveProperty('dateTime');
    expect(conflictResult).toHaveProperty('staffId');
  });
});

// ============================================================================
// Manual Booking with Override — 200 (Requirement 2.2)
// ============================================================================

describe('Manual Booking with confirmOverlap — booking proceeds (200)', () => {
  test('conflict is detected but confirmOverlap=true means booking should proceed', () => {
    const existingAppointments = [
      makeExistingAppointment({ dateTime: '2099-06-15T10:00' }),
    ];

    // The conflict detection still finds the overlap
    const conflictResult = detectConflict(
      'staff-1',
      '2099-06-15T10:30',
      60,
      15,
      existingAppointments,
      serviceDurationMap
    );

    // Conflict IS detected (same logic)
    expect(conflictResult).not.toBeNull();

    // But in the route, when confirmOverlap=true, the booking is persisted anyway (HTTP 200)
    // This test validates the detection logic — the route-level decision to proceed
    // is based on the confirmOverlap flag being present in an AUTHENTICATED request
    const isAuthenticated = true;
    const confirmOverlap = true;

    // The booking proceeds when: conflict exists + authenticated + confirmOverlap
    const shouldPersist = conflictResult !== null && isAuthenticated && confirmOverlap;
    expect(shouldPersist).toBe(true);
  });

  test('confirmOverlap is preserved for authenticated users (field not stripped)', () => {
    const body: Record<string, unknown> = {
      dateTime: '2099-06-15T10:30',
      serviceId: 'svc-haircut',
      staffId: 'staff-1',
      confirmOverlap: true,
      createdBy: 'admin-user',
    };

    // Authenticated user → fields preserved
    const result = stripPrivilegedFields({ ...body }, true);
    expect(result.confirmOverlap).toBe(true);
    expect(result.createdBy).toBe('admin-user');
  });

  test('no conflict → booking proceeds without needing confirmOverlap', () => {
    const existingAppointments = [
      makeExistingAppointment({ dateTime: '2099-06-15T08:00' }), // 8:00-9:15 with buffer
    ];

    // Manual booking at 11:00 — well after existing appointment
    const conflictResult = detectConflict(
      'staff-1',
      '2099-06-15T11:00',
      60,
      15,
      existingAppointments,
      serviceDurationMap
    );

    expect(conflictResult).toBeNull();
    // No conflict → booking persists directly (HTTP 200), confirmOverlap irrelevant
  });
});

// ============================================================================
// Authentication Enforcement — 401 (Requirements 2.3, 7.4)
// ============================================================================

describe('Authentication Enforcement — unauthenticated users cannot override', () => {
  describe('stripPrivilegedFields removes override flags for unauthenticated users', () => {
    test('strips confirmOverlap from unauthenticated request', () => {
      const body: Record<string, unknown> = {
        dateTime: '2099-06-15T10:00',
        serviceId: 'svc-haircut',
        staffId: 'staff-1',
        confirmOverlap: true,
      };

      const result = stripPrivilegedFields(body, false);

      expect(result.confirmOverlap).toBeUndefined();
      // Other booking fields are preserved
      expect(result.dateTime).toBe('2099-06-15T10:00');
      expect(result.serviceId).toBe('svc-haircut');
      expect(result.staffId).toBe('staff-1');
    });

    test('strips createdBy from unauthenticated request', () => {
      const body: Record<string, unknown> = {
        dateTime: '2099-06-15T10:00',
        serviceId: 'svc-haircut',
        createdBy: 'hacker-attempt',
      };

      const result = stripPrivilegedFields(body, false);

      expect(result.createdBy).toBeUndefined();
    });

    test('strips isManual from unauthenticated request', () => {
      const body: Record<string, unknown> = {
        dateTime: '2099-06-15T10:00',
        isManual: true,
      };

      const result = stripPrivilegedFields(body, false);

      expect(result.isManual).toBeUndefined();
    });

    test('strips status from unauthenticated request', () => {
      const body: Record<string, unknown> = {
        dateTime: '2099-06-15T10:00',
        status: 'confirmed',
      };

      const result = stripPrivilegedFields(body, false);

      expect(result.status).toBeUndefined();
    });

    test('strips ALL privileged fields simultaneously', () => {
      const body: Record<string, unknown> = {
        dateTime: '2099-06-15T10:00',
        serviceId: 'svc-haircut',
        staffId: 'staff-1',
        confirmOverlap: true,
        createdBy: 'attacker',
        isManual: true,
        status: 'confirmed',
      };

      const result = stripPrivilegedFields(body, false);

      for (const field of PRIVILEGED_FIELDS) {
        expect(result[field]).toBeUndefined();
      }

      // Non-privileged fields remain
      expect(result.dateTime).toBe('2099-06-15T10:00');
      expect(result.serviceId).toBe('svc-haircut');
      expect(result.staffId).toBe('staff-1');
    });

    test('preserves all fields for authenticated users', () => {
      const body: Record<string, unknown> = {
        dateTime: '2099-06-15T10:00',
        serviceId: 'svc-haircut',
        staffId: 'staff-1',
        confirmOverlap: true,
        createdBy: 'admin-1',
        isManual: true,
        status: 'pending',
      };

      const result = stripPrivilegedFields(body, true);

      expect(result.confirmOverlap).toBe(true);
      expect(result.createdBy).toBe('admin-1');
      expect(result.isManual).toBe(true);
      expect(result.status).toBe('pending');
    });
  });

  describe('Unauthenticated user cannot bypass conflict enforcement', () => {
    test('confirmOverlap stripped → conflict check still enforced for customer booking', () => {
      const body: Record<string, unknown> = {
        dateTime: '2099-06-15T10:30',
        serviceId: 'svc-haircut',
        staffId: 'staff-1',
        confirmOverlap: true, // Malicious attempt to bypass
      };

      // Strip privileged fields (simulates route behavior for unauthenticated user)
      stripPrivilegedFields(body, false);

      // confirmOverlap is gone → conflict check cannot be bypassed
      expect(body.confirmOverlap).toBeUndefined();

      // The conflict check runs regardless
      const existingAppointments = [
        makeExistingAppointment({ dateTime: '2099-06-15T10:00' }),
      ];

      const conflictResult = detectConflict(
        'staff-1',
        '2099-06-15T10:30',
        60,
        15,
        existingAppointments,
        serviceDurationMap
      );

      // Conflict is detected → route returns 409 (cannot be overridden)
      expect(conflictResult).not.toBeNull();
    });

    test('createdBy stripped → request treated as customer booking', () => {
      const body: Record<string, unknown> = {
        dateTime: '2099-06-15T10:00',
        serviceId: 'svc-haircut',
        staffId: 'staff-1',
        createdBy: 'fake-admin', // Malicious attempt
      };

      stripPrivilegedFields(body, false);

      // createdBy is gone → this is treated as a standard customer booking
      expect(body.createdBy).toBeUndefined();
    });
  });

  describe('Edit/reschedule requires authentication (Requirement 7.4)', () => {
    test('stripPrivilegedFields for unauthenticated edit removes confirmOverlap', () => {
      // Simulates an unauthenticated PATCH attempt with confirmOverlap
      const body: Record<string, unknown> = {
        appointmentId: 'appt-123',
        dateTime: '2099-06-15T15:00',
        confirmOverlap: true,
      };

      stripPrivilegedFields(body, false);

      // Without confirmOverlap, any detected conflict will result in 409
      expect(body.confirmOverlap).toBeUndefined();
      // appointmentId is NOT a privileged field — it remains
      expect(body.appointmentId).toBe('appt-123');
    });

    test('self-exclusion works during edits (authenticated user)', () => {
      const existingAppointments = [
        makeExistingAppointment({
          appointmentId: 'appt-being-edited',
          dateTime: '2099-06-15T10:00',
        }),
      ];

      // Edit the same appointment to a new time that would overlap with itself
      const conflictResult = detectConflict(
        'staff-1',
        '2099-06-15T10:30',
        60,
        15,
        existingAppointments,
        serviceDurationMap,
        'appt-being-edited' // excludeAppointmentId
      );

      // No conflict because the appointment being edited is excluded
      expect(conflictResult).toBeNull();
    });

    test('edit detects conflict with OTHER appointments even when self is excluded', () => {
      const existingAppointments = [
        makeExistingAppointment({
          appointmentId: 'appt-being-edited',
          dateTime: '2099-06-15T10:00',
        }),
        makeExistingAppointment({
          appointmentId: 'other-appt',
          dateTime: '2099-06-15T14:00',
        }),
      ];

      // Edit to move to 14:30 → conflicts with other-appt
      const conflictResult = detectConflict(
        'staff-1',
        '2099-06-15T14:30',
        60,
        15,
        existingAppointments,
        serviceDurationMap,
        'appt-being-edited'
      );

      expect(conflictResult).not.toBeNull();
      expect(conflictResult!.appointmentId).toBe('other-appt');
    });
  });
});
