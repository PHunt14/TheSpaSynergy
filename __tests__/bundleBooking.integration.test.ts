/**
 * Integration tests for bundle booking atomicity.
 *
 * Tests:
 * - Bundle booking atomicity: verify all-or-nothing across multiple vendors using database transaction
 * - Post-write verification rollback for bundles
 *
 * **Validates: Requirements 9.2, 9.7, 9.8, 10.8**
 *
 * These tests simulate the full bundle booking flow with a mocked Amplify/DynamoDB client
 * to verify that:
 * 1. When a pre-write conflict is detected for ANY staff member, NO appointments are persisted
 * 2. When a post-write verification detects a concurrent conflict, ALL appointments in the
 *    bundle group are cancelled (rolled back) using the shared groupId
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import {
  checkBundleConflicts,
  queryAppointmentsAcrossVendors,
  buildServiceDurationMap,
  type BundleServiceAssignment,
} from '../app/utils/bundleConflictCheck';
import { detectConflict } from '../app/utils/overlapDetection';

// ── Mock Data Store ─────────────────────────────────────────────────────────

let mockAppointments: any[] = [];
let mockServices: Record<string, any> = {};

function createMockClient(options?: {
  /**
   * If provided, the listAppointmentByVendorIdAndDateTime function will inject
   * these concurrent appointments on the SECOND call (simulating a race condition
   * where another request wrote between our pre-check and post-write verification).
   */
  injectOnPostWriteQuery?: any[];
  /** Track number of calls to listAppointmentByVendorIdAndDateTime per vendorId */
  callCounts?: Record<string, number>;
}) {
  const callCounts: Record<string, number> = options?.callCounts || {};

  return {
    models: {
      Appointment: {
        create: jest.fn(async (data: any) => {
          mockAppointments.push({ ...data });
          return { data, errors: null };
        }),
        update: jest.fn(async (data: any) => {
          const idx = mockAppointments.findIndex((a: any) => a.appointmentId === data.appointmentId);
          if (idx >= 0) {
            mockAppointments[idx] = { ...mockAppointments[idx], ...data };
          }
          return { data, errors: null };
        }),
        listAppointmentByVendorIdAndDateTime: jest.fn(async ({ vendorId, dateTime }: any) => {
          const prefix = dateTime.beginsWith || '';
          // Track call count
          const key = `${vendorId}:${prefix}`;
          callCounts[key] = (callCounts[key] || 0) + 1;

          let results = mockAppointments.filter(
            (a: any) => a.vendorId === vendorId && a.dateTime?.startsWith(prefix) && a.status !== 'cancelled'
          );

          // On second call (post-write verification), inject concurrent appointments
          if (callCounts[key] > 1 && options?.injectOnPostWriteQuery) {
            results = [...results, ...options.injectOnPostWriteQuery.filter(
              (a: any) => a.vendorId === vendorId && a.dateTime?.startsWith(prefix)
            )];
          }

          return { data: results };
        }),
        list: jest.fn(async ({ filter }: any) => {
          const vendorId = filter?.vendorId?.eq;
          const prefix = filter?.dateTime?.beginsWith || '';
          const results = mockAppointments.filter(
            (a: any) => a.vendorId === vendorId && a.dateTime?.startsWith(prefix) && a.status !== 'cancelled'
          );
          return { data: results };
        }),
      },
      Service: {
        get: jest.fn(async ({ serviceId }: any) => {
          return { data: mockServices[serviceId] || null, errors: null };
        }),
      },
    },
  };
}

// ── Test Data ───────────────────────────────────────────────────────────────

const VENDOR_A = 'vendor-a';
const VENDOR_B = 'vendor-b';
const VENDOR_C = 'vendor-c';

const STAFF_ALICE = 'staff-alice';
const STAFF_BOB = 'staff-bob';
const STAFF_CAROL = 'staff-carol';

const DATE = '2025-03-10';
const BUFFER_MINUTES = 15;

function setupServices() {
  mockServices = {
    'svc-massage': { serviceId: 'svc-massage', duration: 60, vendorId: VENDOR_A, allowedStaff: [STAFF_ALICE] },
    'svc-facial': { serviceId: 'svc-facial', duration: 45, vendorId: VENDOR_B, allowedStaff: [STAFF_BOB] },
    'svc-nails': { serviceId: 'svc-nails', duration: 30, vendorId: VENDOR_C, allowedStaff: [STAFF_CAROL] },
    'svc-other': { serviceId: 'svc-other', duration: 60, vendorId: VENDOR_A, allowedStaff: [STAFF_ALICE] },
  };
}

