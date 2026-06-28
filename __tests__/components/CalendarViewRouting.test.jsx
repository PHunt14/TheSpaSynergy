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
          'custom:staffId': 'staff-1',
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

// Mock MultiStaffView to detect when it renders
jest.mock('../../app/dashboard/calendar/MultiStaffView', () => {
  return { __esModule: true, default: (props) => <div data-testid="multi-staff-view">MultiStaffView</div> }
})

// Mock MultiStaffWeekView to detect when it renders
jest.mock('../../app/dashboard/calendar/MultiStaffWeekView', () => {
  return { __esModule: true, default: (props) => <div data-testid="multi-staff-week-view">MultiStaffWeekView</div> }
})

// Mock the calendar utility
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
  computeOverlapLayout: (appointments) => appointments.map((apt) => ({ appointment: apt, column: 0, totalColumns: 1 })),
  formatWeekHeaderLabel: (dates) => 'Jan 12 – Jan 18, 2025',
}))

// ─── Test Data ───

const mockStaff = [
  { visibleId: 'staff-1', staffName: 'Alice', vendorId: 'vendor-1', isActive: true, schedule: null },
  { visibleId: 'staff-2', staffName: 'Bob', vendorId: 'vendor-1', isActive: true, schedule: null },
]

const mockVendors = [
  { vendorId: 'vendor-1', name: 'Spa A' },
]

const mockResponses = {
  '/api/services': { services: [] },
  '/api/staff-schedules': { schedules: mockStaff },
  '/api/vendors': { vendors: mockVendors },
  '/api/dashboard': { appointments: [] },
}

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    for (const [path, response] of Object.entries(mockResponses)) {
      if (url.includes(path)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(response) })
      }
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
  // Mock sessionStorage
  Object.defineProperty(window, 'sessionStorage', {
    value: {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
    },
    writable: true,
  })
})

afterEach(() => jest.restoreAllMocks())

// Import after mocks
import Calendar from '../../app/dashboard/calendar/page.jsx'

// ─── Helpers ───

async function renderAndWaitForLoad() {
  render(<Calendar />)
  // Wait for the initial loading to complete — Calendar renders "Loading..." then the full page
  await waitFor(() => {
    expect(screen.getByText('Calendar')).toBeInTheDocument()
  })
}

/** Get the staff dropdown (first select that contains "Everyone" option) */
function getStaffDropdown() {
  const selects = screen.getAllByRole('combobox')
  return selects.find(select => {
    const options = select.querySelectorAll('option')
    return Array.from(options).some(opt => opt.value === 'everyone')
  })
}

/** Get a view toggle button by exact text (avoids matching "Today" for "day") */
function getViewButton(name) {
  const allButtons = screen.getAllByRole('button')
  return allButtons.find(btn => btn.textContent === name)
}

// ─── Tests ───

describe('Calendar View Routing - Requirement 1.1, 1.2: Staff Dropdown', () => {
  test('"Everyone" renders as the first option in the staff dropdown', async () => {
    await renderAndWaitForLoad()

    const staffSelect = getStaffDropdown()
    expect(staffSelect).toBeDefined()
    const options = staffSelect.querySelectorAll('option')

    // First option should be "Everyone" with value "everyone"
    expect(options[0]).toHaveTextContent('Everyone')
    expect(options[0]).toHaveValue('everyone')
  })

  test('staff dropdown is always visible regardless of selection', async () => {
    await renderAndWaitForLoad()

    // Dropdown should be visible with "everyone" selected (default)
    let staffSelect = getStaffDropdown()
    expect(staffSelect).toBeVisible()

    // Switch to individual staff — dropdown should still be visible
    fireEvent.change(staffSelect, { target: { value: 'staff-1' } })
    await waitFor(() => {
      staffSelect = getStaffDropdown()
      expect(staffSelect).toBeVisible()
    })

    // Switch back to everyone — dropdown should still be visible
    fireEvent.change(staffSelect, { target: { value: 'everyone' } })
    await waitFor(() => {
      staffSelect = getStaffDropdown()
      expect(staffSelect).toBeVisible()
    })
  })
})

describe('Calendar View Routing - Requirement 1.4, 1.5: Everyone + Day/Week rendering', () => {
  test('Everyone + Day renders MultiStaffView', async () => {
    await renderAndWaitForLoad()

    // Default is "everyone" staff, click "day" view button
    const dayButton = getViewButton('day')
    fireEvent.click(dayButton)

    await waitFor(() => {
      expect(screen.getByTestId('multi-staff-view')).toBeInTheDocument()
    })
  })

  test('Everyone + Week renders MultiStaffWeekView', async () => {
    await renderAndWaitForLoad()

    // Default is "everyone" staff, click "week" view button
    const weekButton = getViewButton('week')
    fireEvent.click(weekButton)

    await waitFor(() => {
      expect(screen.getByTestId('multi-staff-week-view')).toBeInTheDocument()
    })
  })
})

describe('Calendar View Routing - Requirement 1.6: Everyone + Month unavailable', () => {
  test('Everyone + Month displays unavailable message', async () => {
    await renderAndWaitForLoad()

    // Click "month" view button with everyone selected
    const monthButton = getViewButton('month')
    fireEvent.click(monthButton)

    await waitFor(() => {
      expect(screen.getByText(/monthly view is not available/i)).toBeInTheDocument()
    })
  })
})

describe('Calendar View Routing - Requirement 1.7: Individual staff renders existing views', () => {
  test('individual staff + Day renders single-staff day view (not MultiStaffView)', async () => {
    await renderAndWaitForLoad()

    // Select individual staff
    const staffSelect = getStaffDropdown()
    fireEvent.change(staffSelect, { target: { value: 'staff-1' } })

    // Select day view
    const dayButton = getViewButton('day')
    fireEvent.click(dayButton)

    await waitFor(() => {
      // MultiStaffView and MultiStaffWeekView should NOT render
      expect(screen.queryByTestId('multi-staff-view')).not.toBeInTheDocument()
      expect(screen.queryByTestId('multi-staff-week-view')).not.toBeInTheDocument()
    })
  })
})

describe('Calendar View Routing - View toggle only has Day, Week, Month', () => {
  test('view toggle has only Day, Week, Month buttons (no Everyone button)', async () => {
    await renderAndWaitForLoad()

    // Should find day, week, month buttons
    expect(getViewButton('day')).toBeDefined()
    expect(getViewButton('week')).toBeDefined()
    expect(getViewButton('month')).toBeDefined()

    // Should NOT find an "Everyone" button in the view toggle area
    const everyoneButton = getViewButton('everyone') || getViewButton('Everyone')
    expect(everyoneButton).toBeUndefined()
  })
})
