import React from 'react'
import { render, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'

/**
 * Regression test for multi-select ("bundle") booking showing NO available dates.
 *
 * Root cause: the bundle-time page compared calendar days against the backend's
 * available-dates list using `date.toISOString().split('T')[0]`, which converts
 * to UTC. In timezones behind UTC that shifts the calendar day back by one, so
 * `availableDates.has(...)` never matched and every day rendered as unavailable.
 *
 * The fix formats the date in LOCAL time (matching the backend's date strings).
 * This test captures the DatePicker's `filterDate`/`dayClassName` props and
 * invokes them with a real Date, asserting a locally-available date is selectable.
 * With the old UTC logic these assertions fail for negative-offset timezones.
 */

// Capture the props react-datepicker is rendered with so we can invoke
// filterDate / dayClassName directly.
let capturedDatePickerProps = null
jest.mock('react-datepicker', () => {
  return (props) => {
    capturedDatePickerProps = props
    return <div data-testid="datepicker">Mock DatePicker</div>
  }
})
jest.mock('react-datepicker/dist/react-datepicker.css', () => ({}))

let searchParams = new URLSearchParams()
jest.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}))

jest.mock('next/link', () => {
  return ({ children, href, className }) => <a href={href} className={className}>{children}</a>
})

jest.mock('../../app/components/BookingDisabled', () => {
  const component = () => <div data-testid="booking-disabled">Booking Disabled</div>
  component.isBookingEnabled = true
  return { __esModule: true, default: component, isBookingEnabled: true }
})

// The available date returned by the backend, expressed as a local YYYY-MM-DD.
const AVAILABLE_DATE_KEY = '2026-09-16'

const mockResponses = {
  '/api/services': {
    services: [
      { serviceId: 's1', name: 'Service One', duration: 60, price: 100, isActive: true },
      { serviceId: 's2', name: 'Service Two', duration: 30, price: 50, isActive: true },
    ],
  },
  '/api/bundles': { bundles: [] },
  '/api/available-dates': { availableDates: [AVAILABLE_DATE_KEY] },
  '/api/bundle-availability': { availableSlots: [] },
}

beforeEach(() => {
  capturedDatePickerProps = null
  // Two individually-selected services (no bundleId) -> multi-select path.
  searchParams = new URLSearchParams()
  searchParams.set('services', 's1,s2')

  global.fetch = jest.fn((url) => {
    for (const [path, response] of Object.entries(mockResponses)) {
      if (url.startsWith(path)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(response) })
      }
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
})

afterEach(() => jest.restoreAllMocks())

import BundleTimePage from '../../app/booking/bundle-time/page.jsx'

// Build a local Date for the available date key (no UTC involved).
function localDateFromKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0) // noon local to avoid DST edge weirdness
}

describe('Bundle/multi-select available dates (timezone regression)', () => {
  test('requests available dates via serviceIds for multi-select', async () => {
    render(<BundleTimePage />)
    await waitFor(() => {
      const calledUrls = global.fetch.mock.calls.map((c) => c[0])
      expect(
        calledUrls.some(
          (u) => u.startsWith('/api/available-dates') && u.includes('serviceIds=s1,s2')
        )
      ).toBe(true)
    })
  })

  test('a locally-available date is selectable in the calendar', async () => {
    render(<BundleTimePage />)

    // Wait until the datepicker has been given its filter function AND the
    // availableDates fetch has resolved into state (props update on re-render).
    await waitFor(() => {
      expect(capturedDatePickerProps).not.toBeNull()
      expect(typeof capturedDatePickerProps.filterDate).toBe('function')
    })

    const availableDate = localDateFromKey(AVAILABLE_DATE_KEY)

    await waitFor(() => {
      // filterDate must return true for the locally-available date.
      // With the old UTC-based comparison this is false in timezones behind UTC.
      expect(capturedDatePickerProps.filterDate(availableDate)).toBe(true)
    })
  })

  test('a locally-available date is not marked as an unavailable day', async () => {
    render(<BundleTimePage />)

    await waitFor(() => {
      expect(capturedDatePickerProps).not.toBeNull()
      expect(typeof capturedDatePickerProps.dayClassName).toBe('function')
    })

    const availableDate = localDateFromKey(AVAILABLE_DATE_KEY)

    await waitFor(() => {
      expect(capturedDatePickerProps.dayClassName(availableDate)).not.toBe('unavailable-day')
    })

    // A date NOT in the available set should be marked unavailable.
    const otherDate = localDateFromKey('2026-09-17')
    expect(capturedDatePickerProps.dayClassName(otherDate)).toBe('unavailable-day')
  })

  test('selecting a day requests times for that SAME local day (not UTC-shifted)', async () => {
    render(<BundleTimePage />)

    await waitFor(() => {
      expect(capturedDatePickerProps).not.toBeNull()
      expect(typeof capturedDatePickerProps.onChange).toBe('function')
    })

    // Simulate the user clicking the locally-available day on the calendar.
    const availableDate = localDateFromKey(AVAILABLE_DATE_KEY)
    await act(async () => {
      capturedDatePickerProps.onChange(availableDate)
    })

    // The times request must ask about the SAME local date the user clicked.
    // The old code used selectedDate.toISOString().split('T')[0], which in
    // timezones behind UTC asks about the previous day -> "no time slots".
    await waitFor(() => {
      const calledUrls = global.fetch.mock.calls.map((c) => c[0])
      const bundleAvailCall = calledUrls.find((u) => u.startsWith('/api/bundle-availability'))
      expect(bundleAvailCall).toBeDefined()
      expect(bundleAvailCall).toContain(`date=${AVAILABLE_DATE_KEY}`)
      // Guard against the previous-day UTC shift specifically.
      expect(bundleAvailCall).not.toContain('date=2026-09-15')
    })
  })
})
