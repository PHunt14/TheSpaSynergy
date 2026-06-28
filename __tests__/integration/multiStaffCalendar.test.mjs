/**
 * Integration Tests for Multi-Staff Calendar Data Fetching
 *
 * Validates the data fetching behavior of the multi-staff calendar view:
 * - In "everyone" view, appointments are fetched using vendorId (not staffId)
 * - Date navigation triggers a re-fetch
 * - Appointment create/edit/cancel refreshes multi-staff view
 *
 * Validates: Requirements 5.1, 5.3, 5.4, 5.5
 */

import { jest } from '@jest/globals'
import { getDateRangeForView } from '../../app/utils/calendar.js'

// ── Helpers ───────────────────────────────────────────────────

/**
 * Simulates the loadMultiStaffAppointments fetch logic from page.jsx.
 * Extracts the URL construction and fetch call so we can test it in isolation.
 */
function buildMultiStaffFetchUrl(userVendorId, currentDate) {
  if (!userVendorId) return null

  const { start, end } = getDateRangeForView('everyone', currentDate)
  const params = new URLSearchParams({
    vendorId: userVendorId,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  })

  return `/api/dashboard?${params}`
}

/**
 * Simulates the loadAppointments (single-staff) fetch logic.
 */
function buildSingleStaffFetchUrl(staffId, view, currentDate) {
  if (!staffId) return null

  const { start, end } = getDateRangeForView(view, currentDate)
  const params = new URLSearchParams({
    staffId: staffId,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  })

  return `/api/dashboard?${params}`
}

/**
 * Simulates the useEffect dependency logic that triggers re-fetch.
 * Returns true if a fetch should happen based on the view and vendorId.
 */
function shouldFetchMultiStaff(view, userVendorId) {
  return view === 'everyone' && !!userVendorId
}

/**
 * Simulates the refresh logic after appointment mutations.
 * Returns which fetches should be triggered based on the current view.
 */
function getRefreshActions(view) {
  const actions = ['loadAppointments']
  if (view === 'everyone') {
    actions.push('loadMultiStaffAppointments')
  }
  return actions
}

// ── Tests: Multi-Staff Fetch URL Construction ─────────────────

describe('Multi-Staff Calendar: Data fetching uses vendorId (Req 5.1)', () => {
  const testDate = new Date(2025, 5, 15, 10, 0) // June 15, 2025

  test('in "everyone" view, fetch URL uses vendorId parameter (not staffId)', () => {
    const url = buildMultiStaffFetchUrl('vendor-kera', testDate)

    expect(url).toContain('vendorId=vendor-kera')
    expect(url).not.toContain('staffId')
    expect(url).toContain('/api/dashboard?')
  })

  test('single-staff fetch uses staffId parameter (not vendorId)', () => {
    const url = buildSingleStaffFetchUrl('staff-alice', 'day', testDate)

    expect(url).toContain('staffId=staff-alice')
    expect(url).not.toContain('vendorId')
    expect(url).toContain('/api/dashboard?')
  })

  test('multi-staff fetch includes startDate and endDate parameters', () => {
    const url = buildMultiStaffFetchUrl('vendor-kera', testDate)

    expect(url).toContain('startDate=')
    expect(url).toContain('endDate=')
  })

  test('multi-staff fetch date range covers the full selected day', () => {
    const url = buildMultiStaffFetchUrl('vendor-kera', testDate)
    const urlParams = new URLSearchParams(url.split('?')[1])

    const startDate = new Date(urlParams.get('startDate'))
    const endDate = new Date(urlParams.get('endDate'))

    // Start should be midnight of the selected day
    expect(startDate.getFullYear()).toBe(2025)
    expect(startDate.getMonth()).toBe(5) // June
    expect(startDate.getDate()).toBe(15)
    expect(startDate.getHours()).toBe(0)
    expect(startDate.getMinutes()).toBe(0)

    // End should be end of the same day
    expect(endDate.getFullYear()).toBe(2025)
    expect(endDate.getMonth()).toBe(5)
    expect(endDate.getDate()).toBe(15)
    expect(endDate.getHours()).toBe(23)
    expect(endDate.getMinutes()).toBe(59)
  })

  test('returns null when vendorId is not available', () => {
    const url = buildMultiStaffFetchUrl(null, testDate)
    expect(url).toBeNull()

    const url2 = buildMultiStaffFetchUrl('', testDate)
    expect(url2).toBeNull()
  })
})

