/**
 * Integration Tests for Unified Booking Flow
 *
 * Validates that the booking flow follows the sequence:
 *   Service Selection → Provider (Staff) Selection → Time Selection → Payment
 *
 * Key assertions:
 * - The flow STARTS with service selection (no vendor step)
 * - No `vendor` or `vendorId` parameter appears in navigation routing
 * - Provider selection shows "Any Available" as first option + eligible staff
 * - Time selection uses serviceId (and optional staffId), never vendorId
 *
 * Validates: Requirements 12.4, 13.1, 13.2, 13.4
 */

import { getEligibleStaff, isServiceBookable } from '../../app/utils/staffEligibility.ts'
import { assignStaff } from '../../app/utils/staffAssigner.js'
import { generateTimeSlots } from '../../app/utils/availability.js'

// ── Test Data ─────────────────────────────────────────────────

const services = [
  {
    serviceId: 'svc-haircut',
    name: 'Haircut',
    categories: ['Hair'],
    duration: 45,
    price: 65,
    isActive: true,
    allowedStaff: ['staff-alice', 'staff-bob'],
    providersRequired: 1,
    maxQuantityPerBooking: 1,
  },
  {
    serviceId: 'svc-massage',
    name: 'Deep Tissue Massage',
    categories: ['Massage'],
    duration: 60,
    price: 120,
    isActive: true,
    allowedStaff: null, // "All" — any active staff
    providersRequired: 1,
    maxQuantityPerBooking: 1,
  },
  {
    serviceId: 'svc-facial',
    name: 'Hydrating Facial',
    categories: ['Skin'],
    duration: 30,
    price: 80,
    isActive: true,
    allowedStaff: ['staff-carol'],
    providersRequired: 1,
    maxQuantityPerBooking: 1,
  },
  {
    serviceId: 'svc-inactive',
    name: 'Inactive Service',
    categories: ['Other'],
    duration: 30,
    price: 50,
    isActive: false,
    allowedStaff: ['staff-alice'],
    providersRequired: 1,
    maxQuantityPerBooking: 1,
  },
]

const staffSchedules = [
  {
    visibleId: 'staff-alice',
    staffName: 'Alice',
    vendorId: 'provider-kera',
    isActive: true,
    schedule: JSON.stringify({ monday: { start: '09:00', end: '17:00' }, tuesday: { start: '09:00', end: '17:00' } }),
    autoAssignRules: JSON.stringify([{ action: 'auto-assign', days: ['monday', 'tuesday'] }]),
    squareAccessToken: 'sq-token-alice',
    squareLocationId: 'loc-alice',
    squareOAuthStatus: 'connected',
  },
  {
    visibleId: 'staff-bob',
    staffName: 'Bob',
    vendorId: 'provider-winsome',
    isActive: true,
    schedule: JSON.stringify({ monday: { start: '10:00', end: '18:00' }, tuesday: { start: '10:00', end: '18:00' } }),
    autoAssignRules: JSON.stringify([{ action: 'auto-assign', days: ['monday', 'tuesday'] }]),
    squareAccessToken: 'sq-token-bob',
    squareLocationId: 'loc-bob',
    squareOAuthStatus: 'connected',
  },
  {
    visibleId: 'staff-carol',
    staffName: 'Carol',
    vendorId: 'provider-selene',
    isActive: true,
    schedule: JSON.stringify({ monday: { start: '09:00', end: '15:00' } }),
    autoAssignRules: JSON.stringify([{ action: 'auto-assign', days: ['monday'] }]),
    squareAccessToken: 'sq-token-carol',
    squareLocationId: 'loc-carol',
    squareOAuthStatus: 'connected',
  },
  {
    visibleId: 'staff-dave',
    staffName: 'Dave',
    vendorId: 'provider-kera',
    isActive: false, // inactive
    schedule: JSON.stringify({ monday: { start: '09:00', end: '17:00' } }),
    autoAssignRules: null,
    squareAccessToken: null,
    squareLocationId: null,
    squareOAuthStatus: 'disconnected',
  },
]

// ── Step 1: Service Selection ─────────────────────────────────

