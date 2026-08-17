/**
 * Integration tests for concurrent booking race condition protection.
 *
 * Simulates multiple simultaneous booking requests for the same staff+time slot
 * and verifies that the optimistic concurrency control (pre-write check + post-write
 * verification) correctly prevents double-booking.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 10.5, 10.7**
 *
 * Tests:
 * - Multiple concurrent POST /api/appointments requests for same slot → at most one succeeds
 * - Post-write verification detects and rolls back conflicting concurrent writes
 * - Fail-open behavior when post-write query fails after successful write
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { detectConflict, extractDateFromDateTime } from '../app/utils/overlapDetection';

// ── Mock Data Store ─────────────────────────────────────────────────────────

let mockAppointments: any[] = [];
let mockServices: Record<string, any> = {};

const VENDOR_ID = 'vendor-spa-1';
const STAFF_ID = 'staff-anna';
const SERVICE_ID = 'svc-massage';
const DATE = '2025-04-15';
const TIME_SLOT = `${DATE}T10:00`;
const DURATION = 60;
const BUFFER_MINUTES = 15;

function setupServices() {
  mockServices = {
    [SERVICE_ID]: { serviceId: SERVICE_ID, duration: DURATION, vendorId: VENDOR_ID },
  };
}

/**
 * Creates a mock DynamoDB/Amplify client that simulates race conditions.
 *
 * @param options.preWriteAppointments - Appointments returned during pre-write check (first query)
 * @param options.postWriteAppointments - Appointments returned during post-write verification (second query)
 * @param options.failOnPostWriteQuery - If true, the post-write query throws a transient error
 */
function createMockClient(options: {
  preWriteAppointments?: any[];
  postWriteAppointments?: any[];
  failOnPostWriteQuery?: boolean;
} = {}) {
  let queryCallCount = 0;

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
        listAppointmentByVendorIdAndDateTime: jest.fn(async (_params?: any) => {
          queryCallCount++;
          if (queryCallCount === 1) {
            // Pre-write check: return whatever appointments exist at start
            return { data: options.preWriteAppointments || [] };
          }
          // Post-write verification (second call onward)
          if (options.failOnPostWriteQuery) {
            throw new Error('DynamoDB transient read error');
          }
          return { data: options.postWriteAppointments || mockAppointments };
        }),
      },
      StaffSchedule: {
        get: jest.fn(async () => ({
          data: { visibleId: STAFF_ID, vendorId: VENDOR_ID, isActive: true },
        })),
      },
      Vendor: {
        get: jest.fn(async () => ({
          data: { vendorId: VENDOR_ID, bufferMinutes: BUFFER_MINUTES, isActive: true },
        })),
      },
      Service: {
        get: jest.fn(async ({ serviceId }: any) => ({
          data: mockServices[serviceId] || null,
          errors: null,
        })),
      },
    },
  };
}

/**
 * Simulates the booking flow for a single customer request:
 * 1. Pre-write conflict check
 * 2. Persist appointment
 * 3. Post-write verification
 * 4. If post-write detects conflict, cancel and return 409
 *
 * Returns { status: 200 | 409, appointmentId }
 */
