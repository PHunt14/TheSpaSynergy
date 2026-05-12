/**
 * Multi-Quantity Availability Tests
 *
 * Unit tests for quantity booking availability functions:
 * - getParallelQuantitySlots (multiple staff simultaneously)
 * - getSequentialQuantitySlots (back-to-back with same staff)
 * - calculateQuantityDuration (total time calculation)
 * - canBookParallel (eligibility check)
 */

import {
  getParallelQuantitySlots,
  getSequentialQuantitySlots,
  calculateQuantityDuration,
  canBookParallel,
} from '../../app/utils/quantityAvailability.js'

// ─── Test Helpers ─────────────────────────────────────────────

const makeStaff = (id, vendorId, schedule) => ({
  visibleId: id,
  vendorId,
  isActive: true,
  name: `Staff ${id}`,
  schedule: JSON.stringify(schedule),
  autoAssignRules: null,
})

const mondaySchedule = { monday: { start: '09:00', end: '17:00' } }
const futureMonday = '2099-01-05' // A Monday far in the future

// ─── getParallelQuantitySlots ─────────────────────────────────

describe('getParallelQuantitySlots', () => {
  const baseService = {
    duration: 60,
    allowedStaff: ['staff-1', 'staff-2', 'staff-3'],
  }

  test('returns slots when enough staff are available for quantity', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-2', 'vendor-b', mondaySchedule),
      makeStaff('staff-3', 'vendor-c', mondaySchedule),
    ]
    const slots = getParallelQuantitySlots({
      service: baseService,
      quantity: 2,
      staffSchedules,
      appointments: [],
      date: futureMonday,
      bufferMinutes: 15,
    })
    expect(slots.length).toBeGreaterThan(0)
    expect(slots[0]).toHaveProperty('time')
    expect(slots[0]).toHaveProperty('display')
  })

  test('returns empty when fewer staff than quantity', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
    ]
    const slots = getParallelQuantitySlots({
      service: baseService,
      quantity: 2,
      staffSchedules,
      appointments: [],
      date: futureMonday,
      bufferMinutes: 15,
    })
    expect(slots).toEqual([])
  })

  test('excludes slots where too many staff are busy', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-2', 'vendor-b', mondaySchedule),
    ]
    // Both staff busy at 09:00
    const appointments = [
      { dateTime: `${futureMonday}T09:00`, staffId: 'staff-1', status: 'confirmed', customer: JSON.stringify({ name: 'A' }) },
      { dateTime: `${futureMonday}T09:00`, staffId: 'staff-2', status: 'confirmed', customer: JSON.stringify({ name: 'B' }) },
    ]
    const slots = getParallelQuantitySlots({
      service: baseService,
      quantity: 2,
      staffSchedules,
      appointments,
      date: futureMonday,
      bufferMinutes: 15,
    })
    const nineSlot = slots.find(s => s.time === '09:00')
    expect(nineSlot).toBeUndefined()
  })

  test('allows slot when only some staff are busy (enough remain)', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-2', 'vendor-b', mondaySchedule),
      makeStaff('staff-3', 'vendor-c', mondaySchedule),
    ]
    // Only staff-1 busy at 09:00
    const appointments = [
      { dateTime: `${futureMonday}T09:00`, staffId: 'staff-1', status: 'confirmed', customer: JSON.stringify({ name: 'A' }) },
    ]
    const slots = getParallelQuantitySlots({
      service: baseService,
      quantity: 2,
      staffSchedules,
      appointments,
      date: futureMonday,
      bufferMinutes: 15,
    })
    const nineSlot = slots.find(s => s.time === '09:00')
    expect(nineSlot).toBeDefined()
  })

  test('returns empty for day when staff not working', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-2', 'vendor-b', mondaySchedule),
    ]
    const slots = getParallelQuantitySlots({
      service: baseService,
      quantity: 2,
      staffSchedules,
      appointments: [],
      date: '2099-01-06', // Tuesday — no schedule
      bufferMinutes: 15,
    })
    expect(slots).toEqual([])
  })

  test('cancelled appointments do not block slots', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-2', 'vendor-b', mondaySchedule),
    ]
    const appointments = [
      { dateTime: `${futureMonday}T09:00`, staffId: 'staff-1', status: 'cancelled', customer: JSON.stringify({ name: 'A' }) },
      { dateTime: `${futureMonday}T09:00`, staffId: 'staff-2', status: 'cancelled', customer: JSON.stringify({ name: 'B' }) },
    ]
    const slots = getParallelQuantitySlots({
      service: baseService,
      quantity: 2,
      staffSchedules,
      appointments,
      date: futureMonday,
      bufferMinutes: 15,
    })
    const nineSlot = slots.find(s => s.time === '09:00')
    expect(nineSlot).toBeDefined()
  })

  test('filters out inactive staff', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      { ...makeStaff('staff-2', 'vendor-b', mondaySchedule), isActive: false },
    ]
    const slots = getParallelQuantitySlots({
      service: baseService,
      quantity: 2,
      staffSchedules,
      appointments: [],
      date: futureMonday,
      bufferMinutes: 15,
    })
    expect(slots).toEqual([])
  })

  test('quantity of 3 requires 3 free staff', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-2', 'vendor-b', mondaySchedule),
      makeStaff('staff-3', 'vendor-c', mondaySchedule),
    ]
    const slots = getParallelQuantitySlots({
      service: baseService,
      quantity: 3,
      staffSchedules,
      appointments: [],
      date: futureMonday,
      bufferMinutes: 15,
    })
    expect(slots.length).toBeGreaterThan(0)
  })
})

