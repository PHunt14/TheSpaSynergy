/**
 * Tests for the shared bundle availability core.
 *
 * bundleAvailabilityCore takes the Amplify data client as a parameter, so we can
 * exercise it with a plain in-memory mock — no module mocking required. This is
 * the single source of truth both the calendar (/api/available-dates) and the
 * time picker (/api/bundle-availability) use, so these tests lock in the shared
 * behavior — including the sauna and room handling that caused real bugs.
 */
import {
  buildBundleAvailabilityContext,
  computeBundleSlotsForDate,
  computeBundleAvailableDates,
} from '../../app/utils/bundleAvailabilityCore.ts'

// ── Mock client ──────────────────────────────────────────────────────────────

function makeClient({ services = [], staff = [], vendors = [], appointments = [] }) {
  const byId = (arr, key) => Object.fromEntries(arr.map(x => [x[key], x]))
  const serviceMap = byId(services, 'serviceId')
  const staffMap = byId(staff, 'visibleId')
  const vendorMap = byId(vendors, 'vendorId')

  return {
    models: {
      Service: {
        get: async ({ serviceId }) => ({ data: serviceMap[serviceId] || null }),
      },
      StaffSchedule: {
        list: async () => ({ data: staff }),
        get: async ({ visibleId }) => ({ data: staffMap[visibleId] || null }),
      },
      Vendor: {
        get: async ({ vendorId }) => ({ data: vendorMap[vendorId] || null }),
      },
      Appointment: {
        listAppointmentByVendorIdAndDateTime: async ({ vendorId, dateTime }) => ({
          data: appointments.filter(
            a => a.vendorId === vendorId && (a.dateTime || '').startsWith(dateTime.beginsWith)
          ),
          nextToken: undefined,
        }),
      },
    },
  }
}

const formatDateLocal = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const openWeek = {
  monday: { start: '09:00', end: '18:00' }, tuesday: { start: '09:00', end: '18:00' },
  wednesday: { start: '09:00', end: '18:00' }, thursday: { start: '09:00', end: '18:00' },
  friday: { start: '09:00', end: '18:00' }, saturday: { start: '09:00', end: '18:00' },
  sunday: { start: '09:00', end: '18:00' },
}
const saunaHoursJson = JSON.stringify({
  monday: { start: '06:30', end: '20:00' }, tuesday: { start: '06:30', end: '20:00' },
  wednesday: { start: '06:30', end: '20:00' }, thursday: { start: '06:30', end: '20:00' },
  friday: { start: '06:30', end: '20:00' }, saturday: { start: '06:30', end: '20:00' },
  sunday: { start: '06:30', end: '20:00' },
})

// 2026-06-15 is a Monday.
const DAY = '2026-06-15'

describe('bundleAvailabilityCore — sauna + staffed service', () => {
  // Reproduces the real bug: a sauna service whose allowedStaff lists HUMANS
  // (not resource-sauna). It must still be bookable via the resource-sauna
  // calendar, not excluded by the allowedStaff filter.
  const services = [
    {
      serviceId: 'svc-sauna', duration: 30, providersRequired: 1, vendorId: null,
      resourceType: 'sauna',
      allowedStaff: ['staff-a', 'staff-b'], // humans listed, but sauna is a resource
    },
    {
      serviceId: 'svc-haircut', duration: 30, providersRequired: 1, vendorId: 'v-kera',
      resourceType: 'staff', allowedStaff: ['staff-a'],
    },
  ]
  const staff = [
    { visibleId: 'staff-a', vendorId: 'v-kera', isActive: true, schedule: JSON.stringify(openWeek), autoAssignRules: null },
    { visibleId: 'resource-sauna', vendorId: 'v-kera', isActive: true, schedule: JSON.stringify(openWeek), autoAssignRules: null },
  ]
  const vendors = [{ vendorId: 'v-kera', saunaHours: saunaHoursJson, bufferMinutes: 15 }]

  test('a day with the sauna open and a stylist working yields slots', async () => {
    const client = makeClient({ services, staff, vendors, appointments: [] })
    const ctx = await buildBundleAvailabilityContext(client, services, DAY)
    const { slots } = computeBundleSlotsForDate(ctx, DAY)
    expect(slots.length).toBeGreaterThan(0)
  })

  test('calendar reports the day as available (matches the time picker)', async () => {
    const client = makeClient({ services, staff, vendors, appointments: [] })
    const ctx = await buildBundleAvailabilityContext(client, services, '2026-06')
    const first = new Date('2026-06-15T00:00:00')
    const last = new Date('2026-06-16T00:00:00')
    const minDate = new Date('2026-06-01T00:00:00')
    const days = computeBundleAvailableDates(ctx, first, last, minDate, null, formatDateLocal)
    expect(days).toContain(DAY)
  })
})