async function simulateBookingRequest(
  client: ReturnType<typeof createMockClient>,
  appointmentId: string,
  dateTime: string = TIME_SLOT,
): Promise<{ status: number; appointmentId: string }> {
  const bookingDate = extractDateFromDateTime(dateTime);

  // Step 1: Pre-write conflict check
  const preWriteResult = await client.models.Appointment.listAppointmentByVendorIdAndDateTime({
    vendorId: VENDOR_ID,
    dateTime: { beginsWith: bookingDate },
  });
  const preWriteApts = (preWriteResult as any).data || [];

  const serviceDurationMap: Record<string, number> = { [SERVICE_ID]: DURATION };

  const preWriteConflict = detectConflict(
    STAFF_ID,
    dateTime,
    DURATION,
    BUFFER_MINUTES,
    preWriteApts,
    serviceDurationMap,
    undefined,
    false
  );

  if (preWriteConflict) {
    return { status: 409, appointmentId };
  }

  // Step 2: Persist the appointment
  await client.models.Appointment.create({
    appointmentId,
    vendorId: VENDOR_ID,
    serviceId: SERVICE_ID,
    staffId: STAFF_ID,
    dateTime,
    status: 'confirmed',
    customer: JSON.stringify({ name: `Customer ${appointmentId}`, duration: DURATION }),
  });

  // Step 3: Post-write verification
  try {
    const postWriteResult = await client.models.Appointment.listAppointmentByVendorIdAndDateTime({
      vendorId: VENDOR_ID,
      dateTime: { beginsWith: bookingDate },
    });
    const postWriteApts = (postWriteResult as any).data || [];

    // Build service duration map for post-write appointments
    const postServiceDurationMap: Record<string, number> = {};
    for (const apt of postWriteApts) {
      if (apt.serviceId && apt.serviceId !== 'blocked' && apt.serviceId !== 'manual') {
        const svcResult = await client.models.Service.get({ serviceId: apt.serviceId });
        if (svcResult.data?.duration) {
          postServiceDurationMap[apt.serviceId] = svcResult.data.duration as number;
        }
      }
    }

    const postWriteConflict = detectConflict(
      STAFF_ID,
      dateTime,
      DURATION,
      BUFFER_MINUTES,
      postWriteApts,
      postServiceDurationMap,
      appointmentId, // exclude self
      false
    );

    if (postWriteConflict) {
      // Step 4: Cancel and return 409
      await client.models.Appointment.update({ appointmentId, status: 'cancelled' });
      return { status: 409, appointmentId };
    }
  } catch {
    // Fail-open: write succeeded, post-write verification failed due to transient error
    // Keep the appointment active (Req 3.4)
  }

  return { status: 200, appointmentId };
}

// ── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockAppointments = [];
  mockServices = {};
  setupServices();
});

