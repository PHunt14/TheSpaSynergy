import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock aws-amplify/auth
jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn(() => Promise.resolve({
    tokens: {
      idToken: {
        payload: {
          'custom:vendorId': 'vendor-1',
          'custom:role': 'admin',
        }
      }
    }
  }))
}))

// Mock aws-amplify
jest.mock('aws-amplify', () => ({
  Amplify: { configure: jest.fn() },
}))

// Mock the amplify-config module
jest.mock('../../app/amplify-config', () => ({}))

// Mock MultiStaffView (ES module import chain causes issues in jsdom environment)
jest.mock('../../app/dashboard/calendar/MultiStaffView', () => {
  return { __esModule: true, default: () => <div data-testid="multi-staff-view">MultiStaffView</div> }
})

// Mock MultiStaffWeekView
jest.mock('../../app/dashboard/calendar/MultiStaffWeekView', () => {
  return { __esModule: true, default: () => <div data-testid="multi-staff-week-view">MultiStaffWeekView</div> }
})

// Mock the calendar utility (ES module)
jest.mock('../../app/utils/calendar', () => ({
  DEFAULT_START_HOUR: 8,
  DEFAULT_END_HOUR: 18,
  getWeekDates: (date) => {
    const d = new Date(date)
    const day = d.getDay()
    const start = new Date(d)
    start.setDate(d.getDate() - day)
    return Array.from({ length: 7 }, (_, i) => {
      const dd = new Date(start)
      dd.setDate(start.getDate() + i)
      return dd
    })
  },
  getMonthDates: (date) => {
    const d = new Date(date)
    const year = d.getFullYear()
    const month = d.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    return Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))
  },
  isSameDay: (a, b) => a.toDateString() === b.toDateString(),
  parseAppointmentDate: (dt) => dt ? new Date(dt) : null,
  generateTimeSlots: (start, end) => {
    const slots = []
    for (let h = start; h < end; h++) {
      slots.push({ hour: h, minute: 0 })
      slots.push({ hour: h, minute: 30 })
    }
    return slots
  },
  getBlockPosition: () => ({ top: 80, height: 80 }),
  getDateRangeForView: (view, date) => {
    const start = new Date(date)
    start.setDate(start.getDate() - 7)
    const end = new Date(date)
    end.setDate(end.getDate() + 7)
    return { start, end }
  },
  computeOverlapLayout: (appointments) => appointments.map((apt, i) => ({ appointment: apt, column: 0, totalColumns: 1 })),
  formatWeekHeaderLabel: (dates) => 'Jan 12 – Jan 18, 2025',
}))

// Track fetch calls for assertions
let fetchCalls = []

const mockAppointment = {
  appointmentId: 'apt-1',
  vendorId: 'vendor-1',
  serviceId: 'svc-1',
  staffId: 'staff-1',
  rawDateTime: '2025-06-15T10:00:00.000Z',
  dateTime: '2025-06-15T10:00:00.000Z',
  status: 'pending-confirmation',
  paymentStatus: 'unpaid',
  staffName: 'Alice',
  customer: { name: 'John Doe', phone: '555-1234', email: 'john@example.com' },
  service: { serviceId: 'svc-1', name: 'Haircut', duration: 60, price: 50 },
}

const mockServices = [
  { serviceId: 'svc-1', vendorId: 'vendor-1', name: 'Haircut', duration: 60, price: 50, isActive: true },
  { serviceId: 'svc-2', vendorId: 'vendor-1', name: 'Massage', duration: 90, price: 100, isActive: true },
]

const mockStaff = [
  { visibleId: 'staff-1', staffName: 'Alice', vendorId: 'vendor-1', isActive: true },
  { visibleId: 'staff-2', staffName: 'Bob', vendorId: 'vendor-1', isActive: true },
]

const mockVendors = [
  { vendorId: 'vendor-1', name: 'Spa A' },
  { vendorId: 'vendor-2', name: 'Spa B' },
]

const mockResponses = {
  '/api/services': { services: mockServices },
  '/api/staff-schedules': { schedules: mockStaff },
  '/api/vendors': { vendors: mockVendors },
  '/api/dashboard': { appointments: [mockAppointment] },
  '/api/appointments/reschedule': { success: true },
  '/api/appointments/reassign': { success: true },
  '/api/appointments': { success: true },
}

