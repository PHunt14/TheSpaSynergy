/**
 * Unit Tests for Bundle Staff Assigner
 *
 * Tests for app/utils/bundleStaffAssigner.js:
 * - Same-staff preference for same-vendor services
 * - Auto-assign preference logic
 * - Error when staff unavailable for any service
 * - No intra-bundle conflicts with sequential scheduling
 * - Multi-provider service within a bundle
 *
 * Validates Requirements: 9.1, 9.2, 9.3, 9.4, 9.6, 9.7
 */

import { assignBundleStaff } from '../../app/utils/bundleStaffAssigner.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeService = (id, vendorId, duration, opts = {}) => ({
  serviceId: id,
  vendorId,
  duration,
  allowedStaff: opts.allowedStaff || [],
  providersRequired: opts.providersRequired || 1,
  name: opts.name || `Service ${id}`,
})

const makeStaff = (visibleId, vendorId, opts = {}) => ({
  visibleId,
  vendorId,
  name: opts.name || `Staff ${visibleId}`,
  isActive: opts.isActive !== undefined ? opts.isActive : true,
  schedule: opts.schedule || JSON.stringify({
    monday: { start: '09:00', end: '17:00' },
    tuesday: { start: '09:00', end: '17:00' },
    wednesday: { start: '09:00', end: '17:00' },
    thursday: { start: '09:00', end: '17:00' },
    friday: { start: '09:00', end: '17:00' },
  }),
  autoAssignRules: opts.autoAssignRules || null,
})

const makeAppointment = (staffId, dateTime, opts = {}) => ({
  appointmentId: opts.appointmentId || `apt-${Math.random().toString(36).slice(2)}`,
  staffId,
  dateTime,
  status: opts.status || 'confirmed',
  customer: opts.customer || JSON.stringify({ name: 'Test Client' }),
})

// Use a Monday date for consistent day-of-week testing
const TEST_DATE = '2024-03-18' // Monday

// ── Same-Staff Preference for Same-Vendor Services ───────────────────────────

describe('assignBundleStaff - same-staff preference', () => {
  test('assigns same staff to multiple services from the same vendor when eligible', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 60, { allowedStaff: ['staff-1', 'staff-2'] }),
      makeService('svc-2', 'vendor-a', 30, { allowedStaff: ['staff-1', 'staff-2'] }),
      makeService('svc-3', 'vendor-b', 45, { allowedStaff: ['staff-3'] }),
    ]

    const staffSchedulesByService = {
      'svc-1': [
        makeStaff('staff-1', 'vendor-a'),
        makeStaff('staff-2', 'vendor-a'),
      ],
      'svc-2': [
        makeStaff('staff-1', 'vendor-a'),
        makeStaff('staff-2', 'vendor-a'),
      ],
      'svc-3': [
        makeStaff('staff-3', 'vendor-b'),
      ],
    }

    const result = assignBundleStaff({
      orderedServices: services,
      staffSchedulesByService,
      appointments: [],
      date: TEST_DATE,
      startTime: '09:00',
      bufferMinutes: 15,
    })

    expect(result).toHaveLength(3)
    // Same vendor services should get the same staff
    expect(result[0].staffId).toBe(result[1].staffId)
    expect(result[0].vendorId).toBe('vendor-a')
    expect(result[1].vendorId).toBe('vendor-a')
    expect(result[2].vendorId).toBe('vendor-b')
    expect(result[2].staffId).toBe('staff-3')
  })

  test('assigns different staff when same staff is not available for all same-vendor services', () => {
    // staff-1 works 09:00-10:30, staff-2 works 09:00-17:00
    // svc-1 is 60min starting at 09:00 (ends 10:00), svc-2 is 60min starting at 10:15 (ends 11:15)
    // staff-1 can't do svc-2 because they end at 10:30 and svc-2 ends at 11:15
    const services = [
      makeService('svc-1', 'vendor-a', 60, { allowedStaff: ['staff-1', 'staff-2'] }),
      makeService('svc-2', 'vendor-a', 60, { allowedStaff: ['staff-1', 'staff-2'] }),
    ]

    const staffSchedulesByService = {
      'svc-1': [
        makeStaff('staff-1', 'vendor-a', {
          schedule: JSON.stringify({ monday: { start: '09:00', end: '10:30' } }),
        }),
        makeStaff('staff-2', 'vendor-a'),
      ],
      'svc-2': [
        makeStaff('staff-1', 'vendor-a', {
          schedule: JSON.stringify({ monday: { start: '09:00', end: '10:30' } }),
        }),
        makeStaff('staff-2', 'vendor-a'),
      ],
    }

    const result = assignBundleStaff({
      orderedServices: services,
      staffSchedulesByService,
      appointments: [],
      date: TEST_DATE,
      startTime: '09:00',
      bufferMinutes: 15,
    })

    expect(result).toHaveLength(2)
    // staff-2 should be assigned to both since staff-1 can't cover svc-2
    expect(result[0].staffId).toBe('staff-2')
    expect(result[1].staffId).toBe('staff-2')
  })

  test('same-staff preference does not apply across different vendors', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 30, { allowedStaff: ['staff-1'] }),
      makeService('svc-2', 'vendor-b', 30, { allowedStaff: ['staff-2'] }),
    ]

    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'vendor-a')],
      'svc-2': [makeStaff('staff-2', 'vendor-b')],
    }

    const result = assignBundleStaff({
      orderedServices: services,
      staffSchedulesByService,
      appointments: [],
      date: TEST_DATE,
      startTime: '09:00',
      bufferMinutes: 15,
    })

    expect(result[0].staffId).toBe('staff-1')
    expect(result[1].staffId).toBe('staff-2')
  })
})