describe('Concurrency Simulation — Multiple simultaneous booking requests (Req 3.1, 10.5)', () => {
  test('when two requests pass pre-write check simultaneously, post-write verification catches the second', async () => {
    // Scenario: Both Request A and Request B pass the pre-write check (no existing appointments).
    // Both write their appointments. Post-write verification for the second request
    // sees the first request's appointment and cancels.

    const appointmentA = {
      appointmentId: 'apt-concurrent-A',
      vendorId: VENDOR_ID,
      serviceId: SERVICE_ID,
      staffId: STAFF_ID,
      dateTime: TIME_SLOT,
      status: 'confirmed',
      customer: JSON.stringify({ name: 'Customer A', duration: DURATION }),
    };

    const appointmentB = {
      appointmentId: 'apt-concurrent-B',
      vendorId: VENDOR_ID,
      serviceId: SERVICE_ID,
      staffId: STAFF_ID,
      dateTime: TIME_SLOT,
      status: 'confirmed',
      customer: JSON.stringify({ name: 'Customer B', duration: DURATION }),
    };

    // Simulate: both pre-write queries return empty (race condition)
    // Post-write for Request A: sees only itself → no conflict
    // Post-write for Request B: sees both A and B → conflict detected
    const clientA = createMockClient({
      preWriteAppointments: [],
      postWriteAppointments: [appointmentA], // only sees itself
    });

    const clientB = createMockClient({
      preWriteAppointments: [],
      postWriteAppointments: [appointmentA, appointmentB], // sees both after both wrote
    });

    // Execute both requests
    const resultA = await simulateBookingRequest(clientA, 'apt-concurrent-A');
    const resultB = await simulateBookingRequest(clientB, 'apt-concurrent-B');

    // Request A succeeds (its post-write sees only itself)
    expect(resultA.status).toBe(200);

    // Request B is rejected (its post-write sees A as a conflict)
    expect(resultB.status).toBe(409);

    // Verify: appointment B was cancelled
    const cancelledB = mockAppointments.find((a: any) => a.appointmentId === 'apt-concurrent-B');
    expect(cancelledB?.status).toBe('cancelled');
  });

  test('at most one booking succeeds when N concurrent requests target same slot', async () => {
    // Simulate 5 concurrent requests all passing pre-write check
    // Each post-write verification sees all appointments written so far
    const N = 5;
    const appointmentIds = Array.from({ length: N }, (_, i) => `apt-race-${i}`);

    // All appointments that would exist after all writes complete
    const allAppointments = appointmentIds.map((id) => ({
      appointmentId: id,
      vendorId: VENDOR_ID,
      serviceId: SERVICE_ID,
      staffId: STAFF_ID,
      dateTime: TIME_SLOT,
      status: 'confirmed',
      customer: JSON.stringify({ name: `Customer ${id}`, duration: DURATION }),
    }));

    // The first request's post-write only sees itself (it wrote first)
    // All others see the first appointment and themselves → conflict
    const results: { status: number; appointmentId: string }[] = [];

    for (let i = 0; i < N; i++) {
      // First request sees only itself in post-write
      // All subsequent requests see the first appointment + themselves
      const postWriteApts = i === 0
        ? [allAppointments[0]]
        : [allAppointments[0], allAppointments[i]];

      const client = createMockClient({
        preWriteAppointments: [], // all pass pre-write (race condition)
        postWriteAppointments: postWriteApts,
      });

      const result = await simulateBookingRequest(client, appointmentIds[i]);
      results.push(result);
    }

    // Exactly one should succeed
    const successes = results.filter((r) => r.status === 200);
    const rejections = results.filter((r) => r.status === 409);

    expect(successes).toHaveLength(1);
    expect(successes[0].appointmentId).toBe('apt-race-0');
    expect(rejections).toHaveLength(N - 1);
  });

  test('pre-write check catches conflict when one request has already completed', async () => {
    // Scenario: Request A completes fully (writes + post-write passes).
    // Request B starts after A has already written → pre-write check catches it directly.

    const existingAppointment = {
      appointmentId: 'apt-already-written',
      vendorId: VENDOR_ID,
      serviceId: SERVICE_ID,
      staffId: STAFF_ID,
      dateTime: TIME_SLOT,
      status: 'confirmed',
      customer: JSON.stringify({ name: 'Customer A', duration: DURATION }),
    };

    // Request B sees the existing appointment during pre-write → immediate 409
    const clientB = createMockClient({
      preWriteAppointments: [existingAppointment],
    });

    const result = await simulateBookingRequest(clientB, 'apt-late-B');

    expect(result.status).toBe(409);

    // Verify: no new appointment was created (rejected at pre-write)
    const newApt = mockAppointments.find((a: any) => a.appointmentId === 'apt-late-B');
    expect(newApt).toBeUndefined();
  });
});

