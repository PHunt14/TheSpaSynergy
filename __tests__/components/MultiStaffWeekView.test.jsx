import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock aws-amplify (required by project structure)
jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn(() => Promise.resolve({
    tokens: { idToken: { payload: { 'custom:vendorId': 'v1', 'custom:role': 'admin' } } }
  }))
}))
jest.mock('aws-amplify', () => ({ Amplify: { configure: jest.fn() } }))
jest.mock('../../app/amplify-config', () => ({}))

// Mock the calendar utility — provide real implementations for the week view utilities
jest.mock('../../app/utils/calendar', () => ({
  getWeekDates: (date) => {
    const d = new Date(date)
    d.setDate(d.getDate() - d.getDay())
    d.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(d)
      day.setDate(d.getDate() + i)
      return day
    })
  },
  isSameDay: (a, b) => (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  ),
  generateTimeSlots: (start, end) => {
    const slots = []
    for (let h = start; h < end; h++) {
      slots.push({ hour: h, minute: 0 })
      slots.push({ hour: h, minute: 30 })
    }
    return slots
  },
  getAggregateWorkingHours: () => ({ start: 480, end: 1020 }),
  groupAppointmentsByDateAndStaff: (appointments, weekDates, staffList) => {
    const grouped = new Map()
    for (const d of weekDates) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const staffMap = new Map()
      for (const staff of staffList) {
        staffMap.set(staff.visibleId, [])
      }
      grouped.set(key, staffMap)
    }
    for (const apt of appointments || []) {
      if (apt.status === 'cancelled') continue
      const aptDate = new Date(apt.rawDateTime || apt.dateTime)
      if (isNaN(aptDate.getTime())) continue
      const key = `${aptDate.getFullYear()}-${String(aptDate.getMonth() + 1).padStart(2, '0')}-${String(aptDate.getDate()).padStart(2, '0')}`
      if (grouped.has(key)) {
        const staffMap = grouped.get(key)
        if (staffMap.has(apt.staffId)) {
          staffMap.get(apt.staffId).push(apt)
        }
      }
    }
    return grouped
  },
  assignStaffColors: (orderedStaff) => {
    const STAFF_COLORS = [
      '#4A90D9', '#E67E22', '#27AE60', '#8E44AD', '#E74C3C',
      '#16A085', '#F39C12', '#2980B9', '#D35400', '#1ABC9C'
    ]
    const colorMap = new Map()
    for (let i = 0; i < (orderedStaff || []).length; i++) {
      colorMap.set(orderedStaff[i].visibleId, STAFF_COLORS[i % STAFF_COLORS.length])
    }
    return colorMap
  },
  orderStaffColumns: (allStaff, vendors) => {
    const isResource = (s) => s.visibleId.startsWith('resource-')
    const staffMembers = (allStaff || []).filter(s => !isResource(s))
    const resources = (allStaff || []).filter(isResource)
    const vendorOrder = (vendors || []).map(v => v.vendorId)
    staffMembers.sort((a, b) => {
      const aIdx = vendorOrder.indexOf(a.vendorId)
      const bIdx = vendorOrder.indexOf(b.vendorId)
      if (aIdx !== bIdx) return aIdx - bIdx
      return (a.staffName || '').localeCompare(b.staffName || '')
    })
    return [...staffMembers, ...resources]
  },
  computeOverlapLayout: (appointments, startHour) => {
    if (!appointments || appointments.length === 0) return []
    return appointments.map((apt) => ({
      appointment: apt,
      column: 0,
      totalColumns: 1,
    }))
  },
  getBlockPosition: (appointmentDate, duration, startHour) => {
    const hours = appointmentDate.getHours()
    const minutes = appointmentDate.getMinutes()
    const totalMinutesFromStart = (hours - startHour) * 60 + minutes
    const pxPerSlot = 40
    const top = (totalMinutesFromStart / 30) * pxPerSlot
    const height = (duration / 30) * pxPerSlot
    return { top, height: Math.max(height, 20) }
  },
  parseAppointmentDate: (rawDateTime) => {
    if (!rawDateTime) return null
    try {
      const d = new Date(rawDateTime)
      return isNaN(d.getTime()) ? null : d
    } catch { return null }
  },
  SLOT_MINUTES: 30,
}))

import MultiStaffWeekView from '../../app/dashboard/calendar/MultiStaffWeekView.jsx'

// ─── Test Data ───