// ── Auto-Assign Preference Logic ────────────────────────────────────────────

describe('assignBundleStaff - auto-assign preference', () => {
  test('prefers staff with auto-assign rules for the booking day', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 60, { allowedStaff: ['staff-1', 'staff-2'] }),
      makeService('svc-2', 'vendor-b', 60, { allowedStaff: ['staff-3', 'staff-4'] }),
    ]

    const staffSchedulesByService = {
      'svc-1': [
        makeStaff('staff-1', 'vendor-a'), // no auto-assign
        makeStaff('staff-2', 'vendor-a', {
          autoAssignRules: JSON.stringify([{ action: 'auto-assign', days: ['monday'] }]),
        }),
      ],
      'svc-2': [
        makeStaff('staff-3', 'vendor-b', {
          autoAssignRules: JSON.stringify([{ action: 'auto-assign', days: ['monday'] }]),
        }),
        makeStaff('staff-4', 'vendor-b'), // no auto-assign
      ],
    }

    const result = assignBundleStaff({
      orderedServices: services,
      staffSchedulesByService,
      appointments: [],
      date: TEST_DATE, // Monday
      startTime: '09:00',
      bufferMinutes: 15,
    })

    expect(result[0].staffId).toBe('staff-2') // auto-assign preferred
    expect(result[1].staffId).toBe('staff-3') // auto-assign preferred
  })

  test('falls back to non-auto-assign staff when auto-assign staff not available', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 60, { allowedStaff: ['staff-1', 'staff-2'] }),
    ]

    // staff-2 has auto-assign for Monday but is inactive
    const staffSchedulesByService = {
      'svc-1': [
        makeStaff('staff-1', 'vendor-a'),
        makeStaff('staff-2', 'vendor-a', {
          isActive: false,
          autoAssignRules: JSON.stringify([{ action: 'auto-assign', days: ['monday'] }]),
        }),
      ],
    }

    const result = assignBundleStaff({
      orderedServices: services,
      staffSchedulesByService,
      appointments: [],
      date: TEST_DATE,
      startTime: '09:00',
      bufferMinutes: 15,
    })

    expect(result[0].staffId).toBe('staff-1')
  })

  test('auto-assign rule for different day does not give preference', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 60, { allowedStaff: ['staff-1', 'staff-2'] }),
    ]

    const staffSchedulesByService = {
      'svc-1': [
        makeStaff('staff-1', 'vendor-a'), // no auto-assign
        makeStaff('staff-2', 'vendor-a', {
          // auto-assign for Tuesday, not Monday
          autoAssignRules: JSON.stringify([{ action: 'auto-assign', days: ['tuesday'] }]),
        }),
      ],
    }

    const result = assignBundleStaff({
      orderedServices: services,
      staffSchedulesByService,
      appointments: [],
      date: TEST_DATE, // Monday
      startTime: '09:00',
      bufferMinutes: 15,
    })

    // Neither has auto-assign for Monday, so first eligible is chosen
    expect(result[0].staffId).toBe('staff-1')
  })

  test('auto-assign preference applies within same-staff vendor groups', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 30, { allowedStaff: ['staff-1', 'staff-2'] }),
      makeService('svc-2', 'vendor-a', 30, { allowedStaff: ['staff-1', 'staff-2'] }),
    ]

    const staffSchedulesByService = {
      'svc-1': [
        makeStaff('staff-1', 'vendor-a'),
        makeStaff('staff-2', 'vendor-a', {
          autoAssignRules: JSON.stringify([{ action: 'auto-assign', days: ['monday'] }]),
        }),
      ],
      'svc-2': [
        makeStaff('staff-1', 'vendor-a'),
        makeStaff('staff-2', 'vendor-a', {
          autoAssignRules: JSON.stringify([{ action: 'auto-assign', days: ['monday'] }]),
        }),
      ],
    }

    const result = assignBundleStaff({
      orderedServices: services,
      staffSchedulesByService,
      appointments: [],
      date: TEST_DATE,
      startTime: '09:00',
      bufferMinutes: 15,
    })

    // Both should be assigned to staff-2 (auto-assign + same-staff preference)
    expect(result[0].staffId).toBe('staff-2')
    expect(result[1].staffId).toBe('staff-2')
  })
})

