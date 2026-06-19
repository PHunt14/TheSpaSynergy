import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock next/navigation
let searchParams = new URLSearchParams()
jest.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}))

jest.mock('next/link', () => {
  return ({ children, href, className }) => <a href={href} className={className}>{children}</a>
})

jest.mock('react-datepicker', () => {
  return (props) => <div data-testid="datepicker">Mock DatePicker</div>
})
jest.mock('react-datepicker/dist/react-datepicker.css', () => ({}))

jest.mock('../../app/utils/bundleDiscount', () => ({
  calculateBundlePrice: ({ services }) => ({
    subtotal: services.reduce((sum, s) => sum + (s.price || 0), 0),
    discountPercent: 0,
    discountAmount: 0,
    total: services.reduce((sum, s) => sum + (s.price || 0), 0),
  }),
  distributeDiscountAcrossVendors: () => [],
  validateBundleServices: () => ({ valid: true, error: null }),
}))

jest.mock('aws-amplify/analytics', () => ({ record: jest.fn() }))

jest.mock('../../app/components/BookingDisabled', () => {
  const component = () => <div data-testid="booking-disabled">Booking Disabled</div>
  component.isBookingEnabled = true
  return { __esModule: true, default: component, isBookingEnabled: true }
})

Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })

const mockResponses = {
  '/api/vendors': { vendors: [{ vendorId: 'v1', name: 'Test Vendor', phone: '555-1234', description: 'A test vendor' }] },
  '/api/providers': { providers: [{ vendorId: 'v1', name: 'Test Vendor', phone: '555-1234', description: 'A test vendor' }] },
  '/api/eligible-staff': { staff: [{ visibleId: 'staff-1', staffName: 'Test Vendor' }], serviceName: 'Test Service' },
  '/api/services': { services: [{ serviceId: 's1', name: 'Test Service', duration: 60, price: 100, categories: ['Wellness'], isActive: true }] },
  '/api/availability': { availableSlots: [{ time: '14:00', display: '2:00 PM' }] },
  '/api/available-dates': { availableDates: ['2025-07-15'] },
  '/api/bundles': { bundles: [{ bundleId: 'b1', name: 'Test Bundle', serviceIds: ['s1'], price: 200, description: 'A bundle' }] },
  '/api/staff-schedules': { schedule: null },
}

