/**
 * Unit tests for the bundle pre-write conflict check module.
 *
 * Verifies:
 * - External conflict detection for each staff member independently
 * - Intra-bundle conflict detection (same staff, overlapping times)
 * - Sequential buffer enforcement (next service starts after previous + buffer)
 * - Multi-vendor query aggregation
 *
 * Requirements: 9.1, 9.3, 9.4, 9.5
 */

import { describe, test, expect } from '@jest/globals';
import {
  checkBundleConflicts,
  checkIntraBundleConflicts,
  checkSequentialBufferEnforcement,
  type BundleServiceAssignment,
} from '../app/utils/bundleConflictCheck';

describe('checkBundleConflicts - external conflict detection (Req 9.1, 9.5)', () => {
  test('detects conflict when staff has an existing appointment at the same time', () => {
    const assignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-a', staffId: 'staff-1', vendorId: 'v1', startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-b', staffId: 'staff-2', vendorId: 'v2', startTime: '10:15', endTime: '11:15', duration: 60 },
    ];

    const existingAppointments = [
      {
        appointmentId: 'apt-existing',
        staffId: 'staff-1',
        dateTime: '2024-06-15T09:30',
        status: 'confirmed',
        serviceId: 'svc-other',
      },
    ];

    const serviceDurationMap = { 'svc-other': 60 };

    const result = checkBundleConflicts(assignments, existingAppointments, serviceDurationMap, 15, '2024-06-15');

    expect(result.hasConflict).toBe(true);
    expect(result.conflictType).toBe('external');
    expect(result.staffId).toBe('staff-1');
    expect(result.serviceId).toBe('svc-a');
  });

  test('passes when no external conflicts exist for any staff member', () => {
    const assignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-a', staffId: 'staff-1', vendorId: 'v1', startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-b', staffId: 'staff-2', vendorId: 'v2', startTime: '10:15', endTime: '11:15', duration: 60 },
    ];

    const existingAppointments = [
      {
        appointmentId: 'apt-existing',
        staffId: 'staff-3', // different staff
        dateTime: '2024-06-15T09:00',
        status: 'confirmed',
        serviceId: 'svc-other',
      },
    ];

    const serviceDurationMap = { 'svc-other': 60 };

    const result = checkBundleConflicts(assignments, existingAppointments, serviceDurationMap, 15, '2024-06-15');

    expect(result.hasConflict).toBe(false);
  });

  test('skips cancelled existing appointments', () => {
    const assignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-a', staffId: 'staff-1', vendorId: 'v1', startTime: '09:00', endTime: '10:00', duration: 60 },
    ];

    const existingAppointments = [
      {
        appointmentId: 'apt-cancelled',
        staffId: 'staff-1',
        dateTime: '2024-06-15T09:00',
        status: 'cancelled',
        serviceId: 'svc-other',
      },
    ];

    const serviceDurationMap = { 'svc-other': 60 };

    const result = checkBundleConflicts(assignments, existingAppointments, serviceDurationMap, 15, '2024-06-15');

    expect(result.hasConflict).toBe(false);
  });

  test('detects conflict including buffer time', () => {
    const assignments: BundleServiceAssignment[] = [
      // Starts at 10:00, so with 15min buffer the window is 10:00 - 11:15
      { serviceId: 'svc-a', staffId: 'staff-1', vendorId: 'v1', startTime: '10:00', endTime: '11:00', duration: 60 },
    ];

    // Existing appointment at 09:00, duration 60, buffer 15 → ends at 10:15
    // New appointment at 10:00 starts within existing buffer window (before 10:15)
    const existingAppointments = [
      {
        appointmentId: 'apt-existing',
        staffId: 'staff-1',
        dateTime: '2024-06-15T09:00',
        status: 'confirmed',
        serviceId: 'svc-other',
      },
    ];

    const serviceDurationMap = { 'svc-other': 60 };

    const result = checkBundleConflicts(assignments, existingAppointments, serviceDurationMap, 15, '2024-06-15');

    expect(result.hasConflict).toBe(true);
    expect(result.conflictType).toBe('external');
  });

  test('passes when new appointment starts exactly at end of existing buffered window (boundary non-overlap)', () => {
    const assignments: BundleServiceAssignment[] = [
      // Starts at 10:15 (exactly at existing end + buffer)
      { serviceId: 'svc-a', staffId: 'staff-1', vendorId: 'v1', startTime: '10:15', endTime: '11:15', duration: 60 },
    ];

    // Existing: 09:00, duration 60, buffer 15 → existing window ends at 10:15
    // New starts at 10:15 → no overlap (boundary condition)
    const existingAppointments = [
      {
        appointmentId: 'apt-existing',
        staffId: 'staff-1',
        dateTime: '2024-06-15T09:00',
        status: 'confirmed',
        serviceId: 'svc-other',
      },
    ];

    const serviceDurationMap = { 'svc-other': 60 };

    const result = checkBundleConflicts(assignments, existingAppointments, serviceDurationMap, 15, '2024-06-15');

    expect(result.hasConflict).toBe(false);
  });

  test('checks each staff member independently across multi-vendor appointments', () => {
    // Staff-2 has a conflict from a different vendor
    const assignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-a', staffId: 'staff-1', vendorId: 'v1', startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-b', staffId: 'staff-2', vendorId: 'v2', startTime: '11:00', endTime: '12:00', duration: 60 },
    ];

    const existingAppointments = [
      {
        appointmentId: 'apt-v1',
        staffId: 'staff-2', // conflict for staff-2 from vendor v1
        dateTime: '2024-06-15T11:00',
        status: 'confirmed',
        serviceId: 'svc-x',
      },
    ];

    const serviceDurationMap = { 'svc-x': 60 };

    const result = checkBundleConflicts(assignments, existingAppointments, serviceDurationMap, 15, '2024-06-15');

    expect(result.hasConflict).toBe(true);
    expect(result.staffId).toBe('staff-2');
    expect(result.serviceId).toBe('svc-b');
  });
});

