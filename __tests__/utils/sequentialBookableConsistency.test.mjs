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
 * assignment logic BOOK uses. This test enforces the invariant directly:
 *
 *   Every slot returned by getSequentialBundleSlots MUST be bookable by
 *   assignBundleStaff for the reported suggestedOrder.
 */

import { getSequentialBundleSlots } from '../../app/utils/sequentialAvailability.js'
import { assignBundleStaff } from '../../app/utils/bundleStaffAssigner.js'

const DAY = { monday: { start: '09:00', end: '17:00' } }

function staff(id, vendorId) {
  return { visibleId: id, vendorId, isActive: true, staffName: id, schedule: DAY }
}

// A Monday date so the schedule above applies.
const DATE = '2024-03-11'

describe('show/book consistency: shared stylist across same-vendor services', () => {
  // Vendor A offers two services in the bundle, and only ONE stylist (s1) is
  // qualified for both. The old count-based logic showed a slot (1 free for
  // each service), but booking cannot put s1 on two overlapping/sequential
  // slots for the same person twice at once — it must sequence them, and if
  // the block doesn't fit, no slot should be shown.
  const services = [
    { serviceId: 'svc-a1', duration: 60, providersRequired: 1, vendorId: 'vendor-a', allowedStaff: ['s1'] },
    { serviceId: 'svc-a2', duration: 60, providersRequired: 1, vendorId: 'vendor-a', allowedStaff: ['s1'] },
  ]
  const staffSchedulesByService = {
    'svc-a1': [staff('s1', 'vendor-a')],
    'svc-a2': [staff('s1', 'vendor-a')],
  }

  test('every returned slot is bookable by assignBundleStaff', () => {
    const { slots, suggestedOrder } = getSequentialBundleSlots({
      services,
      staffSchedulesByService,
      appointments: [],
      startDate: DATE,
      bufferMinutes: 15,
      serviceOrder: null,
      multiDay: false,
      maxDays: 1,
    })

    // There should be some slots (s1 can do both sequentially within 9-5).
    expect(slots.length).toBeGreaterThan(0)

    const orderedServices = suggestedOrder.map(id => services.find(s => s.serviceId === id))

    for (const slot of slots) {
      expect(() =>
        assignBundleStaff({
          orderedServices,
          staffSchedulesByService,
          appointments: [],
          date: DATE,
          startTime: slot.startTime,
          bufferMinutes: 15,
        })
      ).not.toThrow()
    }
  })
})

describe('show/book consistency: two stylists, two services, one busy', () => {
  // Vendor A has services a1 and a2, stylists s1 and s2 both qualified.
  // s2 is fully booked all day, so only s1 is free — same as the single-stylist
  // case. Every shown slot must still be bookable.
  const services = [
    { serviceId: 'svc-a1', duration: 45, providersRequired: 1, vendorId: 'vendor-a', allowedStaff: ['s1', 's2'] },
    { serviceId: 'svc-a2', duration: 45, providersRequired: 1, vendorId: 'vendor-a', allowedStaff: ['s1', 's2'] },
  ]
  const staffSchedulesByService = {
    'svc-a1': [staff('s1', 'vendor-a'), staff('s2', 'vendor-a')],
    'svc-a2': [staff('s1', 'vendor-a'), staff('s2', 'vendor-a')],
  }
  // s2 booked 09:00-17:00 solid.
  const appointments = [
    { appointmentId: 'x', staffId: 's2', dateTime: `${DATE}T09:00`, status: 'confirmed', customer: JSON.stringify({ duration: 480 }) },
  ]

  test('every returned slot is bookable by assignBundleStaff', () => {
    const { slots, suggestedOrder } = getSequentialBundleSlots({
      services,
      staffSchedulesByService,
      appointments,
      startDate: DATE,
      bufferMinutes: 10,
      serviceOrder: null,
      multiDay: false,
      maxDays: 1,
    })

    const orderedServices = suggestedOrder.map(id => services.find(s => s.serviceId === id))

    for (const slot of slots) {
      expect(() =>
        assignBundleStaff({
          orderedServices,
          staffSchedulesByService,
          appointments,
          date: DATE,
          startTime: slot.startTime,
          bufferMinutes: 10,
        })
      ).not.toThrow()
    }
  })
})

describe('show/book consistency: two vendors, distinct stylists', () => {
  // The healthy case — two vendors, one stylist each. Slots should exist and
  // all be bookable.
  const services = [
    { serviceId: 'svc-a', duration: 60, providersRequired: 1, vendorId: 'vendor-a', allowedStaff: ['sa'] },
    { serviceId: 'svc-b', duration: 60, providersRequired: 1, vendorId: 'vendor-b', allowedStaff: ['sb'] },
  ]
  const staffSchedulesByService = {
    'svc-a': [staff('sa', 'vendor-a')],
    'svc-b': [staff('sb', 'vendor-b')],
  }

  test('slots exist and every one is bookable', () => {
    const { slots, suggestedOrder } = getSequentialBundleSlots({
      services,
      staffSchedulesByService,
      appointments: [],
      startDate: DATE,
      bufferMinutes: 15,
      serviceOrder: null,
      multiDay: false,
      maxDays: 1,
    })

    expect(slots.length).toBeGreaterThan(0)

    const orderedServices = suggestedOrder.map(id => services.find(s => s.serviceId === id))
    for (const slot of slots) {
      expect(() =>
        assignBundleStaff({
          orderedServices,
          staffSchedulesByService,
          appointments: [],
          date: DATE,
          startTime: slot.startTime,
          bufferMinutes: 15,
        })
      ).not.toThrow()
    }
  })
})