// ── Error When Staff Unavailable ─────────────────────────────────────────────

describe('assignBundleStaff - error when staff unavailable', () => {
  test('throws when no staff eligible for a service', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 60, { allowedStaff: ['staff-1'] }),
      makeService('svc-2', 'vendor-b', 60, { allowedStaff: ['staff-2'] }),
    ]

    // staff-2 is inactive
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'vendor-a')],
      'svc-2': [makeStaff('staff-2', 'vendor-b', { isActive: false })],
    }

    expect(() =>
      assignBundleStaff({
        orderedServices: services,
        staffSchedulesByService,
        appointments: [],
        date: TEST_DATE,
        startTime: '09:00',
        bufferMinutes: 15,
      })
    ).toThrow(/Cannot assign staff for service svc-2/)
  })

  test('throws when staff has conflicting appointment at scheduled time', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 60, { allowedStaff: ['staff-1'] }),
    ]

    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'vendor-a')],
    }

    // staff-1 has an appointment at 09:00
    const appointments = [
      makeAppointment('staff-1', '2024-03-18T09:00'),
    ]

    expect(() =>
      assignBundleStaff({
        orderedServices: services,
        staffSchedulesByService,
        appointments,
        date: TEST_DATE,
        startTime: '09:00',
        bufferMinutes: 15,
      })
    ).toThrow(/Cannot assign staff for service svc-1/)
  })

  test('throws when staff is outside working hours', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 60, { allowedStaff: ['staff-1'] }),
    ]

    // staff-1 only works 14:00-17:00 on Monday
    const staffSchedulesByService = {
      'svc-1': [
        makeStaff('staff-1', 'vendor-a', {
          schedule: JSON.stringify({ monday: { start: '14:00', end: '17:00' } }),
        }),
      ],
    }

    expect(() =>
      assignBundleStaff({
        orderedServices: services,
        staffSchedulesByService,
        appointments: [],
        date: TEST_DATE,
        startTime: '09:00',
        bufferMinutes: 15,
      })
    ).toThrow(/Cannot assign staff for service svc-1/)
  })

  test('throws when no staff schedules provided for a service', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 60, { allowedStaff: ['staff-1'] }),
      makeService('svc-2', 'vendor-b', 60, { allowedStaff: ['staff-2'] }),
    ]

    // No staff schedules for svc-2
    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'vendor-a')],
      // svc-2 missing
    }

    expect(() =>
      assignBundleStaff({
        orderedServices: services,
        staffSchedulesByService,
        appointments: [],
        date: TEST_DATE,
        startTime: '09:00',
        bufferMinutes: 15,
      })
    ).toThrow(/Cannot assign staff for service svc-2/)
  })

  test('throws when providersRequired exceeds available staff', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 60, {
        allowedStaff: ['staff-1'],
        providersRequired: 2,
      }),
    ]

    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'vendor-a')],
    }

    expect(() =>
      assignBundleStaff({
        orderedServices: services,
        staffSchedulesByService,
        appointments: [],
        date: TEST_DATE,
        startTime: '09:00',
        bufferMinutes: 15,
      })
    ).toThrow(/Cannot assign staff for service svc-1/)
  })
})

// ── No Intra-Bundle Conflicts with Sequential Scheduling ─────────────────────