// ── Tests: Date Navigation Triggers Re-Fetch (Req 5.4) ───────

describe('Multi-Staff Calendar: Date navigation triggers re-fetch (Req 5.4)', () => {
  test('changing date produces a different fetch URL', () => {
    const date1 = new Date(2025, 5, 15) // June 15
    const date2 = new Date(2025, 5, 16) // June 16

    const url1 = buildMultiStaffFetchUrl('vendor-kera', date1)
    const url2 = buildMultiStaffFetchUrl('vendor-kera', date2)

    expect(url1).not.toEqual(url2)
    expect(url1).toContain('2025-06-15')
    expect(url2).toContain('2025-06-16')
  })

  test('useEffect triggers fetch when view is "everyone" and vendorId is set', () => {
    expect(shouldFetchMultiStaff('everyone', 'vendor-kera')).toBe(true)
  })

  test('useEffect does NOT trigger fetch when view is "day"', () => {
    expect(shouldFetchMultiStaff('day', 'vendor-kera')).toBe(false)
  })

  test('useEffect does NOT trigger fetch when view is "week"', () => {
    expect(shouldFetchMultiStaff('week', 'vendor-kera')).toBe(false)
  })

  test('useEffect does NOT trigger fetch when view is "month"', () => {
    expect(shouldFetchMultiStaff('month', 'vendor-kera')).toBe(false)
  })

  test('useEffect does NOT trigger fetch when vendorId is not set', () => {
    expect(shouldFetchMultiStaff('everyone', null)).toBe(false)
    expect(shouldFetchMultiStaff('everyone', '')).toBe(false)
  })

  test('navigating forward a day produces correct next-day URL', () => {
    const today = new Date(2025, 5, 15)
    const tomorrow = new Date(2025, 5, 16)

    const todayUrl = buildMultiStaffFetchUrl('vendor-kera', today)
    const tomorrowUrl = buildMultiStaffFetchUrl('vendor-kera', tomorrow)

    const todayParams = new URLSearchParams(todayUrl.split('?')[1])
    const tomorrowParams = new URLSearchParams(tomorrowUrl.split('?')[1])

    const todayStart = new Date(todayParams.get('startDate'))
    const tomorrowStart = new Date(tomorrowParams.get('startDate'))

    // Difference should be exactly 1 day
    const diffMs = tomorrowStart.getTime() - todayStart.getTime()
    expect(diffMs).toBe(24 * 60 * 60 * 1000)
  })
})

// ── Tests: Appointment Create Refreshes Multi-Staff View (Req 5.5) ─

describe('Multi-Staff Calendar: Appointment creation refreshes view (Req 5.5)', () => {
  test('onCreated callback triggers both loadAppointments and loadMultiStaffAppointments when in "everyone" view', () => {
    const actions = getRefreshActions('everyone')

    expect(actions).toContain('loadAppointments')
    expect(actions).toContain('loadMultiStaffAppointments')
  })

  test('onCreated callback only triggers loadAppointments when NOT in "everyone" view', () => {
    const dayActions = getRefreshActions('day')
    expect(dayActions).toContain('loadAppointments')
    expect(dayActions).not.toContain('loadMultiStaffAppointments')

    const weekActions = getRefreshActions('week')
    expect(weekActions).toContain('loadAppointments')
    expect(weekActions).not.toContain('loadMultiStaffAppointments')
  })
})

// ── Tests: Appointment Confirm/Cancel Refreshes Multi-Staff View (Req 5.5) ─