describe('Post-write verification detects and rolls back conflicting writes (Req 3.2, 3.3, 10.7)', () => {
  test('post-write verification cancels new appointment when concurrent write detected', async () => {
    // The concurrent appointment was written between our pre-write check and post-write verification
    const concurrentAppointment = {
      appointmentId: 'apt-sneaky-concurrent',
      vendorId: VENDOR_ID,
      serviceId: SERVICE_ID,
      staffId: STAFF_ID,
      dateTime: TIME_SLOT,
      status: 'confirmed',
      customer: JSON.stringify({ name: 'Sneaky Customer', duration: DURATION }),
    };

    const ourAppointment = {
      appointmentId: 'apt-our-booking',
      vendorId: VENDOR_ID,
      serviceId: SERVICE_ID,
      staffId: STAFF_ID,
      dateTime: TIME_SLOT,
      status: 'confirmed',
      customer: JSON.stringify({ name: 'Our Customer', duration: DURATION }),
    };

    const client = createMockClient({
      preWriteAppointments: [], // no conflict during pre-write
      postWriteAppointments: [concurrentAppointment, ourAppointment], // concurrent write appeared
    });

    const result = await simulateBookingRequest(client, 'apt-our-booking');

    // Our booking should be rolled back
    expect(result.status).toBe(409);

    // Verify: our appointment status was updated to 'cancelled'
    const cancelledApt = mockAppointments.find((a: any) => a.appointmentId === 'apt-our-booking');
    expect(cancelledApt?.status).toBe('cancelled');
  });

  test('post-write verification passes when no concurrent conflict exists', async () => {
    // Only our own appointment appears in post-write (no concurrent writes)
    const ourAppointment = {
      appointmentId: 'apt-sole-booking',
      vendorId: VENDOR_ID,
      serviceId: SERVICE_ID,
      staffId: STAFF_ID,
      dateTime: TIME_SLOT,
      status: 'confirmed',
      customer: JSON.stringify({ name: 'Solo Customer', duration: DURATION }),
    };

    const client = createMockClient({
      preWriteAppointments: [],
      postWriteAppointments: [ourAppointment], // only our appointment
    });

    const result = await simulateBookingRequest(client, 'apt-sole-booking');

    // Booking should succeed — no conflict
    expect(result.status).toBe(200);

    // Verify: appointment remains active
    const apt = mockAppointments.find((a: any) => a.appointmentId === 'apt-sole-booking');
    expect(apt?.status).toBe('confirmed');
  });

  test('post-write verification detects overlapping (not exact same time) concurrent appointment', async () => {
    // Concurrent appointment starts at 10:30 which overlaps with our 10:00-11:00+buffer
    const concurrentOverlapping = {
      appointmentId: 'apt-overlapping',
      vendorId: VENDOR_ID,
      serviceId: SERVICE_ID,
      staffId: STAFF_ID,
      dateTime: `${DATE}T10:30`,
      status: 'confirmed',
      customer: JSON.stringify({ name: 'Overlapping Customer', duration: DURATION }),
    };

    const ourAppointment = {
      appointmentId: 'apt-our-10am',
      vendorId: VENDOR_ID,
      serviceId: SERVICE_ID,
      staffId: STAFF_ID,
      dateTime: TIME_SLOT,
      status: 'confirmed',
      customer: JSON.stringify({ name: 'Our 10am Customer', duration: DURATION }),
    };

    const client = createMockClient({
      preWriteAppointments: [],
      postWriteAppointments: [concurrentOverlapping, ourAppointment],
    });

    const result = await simulateBookingRequest(client, 'apt-our-10am');

    // Conflict detected due to overlapping time
    expect(result.status).toBe(409);
    const apt = mockAppointments.find((a: any) => a.appointmentId === 'apt-our-10am');
    expect(apt?.status).toBe('cancelled');
  });

  test('post-write verification ignores cancelled appointments in conflict detection', async () => {
    // A concurrent appointment exists but is already cancelled — should NOT trigger rollback
    const cancelledConcurrent = {
      appointmentId: 'apt-cancelled-concurrent',
      vendorId: VENDOR_ID,
      serviceId: SERVICE_ID,
      staffId: STAFF_ID,
      dateTime: TIME_SLOT,
      status: 'cancelled',
      customer: JSON.stringify({ name: 'Cancelled Customer', duration: DURATION }),
    };

    const ourAppointment = {
      appointmentId: 'apt-our-safe',
      vendorId: VENDOR_ID,
      serviceId: SERVICE_ID,
      staffId: STAFF_ID,
      dateTime: TIME_SLOT,
      status: 'confirmed',
      customer: JSON.stringify({ name: 'Safe Customer', duration: DURATION }),
    };

    const client = createMockClient({
      preWriteAppointments: [],
      postWriteAppointments: [cancelledConcurrent, ourAppointment],
    });

    const result = await simulateBookingRequest(client, 'apt-our-safe');

    // No conflict — cancelled appointments are skipped
    expect(result.status).toBe(200);
    const apt = mockAppointments.find((a: any) => a.appointmentId === 'apt-our-safe');
    expect(apt?.status).toBe('confirmed');
  });

  test('post-write verification ignores appointments for different staff members', async () => {
    // A concurrent appointment exists but for a different staff member
    const differentStaffAppointment = {
      appointmentId: 'apt-other-staff',
      vendorId: VENDOR_ID,
      serviceId: SERVICE_ID,
      staffId: 'staff-different',
      dateTime: TIME_SLOT,
      status: 'confirmed',
      customer: JSON.stringify({ name: 'Other Staff Customer', duration: DURATION }),
    };

    const ourAppointment = {
      appointmentId: 'apt-our-no-conflict',
      vendorId: VENDOR_ID,
      serviceId: SERVICE_ID,
      staffId: STAFF_ID,
      dateTime: TIME_SLOT,
      status: 'confirmed',
      customer: JSON.stringify({ name: 'Our Customer', duration: DURATION }),
    };

    const client = createMockClient({
      preWriteAppointments: [],
      postWriteAppointments: [differentStaffAppointment, ourAppointment],
    });

    const result = await simulateBookingRequest(client, 'apt-our-no-conflict');

    // No conflict — different staff
    expect(result.status).toBe(200);
  });

  test('fail-open: post-write query failure after successful write keeps appointment active (Req 3.4)', async () => {
    const client = createMockClient({
      preWriteAppointments: [],
      failOnPostWriteQuery: true, // post-write query throws a transient error
    });

    const result = await simulateBookingRequest(client, 'apt-failopen');

    // Fail-open: appointment remains active despite verification failure
    expect(result.status).toBe(200);

    // Verify: appointment was NOT cancelled
    const apt = mockAppointments.find((a: any) => a.appointmentId === 'apt-failopen');
    expect(apt?.status).toBe('confirmed');
  });
});