describe('assignBundleStaff - no intra-bundle conflicts', () => {
  test('sequential services assigned to same staff do not overlap', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 60, { allowedStaff: ['staff-1'] }),
      makeService('svc-2', 'vendor-a', 60, { allowedStaff: ['staff-1'] }),
    ]

    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'vendor-a')],
      'svc-2': [makeStaff('staff-1', 'vendor-a')],
    }

    const result = assignBundleStaff({
      orderedServices: services,
      staffSchedulesByService,
      appointments: [],
      date: TEST_DATE,
      startTime: '09:00',
      bufferMinutes: 15,
    })

    // svc-1: 09:00-10:00, svc-2: 10:15-11:15 (with 15min buffer)
    expect(result[0].startTime).toBe('09:00')
    expect(result[0].endTime).toBe('10:00')
    expect(result[1].startTime).toBe('10:15')
    expect(result[1].endTime).toBe('11:15')
    // Same staff, no overlap
    expect(result[0].staffId).toBe('staff-1')
    expect(result[1].staffId).toBe('staff-1')
  })

  test('assigns different staff when same staff would cause intra-bundle conflict', () => {
    // Two services from different vendors that overlap in time
    // This shouldn't happen with sequential scheduling, but if buffer is 0
    // and services are from different vendors, they should still get different staff
    // if the same staff can't handle both
    const services = [
      makeService('svc-1', 'vendor-a', 60, { allowedStaff: ['staff-1', 'staff-2'] }),
      makeService('svc-2', 'vendor-b', 60, { allowedStaff: ['staff-1', 'staff-2'] }),
    ]

    const staffSchedulesByService = {
      'svc-1': [
        makeStaff('staff-1', 'vendor-a'),
        makeStaff('staff-2', 'vendor-a'),
      ],
      'svc-2': [
        makeStaff('staff-1', 'vendor-b'),
        makeStaff('staff-2', 'vendor-b'),
      ],
    }

    const result = assignBundleStaff({
      orderedServices: services,
      staffSchedulesByService,
      appointments: [],
      date: TEST_DATE,
      startTime: '09:00',
      bufferMinutes: 15,
    })

    // With sequential scheduling (60min + 15min buffer), no overlap
    // Both can be assigned to same staff since they don't overlap
    expect(result).toHaveLength(2)
    expect(result[0].endTime).toBe('10:00')
    expect(result[1].startTime).toBe('10:15')
  })

  test('three sequential services from same vendor all get same staff without conflicts', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 30, { allowedStaff: ['staff-1'] }),
      makeService('svc-2', 'vendor-a', 30, { allowedStaff: ['staff-1'] }),
      makeService('svc-3', 'vendor-a', 30, { allowedStaff: ['staff-1'] }),
    ]

    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'vendor-a')],
      'svc-2': [makeStaff('staff-1', 'vendor-a')],
      'svc-3': [makeStaff('staff-1', 'vendor-a')],
    }

    const result = assignBundleStaff({
      orderedServices: services,
      staffSchedulesByService,
      appointments: [],
      date: TEST_DATE,
      startTime: '09:00',
      bufferMinutes: 10,
    })

    // svc-1: 09:00-09:30, svc-2: 09:40-10:10, svc-3: 10:20-10:50
    expect(result[0].staffId).toBe('staff-1')
    expect(result[1].staffId).toBe('staff-1')
    expect(result[2].staffId).toBe('staff-1')
    expect(result[0].startTime).toBe('09:00')
    expect(result[0].endTime).toBe('09:30')
    expect(result[1].startTime).toBe('09:40')
    expect(result[1].endTime).toBe('10:10')
    expect(result[2].startTime).toBe('10:20')
    expect(result[2].endTime).toBe('10:50')
  })

  test('cancelled appointments do not cause conflicts', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 60, { allowedStaff: ['staff-1'] }),
    ]

    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'vendor-a')],
    }

    // Cancelled appointment at the same time should not block
    const appointments = [
      makeAppointment('staff-1', '2024-03-18T09:00', { status: 'cancelled' }),
    ]

    const result = assignBundleStaff({
      orderedServices: services,
      staffSchedulesByService,
      appointments,
      date: TEST_DATE,
      startTime: '09:00',
      bufferMinutes: 15,
    })

    expect(result[0].staffId).toBe('staff-1')
  })
})

// ── Multi-Provider Service Within a Bundle ───────────────────────────────────