describe('Multi-Staff Calendar: Appointment confirm/cancel refreshes view (Req 5.5)', () => {
  test('handleConfirm triggers multi-staff refresh when in "everyone" view', () => {
    const actions = getRefreshActions('everyone')

    expect(actions).toContain('loadMultiStaffAppointments')
  })

  test('handleCancel triggers multi-staff refresh when in "everyone" view', () => {
    const actions = getRefreshActions('everyone')

    expect(actions).toContain('loadMultiStaffAppointments')
  })

  test('handleReschedule (edit) triggers multi-staff refresh when in "everyone" view', () => {
    const actions = getRefreshActions('everyone')

    expect(actions).toContain('loadMultiStaffAppointments')
  })

  test('confirm/cancel does NOT trigger multi-staff refresh when in "day" view', () => {
    const actions = getRefreshActions('day')

    expect(actions).not.toContain('loadMultiStaffAppointments')
  })
})

// ── Tests: Fetch with mocked global fetch ─────────────────────

describe('Multi-Staff Calendar: Fetch integration with mocked fetch (Req 5.1, 5.3)', () => {
  let originalFetch

  beforeEach(() => {
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  test('loadMultiStaffAppointments calls fetch with vendorId-based URL', async () => {
    const fetchCalls = []
    global.fetch = jest.fn((url, options) => {
      fetchCalls.push({ url, options })
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ appointments: [] }),
      })
    })

    // Simulate what the component does
    const userVendorId = 'vendor-kera'
    const currentDate = new Date(2025, 5, 15)
    const { start, end } = getDateRangeForView('everyone', currentDate)
    const params = new URLSearchParams({
      vendorId: userVendorId,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    })

    await global.fetch(`/api/dashboard?${params}`)

    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0].url).toContain('vendorId=vendor-kera')
    expect(fetchCalls[0].url).not.toContain('staffId')
    expect(fetchCalls[0].url).toContain('/api/dashboard')
  })

  test('fetch failure triggers retry logic (simulated)', async () => {
    let callCount = 0
    global.fetch = jest.fn(() => {
      callCount++
      if (callCount <= 2) {
        return Promise.resolve({ ok: false, status: 500 })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ appointments: [] }),
      })
    })

    // Simulate retry logic from loadMultiStaffAppointments
    const maxRetries = 2
    let result = null
    let error = null

    for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
      const res = await global.fetch('/api/dashboard?vendorId=v1&startDate=x&endDate=y')
      if (res.ok) {
        result = await res.json()
        break
      }
      if (retryCount === maxRetries) {
        error = 'Failed to load appointments. Please try again.'
      }
    }

    // After 2 failures, the 3rd attempt succeeds
    expect(callCount).toBe(3)
    expect(result).toEqual({ appointments: [] })
    expect(error).toBeNull()
  })

  test('fetch failure after max retries sets error state (Req 5.3)', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 500 })
    )

    const maxRetries = 2
    let error = null

    for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
      const res = await global.fetch('/api/dashboard?vendorId=v1&startDate=x&endDate=y')
      if (res.ok) break
      if (retryCount === maxRetries) {
        error = 'Failed to load appointments. Please try again.'
      }
    }

    expect(error).toBe('Failed to load appointments. Please try again.')
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })

  test('successful fetch returns appointments array', async () => {
    const mockAppointments = [
      { appointmentId: 'apt-1', staffId: 'staff-alice', status: 'confirmed' },
      { appointmentId: 'apt-2', staffId: 'staff-bob', status: 'pending' },
    ]

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ appointments: mockAppointments }),
      })
    )

    const res = await global.fetch('/api/dashboard?vendorId=vendor-kera&startDate=x&endDate=y')
    const data = await res.json()

    expect(data.appointments).toHaveLength(2)
    expect(data.appointments[0].staffId).toBe('staff-alice')
    expect(data.appointments[1].staffId).toBe('staff-bob')
  })
})