const mockStaff = [
  { visibleId: 'staff-1', staffName: 'Alice', vendorId: 'v1', isActive: true, schedule: { wednesday: { start: '09:00', end: '17:00' } } },
  { visibleId: 'staff-2', staffName: 'Bob', vendorId: 'v1', isActive: true, schedule: { wednesday: { start: '08:00', end: '18:00' } } },
]

const mockVendors = [{ vendorId: 'v1', name: 'Main Spa' }]

// Wednesday Jan 15, 2025 — week is Sun Jan 12 – Sat Jan 18
const selectedDate = new Date(2025, 0, 15)

const mockAppointments = [
  {
    appointmentId: 'apt-1',
    dateTime: '2025-01-15T10:00:00',
    rawDateTime: '2025-01-15T10:00:00',
    staffId: 'staff-1',
    staffName: 'Alice',
    customer: { name: 'John' },
    service: { duration: 60, name: 'Massage' },
    status: 'confirmed',
  },
  {
    appointmentId: 'apt-2',
    dateTime: '2025-01-15T10:00:00',
    rawDateTime: '2025-01-15T10:00:00',
    staffId: 'staff-2',
    staffName: 'Bob',
    customer: { name: 'Jane' },
    service: { duration: 30, name: 'Facial' },
    status: 'confirmed',
  },
]

// ─── Tests ───