// ─── getSequentialQuantitySlots ───────────────────────────────

describe('getSequentialQuantitySlots', () => {
  const baseService = {
    duration: 60,
    allowedStaff: ['staff-1', 'staff-2'],
  }

  test('returns slots when staff can accommodate full sequential block', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
    ]
    const slots = getSequentialQuantitySlots({
      service: baseService,
      quantity: 2,
      staffSchedules,
      appointments: [],
      date: futureMonday,
      bufferMinutes: 15,
    })
    expect(slots.length).toBeGreaterThan(0)
    // First slot should be 09:00
    expect(slots[0].time).toBe('09:00')
  })

  test('total block = quantity * duration + (quantity-1) * buffer', () => {
    // 3 × 60min + 2 × 15min = 210min = 3.5 hours
    // Staff works 09:00-17:00 (480 min), so last valid start = 17:00 - 210min = 13:30
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
    ]
    const slots = getSequentialQuantitySlots({
      service: baseService,
      quantity: 3,
      staffSchedules,
      appointments: [],
      date: futureMonday,
      bufferMinutes: 15,
    })
    const lastSlot = slots[slots.length - 1]
    // 17:00 = 1020 min, 1020 - 210 = 810 min = 13:30
    expect(lastSlot.time).toBe('13:30')
  })

  test('excludes slots where mid-block conflicts exist', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
    ]
    // Appointment at 10:00 blocks the 09:00 start for 2× 60min + 15min buffer
    // 09:00 start → first ends 10:00, buffer to 10:15, second 10:15-11:15
    // But 10:00 appointment conflicts with the buffer/second slot
    const appointments = [
      { dateTime: `${futureMonday}T10:00`, staffId: 'staff-1', status: 'confirmed', customer: JSON.stringify({ name: 'A' }) },
    ]
    const slots = getSequentialQuantitySlots({
      service: baseService,
      quantity: 2,
      staffSchedules,
      appointments,
      date: futureMonday,
      bufferMinutes: 15,
    })
    const nineSlot = slots.find(s => s.time === '09:00')
    expect(nineSlot).toBeUndefined()
  })

  test('returns empty when no staff available', () => {
    const slots = getSequentialQuantitySlots({
      service: baseService,
      quantity: 2,
      staffSchedules: [],
      appointments: [],
      date: futureMonday,
      bufferMinutes: 15,
    })
    expect(slots).toEqual([])
  })

  test('returns empty when window too small for sequential block', () => {
    // Staff works only 2 hours, but need 2×60 + 15 = 135 min
    const shortSchedule = { monday: { start: '09:00', end: '11:00' } }
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', shortSchedule),
    ]
    const slots = getSequentialQuantitySlots({
      service: baseService,
      quantity: 2,
      staffSchedules,
      appointments: [],
      date: futureMonday,
      bufferMinutes: 15,
    })
    expect(slots).toEqual([])
  })

  test('uses any available staff member (not just first)', () => {
    // staff-1 is fully booked, staff-2 is free
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
      makeStaff('staff-2', 'vendor-b', mondaySchedule),
    ]
    // Fill staff-1's entire day
    const appointments = Array.from({ length: 8 }, (_, i) => ({
      dateTime: `${futureMonday}T${(9 + i).toString().padStart(2, '0')}:00`,
      staffId: 'staff-1',
      status: 'confirmed',
      customer: JSON.stringify({ name: `Client ${i}` }),
    }))
    const slots = getSequentialQuantitySlots({
      service: baseService,
      quantity: 2,
      staffSchedules,
      appointments,
      date: futureMonday,
      bufferMinutes: 15,
    })
    // staff-2 is free, so slots should exist
    expect(slots.length).toBeGreaterThan(0)
  })

  test('handles blocked time with custom duration', () => {
    const staffSchedules = [
      makeStaff('staff-1', 'vendor-a', mondaySchedule),
    ]
    // Blocked time from 10:00 for 120 minutes
    const appointments = [
      {
        dateTime: `${futureMonday}T10:00`,
        staffId: 'staff-1',
        status: 'confirmed',
        customer: JSON.stringify({ name: 'Block', isBlockedTime: true, duration: 120 }),
      },
    ]
    const slots = getSequentialQuantitySlots({
      service: baseService,
      quantity: 2,
      staffSchedules,
      appointments,
      date: futureMonday,
      bufferMinutes: 15,
    })
    // 09:00 start: first 09:00-10:00, buffer 10:00-10:15 → conflicts with block at 10:00
    const nineSlot = slots.find(s => s.time === '09:00')
    expect(nineSlot).toBeUndefined()
    // 12:30 start should work (block ends at 12:00 + 15 buffer = 12:15)
    const twelveThirtySlot = slots.find(s => s.time === '12:30')
    expect(twelveThirtySlot).toBeDefined()
  })
})

