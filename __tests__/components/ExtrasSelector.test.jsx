import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock the extrasCalculator utility to avoid ESM import issues in jsdom env
jest.mock('@/app/utils/extrasCalculator', () => ({
  filterAvailableExtras: (extras, groupSize) => {
    if (!extras || !Array.isArray(extras)) return []
    return extras.filter(extra => {
      if (!extra.isActive) return false
      if (extra.groupOnly && groupSize < 3) return false
      return true
    })
  },
}))

import ExtrasSelector from '../../app/components/ExtrasSelector'

const mockExtras = [
  {
    extraId: 'extra-1',
    name: 'Charcuterie Board',
    description: 'Artisan cheeses and meats',
    price: 45.00,
    perPerson: false,
    groupOnly: false,
    isActive: true,
  },
  {
    extraId: 'extra-2',
    name: 'Fruit Tray',
    description: 'Seasonal fruits',
    price: 12.50,
    perPerson: true,
    groupOnly: false,
    isActive: true,
  },
  {
    extraId: 'extra-3',
    name: 'Group Drink Package',
    description: 'Mocktails for the group',
    price: 30.00,
    perPerson: false,
    groupOnly: true,
    isActive: true,
  },
  {
    extraId: 'extra-4',
    name: 'Inactive Extra',
    description: 'Should not appear',
    price: 10.00,
    perPerson: false,
    groupOnly: false,
    isActive: false,
  },
]

describe('ExtrasSelector', () => {
  const defaultProps = {
    extras: mockExtras,
    selectedExtras: [],
    onToggle: jest.fn(),
    groupSize: 4,
  }

  test('renders a list of available extras with their names and prices', () => {
    render(<ExtrasSelector {...defaultProps} />)

    expect(screen.getByText('Charcuterie Board')).toBeInTheDocument()
    expect(screen.getByText('$45.00')).toBeInTheDocument()

    expect(screen.getByText('Fruit Tray')).toBeInTheDocument()
    expect(screen.getByText(/\$12\.50/)).toBeInTheDocument()
  })

  test('shows "per person" label for extras with perPerson: true', () => {
    render(<ExtrasSelector {...defaultProps} />)

    expect(screen.getByText('per person')).toBeInTheDocument()
  })

  test('does not show "per person" label for extras with perPerson: false', () => {
    const extrasWithoutPerPerson = [
      {
        extraId: 'extra-flat',
        name: 'Flat Price Item',
        price: 20.00,
        perPerson: false,
        groupOnly: false,
        isActive: true,
      },
    ]

    render(
      <ExtrasSelector
        extras={extrasWithoutPerPerson}
        selectedExtras={[]}
        onToggle={jest.fn()}
        groupSize={2}
      />
    )

    expect(screen.getByText('Flat Price Item')).toBeInTheDocument()
    expect(screen.queryByText('per person')).not.toBeInTheDocument()
  })

  test('filters out inactive extras (isActive: false) from display', () => {
    render(<ExtrasSelector {...defaultProps} />)

    expect(screen.queryByText('Inactive Extra')).not.toBeInTheDocument()
  })

  test('filters out group-only extras when groupSize < 3', () => {
    render(<ExtrasSelector {...defaultProps} groupSize={2} />)

    expect(screen.queryByText('Group Drink Package')).not.toBeInTheDocument()
  })

  test('shows group-only extras when groupSize >= 3', () => {
    render(<ExtrasSelector {...defaultProps} groupSize={3} />)

    expect(screen.getByText('Group Drink Package')).toBeInTheDocument()
  })

  test('calls onToggle with extraId when an extra is clicked', () => {
    const handleToggle = jest.fn()
    render(<ExtrasSelector {...defaultProps} onToggle={handleToggle} />)

    fireEvent.click(screen.getByText('Charcuterie Board'))
    expect(handleToggle).toHaveBeenCalledWith('extra-1')
  })

  test('shows description text when extra has a description', () => {
    render(<ExtrasSelector {...defaultProps} />)

    expect(screen.getByText('Artisan cheeses and meats')).toBeInTheDocument()
    expect(screen.getByText('Seasonal fruits')).toBeInTheDocument()
  })

  test('returns null when no available extras exist', () => {
    const { container } = render(
      <ExtrasSelector
        extras={[]}
        selectedExtras={[]}
        onToggle={jest.fn()}
        groupSize={2}
      />
    )

    expect(container.firstChild).toBeNull()
  })

  test('selected extras have visual indicator (checked state)', () => {
    render(<ExtrasSelector {...defaultProps} selectedExtras={['extra-1']} />)

    const selectedItem = screen.getByRole('checkbox', { name: /Charcuterie Board/ })
    expect(selectedItem).toBeChecked()

    const unselectedItem = screen.getByRole('checkbox', { name: /Fruit Tray/ })
    expect(unselectedItem).not.toBeChecked()
  })
})