describe('MultiStaffWeekView Component', () => {
  let mockOnAppointmentClick
  let mockOnSlotClick
  let mockOnDayClick

  beforeEach(() => {
    mockOnAppointmentClick = jest.fn()
    mockOnSlotClick = jest.fn()
    mockOnDayClick = jest.fn()
  })

  function renderComponent(props = {}) {
    return render(
      <MultiStaffWeekView
        selectedDate={selectedDate}
        allStaff={mockStaff}
        appointments={mockAppointments}
        startHour={8}
        endHour={18}
        onAppointmentClick={mockOnAppointmentClick}
        onSlotClick={mockOnSlotClick}
        onDayClick={mockOnDayClick}
        vendors={mockVendors}
        {...props}
      />
    )
  }

  describe('7 day columns rendered with correct dates (Req 2.1)', () => {
    test('renders 7 day header buttons for Sun Jan 12 – Sat Jan 18', () => {
      renderComponent()

      // Week containing Wed Jan 15 2025 is Sun Jan 12 - Sat Jan 18
      const headerButtons = screen.getAllByRole('columnheader')
      expect(headerButtons).toHaveLength(7)
    })

    test('day headers display correct date numbers for the week', () => {
      renderComponent()

      // Sun=12, Mon=13, Tue=14, Wed=15, Thu=16, Fri=17, Sat=18
      expect(screen.getByText('12')).toBeInTheDocument()
      expect(screen.getByText('13')).toBeInTheDocument()
      expect(screen.getByText('14')).toBeInTheDocument()
      expect(screen.getByText('15')).toBeInTheDocument()
      expect(screen.getByText('16')).toBeInTheDocument()
      expect(screen.getByText('17')).toBeInTheDocument()
      expect(screen.getByText('18')).toBeInTheDocument()
    })

    test('day headers display abbreviated day names', () => {
      renderComponent()

      expect(screen.getByText('Sun')).toBeInTheDocument()
      expect(screen.getByText('Mon')).toBeInTheDocument()
      expect(screen.getByText('Tue')).toBeInTheDocument()
      expect(screen.getByText('Wed')).toBeInTheDocument()
      expect(screen.getByText('Thu')).toBeInTheDocument()
      expect(screen.getByText('Fri')).toBeInTheDocument()
      expect(screen.getByText('Sat')).toBeInTheDocument()
    })

    test('renders 7 day columns in the week body', () => {
      const { container } = renderComponent()

      const dayColumns = container.querySelectorAll('.multi-staff-week-day-column')
      expect(dayColumns).toHaveLength(7)
    })
  })

  describe('Today highlight styling (Req 2.3)', () => {
    test('today\'s date header has primary color background', () => {
      // Use today as the selected date so there's a "today" match in the header
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const { container } = renderComponent({ selectedDate: today })

      // Find the header button that has aria-label containing "today"
      const todayButton = screen.getAllByRole('columnheader').find(
        btn => btn.getAttribute('aria-label')?.includes('today')
      )

      expect(todayButton).toBeDefined()
      // Verify it has the primary color background
      expect(todayButton.style.background).toContain('var(--color-primary')
    })

    test('non-today dates do not have today highlight', () => {
      // Use a date far in the past so no day matches today
      const pastDate = new Date(2020, 0, 8) // Wed Jan 8, 2020

      renderComponent({ selectedDate: pastDate })

      const headerButtons = screen.getAllByRole('columnheader')
      const todayButtons = headerButtons.filter(
        btn => btn.getAttribute('aria-label')?.includes('today')
      )

      expect(todayButtons).toHaveLength(0)
    })
  })

  describe('Day header click triggers onDayClick (Req 2.5)', () => {
    test('clicking a day header button calls onDayClick with the correct Date', () => {
      renderComponent()

      // Click the Monday header (Jan 13)
      const monHeader = screen.getAllByRole('columnheader').find(
        btn => btn.getAttribute('aria-label')?.startsWith('Mon')
      )

      fireEvent.click(monHeader)

      expect(mockOnDayClick).toHaveBeenCalledTimes(1)
      const calledDate = mockOnDayClick.mock.calls[0][0]
      expect(calledDate.getDate()).toBe(13)
      expect(calledDate.getMonth()).toBe(0) // January
      expect(calledDate.getFullYear()).toBe(2025)
    })

    test('clicking a different day header calls onDayClick with that day', () => {
      renderComponent()

      // Click Saturday header (Jan 18)
      const satHeader = screen.getAllByRole('columnheader').find(
        btn => btn.getAttribute('aria-label')?.startsWith('Sat')
      )

      fireEvent.click(satHeader)

      expect(mockOnDayClick).toHaveBeenCalledTimes(1)
      const calledDate = mockOnDayClick.mock.calls[0][0]
      expect(calledDate.getDate()).toBe(18)
      expect(calledDate.getMonth()).toBe(0)
      expect(calledDate.getFullYear()).toBe(2025)
    })
  })

  describe('Appointment block click triggers onAppointmentClick (Req 4.1)', () => {
    test('clicking an appointment block calls onAppointmentClick with the appointment', () => {
      const { container } = renderComponent()

      // Find the appointment block by its data-appointment-id attribute
      const aptBlock = container.querySelector('[data-appointment-id="apt-1"]')
      expect(aptBlock).toBeTruthy()

      fireEvent.click(aptBlock)

      expect(mockOnAppointmentClick).toHaveBeenCalledTimes(1)
      expect(mockOnAppointmentClick).toHaveBeenCalledWith(
        expect.objectContaining({ appointmentId: 'apt-1' })
      )
    })

    test('clicking a second appointment block calls onAppointmentClick with that appointment', () => {
      const { container } = renderComponent()

      const aptBlock = container.querySelector('[data-appointment-id="apt-2"]')
      expect(aptBlock).toBeTruthy()

      fireEvent.click(aptBlock)

      expect(mockOnAppointmentClick).toHaveBeenCalledTimes(1)
      expect(mockOnAppointmentClick).toHaveBeenCalledWith(
        expect.objectContaining({ appointmentId: 'apt-2' })
      )
    })
  })

  describe('Empty slot click triggers onSlotClick (Req 4.2)', () => {
    test('clicking an empty slot calls onSlotClick with a Date at the correct time', () => {
      const { container } = renderComponent()

      // Get the first day column's slot buttons (the grid divs with role="button")
      const dayColumns = container.querySelectorAll('.multi-staff-week-day-column')
      expect(dayColumns.length).toBeGreaterThan(0)

      // Click the first slot (index 0) in the first day column — corresponds to startHour:00
      const firstSlotInDay = dayColumns[0].querySelectorAll('[role="button"]')
      expect(firstSlotInDay.length).toBeGreaterThan(0)

      // The first slot corresponds to 8:00 AM (startHour=8, index 0)
      fireEvent.click(firstSlotInDay[0])

      expect(mockOnSlotClick).toHaveBeenCalledTimes(1)
      const calledDate = mockOnSlotClick.mock.calls[0][0]
      expect(calledDate.getHours()).toBe(8)
      expect(calledDate.getMinutes()).toBe(0)
    })

    test('clicking a later slot calls onSlotClick with the correct time', () => {
      const { container } = renderComponent()

      const dayColumns = container.querySelectorAll('.multi-staff-week-day-column')
      // Slot index 4 = startHour + 2 hours = 10:00 (4 * 30 min = 120 min from start)
      const slots = dayColumns[0].querySelectorAll('[role="button"]')
      fireEvent.click(slots[4])

      expect(mockOnSlotClick).toHaveBeenCalledTimes(1)
      const calledDate = mockOnSlotClick.mock.calls[0][0]
      expect(calledDate.getHours()).toBe(10)
      expect(calledDate.getMinutes()).toBe(0)
    })
  })

  describe('Color-coded blocks per staff member (Req 3.3)', () => {
    test('appointment blocks have staff-specific color styling', () => {
      const { container } = renderComponent()

      // Alice's appointment (staff-1) should have color #4A90D9 → rgb(74, 144, 217)
      const aliceBlock = container.querySelector('[data-appointment-id="apt-1"]')
      expect(aliceBlock).toBeTruthy()
      // jsdom converts hex to rgb in computed style attributes
      const aliceStyle = aliceBlock.getAttribute('style') || ''
      expect(aliceStyle).toContain('74, 144, 217')

      // Bob's appointment (staff-2) should have color #E67E22 → rgb(230, 126, 34)
      const bobBlock = container.querySelector('[data-appointment-id="apt-2"]')
      expect(bobBlock).toBeTruthy()
      const bobStyle = bobBlock.getAttribute('style') || ''
      expect(bobStyle).toContain('230, 126, 34')
    })

    test('different staff have different colors applied to their blocks', () => {
      const { container } = renderComponent()

      const aliceBlock = container.querySelector('[data-appointment-id="apt-1"]')
      const bobBlock = container.querySelector('[data-appointment-id="apt-2"]')

      // Verify they have different color values in their styles
      const aliceStyle = aliceBlock.getAttribute('style') || ''
      const bobStyle = bobBlock.getAttribute('style') || ''
      // Alice uses rgb(74, 144, 217), Bob uses rgb(230, 126, 34)
      expect(aliceStyle).toContain('74, 144, 217')
      expect(bobStyle).toContain('230, 126, 34')
      // Confirm they differ
      expect(aliceStyle).not.toContain('230, 126, 34')
      expect(bobStyle).not.toContain('74, 144, 217')
    })
  })

  describe('StaffLegend is rendered with all staff members (Req 9.1)', () => {
    test('StaffLegend is rendered showing all staff names', () => {
      const { container } = renderComponent()

      // StaffLegend shows the "Staff Legend" header and staff names
      expect(screen.getByText('Staff Legend')).toBeInTheDocument()
      // Staff names appear in the legend items (may also appear in appointment blocks)
      const legendItems = container.querySelectorAll('.staff-legend-item')
      expect(legendItems).toHaveLength(2)
      expect(legendItems[0].textContent).toBe('Alice')
      expect(legendItems[1].textContent).toBe('Bob')
    })

    test('StaffLegend shows color swatches for each staff member', () => {
      const { container } = renderComponent()

      const swatches = container.querySelectorAll('.staff-legend-swatch')
      expect(swatches).toHaveLength(2)
      expect(swatches[0]).toHaveStyle({ backgroundColor: '#4A90D9' })
      expect(swatches[1]).toHaveStyle({ backgroundColor: '#E67E22' })
    })
  })

  describe('Overlap handling (Req 3.5)', () => {
    test('overlapping appointments are both rendered in the same day column', () => {
      // Both apt-1 and apt-2 are at 10:00 on Jan 15 — they overlap
      const { container } = renderComponent()

      const apt1 = container.querySelector('[data-appointment-id="apt-1"]')
      const apt2 = container.querySelector('[data-appointment-id="apt-2"]')

      expect(apt1).toBeTruthy()
      expect(apt2).toBeTruthy()
    })

    test('overlapping appointments have absolute positioning for stacking', () => {
      const { container } = renderComponent()

      const apt1 = container.querySelector('[data-appointment-id="apt-1"]')
      const apt2 = container.querySelector('[data-appointment-id="apt-2"]')

      expect(apt1.style.position).toBe('absolute')
      expect(apt2.style.position).toBe('absolute')
    })
  })
})