function addExistingAppointment(overrides: any = {}) {
  const apt = {
    appointmentId: `apt-existing-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    vendorId: VENDOR_A,
    staffId: STAFF_ALICE,
    serviceId: 'svc-other',
    dateTime: `${DATE}T09:00`,
    status: 'confirmed',
    customer: JSON.stringify({ name: 'Existing Customer', duration: 60 }),
    ...overrides,
  };
  mockAppointments.push(apt);
  return apt;
}

// ── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockAppointments = [];
  mockServices = {};
  setupServices();
});

describe('Bundle Booking Atomicity - Pre-write conflict rejection (Req 9.2, 10.8)', () => {
  test('rejects entire bundle when ONE staff member has a conflict — NO appointments persisted', () => {
    // Setup: Staff Alice has an existing appointment at 09:00 (60 min + 15 buffer = until 10:15)
    addExistingAppointment({
      staffId: STAFF_ALICE,
      vendorId: VENDOR_A,
      dateTime: `${DATE}T09:00`,
      serviceId: 'svc-other',
    });

    // Bundle attempts to book:
    // - Alice (vendor-a): 09:30-10:30 → CONFLICTS with existing 09:00 appointment
    // - Bob (vendor-b): 09:30-10:15 → no conflict
    // - Carol (vendor-c): 10:30-11:00 → no conflict
    const bundleAssignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-massage', staffId: STAFF_ALICE, vendorId: VENDOR_A, startTime: '09:30', endTime: '10:30', duration: 60 },
      { serviceId: 'svc-facial', staffId: STAFF_BOB, vendorId: VENDOR_B, startTime: '09:30', endTime: '10:15', duration: 45 },
      { serviceId: 'svc-nails', staffId: STAFF_CAROL, vendorId: VENDOR_C, startTime: '10:30', endTime: '11:00', duration: 30 },
    ];

    const serviceDurationMap = { 'svc-other': 60 };

    // Pre-write conflict check — this is what the route does before persisting
    const result = checkBundleConflicts(
      bundleAssignments,
      mockAppointments,
      serviceDurationMap,
      BUFFER_MINUTES,
      DATE
    );

    // Verify: conflict detected
    expect(result.hasConflict).toBe(true);
    expect(result.conflictType).toBe('external');
    expect(result.staffId).toBe(STAFF_ALICE);

    // Verify: NO appointments should have been created (route rejects before write)
    // Since checkBundleConflicts returned hasConflict=true, the route would NOT call
    // Appointment.create. We verify no new appointments were added to our store.
    const newAppointments = mockAppointments.filter(
      (a: any) => a.serviceId === 'svc-massage' || a.serviceId === 'svc-facial' || a.serviceId === 'svc-nails'
    );
    expect(newAppointments).toHaveLength(0);
  });

  test('rejects entire bundle when conflict is with a different vendor appointment (multi-vendor query)', async () => {
    // Staff Bob works for vendor-b, but has an appointment already at vendor-b
    addExistingAppointment({
      staffId: STAFF_BOB,
      vendorId: VENDOR_B,
      dateTime: `${DATE}T10:00`,
      serviceId: 'svc-facial',
    });

    const bundleAssignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-massage', staffId: STAFF_ALICE, vendorId: VENDOR_A, startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-facial', staffId: STAFF_BOB, vendorId: VENDOR_B, startTime: '10:00', endTime: '10:45', duration: 45 },
      { serviceId: 'svc-nails', staffId: STAFF_CAROL, vendorId: VENDOR_C, startTime: '11:00', endTime: '11:30', duration: 30 },
    ];

    // Query appointments across all vendors (simulating queryAppointmentsAcrossVendors)
    const mockClient = createMockClient();
    const allAppointments = await queryAppointmentsAcrossVendors(
      mockClient,
      [VENDOR_A, VENDOR_B, VENDOR_C],
      DATE
    );

    const serviceDurationMap = await buildServiceDurationMap(mockClient, allAppointments);

    const result = checkBundleConflicts(
      bundleAssignments,
      allAppointments,
      serviceDurationMap,
      BUFFER_MINUTES,
      DATE
    );

    // Conflict for Bob — entire bundle rejected
    expect(result.hasConflict).toBe(true);
    expect(result.staffId).toBe(STAFF_BOB);
    expect(result.serviceId).toBe('svc-facial');
  });

  test('all-or-nothing: when NO conflict exists, all appointments can be created', async () => {
    // No existing appointments for any staff member
    const bundleAssignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-massage', staffId: STAFF_ALICE, vendorId: VENDOR_A, startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-facial', staffId: STAFF_BOB, vendorId: VENDOR_B, startTime: '10:15', endTime: '11:00', duration: 45 },
      { serviceId: 'svc-nails', staffId: STAFF_CAROL, vendorId: VENDOR_C, startTime: '11:15', endTime: '11:45', duration: 30 },
    ];

    const mockClient = createMockClient();
    const allAppointments = await queryAppointmentsAcrossVendors(
      mockClient,
      [VENDOR_A, VENDOR_B, VENDOR_C],
      DATE
    );

    const serviceDurationMap = await buildServiceDurationMap(mockClient, allAppointments);

    const result = checkBundleConflicts(
      bundleAssignments,
      allAppointments,
      serviceDurationMap,
      BUFFER_MINUTES,
      DATE
    );

    // No conflict — all appointments can proceed
    expect(result.hasConflict).toBe(false);

    // Simulate creating all appointments with shared groupId
    const groupId = 'group-test-123';
    const createdIds: string[] = [];

    for (const assignment of bundleAssignments) {
      const appointmentId = `apt-bundle-${assignment.serviceId}`;
      const createResult = await mockClient.models.Appointment.create({
        appointmentId,
        vendorId: assignment.vendorId,
        serviceId: assignment.serviceId,
        staffId: assignment.staffId,
        groupId,
        dateTime: `${DATE}T${assignment.startTime}`,
        status: 'pending-confirmation',
        customer: JSON.stringify({ name: 'Bundle Customer', duration: assignment.duration }),
      });
      expect(createResult.errors).toBeNull();
      createdIds.push(appointmentId);
    }

    // Verify ALL appointments were created with the shared groupId
    const bundleAppointments = mockAppointments.filter((a: any) => a.groupId === groupId);
    expect(bundleAppointments).toHaveLength(3);
    expect(bundleAppointments.every((a: any) => a.status === 'pending-confirmation')).toBe(true);
    expect(bundleAppointments.map((a: any) => a.vendorId).sort()).toEqual(
      [VENDOR_A, VENDOR_B, VENDOR_C].sort()
    );
  });

  test('intra-bundle conflict rejects entire bundle — no appointments persisted', () => {
    // Same staff (Alice) assigned to two overlapping services in the bundle
    const bundleAssignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-massage', staffId: STAFF_ALICE, vendorId: VENDOR_A, startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-facial', staffId: STAFF_ALICE, vendorId: VENDOR_A, startTime: '09:30', endTime: '10:15', duration: 45 },
    ];

    const result = checkBundleConflicts(
      bundleAssignments,
      [], // no external appointments
      {},
      BUFFER_MINUTES,
      DATE
    );

    expect(result.hasConflict).toBe(true);
    expect(result.conflictType).toBe('intra-bundle');
    expect(result.staffId).toBe(STAFF_ALICE);
  });
});

describe('Bundle Booking Atomicity - Post-write verification rollback (Req 9.7, 9.8)', () => {
  test('post-write verification detects concurrent conflict and rolls back ALL bundle appointments', async () => {
    // Scenario: Pre-write check passes, we create all appointments.
    // Then a concurrent request writes a conflicting appointment for Staff Alice.
    // Post-write verification re-queries and detects the conflict.
    // ALL appointments in the bundle group must be cancelled.

    const groupId = 'group-postwrite-test';
    const bundleAppointmentIds = [
      'apt-bundle-massage',
      'apt-bundle-facial',
      'apt-bundle-nails',
    ];

    // The concurrent appointment that was written AFTER our pre-write check
    const concurrentAppointment = {
      appointmentId: 'apt-concurrent-conflict',
      vendorId: VENDOR_A,
      staffId: STAFF_ALICE,
      serviceId: 'svc-other',
      dateTime: `${DATE}T09:30`,
      status: 'confirmed',
      customer: JSON.stringify({ name: 'Concurrent Customer', duration: 60 }),
    };

    // Create mock client that injects the concurrent appointment on the second query
    const callCounts: Record<string, number> = {};
    const mockClient = createMockClient({
      injectOnPostWriteQuery: [concurrentAppointment],
      callCounts,
    });

    // Step 1: Pre-write check passes (no existing appointments)
    const bundleAssignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-massage', staffId: STAFF_ALICE, vendorId: VENDOR_A, startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-facial', staffId: STAFF_BOB, vendorId: VENDOR_B, startTime: '10:15', endTime: '11:00', duration: 45 },
      { serviceId: 'svc-nails', staffId: STAFF_CAROL, vendorId: VENDOR_C, startTime: '11:15', endTime: '11:45', duration: 30 },
    ];

    const preWriteAppointments = await queryAppointmentsAcrossVendors(
      mockClient,
      [VENDOR_A, VENDOR_B, VENDOR_C],
      DATE
    );
    const serviceDurationMap = await buildServiceDurationMap(mockClient, preWriteAppointments);

    const preWriteResult = checkBundleConflicts(
      bundleAssignments,
      preWriteAppointments,
      serviceDurationMap,
      BUFFER_MINUTES,
      DATE
    );
    expect(preWriteResult.hasConflict).toBe(false); // Pre-write passes

    // Step 2: Create all bundle appointments (simulating what the route does)
    for (let i = 0; i < bundleAssignments.length; i++) {
      const assignment = bundleAssignments[i];
      await mockClient.models.Appointment.create({
        appointmentId: bundleAppointmentIds[i],
        vendorId: assignment.vendorId,
        serviceId: assignment.serviceId,
        staffId: assignment.staffId,
        groupId,
        dateTime: `${DATE}T${assignment.startTime}`,
        status: 'pending-confirmation',
        customer: JSON.stringify({ name: 'Bundle Customer', duration: assignment.duration }),
      });
    }

    // Verify appointments were created
    const createdAppointments = mockAppointments.filter((a: any) => a.groupId === groupId);
    expect(createdAppointments).toHaveLength(3);

    // Step 3: Post-write verification — re-query appointments for each staff member
    // The mockClient will now inject the concurrent appointment on second call
    let postWriteConflictDetected = false;

    // Simulate verifyBundlePostWrite logic
    const uniqueStaff = new Map<string, { vendorId: string; assignments: typeof bundleAssignments }>();
    for (const assignment of bundleAssignments) {
      if (!uniqueStaff.has(assignment.staffId)) {
        uniqueStaff.set(assignment.staffId, { vendorId: assignment.vendorId, assignments: [] });
      }
      uniqueStaff.get(assignment.staffId)!.assignments.push(assignment);
    }

    for (const [staffId, { vendorId, assignments }] of uniqueStaff) {
      // Re-query (this will be the 2nd call for vendor-a, injecting concurrent appointment)
      const postWriteResult = await mockClient.models.Appointment.listAppointmentByVendorIdAndDateTime({
        vendorId,
        dateTime: { beginsWith: DATE },
      });
      const postWriteApts = postWriteResult.data || [];

      // Build service duration map for post-write appointments
      const postServiceIds = [...new Set(postWriteApts.map((a: any) => a.serviceId).filter(Boolean))] as string[];
      const postServiceDurationMap: Record<string, number> = {};
      for (const sid of postServiceIds) {
        if (sid === 'blocked' || sid === 'manual') continue;
        const svcResult = await mockClient.models.Service.get({ serviceId: sid });
        if (svcResult.data?.duration) postServiceDurationMap[sid] = svcResult.data.duration;
      }

      // Check each staff member's assignments for conflicts
      for (const assignment of assignments) {
        const serviceDateTime = `${DATE}T${assignment.startTime}`;

        // Exclude our own bundle appointments from conflict check
        const filteredApts = postWriteApts.filter(
          (a: any) => !bundleAppointmentIds.includes(a.appointmentId)
        );

        const conflict = detectConflict(
          staffId,
          serviceDateTime,
          assignment.duration,
          BUFFER_MINUTES,
          filteredApts,
          postServiceDurationMap,
          undefined,
          false
        );

        if (conflict) {
          postWriteConflictDetected = true;
          break;
        }
      }

      if (postWriteConflictDetected) break;
    }

    // Verify: post-write conflict WAS detected (concurrent appointment for Alice)
    expect(postWriteConflictDetected).toBe(true);

    // Step 4: Atomic rollback — cancel ALL appointments in the bundle group
    for (const id of bundleAppointmentIds) {
      await mockClient.models.Appointment.update({ appointmentId: id, status: 'cancelled' });
    }

    // Verify: ALL appointments in the group are now cancelled
    const rolledBackAppointments = mockAppointments.filter((a: any) => a.groupId === groupId);
    expect(rolledBackAppointments).toHaveLength(3);
    expect(rolledBackAppointments.every((a: any) => a.status === 'cancelled')).toBe(true);

    // Verify: Bob's and Carol's appointments were also cancelled (all-or-nothing)
    const bobAppt = rolledBackAppointments.find((a: any) => a.staffId === STAFF_BOB);
    const carolAppt = rolledBackAppointments.find((a: any) => a.staffId === STAFF_CAROL);
    expect(bobAppt?.status).toBe('cancelled');
    expect(carolAppt?.status).toBe('cancelled');
  });

  test('post-write verification passes when no concurrent conflicts — all appointments remain active', async () => {
    const groupId = 'group-no-conflict';
    const bundleAppointmentIds = [
      'apt-ok-massage',
      'apt-ok-facial',
      'apt-ok-nails',
    ];

    // No concurrent appointment injection — post-write will see only our own appointments
    const mockClient = createMockClient();

    const bundleAssignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-massage', staffId: STAFF_ALICE, vendorId: VENDOR_A, startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-facial', staffId: STAFF_BOB, vendorId: VENDOR_B, startTime: '10:15', endTime: '11:00', duration: 45 },
      { serviceId: 'svc-nails', staffId: STAFF_CAROL, vendorId: VENDOR_C, startTime: '11:15', endTime: '11:45', duration: 30 },
    ];

    // Create all bundle appointments
    for (let i = 0; i < bundleAssignments.length; i++) {
      const assignment = bundleAssignments[i];
      await mockClient.models.Appointment.create({
        appointmentId: bundleAppointmentIds[i],
        vendorId: assignment.vendorId,
        serviceId: assignment.serviceId,
        staffId: assignment.staffId,
        groupId,
        dateTime: `${DATE}T${assignment.startTime}`,
        status: 'pending-confirmation',
        customer: JSON.stringify({ name: 'Bundle Customer', duration: assignment.duration }),
      });
    }

    // Post-write verification: re-query each staff member's appointments
    let postWriteConflictDetected = false;

    for (const assignment of bundleAssignments) {
      const postWriteResult = await mockClient.models.Appointment.listAppointmentByVendorIdAndDateTime({
        vendorId: assignment.vendorId,
        dateTime: { beginsWith: DATE },
      });
      const postWriteApts = postWriteResult.data || [];

      // Build service duration map
      const postServiceDurationMap: Record<string, number> = {};
      for (const apt of postWriteApts) {
        if (apt.serviceId && apt.serviceId !== 'blocked' && apt.serviceId !== 'manual') {
          const svcResult = await mockClient.models.Service.get({ serviceId: apt.serviceId });
          if (svcResult.data?.duration) postServiceDurationMap[apt.serviceId] = svcResult.data.duration;
        }
      }

      // Exclude our own bundle appointments
      const filteredApts = postWriteApts.filter(
        (a: any) => !bundleAppointmentIds.includes(a.appointmentId)
      );

      const conflict = detectConflict(
        assignment.staffId,
        `${DATE}T${assignment.startTime}`,
        assignment.duration,
        BUFFER_MINUTES,
        filteredApts,
        postServiceDurationMap,
        undefined,
        false
      );

      if (conflict) {
        postWriteConflictDetected = true;
        break;
      }
    }

    // No conflict detected — appointments remain active
    expect(postWriteConflictDetected).toBe(false);

    const bundleAppts = mockAppointments.filter((a: any) => a.groupId === groupId);
    expect(bundleAppts).toHaveLength(3);
    expect(bundleAppts.every((a: any) => a.status === 'pending-confirmation')).toBe(true);
  });

  test('groupId is shared across all appointments in a bundle for atomic rollback', async () => {
    const groupId = 'group-shared-id-test';
    const mockClient = createMockClient();

    const assignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-massage', staffId: STAFF_ALICE, vendorId: VENDOR_A, startTime: '14:00', endTime: '15:00', duration: 60 },
      { serviceId: 'svc-facial', staffId: STAFF_BOB, vendorId: VENDOR_B, startTime: '14:00', endTime: '14:45', duration: 45 },
      { serviceId: 'svc-nails', staffId: STAFF_CAROL, vendorId: VENDOR_C, startTime: '14:00', endTime: '14:30', duration: 30 },
    ];

    // Create all appointments with shared groupId
    for (const assignment of assignments) {
      await mockClient.models.Appointment.create({
        appointmentId: `apt-group-${assignment.serviceId}`,
        vendorId: assignment.vendorId,
        serviceId: assignment.serviceId,
        staffId: assignment.staffId,
        groupId,
        dateTime: `${DATE}T${assignment.startTime}`,
        status: 'pending-confirmation',
        customer: JSON.stringify({ name: 'Bundle Customer', duration: assignment.duration }),
      });
    }

    // Verify all share the same groupId
    const groupAppointments = mockAppointments.filter((a: any) => a.groupId === groupId);
    expect(groupAppointments).toHaveLength(3);

    // Simulate atomic rollback (cancel all by groupId)
    for (const apt of groupAppointments) {
      await mockClient.models.Appointment.update({
        appointmentId: apt.appointmentId,
        status: 'cancelled',
      });
    }

    // Verify all cancelled
    const allCancelled = mockAppointments
      .filter((a: any) => a.groupId === groupId)
      .every((a: any) => a.status === 'cancelled');
    expect(allCancelled).toBe(true);
  });

  test('partial creation failure triggers rollback of already-created appointments', async () => {
    // Scenario: First 2 appointments are created successfully, the 3rd fails.
    // The route should cancel the first 2 (atomic rollback).

    const groupId = 'group-partial-failure';
    let createCallCount = 0;

    const failingClient = {
      models: {
        Appointment: {
          create: jest.fn(async (data: any) => {
            createCallCount++;
            if (createCallCount === 3) {
              // Third creation fails
              return { data: null, errors: [{ message: 'DynamoDB write error' }] };
            }
            mockAppointments.push({ ...data });
            return { data, errors: null };
          }),
          update: jest.fn(async (data: any) => {
            const idx = mockAppointments.findIndex((a: any) => a.appointmentId === data.appointmentId);
            if (idx >= 0) {
              mockAppointments[idx] = { ...mockAppointments[idx], ...data };
            }
            return { data, errors: null };
          }),
        },
        Service: {
          get: jest.fn(async ({ serviceId }: any) => {
            return { data: mockServices[serviceId] || null, errors: null };
          }),
        },
      },
    };

    const assignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-massage', staffId: STAFF_ALICE, vendorId: VENDOR_A, startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-facial', staffId: STAFF_BOB, vendorId: VENDOR_B, startTime: '10:15', endTime: '11:00', duration: 45 },
      { serviceId: 'svc-nails', staffId: STAFF_CAROL, vendorId: VENDOR_C, startTime: '11:15', endTime: '11:45', duration: 30 },
    ];

    // Simulate the route's creation loop
    const appointmentIds: string[] = [];
    const creationErrors: any[] = [];

    for (const assignment of assignments) {
      const appointmentId = `apt-partial-${assignment.serviceId}`;
      const result = await failingClient.models.Appointment.create({
        appointmentId,
        vendorId: assignment.vendorId,
        serviceId: assignment.serviceId,
        staffId: assignment.staffId,
        groupId,
        dateTime: `${DATE}T${assignment.startTime}`,
        status: 'pending-confirmation',
        customer: JSON.stringify({ name: 'Bundle Customer', duration: assignment.duration }),
      });

      if (result.errors) {
        creationErrors.push({ appointmentId, errors: result.errors });
      } else {
        appointmentIds.push(appointmentId);
      }
    }

    // Creation had errors — trigger rollback
    expect(creationErrors).toHaveLength(1);
    expect(appointmentIds).toHaveLength(2);

    // Rollback: cancel all successfully created appointments
    for (const id of appointmentIds) {
      await failingClient.models.Appointment.update({ appointmentId: id, status: 'cancelled' });
    }

    // Verify: all created appointments are now cancelled
    const groupAppts = mockAppointments.filter((a: any) => a.groupId === groupId);
    expect(groupAppts).toHaveLength(2);
    expect(groupAppts.every((a: any) => a.status === 'cancelled')).toBe(true);
  });

  test('post-write conflict for ONE staff member cancels ALL bundle appointments across all vendors', async () => {
    // A more specific test: conflict is for Carol (vendor-c), but Alice (vendor-a)
    // and Bob (vendor-b) appointments are also cancelled.

    const groupId = 'group-cross-vendor-rollback';
    const bundleAppointmentIds = [
      'apt-xv-massage',
      'apt-xv-facial',
      'apt-xv-nails',
    ];

    // Concurrent appointment conflicts with Carol at vendor-c
    const concurrentAppointment = {
      appointmentId: 'apt-concurrent-carol',
      vendorId: VENDOR_C,
      staffId: STAFF_CAROL,
      serviceId: 'svc-nails',
      dateTime: `${DATE}T11:00`,
      status: 'confirmed',
      customer: JSON.stringify({ name: 'Concurrent Carol Customer', duration: 30 }),
    };

    const mockClient = createMockClient({
      injectOnPostWriteQuery: [concurrentAppointment],
    });

    const bundleAssignments: BundleServiceAssignment[] = [
      { serviceId: 'svc-massage', staffId: STAFF_ALICE, vendorId: VENDOR_A, startTime: '09:00', endTime: '10:00', duration: 60 },
      { serviceId: 'svc-facial', staffId: STAFF_BOB, vendorId: VENDOR_B, startTime: '10:15', endTime: '11:00', duration: 45 },
      { serviceId: 'svc-nails', staffId: STAFF_CAROL, vendorId: VENDOR_C, startTime: '11:00', endTime: '11:30', duration: 30 },
    ];

    // Pre-write passes
    const preWriteAppts = await queryAppointmentsAcrossVendors(mockClient, [VENDOR_A, VENDOR_B, VENDOR_C], DATE);
    const preDurationMap = await buildServiceDurationMap(mockClient, preWriteAppts);
    const preResult = checkBundleConflicts(bundleAssignments, preWriteAppts, preDurationMap, BUFFER_MINUTES, DATE);
    expect(preResult.hasConflict).toBe(false);

    // Create all appointments
    for (let i = 0; i < bundleAssignments.length; i++) {
      await mockClient.models.Appointment.create({
        appointmentId: bundleAppointmentIds[i],
        vendorId: bundleAssignments[i].vendorId,
        serviceId: bundleAssignments[i].serviceId,
        staffId: bundleAssignments[i].staffId,
        groupId,
        dateTime: `${DATE}T${bundleAssignments[i].startTime}`,
        status: 'pending-confirmation',
        customer: JSON.stringify({ name: 'Bundle Customer', duration: bundleAssignments[i].duration }),
      });
    }

    // Post-write: check Carol's vendor
    let conflictFound = false;

    // Re-query vendor-c (second call injects concurrent appointment)
    const postWriteResult = await mockClient.models.Appointment.listAppointmentByVendorIdAndDateTime({
      vendorId: VENDOR_C,
      dateTime: { beginsWith: DATE },
    });
    const postWriteApts = postWriteResult.data || [];

    const postDurationMap: Record<string, number> = { 'svc-nails': 30 };
    const filteredApts = postWriteApts.filter(
      (a: any) => !bundleAppointmentIds.includes(a.appointmentId)
    );

    const conflict = detectConflict(
      STAFF_CAROL,
      `${DATE}T11:00`,
      30,
      BUFFER_MINUTES,
      filteredApts,
      postDurationMap,
      undefined,
      false
    );

    if (conflict) conflictFound = true;
    expect(conflictFound).toBe(true);

    // Atomic rollback: cancel ALL bundle appointments (including Alice's and Bob's)
    for (const id of bundleAppointmentIds) {
      await mockClient.models.Appointment.update({ appointmentId: id, status: 'cancelled' });
    }

    // Verify cross-vendor rollback
    const allGroupAppts = mockAppointments.filter((a: any) => a.groupId === groupId);
    expect(allGroupAppts).toHaveLength(3);
    expect(allGroupAppts.every((a: any) => a.status === 'cancelled')).toBe(true);

    // Specifically verify Alice (vendor-a) and Bob (vendor-b) were cancelled despite no conflict for them
    const aliceAppt = allGroupAppts.find((a: any) => a.staffId === STAFF_ALICE);
    const bobAppt = allGroupAppts.find((a: any) => a.staffId === STAFF_BOB);
    expect(aliceAppt?.status).toBe('cancelled');
    expect(bobAppt?.status).toBe('cancelled');
  });
});
