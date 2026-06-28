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

import StaffLegend from '../../app/dashboard/calendar/StaffLegend.jsx'

// ─── Test Data ───

const mockStaff = [
  { visibleId: 'staff-1', staffName: 'Alice' },
  { visibleId: 'staff-2', staffName: 'Bob' },
  { visibleId: 'staff-3', staffName: 'Charlie' },
]

const mockColorMap = new Map([
  ['staff-1', '#4A90D9'],
  ['staff-2', '#E67E22'],
  ['staff-3', '#27AE60'],
])

// ─── Tests ───

describe('StaffLegend Component', () => {
  describe('Rendering staff with color swatches', () => {
    test('renders all staff members with their names', () => {
      render(
        <StaffLegend
          staff={mockStaff}
          colorMap={mockColorMap}
          collapsed={false}
          onToggle={jest.fn()}
        />
      )

      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('Bob')).toBeInTheDocument()
      expect(screen.getByText('Charlie')).toBeInTheDocument()
    })

    test('renders color swatches with correct colors from colorMap', () => {
      const { container } = render(
        <StaffLegend
          staff={mockStaff}
          colorMap={mockColorMap}
          collapsed={false}
          onToggle={jest.fn()}
        />
      )

      const swatches = container.querySelectorAll('.staff-legend-swatch')
      expect(swatches).toHaveLength(3)
      expect(swatches[0]).toHaveStyle({ backgroundColor: '#4A90D9' })
      expect(swatches[1]).toHaveStyle({ backgroundColor: '#E67E22' })
      expect(swatches[2]).toHaveStyle({ backgroundColor: '#27AE60' })
    })
  })

  describe('Collapse/expand toggle behavior', () => {
    test('when collapsed=false, staff list is visible', () => {
      render(
        <StaffLegend
          staff={mockStaff}
          colorMap={mockColorMap}
          collapsed={false}
          onToggle={jest.fn()}
        />
      )

      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('Bob')).toBeInTheDocument()
      expect(screen.getByText('Charlie')).toBeInTheDocument()
      expect(screen.getByRole('region', { name: /staff color legend/i })).toBeInTheDocument()
    })

    test('when collapsed=true, staff list is hidden but toggle header is visible', () => {
      render(
        <StaffLegend
          staff={mockStaff}
          colorMap={mockColorMap}
          collapsed={true}
          onToggle={jest.fn()}
        />
      )

      expect(screen.getByText('Staff Legend')).toBeInTheDocument()
      expect(screen.queryByText('Alice')).not.toBeInTheDocument()
      expect(screen.queryByText('Bob')).not.toBeInTheDocument()
      expect(screen.queryByText('Charlie')).not.toBeInTheDocument()
    })

    test('clicking the toggle button calls onToggle', () => {
      const onToggle = jest.fn()
      render(
        <StaffLegend
          staff={mockStaff}
          colorMap={mockColorMap}
          collapsed={false}
          onToggle={onToggle}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /staff legend/i }))
      expect(onToggle).toHaveBeenCalledTimes(1)
    })

    test('toggle button has aria-expanded=true when not collapsed', () => {
      render(
        <StaffLegend
          staff={mockStaff}
          colorMap={mockColorMap}
          collapsed={false}
          onToggle={jest.fn()}
        />
      )

      const button = screen.getByRole('button', { name: /staff legend/i })
      expect(button).toHaveAttribute('aria-expanded', 'true')
    })

    test('toggle button has aria-expanded=false when collapsed', () => {
      render(
        <StaffLegend
          staff={mockStaff}
          colorMap={mockColorMap}
          collapsed={true}
          onToggle={jest.fn()}
        />
      )

      const button = screen.getByRole('button', { name: /staff legend/i })
      expect(button).toHaveAttribute('aria-expanded', 'false')
    })
  })

  describe('Staff with zero appointments still shown', () => {
    test('all staff in the array are rendered regardless of appointments', () => {
      // Staff members are rendered based on the staff array, not appointments
      const staffWithNoAppointments = [
        { visibleId: 'staff-a', staffName: 'No-Appointments Amy' },
        { visibleId: 'staff-b', staffName: 'Empty Bob' },
      ]
      const colorMap = new Map([
        ['staff-a', '#4A90D9'],
        ['staff-b', '#E67E22'],
      ])

      render(
        <StaffLegend
          staff={staffWithNoAppointments}
          colorMap={colorMap}
          collapsed={false}
          onToggle={jest.fn()}
        />
      )

      expect(screen.getByText('No-Appointments Amy')).toBeInTheDocument()
      expect(screen.getByText('Empty Bob')).toBeInTheDocument()
    })
  })

  describe('Empty staff array', () => {
    test('renders without errors when staff array is empty', () => {
      const { container } = render(
        <StaffLegend
          staff={[]}
          colorMap={new Map()}
          collapsed={false}
          onToggle={jest.fn()}
        />
      )

      expect(container.querySelector('.staff-legend')).toBeInTheDocument()
      expect(screen.getByText('Staff Legend')).toBeInTheDocument()
      expect(container.querySelectorAll('.staff-legend-item')).toHaveLength(0)
    })

    test('renders without errors when staff is undefined', () => {
      const { container } = render(
        <StaffLegend
          staff={undefined}
          colorMap={undefined}
          collapsed={false}
          onToggle={jest.fn()}
        />
      )

      expect(container.querySelector('.staff-legend')).toBeInTheDocument()
      expect(screen.getByText('Staff Legend')).toBeInTheDocument()
    })
  })
})