describe('MultiStaffWeekView Responsive Behavior', () => {
  let mockOnAppointmentClick
  let mockOnSlotClick
  let mockOnDayClick
  let originalInnerWidth

  beforeEach(() => {
    mockOnAppointmentClick = jest.fn()
    mockOnSlotClick = jest.fn()
    mockOnDayClick = jest.fn()
    originalInnerWidth = window.innerWidth
  })

  afterEach(() => {
    // Restore original innerWidth
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    })
  })

  function renderComponent(props = {}) {
    return render(
      <MultiStaffWeekView
        selectedDate={selectedDate}
        allStaff={mockStaff}
        appointments={mockAppointments}
        startHour={8}
        endHour={18}
        onAppointmentClick={mockOnAppointmentClick}
        onSlotClick={mockOnSlotClick}
        onDayClick={mockOnDayClick}
        vendors={mockVendors}
        {...props}
      />
    )
  }

  describe('Abbreviated day labels at narrow viewport (Req 8.4)', () => {
    test('displays single-letter day abbreviations when viewport < 768px', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 600,
      })

      renderComponent()

      // At narrow viewport, single-letter labels should be used
      const headerButtons = screen.getAllByRole('columnheader')
      const dayNames = headerButtons.map(
        btn => btn.querySelector('.week-header-day-name').textContent
      )

      expect(dayNames).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S'])
    })

    test('responds to resize event and switches to abbreviated labels', () => {
      // Start at wide viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      })

      const { rerender } = render(
        <MultiStaffWeekView
          selectedDate={selectedDate}
          allStaff={mockStaff}
          appointments={mockAppointments}
          startHour={8}
          endHour={18}
          onAppointmentClick={mockOnAppointmentClick}
          onSlotClick={mockOnSlotClick}
          onDayClick={mockOnDayClick}
          vendors={mockVendors}
        />
      )

      // Verify full labels initially
      let headerButtons = screen.getAllByRole('columnheader')
      let dayNames = headerButtons.map(
        btn => btn.querySelector('.week-header-day-name').textContent
      )
      expect(dayNames).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])

      // Simulate resize to narrow viewport
      act(() => {
        Object.defineProperty(window, 'innerWidth', {
          writable: true,
          configurable: true,
          value: 600,
        })
        window.dispatchEvent(new Event('resize'))
      })

      // After resize, should show abbreviated labels
      headerButtons = screen.getAllByRole('columnheader')
      dayNames = headerButtons.map(
        btn => btn.querySelector('.week-header-day-name').textContent
      )
      expect(dayNames).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S'])
    })
  })

  describe('Full day labels at wide viewport (Req 8.4)', () => {
    test('displays full abbreviated day names when viewport >= 768px', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      })

      renderComponent()

      const headerButtons = screen.getAllByRole('columnheader')
      const dayNames = headerButtons.map(
        btn => btn.querySelector('.week-header-day-name').textContent
      )

      expect(dayNames).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
    })

    test('displays full labels at exactly 768px (boundary)', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 768,
      })

      renderComponent()

      const headerButtons = screen.getAllByRole('columnheader')
      const dayNames = headerButtons.map(
        btn => btn.querySelector('.week-header-day-name').textContent
      )

      expect(dayNames).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
    })
  })

  describe('Minimum column width of 100px (Req 8.2)', () => {
    test('day columns container uses gridTemplateColumns with minmax(100px, 1fr)', () => {
      const { container } = renderComponent()

      const columnsContainer = container.querySelector('.multi-staff-week-columns')
      expect(columnsContainer).toBeTruthy()
      expect(columnsContainer.style.gridTemplateColumns).toBe('repeat(7, minmax(100px, 1fr))')
    })

    test('day columns container has minWidth of 700px (7 × 100px)', () => {
      const { container } = renderComponent()

      const columnsContainer = container.querySelector('.multi-staff-week-columns')
      expect(columnsContainer).toBeTruthy()
      expect(columnsContainer.style.minWidth).toBe('700px')
    })
  })

  describe('Time grid sticky positioning (Req 8.3)', () => {
    test('time grid has position sticky and left 0', () => {
      const { container } = renderComponent()

      const timeGrid = container.querySelector('.multi-staff-week-time-grid')
      expect(timeGrid).toBeTruthy()
      expect(timeGrid.style.position).toBe('sticky')
      expect(timeGrid.style.left).toBe('0px')
    })

    test('time grid has a z-index for layering above scrolling content', () => {
      const { container } = renderComponent()

      const timeGrid = container.querySelector('.multi-staff-week-time-grid')
      expect(timeGrid).toBeTruthy()
      expect(parseInt(timeGrid.style.zIndex)).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Horizontal scroll container (Req 8.1)', () => {
    test('scroll container has overflowX auto for horizontal scrolling', () => {
      const { container } = renderComponent()

      const scrollContainer = container.querySelector('.multi-staff-week-scroll-container')
      expect(scrollContainer).toBeTruthy()
      expect(scrollContainer.style.overflowX).toBe('auto')
    })
  })
})
