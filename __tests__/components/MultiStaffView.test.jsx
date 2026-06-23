import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock aws-amplify (required by project structure)
jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn(() => Promise.resolve({
    tokens: { idToken: { payload: { 'custom:vendorId': 'v1', 'custom:role': 'admin' } } }
  }))
}))
jest.mock('aws-amplify', () => ({ Amplify: { configure: jest.fn() } }))
jest.mock('../../app/amplify-config', () => ({}))

// Mock the calendar utility — provide real implementations for grouping/ordering
jest.mock('../../app/utils/calendar', () => ({
  groupAppointmentsByStaff: (appointments, staffList) => {
    const staffIds = new Set(staffList.map(s => s.visibleId))
    const grouped = new Map()
    for (const staff of staffList) {
      grouped.set(staff.visibleId, [])
    }
    for (const apt of appointments || []) {
      if (apt.status === 'cancelled') continue
      if (staffIds.has(apt.staffId)) {
        grouped.get(apt.staffId).push(apt)
      }
    }
    return grouped
  },
  orderStaffColumns: (allStaff, vendors) => {
    const isResource = (s) => s.visibleId.startsWith('resource-')
    const staffMembers = allStaff.filter(s => !isResource(s))
    const resources = allStaff.filter(isResource)
    const vendorOrder = vendors.map(v => v.vendorId)
    staffMembers.sort((a, b) => {
      const aIdx = vendorOrder.indexOf(a.vendorId)
      const bIdx = vendorOrder.indexOf(b.vendorId)
      if (aIdx !== bIdx) return aIdx - bIdx
      return (a.staffName || '').localeCompare(b.staffName || '')
    })
    return [...staffMembers, ...resources]
  },
  generateTimeSlots: (start, end) => {
    const slots = []
    for (let h = start; h < end; h++) {
      slots.push({ hour: h, minute: 0 })
      slots.push({ hour: h, minute: 30 })
    }
    return slots
  },
  getWorkingHoursForStaff: () => ({ start: 540, end: 1020 }),
}))

import MultiStaffView from '../../app/dashboard/calendar/MultiStaffView.jsx'

// ─── Test Data ───

const mockStaff = [
  { visibleId: 'staff-1', staffName: 'Alice', vendorId: 'v1', isActive: true, schedule: null },
  { visibleId: 'staff-2', staffName: 'Bob', vendorId: 'v1', isActive: true, schedule: null },
]

const mockStaffWithResource = [
  { visibleId: 'staff-1', staffName: 'Alice', vendorId: 'v1', isActive: true, schedule: null },
  { visibleId: 'resource-sauna', staffName: 'Sauna', vendorId: 'v1', isActive: true, schedule: null },
]

const mockVendors = [{ vendorId: 'v1', name: 'Spa A' }]

const mockAppointments = [
  {
    appointmentId: 'apt-1',
    staffId: 'staff-1',
    dateTime: '2025-06-15T10:00:00.000Z',
    status: 'confirmed',
    customer: { name: 'John Doe' },
    service: { name: 'Haircut', duration: 60 },
  },
]

const testDate = new Date('2025-06-15T00:00:00.000Z')

/**
 * MockTimeBlockColumn renders appointments and clickable time slots
 * so we can test click interactions in the MultiStaffView.
 */
function MockTimeBlockColumn({ appointments, onAppointmentClick, onSlotClick, startHour }) {
  return (
    <div data-testid="time-block-column">
      {(appointments || []).map((apt) => (
        <div
          key={apt.appointmentId}
          data-testid={`appointment-${apt.appointmentId}`}
          onClick={() => onAppointmentClick(apt)}
        >
          {apt.customer?.name}
        </div>
      ))}
      {/* Render a clickable slot at 10:00 */}
      <div
        data-testid="time-slot"
        onClick={() => {
          const slotDate = new Date(2025, 5, 15, 10, 0)
          onSlotClick(slotDate)
        }}
      >
        10:00 slot
      </div>
    </div>
  )
}

// ─── Tests ───

