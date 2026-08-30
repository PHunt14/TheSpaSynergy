/**
 * Regression tests for the show/book availability consistency bug:
 * the calendar would show a multi-service slot as available, but booking it
 * would fail with "Selected time is no longer available".
 *
 * Root cause: the availability (SHOW) path counted free staff per service
 * independently, while the booking (BOOK) path builds a single conflict-free
 * assignment with same-staff-per-vendor grouping. Counting double-counts a
 * stylist shared across two same-vendor services.
 *
 * Fix: the SHOW path now gates each slot on canAssignBundleStaff — the SAME
 * assignment logic BOOK uses. This suite enforces the invariant directly:
 *
 *   Every slot returned by getSequentialBundleSlots MUST be bookable by
 *   assignBundleStaff for the reported suggestedOrder.
 */

import { getSequentialBundleSlots } from '../../app/utils/sequentialAvailability.js'
import { assignBundleStaff } from '../../app/utils/bundleStaffAssigner.js'

const DAY = { monday: { start: '09:00', end: '17:00' } }
const DATE = '2024-03-11' // a Monday, so the schedule above applies

function staff(id, vendorId) {
  return { visibleId: id, vendorId, isActive: true, staffName: id, schedule: DAY }
}

/**
 * Shared assertion: compute availability, then verify EVERY returned slot is
 * bookable by assignBundleStaff for the reported order. Optionally require that
 * at least one slot exists.
 */
function assertAllSlotsBookable({ services, staffSchedulesByService, appointments = [], bufferMinutes, expectSlots = false }) {
  const { slots, suggestedOrder } = getSequentialBundleSlots({
    services,
    staffSchedulesByService,
    appointments,
    startDate: DATE,
    bufferMinutes,
    serviceOrder: null,
    multiDay: false,
    maxDays: 1,
  })

  if (expectSlots) expect(slots.length).toBeGreaterThan(0)

  const orderedServices = suggestedOrder.map(id => services.find(s => s.serviceId === id))

  for (const slot of slots) {
    expect(() =>
      assignBundleStaff({
        orderedServices,
        staffSchedulesByService,
        appointments,
        date: DATE,
        startTime: slot.startTime,
        bufferMinutes,
      })
    ).not.toThrow()
  }
}

describe('show/book consistency: every shown slot is bookable', () => {
  test('shared stylist across two same-vendor services (the original bug)', () => {
    // Vendor A offers two services, and only ONE stylist (s1) is qualified for
    // both. The old count-based logic counted s1 twice and showed slots the
    // booking path then rejected.
    assertAllSlotsBookable({
      services: [
        { serviceId: 'svc-a1', duration: 60, providersRequired: 1, vendorId: 'vendor-a', allowedStaff: ['s1'] },
        { serviceId: 'svc-a2', duration: 60, providersRequired: 1, vendorId: 'vendor-a', allowedStaff: ['s1'] },
      ],
      staffSchedulesByService: {
        'svc-a1': [staff('s1', 'vendor-a')],
        'svc-a2': [staff('s1', 'vendor-a')],
      },
      bufferMinutes: 15,
      expectSlots: true, // s1 can do both sequentially within 9-5
    })
  })

  test('two eligible stylists but one is fully booked', () => {
    // s2 is booked solid all day, so only s1 is effectively free — same
    // constraint as the single-stylist case. Every shown slot must still book.
    assertAllSlotsBookable({
      services: [
        { serviceId: 'svc-a1', duration: 45, providersRequired: 1, vendorId: 'vendor-a', allowedStaff: ['s1', 's2'] },
        { serviceId: 'svc-a2', duration: 45, providersRequired: 1, vendorId: 'vendor-a', allowedStaff: ['s1', 's2'] },
      ],
      staffSchedulesByService: {
        'svc-a1': [staff('s1', 'vendor-a'), staff('s2', 'vendor-a')],
        'svc-a2': [staff('s1', 'vendor-a'), staff('s2', 'vendor-a')],
      },
      appointments: [
        { appointmentId: 'x', staffId: 's2', dateTime: `${DATE}T09:00`, status: 'confirmed', customer: JSON.stringify({ duration: 480 }) },
      ],
      bufferMinutes: 10,
    })
  })

  test('healthy case: two vendors, distinct stylists', () => {
    assertAllSlotsBookable({
      services: [
        { serviceId: 'svc-a', duration: 60, providersRequired: 1, vendorId: 'vendor-a', allowedStaff: ['sa'] },
        { serviceId: 'svc-b', duration: 60, providersRequired: 1, vendorId: 'vendor-b', allowedStaff: ['sb'] },
      ],
      staffSchedulesByService: {
        'svc-a': [staff('sa', 'vendor-a')],
        'svc-b': [staff('sb', 'vendor-b')],
      },
      bufferMinutes: 15,
      expectSlots: true,
    })
  })
})