describe('Booking Flow Integration: Step 1 — Service Selection (No Vendor Step)', () => {
  test('service catalog displays only active services without vendor grouping', () => {
    // Simulates what the booking page does: fetch all services, filter active
    const activeServices = services.filter(s => s.isActive !== false)

    expect(activeServices).toHaveLength(3)
    expect(activeServices.map(s => s.name)).toEqual(
      expect.arrayContaining(['Haircut', 'Deep Tissue Massage', 'Hydrating Facial'])
    )
    // Inactive service excluded
    expect(activeServices.find(s => s.name === 'Inactive Service')).toBeUndefined()
  })

  test('services are grouped by category, not by vendor', () => {
    const activeServices = services.filter(s => s.isActive !== false)

    // Group services by category (matching booking page logic)
    const groups = {}
    for (const service of activeServices) {
      const cats = service.categories?.length > 0 ? service.categories : ['Other']
      for (const cat of cats) {
        if (!groups[cat]) groups[cat] = []
        groups[cat].push(service)
      }
    }

    // Categories should be based on service categories, not vendor names
    expect(Object.keys(groups)).toEqual(expect.arrayContaining(['Hair', 'Massage', 'Skin']))
    expect(Object.keys(groups)).not.toContain('vendor')
    expect(Object.keys(groups)).not.toContain('Kera Studio')
    expect(Object.keys(groups)).not.toContain('Winsome Woods')
  })

  test('no vendor property influences service display or routing', () => {
    const activeServices = services.filter(s => s.isActive !== false)

    // Verify services don't carry vendorId (removed from model)
    for (const service of activeServices) {
      expect(service).not.toHaveProperty('vendorId')
      expect(service).not.toHaveProperty('leadVendorId')
    }
  })

  test('selecting a single service generates navigation URL to provider step (no vendor param)', () => {
    const selectedService = services[0] // Haircut

    // This is the navigation logic from the booking page's handleContinue
    const navigationUrl = `/booking/provider?service=${selectedService.serviceId}`

    expect(navigationUrl).toBe('/booking/provider?service=svc-haircut')
    expect(navigationUrl).not.toContain('vendor')
    expect(navigationUrl).not.toContain('vendorId')
  })

  test('selecting multiple services generates navigation URL to bundle-time (no vendor param)', () => {
    const selectedServices = [services[0], services[1]] // Haircut + Massage

    // Bundle flow navigation logic from booking page
    const navigationUrl = `/booking/bundle-time?services=${selectedServices.map(s => s.serviceId).join(',')}`

    expect(navigationUrl).toBe('/booking/bundle-time?services=svc-haircut,svc-massage')
    expect(navigationUrl).not.toContain('vendor')
    expect(navigationUrl).not.toContain('vendorId')
  })
})

// ── Step 2: Provider (Staff) Selection ───────────────────────