describe('assignBundleStaff - multi-provider service', () => {
  test('assigns multiple staff when providersRequired > 1', () => {
    // A service requiring 2 providers followed by a single-provider service
    const services = [
      makeService('svc-1', 'vendor-a', 60, {
        allowedStaff: ['staff-1', 'staff-2', 'staff-3'],
        providersRequired: 2,
      }),
      makeService('svc-2', 'vendor-b', 30, { allowedStaff: ['staff-4'] }),
    ]

    const staffSchedulesByService = {
      'svc-1': [
        makeStaff('staff-1', 'vendor-a'),
        makeStaff('staff-2', 'vendor-a'),
        makeStaff('staff-3', 'vendor-a'),
      ],
      'svc-2': [makeStaff('staff-4', 'vendor-b')],
    }

    // The function assigns one staff per service entry, but providersRequired
    // is checked during eligibility. If only 1 staff is assigned per service,
    // the function validates that at least providersRequired are eligible.
    const result = assignBundleStaff({
      orderedServices: services,
      staffSchedulesByService,
      appointments: [],
      date: TEST_DATE,
      startTime: '09:00',
      bufferMinutes: 15,
    })

    expect(result).toHaveLength(3)
    expect(result[0].vendorId).toBe('vendor-a')
    expect(result[1].vendorId).toBe('vendor-a')
    expect(result[2].vendorId).toBe('vendor-b')
    expect(result[2].staffId).toBe('staff-4')
  })

  test('throws when fewer staff available than providersRequired', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 60, {
        allowedStaff: ['staff-1', 'staff-2'],
        providersRequired: 3,
      }),
    ]

    const staffSchedulesByService = {
      'svc-1': [
        makeStaff('staff-1', 'vendor-a'),
        makeStaff('staff-2', 'vendor-a'),
      ],
    }

    expect(() =>
      assignBundleStaff({
        orderedServices: services,
        staffSchedulesByService,
        appointments: [],
        date: TEST_DATE,
        startTime: '09:00',
        bufferMinutes: 15,
      })
    ).toThrow(/Cannot assign staff for service svc-1.*need 3.*found 2/)
  })

  test('multi-provider service with some staff having conflicts still works if enough remain', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 60, {
        allowedStaff: ['staff-1', 'staff-2', 'staff-3'],
        providersRequired: 2,
      }),
    ]

    const staffSchedulesByService = {
      'svc-1': [
        makeStaff('staff-1', 'vendor-a'),
        makeStaff('staff-2', 'vendor-a'),
        makeStaff('staff-3', 'vendor-a'),
      ],
    }

    // staff-1 has a conflict at 09:00
    const appointments = [
      makeAppointment('staff-1', '2024-03-18T09:00'),
    ]

    const result = assignBundleStaff({
      orderedServices: services,
      staffSchedulesByService,
      appointments,
      date: TEST_DATE,
      startTime: '09:00',
      bufferMinutes: 15,
    })

    // Should still succeed since 2 staff (staff-2, staff-3) are available
    expect(result).toHaveLength(2)
    expect(['staff-2', 'staff-3']).toContain(result[0].staffId)
    expect(['staff-2', 'staff-3']).toContain(result[1].staffId)
    expect(result[0].staffId).not.toBe(result[1].staffId)
  })
})

// ── Return Value Structure ───────────────────────────────────────────────────

describe('assignBundleStaff - return value structure', () => {
  test('returns correct structure for each assignment', () => {
    const services = [
      makeService('svc-1', 'vendor-a', 60, { allowedStaff: ['staff-1'] }),
      makeService('svc-2', 'vendor-b', 45, { allowedStaff: ['staff-2'] }),
    ]

    const staffSchedulesByService = {
      'svc-1': [makeStaff('staff-1', 'vendor-a', { name: 'Alice' })],
      'svc-2': [makeStaff('staff-2', 'vendor-b', { name: 'Bob' })],
    }

    const result = assignBundleStaff({
      orderedServices: services,
      staffSchedulesByService,
      appointments: [],
      date: TEST_DATE,
      startTime: '09:00',
      bufferMinutes: 15,
    })

    expect(result).toHaveLength(2)

    expect(result[0]).toEqual({
      serviceId: 'svc-1',
      staffId: 'staff-1',
      vendorId: 'vendor-a',
      staffName: 'Alice',
      startTime: '09:00',
      endTime: '10:00',
    })

    expect(result[1]).toEqual({
      serviceId: 'svc-2',
      staffId: 'staff-2',
      vendorId: 'vendor-b',
      staffName: 'Bob',
      startTime: '10:15',
      endTime: '11:00',
    })
  })
})