describe('checkIntraBundleConflicts (Req 9.3)', () => {
  test('detects intra-bundle conflict when same staff has overlapping services', () => {
    const assignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-a', staffId: 'staff-1', vendorId: 'v1', startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-b', staffId: 'staff-1', vendorId: 'v1', startTime: '09:30', endTime: '10:30', duration: 60 },
    ];

    const result = checkIntraBundleConflicts(assignments, 15);

    expect(result.hasConflict).toBe(true);
    expect(result.conflictType).toBe('intra-bundle');
    expect(result.staffId).toBe('staff-1');
  });

  test('no conflict when same staff has non-overlapping services with buffer', () => {
    const assignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-a', staffId: 'staff-1', vendorId: 'v1', startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-b', staffId: 'staff-1', vendorId: 'v1', startTime: '10:15', endTime: '11:15', duration: 60 },
    ];

    const result = checkIntraBundleConflicts(assignments, 15);

    expect(result.hasConflict).toBe(false);
  });

  test('no conflict when different staff have overlapping services', () => {
    const assignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-a', staffId: 'staff-1', vendorId: 'v1', startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-b', staffId: 'staff-2', vendorId: 'v2', startTime: '09:00', endTime: '10:00', duration: 60 },
    ];

    const result = checkIntraBundleConflicts(assignments, 15);

    expect(result.hasConflict).toBe(false);
  });

  test('detects conflict when buffer causes overlap even without direct time overlap', () => {
    // Service A ends at 10:00, with 15min buffer → extends to 10:15
    // Service B starts at 10:10 — within the buffer zone
    const assignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-a', staffId: 'staff-1', vendorId: 'v1', startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-b', staffId: 'staff-1', vendorId: 'v1', startTime: '10:10', endTime: '11:10', duration: 60 },
    ];

    const result = checkIntraBundleConflicts(assignments, 15);

    expect(result.hasConflict).toBe(true);
    expect(result.conflictType).toBe('intra-bundle');
  });
});