beforeEach(() => {
  searchParams = new URLSearchParams()
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

// ─── Imports (after mocks) ───

import BookingPage from '../../app/booking/page.jsx'
import ServicePage from '../../app/booking/service/page.jsx'
import ProviderPage from '../../app/booking/provider/page.jsx'
import TimePage from '../../app/booking/time/page.jsx'
import BundleTimePage from '../../app/booking/bundle-time/page.jsx'
import BundlePage from '../../app/booking/bundle/page.jsx'
import ConfirmPage from '../../app/booking/confirm/page.jsx'
import SuccessPage from '../../app/booking/success/page.jsx'

// ─── Tests ───

describe('Booking Page (/booking)', () => {
  test('renders without crashing', async () => {
    render(<BookingPage />)
    await waitFor(() => expect(screen.getByText('Book a Service')).toBeInTheDocument())
  })

  test('renders unified service catalog after fetch', async () => {
    render(<BookingPage />)
    await waitFor(() => expect(screen.getByText('Test Service')).toBeInTheDocument())
  })

  test('displays category filter with All selected by default', async () => {
    render(<BookingPage />)
    await waitFor(() => {
      const allButton = screen.getByRole('button', { name: 'All' })
      expect(allButton).toBeInTheDocument()
    })
  })

  test('groups services by category', async () => {
    render(<BookingPage />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Wellness' })).toBeInTheDocument())
  })
})

describe('Service Page (/booking/service)', () => {
  beforeEach(() => searchParams.set('vendor', 'v1'))

  test('renders and redirects to /booking', async () => {
    render(<ServicePage />)
    await waitFor(() => expect(screen.getByText('Redirecting to booking...')).toBeInTheDocument())
  })
})

describe('Provider Page (/booking/provider)', () => {
  beforeEach(() => searchParams.set('service', 's1'))

  test('renders without crashing', async () => {
    render(<ProviderPage />)
    await waitFor(() => expect(screen.getByText('Select a Provider')).toBeInTheDocument())
  })

  test('renders vendors after fetch', async () => {
    render(<ProviderPage />)
    await waitFor(() => expect(screen.getByText('Test Vendor')).toBeInTheDocument())
  })
})

describe('Time Page (/booking/time)', () => {
  beforeEach(() => {
    searchParams.set('vendor', 'v1')
    searchParams.set('service', 's1')
  })

  test('renders without crashing', async () => {
    render(<TimePage />)
    await waitFor(() => expect(screen.getByText('Select Date & Time')).toBeInTheDocument())
  })

  test('renders datepicker', async () => {
    render(<TimePage />)
    await waitFor(() => expect(screen.getByTestId('datepicker')).toBeInTheDocument())
  })

  test('renders time slots after fetch', async () => {
    render(<TimePage />)
    await waitFor(() => expect(screen.getByText('2:00 PM')).toBeInTheDocument())
  })
})

describe('Bundle Time Page (/booking/bundle-time)', () => {
  beforeEach(() => {
    searchParams.set('bundleId', 'b1')
    searchParams.set('services', 's1')
  })

  test('renders without crashing', async () => {
    render(<BundleTimePage />)
    await waitFor(() => expect(screen.getByText('Select Date & Time')).toBeInTheDocument())
  })

  test('renders datepicker', async () => {
    render(<BundleTimePage />)
    await waitFor(() => expect(screen.getByTestId('datepicker')).toBeInTheDocument())
  })
})

describe('Bundle Page (/booking/bundle)', () => {
  beforeEach(() => searchParams.set('id', 'b1'))

  test('renders without crashing', async () => {
    render(<BundlePage />)
    await waitFor(() => expect(screen.getByText('Test Bundle')).toBeInTheDocument())
  })

  test('renders included services', async () => {
    render(<BundlePage />)
    await waitFor(() => expect(screen.getByText('Included Services')).toBeInTheDocument())
  })
})

describe('Confirm Page (/booking/confirm)', () => {
  beforeEach(() => {
    searchParams.set('vendor', 'v1')
    searchParams.set('service', 's1')
    searchParams.set('date', '2025-07-15T00:00:00.000Z')
    searchParams.set('time', '2:00 PM')
  })

  test('renders without crashing', async () => {
    render(<ConfirmPage />)
    await waitFor(() => expect(screen.getByText('Review Booking')).toBeInTheDocument())
  })

  test('renders customer form fields', async () => {
    render(<ConfirmPage />)
    await waitFor(() => {
      expect(screen.getByText('Full Name *')).toBeInTheDocument()
      expect(screen.getByText('Email *')).toBeInTheDocument()
      expect(screen.getByText('Phone *')).toBeInTheDocument()
    })
  })
})

describe('Success Page (/booking/success)', () => {
  beforeEach(() => {
    searchParams.set('id', 'apt-123')
    searchParams.set('dateTime', '2025-07-15T14:00:00')
    searchParams.set('service', 'Test Service')
    searchParams.set('payment', 'in-person')
  })

  test('renders without crashing', async () => {
    render(<SuccessPage />)
    await waitFor(() => expect(screen.getByText('Booking Submitted!')).toBeInTheDocument())
  })

  test('renders appointment details', async () => {
    render(<SuccessPage />)
    await waitFor(() => {
      expect(screen.getByText('apt-123')).toBeInTheDocument()
      expect(screen.getByText(/Test Service/)).toBeInTheDocument()
    })
  })

  test('renders return home link', async () => {
    render(<SuccessPage />)
    const link = screen.getByRole('link', { name: /Return to Home/ })
    expect(link).toHaveAttribute('href', '/')
  })
})