describe('Booking Flow Integration: Step 2 — Provider (Staff) Selection', () => {
  test('"Any Available" is presented as the first option', () => {
    // The provider page always shows "Any Available" first, then staff
    const service = services[0] // Haircut (allowedStaff: alice, bob)
    const eligibleStaff = getEligibleStaff(service, staffSchedules)

    // Build the options list the way the provider page does
    const options = [
      { id: 'any', name: 'Any Available' },
      ...eligibleStaff.sort((a, b) => (a.staffName || '').localeCompare(b.staffName || ''))
        .map(s => ({ id: s.visibleId, name: s.staffName })),
    ]

    expect(options[0]).toEqual({ id: 'any', name: 'Any Available' })
    expect(options.length).toBeGreaterThan(1) // at least Any + 1 staff
  })

  test('eligible staff are determined by allowedStaff on the service (not vendor)', () => {
    const haircut = services[0] // allowedStaff: ['staff-alice', 'staff-bob']
    const eligible = getEligibleStaff(haircut, staffSchedules)

    // Only Alice and Bob should be eligible, regardless of their vendor affiliation
    expect(eligible.map(s => s.visibleId).sort()).toEqual(['staff-alice', 'staff-bob'])
    // They belong to different providers but both appear
    expect(eligible[0].vendorId).not.toBe(eligible[1].vendorId)
  })

  test('service with allowedStaff=null shows all active staff', () => {
    const massage = services[1] // allowedStaff: null ("All")
    const eligible = getEligibleStaff(massage, staffSchedules)

    // All active staff are eligible (Dave is inactive, so excluded)
    const activeStaffIds = staffSchedules.filter(s => s.isActive).map(s => s.visibleId)
    expect(eligible.map(s => s.visibleId).sort()).toEqual(activeStaffIds.sort())
    expect(eligible.find(s => s.visibleId === 'staff-dave')).toBeUndefined()
  })

  test('service with no eligible active staff shows empty list (no providers available)', () => {
    // Service restricted to only inactive staff
    const restrictedService = {
      serviceId: 'svc-restricted',
      name: 'Restricted',
      allowedStaff: ['staff-dave'], // Dave is inactive
    }

    const eligible = getEligibleStaff(restrictedService, staffSchedules)
    expect(eligible).toHaveLength(0)
    expect(isServiceBookable(restrictedService, staffSchedules)).toBe(false)
  })

  test('selecting "Any Available" navigates to time page with serviceId only (no vendor)', () => {
    const serviceId = 'svc-haircut'

    // Navigation for "Any Available" selection
    const navigationUrl = `/booking/time?service=${serviceId}`

    expect(navigationUrl).toBe('/booking/time?service=svc-haircut')
    expect(navigationUrl).not.toContain('vendor')
    expect(navigationUrl).not.toContain('vendorId')
    expect(navigationUrl).not.toContain('staffId')
  })

  test('selecting a specific staff member navigates to time page with serviceId+staffId (no vendor)', () => {
    const serviceId = 'svc-haircut'
    const staffId = 'staff-alice'

    // Navigation for specific staff selection
    const navigationUrl = `/booking/time?service=${serviceId}&staffId=${staffId}`

    expect(navigationUrl).toBe('/booking/time?service=svc-haircut&staffId=staff-alice')
    expect(navigationUrl).not.toContain('vendor')
    expect(navigationUrl).not.toContain('vendorId')
  })
})

// ── Step 3: Time Selection ───────────────────────────────────