describe('checkSequentialBufferEnforcement (Req 9.4)', () => {
  test('passes when sequential services have proper buffer between them', () => {
    const assignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-a', staffId: 'staff-1', vendorId: 'v1', startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-b', staffId: 'staff-1', vendorId: 'v1', startTime: '10:15', endTime: '11:15', duration: 60 },
    ];

    const result = checkSequentialBufferEnforcement(assignments, 15);

    expect(result.hasConflict).toBe(false);
  });

  test('detects violation when next service starts too early (before previous + duration + buffer)', () => {
    const assignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-a', staffId: 'staff-1', vendorId: 'v1', startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-b', staffId: 'staff-1', vendorId: 'v1', startTime: '10:10', endTime: '11:10', duration: 60 },
    ];

    const result = checkSequentialBufferEnforcement(assignments, 15);

    expect(result.hasConflict).toBe(true);
    expect(result.conflictType).toBe('sequential-buffer');
    expect(result.staffId).toBe('staff-1');
  });

  test('passes when services are assigned to different staff (no buffer needed between them)', () => {
    const assignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-a', staffId: 'staff-1', vendorId: 'v1', startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-b', staffId: 'staff-2', vendorId: 'v2', startTime: '09:30', endTime: '10:30', duration: 60 },
    ];

    const result = checkSequentialBufferEnforcement(assignments, 15);

    expect(result.hasConflict).toBe(false);
  });

  test('handles three sequential services to same staff correctly', () => {
    // 09:00-10:00, 10:15-11:15, 11:30-12:30 with 15min buffer — all valid
    const assignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-a', staffId: 'staff-1', vendorId: 'v1', startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-b', staffId: 'staff-1', vendorId: 'v1', startTime: '10:15', endTime: '11:15', duration: 60 },
      { serviceId: 'svc-c', staffId: 'staff-1', vendorId: 'v1', startTime: '11:30', endTime: '12:30', duration: 60 },
    ];

    const result = checkSequentialBufferEnforcement(assignments, 15);

    expect(result.hasConflict).toBe(false);
  });

  test('detects violation in the middle of a three-service sequence', () => {
    // Second → Third doesn't have enough buffer
    const assignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-a', staffId: 'staff-1', vendorId: 'v1', startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-b', staffId: 'staff-1', vendorId: 'v1', startTime: '10:15', endTime: '11:15', duration: 60 },
      { serviceId: 'svc-c', staffId: 'staff-1', vendorId: 'v1', startTime: '11:20', endTime: '12:20', duration: 60 },
    ];

    const result = checkSequentialBufferEnforcement(assignments, 15);

    expect(result.hasConflict).toBe(true);
    expect(result.conflictType).toBe('sequential-buffer');
    expect(result.serviceId).toBe('svc-c');
  });

  test('single service for staff has no sequential buffer issue', () => {
    const assignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-a', staffId: 'staff-1', vendorId: 'v1', startTime: '09:00', endTime: '10:00', duration: 60 },
    ];

    const result = checkSequentialBufferEnforcement(assignments, 15);

    expect(result.hasConflict).toBe(false);
  });

  test('enforces buffer with zero buffer minutes (services must still not overlap)', () => {
    // With 0 buffer, services can be truly back-to-back
    const assignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-a', staffId: 'staff-1', vendorId: 'v1', startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-b', staffId: 'staff-1', vendorId: 'v1', startTime: '10:00', endTime: '11:00', duration: 60 },
    ];

    const result = checkSequentialBufferEnforcement(assignments, 0);

    expect(result.hasConflict).toBe(false);
  });
});

describe('checkBundleConflicts - full integration', () => {
  test('rejects entire bundle when any single staff member has a conflict (Req 9.2)', () => {
    // Staff-1 is fine, but Staff-2 has a conflict
    const assignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-a', staffId: 'staff-1', vendorId: 'v1', startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-b', staffId: 'staff-2', vendorId: 'v2', startTime: '11:00', endTime: '12:00', duration: 60 },
    ];

    const existingAppointments = [
      {
        appointmentId: 'apt-conflict',
        staffId: 'staff-2',
        dateTime: '2024-06-15T10:30',
        status: 'confirmed',
        serviceId: 'svc-x',
      },
    ];

    const serviceDurationMap = { 'svc-x': 60 };

    const result = checkBundleConflicts(assignments, existingAppointments, serviceDurationMap, 15, '2024-06-15');

    expect(result.hasConflict).toBe(true);
    // The conflict should be detected for staff-2
    expect(result.staffId).toBe('staff-2');
  });

  test('detects intra-bundle conflict even when no external conflicts exist', () => {
    const assignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-a', staffId: 'staff-1', vendorId: 'v1', startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-b', staffId: 'staff-1', vendorId: 'v1', startTime: '09:30', endTime: '10:30', duration: 60 },
    ];

    // No existing appointments
    const result = checkBundleConflicts(assignments, [], {}, 15, '2024-06-15');

    expect(result.hasConflict).toBe(true);
    expect(result.conflictType).toBe('intra-bundle');
  });

  test('passes when all staff are free and no intra-bundle conflicts', () => {
    const assignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-a', staffId: 'staff-1', vendorId: 'v1', startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-b', staffId: 'staff-2', vendorId: 'v2', startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-c', staffId: 'staff-1', vendorId: 'v1', startTime: '10:15', endTime: '11:15', duration: 60 },
    ];

    const existingAppointments = [
      {
        appointmentId: 'apt-other-staff',
        staffId: 'staff-3',
        dateTime: '2024-06-15T09:00',
        status: 'confirmed',
        serviceId: 'svc-y',
      },
    ];

    const serviceDurationMap = { 'svc-y': 60 };

    const result = checkBundleConflicts(assignments, existingAppointments, serviceDurationMap, 15, '2024-06-15');

    expect(result.hasConflict).toBe(false);
  });

  test('handles blocked-time entries as real appointments during conflict check', () => {
    const assignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-a', staffId: 'staff-1', vendorId: 'v1', startTime: '09:00', endTime: '10:00', duration: 60 },
    ];

    const existingAppointments = [
      {
        appointmentId: 'blocked-1',
        staffId: 'staff-1',
        dateTime: '2024-06-15T09:00',
        status: 'blocked',
        serviceId: 'blocked',
        customer: JSON.stringify({ duration: 120 }),
      },
    ];

    const serviceDurationMap = {};

    const result = checkBundleConflicts(assignments, existingAppointments, serviceDurationMap, 15, '2024-06-15');

    expect(result.hasConflict).toBe(true);
    expect(result.conflictType).toBe('external');
  });
});