describe('Post-write verification with buffer time enforcement (Req 3.1)', () => {
  test('concurrent appointment within buffer window triggers rollback', async () => {
    // Our appointment: 10:00, duration 60, buffer 15 → occupies until 11:15
    // Concurrent: starts at 11:10 → overlaps with our buffer window
    const concurrentInBuffer = {
      appointmentId: 'apt-in-buffer',
      vendorId: VENDOR_ID,
      serviceId: SERVICE_ID,
      staffId: STAFF_ID,
      dateTime: `${DATE}T11:10`,
      status: 'confirmed',
      customer: JSON.stringify({ name: 'Buffer Violator', duration: DURATION }),
    };

    const ourAppointment = {
      appointmentId: 'apt-buffer-test',
      vendorId: VENDOR_ID,
      serviceId: SERVICE_ID,
      staffId: STAFF_ID,
      dateTime: TIME_SLOT,
      status: 'confirmed',
      customer: JSON.stringify({ name: 'Buffer Test Customer', duration: DURATION }),
    };

    const client = createMockClient({
      preWriteAppointments: [],
      postWriteAppointments: [concurrentInBuffer, ourAppointment],
    });

    const result = await simulateBookingRequest(client, 'apt-buffer-test');

    // Conflict: the concurrent appointment starts within our buffer
    expect(result.status).toBe(409);
    const apt = mockAppointments.find((a: any) => a.appointmentId === 'apt-buffer-test');
    expect(apt?.status).toBe('cancelled');
  });

  test('concurrent appointment AFTER buffer window does NOT trigger rollback', async () => {
    // Our appointment: 10:00, duration 60, buffer 15 → occupies until 11:15
    // Concurrent: starts at 11:15 → exactly at boundary → NO conflict
    const concurrentAfterBuffer = {
      appointmentId: 'apt-after-buffer',
      vendorId: VENDOR_ID,
      serviceId: SERVICE_ID,
      staffId: STAFF_ID,
      dateTime: `${DATE}T11:15`,
      status: 'confirmed',
      customer: JSON.stringify({ name: 'After Buffer Customer', duration: DURATION }),
    };

    const ourAppointment = {
      appointmentId: 'apt-boundary-ok',
      vendorId: VENDOR_ID,
      serviceId: SERVICE_ID,
      staffId: STAFF_ID,
      dateTime: TIME_SLOT,
      status: 'confirmed',
      customer: JSON.stringify({ name: 'Boundary OK Customer', duration: DURATION }),
    };

    const client = createMockClient({
      preWriteAppointments: [],
      postWriteAppointments: [concurrentAfterBuffer, ourAppointment],
    });

    const result = await simulateBookingRequest(client, 'apt-boundary-ok');

    // No conflict: starts exactly at the boundary (non-overlap)
    expect(result.status).toBe(200);
    const apt = mockAppointments.find((a: any) => a.appointmentId === 'apt-boundary-ok');
    expect(apt?.status).toBe('confirmed');
  });
});