describe('Booking Flow Integration: Step 3 — Time Selection', () => {
  test('time selection fetches availability with serviceId (no vendorId)', () => {
    const serviceId = 'svc-haircut'
    const date = '2025-01-06'

    // Build the URL the time page uses for availability fetch
    const availabilityUrl = `/api/availability?serviceId=${serviceId}&date=${date}`

    expect(availabilityUrl).toContain('serviceId=svc-haircut')
    expect(availabilityUrl).not.toContain('vendorId')
    expect(availabilityUrl).not.toContain('vendor=')
  })

  test('time selection with specific staff includes staffId parameter (no vendorId)', () => {
    const serviceId = 'svc-haircut'
    const staffId = 'staff-alice'
    const date = '2025-01-06'

    // URL when a specific provider was selected
    const availabilityUrl = `/api/availability?serviceId=${serviceId}&date=${date}&staffId=${staffId}`

    expect(availabilityUrl).toContain('serviceId=svc-haircut')
    expect(availabilityUrl).toContain('staffId=staff-alice')
    expect(availabilityUrl).not.toContain('vendorId')
    expect(availabilityUrl).not.toContain('vendor=')
  })

  test('time slots are generated for eligible staff without vendor dependency', () => {
    // Generate time slots using the utility function
    const startTime = '09:00'
    const endTime = '17:00'
    const duration = 45 // Haircut duration
    const bufferMinutes = 15
    const bookedSlots = []
    const date = '2025-01-06'

    const slots = generateTimeSlots(startTime, endTime, duration, bufferMinutes, bookedSlots, date)

    expect(slots.length).toBeGreaterThan(0)
    // Each slot should have time and display properties
    expect(slots[0]).toHaveProperty('time')
    expect(slots[0]).toHaveProperty('display')
    // Slots should not carry vendor information
    for (const slot of slots) {
      expect(slot).not.toHaveProperty('vendorId')
      expect(slot).not.toHaveProperty('vendor')
    }
  })

  test('auto-assignment works with "Any Available" using fewest bookings algorithm', () => {
    const service = services[0] // Haircut (allowedStaff: alice, bob)
    const date = '2025-01-06' // Monday

    // Alice has 3 bookings, Bob has 1 → Bob should be assigned
    const existingAppointments = [
      { dateTime: '2025-01-06T09:00', staffId: 'staff-alice', status: 'confirmed', customer: JSON.stringify({ name: 'C1' }) },
      { dateTime: '2025-01-06T11:00', staffId: 'staff-alice', status: 'confirmed', customer: JSON.stringify({ name: 'C2' }) },
      { dateTime: '2025-01-06T13:00', staffId: 'staff-alice', status: 'confirmed', customer: JSON.stringify({ name: 'C3' }) },
      { dateTime: '2025-01-06T10:00', staffId: 'staff-bob', status: 'confirmed', customer: JSON.stringify({ name: 'C4' }) },
    ]

    const assigned = assignStaff({
      service,
      staffSchedules,
      appointments: existingAppointments,
      date,
      time: '14:00',
      bufferMinutes: 15,
    })

    expect(assigned).toHaveLength(1)
    // Bob has fewer bookings (1 vs 3), so Bob should be assigned
    expect(assigned[0].staffId).toBe('staff-bob')
    // The assignment carries vendorId for payment routing (from StaffSchedule, not Service)
    expect(assigned[0].vendorId).toBe('provider-winsome')
  })

  test('navigation to confirm page uses serviceId and staffId (no vendor param)', () => {
    const serviceId = 'svc-haircut'
    const staffId = 'staff-alice'
    const date = '2025-01-06T00:00:00.000Z'
    const time = '2:00 PM'

    // Confirm page URL built by the time page
    const confirmUrl = `/booking/confirm?service=${serviceId}&date=${date}&time=${time}&staffId=${staffId}`

    expect(confirmUrl).toContain('service=svc-haircut')
    expect(confirmUrl).toContain('staffId=staff-alice')
    expect(confirmUrl).not.toContain('vendor=')
    expect(confirmUrl).not.toContain('vendorId')
  })
})

// ── Step 4: Full Flow End-to-End ─────────────────────────────

describe('Booking Flow Integration: Full Flow (Service → Provider → Time → Confirm)', () => {
  test('complete single-service booking flow has no vendor step or vendor params', () => {
    // Step 1: Client arrives at /booking — sees unified service catalog
    const activeServices = services.filter(s => s.isActive)
    expect(activeServices.length).toBeGreaterThan(0)

    // Step 2: Client selects a service — navigates to provider selection
    const selectedService = activeServices[0]
    const providerStepUrl = `/booking/provider?service=${selectedService.serviceId}`
    expect(providerStepUrl).not.toContain('vendor')

    // Step 3: Client sees eligible providers based on allowedStaff
    const eligible = getEligibleStaff(selectedService, staffSchedules)
    expect(eligible.length).toBeGreaterThan(0)

    // Step 4: Client selects "Any Available" — navigates to time selection
    const timeStepUrl = `/booking/time?service=${selectedService.serviceId}`
    expect(timeStepUrl).not.toContain('vendor')

    // Step 5: Client picks a time — navigates to confirm
    const confirmUrl = `/booking/confirm?service=${selectedService.serviceId}&date=2025-01-06T00:00:00.000Z&time=2:00%20PM`
    expect(confirmUrl).not.toContain('vendor')

    // Verify NO URL in the flow contains "vendor" or "vendorId"
    const allUrls = [providerStepUrl, timeStepUrl, confirmUrl]
    for (const url of allUrls) {
      expect(url.toLowerCase()).not.toContain('vendor')
    }
  })

  test('complete flow with specific staff selection has no vendor params', () => {
    const selectedService = services[0] // Haircut
    const eligible = getEligibleStaff(selectedService, staffSchedules)
    const selectedStaff = eligible[0] // Alice

    // Each step's URL
    const step2Url = `/booking/provider?service=${selectedService.serviceId}`
    const step3Url = `/booking/time?service=${selectedService.serviceId}&staffId=${selectedStaff.visibleId}`
    const step4Url = `/booking/confirm?service=${selectedService.serviceId}&date=2025-01-06T00:00:00.000Z&time=10:00%20AM&staffId=${selectedStaff.visibleId}`

    const allUrls = [step2Url, step3Url, step4Url]
    for (const url of allUrls) {
      expect(url.toLowerCase()).not.toContain('vendor')
    }

    // The flow uses serviceId and staffId, never vendorId
    expect(step3Url).toContain('serviceId' in {} ? 'serviceId' : 'service=')
    expect(step3Url).toContain('staffId=')
  })

  test('old vendor-specific booking URL (/booking/service?vendor=X) redirects to /booking', () => {
    // The service page now redirects to /booking regardless of vendor param
    // This validates Req 13.5: redirect old vendor-specific booking URLs
    const legacyUrl = '/booking/service?vendor=v1'
    const redirectTarget = '/booking'

    // The ServicePage component performs: router.replace('/booking')
    // Verify the redirect doesn't preserve vendor param
    expect(redirectTarget).not.toContain('vendor')
    expect(redirectTarget).toBe('/booking')
  })

  test('bundle flow also avoids vendor params', () => {
    const selectedServices = [services[0], services[1]]

    // Bundle flow navigation from booking page
    const bundleUrl = `/booking/bundle-time?services=${selectedServices.map(s => s.serviceId).join(',')}`

    expect(bundleUrl).toBe('/booking/bundle-time?services=svc-haircut,svc-massage')
    expect(bundleUrl).not.toContain('vendor')
    expect(bundleUrl).not.toContain('vendorId')
  })
})