describe('MultiStaffView Component', () => {
  describe('Empty state', () => {
    test('renders "No active staff found." when allStaff is empty', () => {
      render(
        <MultiStaffView
          date={testDate}
          allStaff={[]}
          appointments={[]}
          startHour={8}
          endHour={18}
          onAppointmentClick={jest.fn()}
          onSlotClick={jest.fn()}
          vendors={mockVendors}
          TimeBlockColumn={MockTimeBlockColumn}
        />
      )
      expect(screen.getByText('No active staff found.')).toBeInTheDocument()
    })

    test('renders "No active staff found." when allStaff is undefined', () => {
      render(
        <MultiStaffView
          date={testDate}
          allStaff={undefined}
          appointments={[]}
          startHour={8}
          endHour={18}
          onAppointmentClick={jest.fn()}
          onSlotClick={jest.fn()}
          vendors={mockVendors}
          TimeBlockColumn={MockTimeBlockColumn}
        />
      )
      expect(screen.getByText('No active staff found.')).toBeInTheDocument()
    })
  })

  describe('Resource column', () => {
    test('renders resource-sauna as a column when in active staff list', () => {
      render(
        <MultiStaffView
          date={testDate}
          allStaff={mockStaffWithResource}
          appointments={[]}
          startHour={8}
          endHour={18}
          onAppointmentClick={jest.fn()}
          onSlotClick={jest.fn()}
          vendors={mockVendors}
          TimeBlockColumn={MockTimeBlockColumn}
        />
      )
      expect(screen.getByText('Sauna')).toBeInTheDocument()
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })
  })

  describe('Staff columns rendered', () => {
    test('each active staff member gets their own column with name in header', () => {
      render(
        <MultiStaffView
          date={testDate}
          allStaff={mockStaff}
          appointments={[]}
          startHour={8}
          endHour={18}
          onAppointmentClick={jest.fn()}
          onSlotClick={jest.fn()}
          vendors={mockVendors}
          TimeBlockColumn={MockTimeBlockColumn}
        />
      )
      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('Bob')).toBeInTheDocument()
    })
  })

  describe('Appointment click', () => {
    test('clicking an appointment calls onAppointmentClick with the appointment', () => {
      const onAppointmentClick = jest.fn()
      render(
        <MultiStaffView
          date={testDate}
          allStaff={mockStaff}
          appointments={mockAppointments}
          startHour={8}
          endHour={18}
          onAppointmentClick={onAppointmentClick}
          onSlotClick={jest.fn()}
          vendors={mockVendors}
          TimeBlockColumn={MockTimeBlockColumn}
        />
      )
      fireEvent.click(screen.getByTestId('appointment-apt-1'))
      expect(onAppointmentClick).toHaveBeenCalledTimes(1)
      expect(onAppointmentClick).toHaveBeenCalledWith(mockAppointments[0])
    })
  })

  describe('Slot click enrichment', () => {
    test('clicking a slot calls onSlotClick with dateTime and staffId from the clicked column', () => {
      const onSlotClick = jest.fn()
      render(
        <MultiStaffView
          date={testDate}
          allStaff={[mockStaff[0]]}
          appointments={[]}
          startHour={8}
          endHour={18}
          onAppointmentClick={jest.fn()}
          onSlotClick={onSlotClick}
          vendors={mockVendors}
          TimeBlockColumn={MockTimeBlockColumn}
        />
      )
      fireEvent.click(screen.getByTestId('time-slot'))
      expect(onSlotClick).toHaveBeenCalledTimes(1)
      expect(onSlotClick).toHaveBeenCalledWith(
        expect.any(Date),
        'staff-1'
      )
      // Verify the date/time passed
      const [dateArg] = onSlotClick.mock.calls[0]
      expect(dateArg.getHours()).toBe(10)
      expect(dateArg.getMinutes()).toBe(0)
    })
  })

  describe('Column ordering', () => {
    test('non-resource staff appear before resources', () => {
      const staffWithMixedOrder = [
        { visibleId: 'resource-sauna', staffName: 'Sauna', vendorId: 'v1', isActive: true, schedule: null },
        { visibleId: 'staff-1', staffName: 'Alice', vendorId: 'v1', isActive: true, schedule: null },
        { visibleId: 'staff-2', staffName: 'Bob', vendorId: 'v1', isActive: true, schedule: null },
      ]

      const { container } = render(
        <MultiStaffView
          date={testDate}
          allStaff={staffWithMixedOrder}
          appointments={[]}
          startHour={8}
          endHour={18}
          onAppointmentClick={jest.fn()}
          onSlotClick={jest.fn()}
          vendors={mockVendors}
          TimeBlockColumn={MockTimeBlockColumn}
        />
      )

      // Get all staff column headers in order
      const headers = container.querySelectorAll('.staff-column-header')
      const headerTexts = Array.from(headers).map(h => h.textContent)

      // Non-resource staff (Alice, Bob) should come before resource (Sauna)
      const aliceIdx = headerTexts.indexOf('Alice')
      const bobIdx = headerTexts.indexOf('Bob')
      const saunaIdx = headerTexts.indexOf('Sauna')

      expect(aliceIdx).toBeLessThan(saunaIdx)
      expect(bobIdx).toBeLessThan(saunaIdx)
    })
  })
})