// ─── calculateQuantityDuration ────────────────────────────────

describe('calculateQuantityDuration', () => {
  test('parallel mode returns single service duration', () => {
    expect(calculateQuantityDuration(60, 3, 15, 'parallel')).toBe(60)
  })

  test('sequential mode: 1 unit = just duration', () => {
    expect(calculateQuantityDuration(60, 1, 15, 'sequential')).toBe(60)
  })

  test('sequential mode: 2 units = 2*duration + 1*buffer', () => {
    expect(calculateQuantityDuration(60, 2, 15, 'sequential')).toBe(135)
  })

  test('sequential mode: 3 units = 3*duration + 2*buffer', () => {
    expect(calculateQuantityDuration(60, 3, 15, 'sequential')).toBe(210)
  })

  test('sequential mode: 4 units with 0 buffer', () => {
    expect(calculateQuantityDuration(30, 4, 0, 'sequential')).toBe(120)
  })
})

// ─── canBookParallel ──────────────────────────────────────────

describe('canBookParallel', () => {
  test('returns true when allowedStaff >= quantity', () => {
    const service = { allowedStaff: ['a', 'b', 'c'] }
    expect(canBookParallel(service, 2)).toBe(true)
    expect(canBookParallel(service, 3)).toBe(true)
  })

  test('returns false when allowedStaff < quantity', () => {
    const service = { allowedStaff: ['a'] }
    expect(canBookParallel(service, 2)).toBe(false)
  })

  test('returns false when allowedStaff is empty', () => {
    const service = { allowedStaff: [] }
    expect(canBookParallel(service, 1)).toBe(false)
  })

  test('handles missing allowedStaff', () => {
    const service = {}
    expect(canBookParallel(service, 1)).toBe(false)
  })

  test('quantity of 1 with 1 staff returns true', () => {
    const service = { allowedStaff: ['a'] }
    expect(canBookParallel(service, 1)).toBe(true)
  })
})