describe('bundleAvailabilityCore — room service always needs staff', () => {
  // A room service must be scheduled against its human staff, NOT a resource.
  const services = [
    { serviceId: 'svc-room', duration: 60, providersRequired: 1, vendorId: 'v-kera', resourceType: 'room', allowedStaff: ['staff-a'] },
    { serviceId: 'svc-haircut', duration: 30, providersRequired: 1, vendorId: 'v-kera', resourceType: 'staff', allowedStaff: ['staff-a'] },
  ]
  const staff = [
    { visibleId: 'staff-a', vendorId: 'v-kera', isActive: true, schedule: JSON.stringify(openWeek), autoAssignRules: null },
  ]
  const vendors = [{ vendorId: 'v-kera', bufferMinutes: 15 }]

  test('room + haircut with a shared eligible stylist yields slots', async () => {
    const client = makeClient({ services, staff, vendors, appointments: [] })
    const ctx = await buildBundleAvailabilityContext(client, services, DAY)
    const { slots } = computeBundleSlotsForDate(ctx, DAY)
    expect(slots.length).toBeGreaterThan(0)
  })

  test('room service with NO eligible staff yields no slots', async () => {
    const servicesNoStaff = [
      { serviceId: 'svc-room', duration: 60, providersRequired: 1, vendorId: 'v-kera', resourceType: 'room', allowedStaff: ['staff-missing'] },
    ]
    const client = makeClient({ services: servicesNoStaff, staff, vendors, appointments: [] })
    const ctx = await buildBundleAvailabilityContext(client, servicesNoStaff, DAY)
    const { slots } = computeBundleSlotsForDate(ctx, DAY)
    expect(slots.length).toBe(0)
  })
})

describe('bundleAvailabilityCore — calendar and time picker agree', () => {
  const services = [
    { serviceId: 'svc-1', duration: 30, providersRequired: 1, vendorId: 'v-kera', resourceType: 'staff', allowedStaff: ['staff-a'] },
    { serviceId: 'svc-2', duration: 30, providersRequired: 1, vendorId: 'v-kera', resourceType: 'staff', allowedStaff: ['staff-a'] },
  ]
  const staff = [
    { visibleId: 'staff-a', vendorId: 'v-kera', isActive: true, schedule: JSON.stringify(openWeek), autoAssignRules: null },
  ]
  const vendors = [{ vendorId: 'v-kera', bufferMinutes: 15 }]

  test('every calendar-green day yields slots from the per-day computation', async () => {
    const client = makeClient({ services, staff, vendors, appointments: [] })
    const monthCtx = await buildBundleAvailabilityContext(client, services, '2026-06')
    const first = new Date('2026-06-15T00:00:00')
    const last = new Date('2026-06-20T00:00:00')
    const minDate = new Date('2026-06-01T00:00:00')
    const days = computeBundleAvailableDates(monthCtx, first, last, minDate, null, formatDateLocal)
    expect(days.length).toBeGreaterThan(0)

    // The invariant: each green day must produce at least one slot via the SAME
    // per-day function the time picker calls.
    for (const day of days) {
      const dayCtx = await buildBundleAvailabilityContext(client, services, day)
      const { slots } = computeBundleSlotsForDate(dayCtx, day)
      expect(slots.length).toBeGreaterThan(0)
    }
  })
})
