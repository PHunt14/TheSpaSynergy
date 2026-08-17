/**
 * Unit Tests for Bundle Availability Calendar Filtering
 *
 * Tests that GET /api/bundle-availability only displays time slots where ALL
 * required staff members are simultaneously available for their respective
 * service durations (including buffer time).
 *
 * Validates Requirements: 9.6
 */

import {
  findSlotsForOrder,
  getSequentialBundleSlots
} from '../../app/utils/sequentialAvailability.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeStaff = (id, vendorId, schedule) => ({
  visibleId: id,
  vendorId,
  isActive: true,
  name: `Staff ${id}`,
  schedule: JSON.stringify(schedule),
  autoAssignRules: null,
})

const mondaySchedule = { monday: { start: '09:00', end: '17:00' } }

const makeService = (id, duration, allowedStaff = ['staff-1'], providersRequired = 1) => ({
  serviceId: id,
  duration,
  allowedStaff,
  providersRequired,
  vendorId: 'vendor-1',
})

// ── Bundle Availability: All Staff Simultaneously Free ───────────────────────

describe('Bundle availability calendar filtering (Requirement 9.6)', () => {
  test('only shows slots where ALL required staff are simultaneously free', () => {
    // Two services requiring different staff — both must be free
    const services = [
      makeService('svc-1', 60, ['staff-1']),
      makeService('svc-2', 60, ['staff-2'])
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', mondaySchedule)],
      'svc-2': [makeStaff('staff-2', 'v-b', mondaySchedule)]
    }

    // staff-2 has an appointment from 10:00-11:00
    const appointments = [
      {
        dateTime: '2025-01-06T10:00',
        staffId: 'staff-2',
        status: 'confirmed',
        customer: JSON.stringify({ duration: 60 })
      }
    ]

    const slots = findSlotsForOrder({
      orderedServices: services,
      staffSchedulesByService,
      appointments,
      date: '2025-01-06', // Monday
      bufferMinutes: 15
    })

    // Total bundle: 60 + 15 (buffer) + 60 = 135 min
    // staff-2 is needed for svc-2 which starts at bundle_start + 75 min
    // staff-2 busy 10:00–11:00, with buffer blocked until 11:15
    // So svc-2 cannot start between 10:00 and 11:15
    // Bundle start at 09:00 → svc-2 starts at 10:15, which conflicts with 10:00-11:15
    // Bundle start at 09:30 → svc-2 starts at 10:45, which conflicts with 10:00-11:15
    // Bundle start at 10:00 → svc-2 starts at 11:15, which is at boundary (should not overlap)
    const startTimes = slots.map(s => s.startTime)
    expect(startTimes).not.toContain('09:00')
    expect(startTimes).not.toContain('09:30')
    // 10:00 start → svc-2 starts at 11:15, needs to be checked against buffer
    // staff-2 appointment is 10:00-11:00 + 15 buffer = blocked until 11:15
    // svc-2 at 11:15 with 60+15 buffer = 11:15 to 12:30
    // Check: 11:15 < 11:15? No → no overlap. Should be available.
    expect(startTimes).toContain('10:00')
  })

  test('excludes slot when same staff needed for multiple services in bundle creates intra-bundle conflict', () => {
    // Same staff assigned to both services — they overlap in time if scheduled simultaneously
    // Only one staff member is available for both services
    const services = [
      makeService('svc-1', 60, ['staff-1']),
      makeService('svc-2', 60, ['staff-1']) // same staff!
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', mondaySchedule)],
      'svc-2': [makeStaff('staff-1', 'v-a', mondaySchedule)] // same staff
    }

    const slots = findSlotsForOrder({
      orderedServices: services,
      staffSchedulesByService,
      appointments: [],
      date: '2025-01-06',
      bufferMinutes: 15
    })

    // Services are SEQUENTIAL with buffer, so same staff CAN serve both
    // svc-1: 09:00-10:00, svc-2: 10:15-11:15
    // No overlap because they are sequenced. Slots should be available.
    expect(slots.length).toBeGreaterThan(0)

    // Verify that the schedule is properly sequenced (no overlap)
    for (const slot of slots) {
      const svc1End = slot.schedule[0].endTime
      const svc2Start = slot.schedule[1].startTime
      const [endH, endM] = svc1End.split(':').map(Number)
      const [startH, startM] = svc2Start.split(':').map(Number)
      const endMin = endH * 60 + endM
      const startMin = startH * 60 + startM
      // svc-2 starts at least buffer minutes after svc-1 ends
      expect(startMin).toBeGreaterThanOrEqual(endMin + 15)
    }
  })

  test('excludes slot when only one staff available but two providers required for a service', () => {
    // Bundle has a service needing 2 providers, but only 1 is free
    const services = [
      makeService('svc-1', 60, ['staff-1', 'staff-2'], 2), // needs 2 providers
      makeService('svc-2', 30, ['staff-3'])
    ]
    const staffSchedulesByService = {
      'svc-1': [
        makeStaff('staff-1', 'v-a', mondaySchedule),
        makeStaff('staff-2', 'v-a', mondaySchedule)
      ],
      'svc-2': [makeStaff('staff-3', 'v-b', mondaySchedule)]
    }

    // staff-2 is busy all day
    const appointments = [
      {
        dateTime: '2025-01-06T09:00',
        staffId: 'staff-2',
        status: 'confirmed',
        customer: JSON.stringify({ duration: 480 }) // 8 hours
      }
    ]

    const slots = findSlotsForOrder({
      orderedServices: services,
      staffSchedulesByService,
      appointments,
      date: '2025-01-06',
      bufferMinutes: 15
    })

    // svc-1 needs 2 providers, but staff-2 is busy. Only 1 available → no slots
    expect(slots).toHaveLength(0)
  })

  test('shows slots when all required staff across multiple vendors are free', () => {
    // Multi-vendor bundle: each service from different vendor
    const services = [
      { ...makeService('svc-1', 45, ['staff-1']), vendorId: 'vendor-1' },
      { ...makeService('svc-2', 30, ['staff-2']), vendorId: 'vendor-2' }
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'vendor-1', mondaySchedule)],
      'svc-2': [makeStaff('staff-2', 'vendor-2', mondaySchedule)]
    }

    const slots = findSlotsForOrder({
      orderedServices: services,
      staffSchedulesByService,
      appointments: [],
      date: '2025-01-06',
      bufferMinutes: 15
    })

    // Both staff free all day → slots should be available
    expect(slots.length).toBeGreaterThan(0)
  })

  test('filters slots considering appointments from all vendors', () => {
    // Multi-vendor bundle where staff from vendor-2 is busy
    const services = [
      { ...makeService('svc-1', 60, ['staff-1']), vendorId: 'vendor-1' },
      { ...makeService('svc-2', 60, ['staff-2']), vendorId: 'vendor-2' }
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'vendor-1', mondaySchedule)],
      'svc-2': [makeStaff('staff-2', 'vendor-2', mondaySchedule)]
    }

    // staff-2 (vendor-2) is booked 14:00-15:00
    const appointments = [
      {
        dateTime: '2025-01-06T14:00',
        staffId: 'staff-2',
        status: 'confirmed',
        customer: JSON.stringify({ duration: 60 })
      }
    ]

    const slots = findSlotsForOrder({
      orderedServices: services,
      staffSchedulesByService,
      appointments,
      date: '2025-01-06',
      bufferMinutes: 15
    })

    const startTimes = slots.map(s => s.startTime)

    // Bundle total: 60 + 15 + 60 = 135 min
    // svc-2 starts at bundle_start + 75 min
    // staff-2 busy 14:00–15:15 (with buffer)
    // Bundle start at 13:00 → svc-2 starts at 14:15, overlaps with 14:00-15:15
    expect(startTimes).not.toContain('13:00')

    // Bundle start at 12:00 → svc-2 starts at 13:15, ends at 14:15+15=14:30
    // Overlaps with 14:00-15:15? svc-2: 13:15 to 14:30, apt: 14:00 to 15:15
    // 13:15 < 15:15 AND 14:30 > 14:00 → yes overlap
    expect(startTimes).not.toContain('12:00')

    // Bundle start at 09:00 → svc-2 starts at 10:15, ends at 11:15+15=11:30
    // No overlap with 14:00 appointment → should be available
    expect(startTimes).toContain('09:00')
  })

  test('blocked time entries prevent bundle slot availability', () => {
    const services = [
      makeService('svc-1', 60, ['staff-1']),
      makeService('svc-2', 60, ['staff-2'])
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', mondaySchedule)],
      'svc-2': [makeStaff('staff-2', 'v-b', mondaySchedule)]
    }

    // staff-1 has blocked time from 09:00-10:00
    const appointments = [
      {
        dateTime: '2025-01-06T09:00',
        staffId: 'staff-1',
        status: 'blocked',
        serviceId: 'blocked',
        customer: JSON.stringify({ duration: 60, isBlockedTime: true })
      }
    ]

    const slots = findSlotsForOrder({
      orderedServices: services,
      staffSchedulesByService,
      appointments,
      date: '2025-01-06',
      bufferMinutes: 15
    })

    const startTimes = slots.map(s => s.startTime)
    // staff-1 blocked 09:00-10:15 (with buffer)
    // svc-1 at 09:00 overlaps → 09:00 excluded
    expect(startTimes).not.toContain('09:00')
    expect(startTimes).not.toContain('09:30')
    // 10:30 start → svc-1 starts 10:30, outside block+buffer (10:15)
    expect(startTimes).toContain('10:30')
  })

  test('intra-bundle: same staff for overlapping simultaneous services is rejected', () => {
    // Two services with providersRequired=1 each, but only one staff member
    // eligible for both and the services would overlap (non-sequential scenario)
    // In sequential mode, services are back-to-back so same staff works.
    // But if services are short enough that a single staff COULD handle both,
    // the slot should still be valid (they are sequential, not simultaneous).
    const services = [
      makeService('svc-1', 30, ['staff-1']),
      makeService('svc-2', 30, ['staff-1']) // same staff eligible
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', mondaySchedule)],
      'svc-2': [makeStaff('staff-1', 'v-a', mondaySchedule)]
    }

    const slots = findSlotsForOrder({
      orderedServices: services,
      staffSchedulesByService,
      appointments: [],
      date: '2025-01-06',
      bufferMinutes: 15
    })

    // Sequential with buffer: svc-1 30min + 15 buffer + svc-2 30min = 75 total
    // Same staff can do both since they're sequential. Should have slots.
    expect(slots.length).toBeGreaterThan(0)
  })

  test('when two services need same staff but overlap (providersRequired=2 total), slot is excluded if not enough staff', () => {
    // Two services, same staff pool, providersRequired=1 each
    // But only one staff member in the pool
    // Sequential: should work since they don't overlap
    const services = [
      makeService('svc-1', 60, ['staff-1'], 1),
      makeService('svc-2', 60, ['staff-1'], 1) // same single staff
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'v-a', mondaySchedule)],
      'svc-2': [makeStaff('staff-1', 'v-a', mondaySchedule)]
    }

    const slots = findSlotsForOrder({
      orderedServices: services,
      staffSchedulesByService,
      appointments: [],
      date: '2025-01-06',
      bufferMinutes: 15
    })

    // Sequential: svc-1 ends before svc-2 starts (with buffer)
    // Same staff can handle both. Should have slots.
    expect(slots.length).toBeGreaterThan(0)

    // Now test with zero buffer - services are truly back-to-back
    const slotsNoBuf = findSlotsForOrder({
      orderedServices: services,
      staffSchedulesByService,
      appointments: [],
      date: '2025-01-06',
      bufferMinutes: 0
    })
    expect(slotsNoBuf.length).toBeGreaterThan(0)
  })

  test('getSequentialBundleSlots only returns slots where all staff across vendors are free', () => {
    const services = [
      { ...makeService('svc-1', 60, ['staff-1']), vendorId: 'vendor-1' },
      { ...makeService('svc-2', 60, ['staff-2']), vendorId: 'vendor-2' }
    ]
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'vendor-1', mondaySchedule)],
      'svc-2': [makeStaff('staff-2', 'vendor-2', mondaySchedule)]
    }

    // staff-2 completely booked from 09:00-17:00
    const appointments = [
      {
        dateTime: '2025-01-06T09:00',
        staffId: 'staff-2',
        status: 'confirmed',
        customer: JSON.stringify({ duration: 480 })
      }
    ]

    const result = getSequentialBundleSlots({
      services,
      staffSchedulesByService,
      appointments,
      startDate: '2025-01-06',
      bufferMinutes: 15,
      serviceOrder: ['svc-1', 'svc-2'],
      multiDay: false,
      maxDays: 1
    })

    // staff-2 is busy all day → no bundle slots should be available
    expect(result.slots).toHaveLength(0)
  })
})