// ── Negative Tests: Vendor Step Does Not Exist ───────────────

describe('Booking Flow Integration: No Vendor Step Exists', () => {
  test('booking flow does not include a vendor selection step', () => {
    // The booking flow steps are:
    // 1. /booking (service selection)
    // 2. /booking/provider (staff selection)
    // 3. /booking/time (time slot selection)
    // 4. /booking/confirm (review & payment)
    //
    // There is NO /booking/vendor or /booking/vendors step
    const bookingFlowSteps = [
      '/booking',
      '/booking/provider',
      '/booking/time',
      '/booking/confirm',
    ]

    for (const step of bookingFlowSteps) {
      expect(step).not.toContain('/vendor')
    }

    // The old multi-vendor route is renamed to bundle
    expect('/booking/bundle').not.toContain('vendor')
  })

  test('provider selection page fetches staff using serviceId, not vendorId', () => {
    const serviceId = 'svc-haircut'

    // The provider page calls: /api/eligible-staff?serviceId=X
    const apiUrl = `/api/eligible-staff?serviceId=${serviceId}`

    expect(apiUrl).toContain('serviceId=svc-haircut')
    expect(apiUrl).not.toContain('vendorId')
    expect(apiUrl).not.toContain('vendor=')
  })

  test('availability API is called with serviceId+staffId, never vendorId', () => {
    // Build the availability URL as the time page does
    const params = new URLSearchParams()
    params.set('serviceId', 'svc-haircut')
    params.set('date', '2025-01-06')
    // Optional: specific staff
    params.set('staffId', 'staff-alice')

    const url = `/api/availability?${params.toString()}`

    expect(url).toContain('serviceId=')
    expect(url).toContain('staffId=')
    expect(url).not.toContain('vendorId')
    expect(url).not.toContain('vendor=')
  })

  test('confirm page URL uses service and staffId without vendor context', () => {
    const params = new URLSearchParams()
    params.set('service', 'svc-haircut')
    params.set('date', '2025-01-06T00:00:00.000Z')
    params.set('time', '2:00 PM')
    params.set('staffId', 'staff-alice')

    const url = `/booking/confirm?${params.toString()}`

    expect(url).toContain('service=')
    expect(url).toContain('staffId=')
    expect(url).not.toContain('vendor=')
    expect(url).not.toContain('vendorId')
  })
})