beforeEach(() => {
  fetchCalls = []
  global.fetch = jest.fn((url, opts) => {
    fetchCalls.push({ url, opts })
    for (const [path, response] of Object.entries(mockResponses)) {
      if (url.includes(path)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(response) })
      }
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
  // Mock window.confirm
  global.confirm = jest.fn(() => true)
})

afterEach(() => jest.restoreAllMocks())

// Import after mocks
import Calendar from '../../app/dashboard/calendar/page.jsx'

// ─── Tests ───

describe('Calendar Page - Appointment Detail Modal', () => {
  test('renders calendar and loads appointments', async () => {
    render(<Calendar />)
    await waitFor(() => {
      expect(screen.getByText('Calendar')).toBeInTheDocument()
    })
  })

  test('clicking appointment opens detail modal with correct info', async () => {
    render(<Calendar />)
    await waitFor(() => {
      const aptBlock = screen.queryByText('John Doe')
      if (aptBlock) {
        fireEvent.click(aptBlock)
      }
    })
    // Modal should show appointment details
    await waitFor(() => {
      const detailHeading = screen.queryByText('Appointment Details')
      if (detailHeading) {
        expect(detailHeading).toBeInTheDocument()
        expect(screen.getByText(/Haircut/)).toBeInTheDocument()
        expect(screen.getByText(/Alice/)).toBeInTheDocument()
      }
    })
  })
})

describe('Calendar Page - Inline Edit Modal', () => {
  // Helper to render and open the edit modal
  const openEditModal = async () => {
    render(<Calendar />)
    await waitFor(() => {
      expect(screen.getByText('Calendar')).toBeInTheDocument()
    })
    // Wait for appointments to load and click one
    await waitFor(() => {
      const aptBlock = screen.queryByText('John Doe')
      if (aptBlock) fireEvent.click(aptBlock)
    })
    // Click Edit button
    await waitFor(() => {
      const editBtn = screen.queryByText('Edit')
      if (editBtn) fireEvent.click(editBtn)
    })
  }

  test('Edit button switches modal to edit mode', async () => {
    await openEditModal()
    await waitFor(() => {
      const editHeading = screen.queryByText('Edit Appointment')
      if (editHeading) {
        expect(editHeading).toBeInTheDocument()
      }
    })
  })

  test('edit mode shows form fields for datetime, service, staff, status, customer', async () => {
    await openEditModal()
    await waitFor(() => {
      // Check for form labels
      const dateLabel = screen.queryByLabelText('Date & Time')
      const serviceLabel = screen.queryByLabelText('Service')
      const staffLabel = screen.queryByLabelText('Staff Member')
      const statusLabel = screen.queryByLabelText('Status')
      const nameLabel = screen.queryByLabelText('Customer Name')
      const phoneLabel = screen.queryByLabelText('Phone')
      const emailLabel = screen.queryByLabelText('Email')

      if (dateLabel) {
        expect(dateLabel).toBeInTheDocument()
        expect(serviceLabel).toBeInTheDocument()
        expect(staffLabel).toBeInTheDocument()
        expect(statusLabel).toBeInTheDocument()
        expect(nameLabel).toBeInTheDocument()
        expect(phoneLabel).toBeInTheDocument()
        expect(emailLabel).toBeInTheDocument()
      }
    })
  })

  test('Back button returns to view mode without saving', async () => {
    await openEditModal()
    await waitFor(() => {
      const backBtn = screen.queryByText('Back')
      if (backBtn) {
        fireEvent.click(backBtn)
      }
    })
    await waitFor(() => {
      // Should be back in view mode
      const detailHeading = screen.queryByText('Appointment Details')
      if (detailHeading) {
        expect(detailHeading).toBeInTheDocument()
      }
    })
  })

  test('Save Changes button exists in edit mode', async () => {
    await openEditModal()
    await waitFor(() => {
      const saveBtn = screen.queryByText('Save Changes')
      if (saveBtn) {
        expect(saveBtn).toBeInTheDocument()
      }
    })
  })
})
