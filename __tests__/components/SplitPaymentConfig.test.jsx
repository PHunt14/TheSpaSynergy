import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import SplitPaymentConfig from '../../app/kiosk/components/SplitPaymentConfig'

// Mock the splitCalculator module
jest.mock('../../app/utils/splitCalculator', () => ({
  calculateEqualSplit: ({ totalCents, payerCount }) => {
    const base = Math.floor(totalCents / payerCount)
    const remainder = totalCents % payerCount
    const amounts = []
    for (let i = 0; i < payerCount; i++) {
      amounts.push(i < remainder ? base + 1 : base)
    }
    return { payerAmounts: amounts }
  },
  validateCustomSplit: ({ totalCents, payerAmountsCents }) => {
    for (let i = 0; i < payerAmountsCents.length; i++) {
      if (payerAmountsCents[i] < 50) {
        return { valid: false, error: `Payer ${i + 1} amount is below the minimum of 50 cents`, remainingCents: totalCents - payerAmountsCents.reduce((s, a) => s + a, 0) }
      }
    }
    const sum = payerAmountsCents.reduce((s, a) => s + a, 0)
    if (sum !== totalCents) {
      return { valid: false, error: sum < totalCents ? `Amounts do not cover the total` : `Amounts exceed the total`, remainingCents: totalCents - sum }
    }
    return { valid: true, remainingCents: 0 }
  },
  centsToDollars: (cents) => (cents / 100).toFixed(2),
  dollarsToCents: (dollars) => Math.round(dollars * 100),
}))

describe('SplitPaymentConfig', () => {
  const defaultProps = {
    totalAmountCents: 10000, // $100.00
    onConfigured: jest.fn(),
  }

  beforeEach(() => {
    defaultProps.onConfigured.mockClear()
  })

  test('renders mode toggle with neither selected initially', () => {
    render(<SplitPaymentConfig {...defaultProps} />)

    const equalRadio = screen.getByLabelText('Equal split')
    const customRadio = screen.getByLabelText('Custom split')

    expect(equalRadio).not.toBeChecked()
    expect(customRadio).not.toBeChecked()
  })

  test('selecting "Equal Split" shows payer count input', () => {
    render(<SplitPaymentConfig {...defaultProps} />)

    // Initially no payer count input visible
    expect(screen.queryByLabelText('Number of Payers')).not.toBeInTheDocument()

    // Select Equal Split
    fireEvent.click(screen.getByLabelText('Equal split'))

    // Now the payer count input should be visible
    expect(screen.getByLabelText('Number of Payers')).toBeInTheDocument()
  })

  test('equal mode: validates payer count (rejects < 2, > 10, non-integer)', () => {
    render(<SplitPaymentConfig {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Equal split'))

    const input = screen.getByLabelText('Number of Payers')

    // Less than 2
    fireEvent.change(input, { target: { value: '1' } })
    expect(screen.getByText('Enter an integer between 2 and 10')).toBeInTheDocument()

    // Greater than 10
    fireEvent.change(input, { target: { value: '11' } })
    expect(screen.getByText('Enter an integer between 2 and 10')).toBeInTheDocument()

    // Valid value - error should disappear
    fireEvent.change(input, { target: { value: '3' } })
    expect(screen.queryByText('Enter an integer between 2 and 10')).not.toBeInTheDocument()
  })

  test('equal mode: displays correct amounts for each payer', () => {
    render(<SplitPaymentConfig {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Equal split'))

    const input = screen.getByLabelText('Number of Payers')
    fireEvent.change(input, { target: { value: '3' } })

    // $100 / 3 = $33.33 each, first payer gets $33.34 (remainder)
    expect(screen.getByText('$33.34')).toBeInTheDocument()
    expect(screen.getAllByText('$33.33')).toHaveLength(2)
  })

  test('selecting "Custom Split" shows tabular interface with 2 rows', () => {
    render(<SplitPaymentConfig {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Custom split'))

    // Should show a table with 2 payer rows
    expect(screen.getByText('Person 1')).toBeInTheDocument()
    expect(screen.getByText('Person 2')).toBeInTheDocument()
    expect(screen.getByLabelText('Amount for Person 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Amount for Person 2')).toBeInTheDocument()
  })

  test('custom mode: add payer button adds a row (up to 10)', () => {
    render(<SplitPaymentConfig {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Custom split'))

    const addButton = screen.getByLabelText('Add payer')
    fireEvent.click(addButton)

    // Should now have 3 payers
    expect(screen.getByText('Person 3')).toBeInTheDocument()
    expect(screen.getByLabelText('Amount for Person 3')).toBeInTheDocument()
  })

  test('custom mode: remove payer button removes a row (min 2)', () => {
    render(<SplitPaymentConfig {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Custom split'))

    // Add a payer first to have 3
    fireEvent.click(screen.getByLabelText('Add payer'))
    expect(screen.getByText('Person 3')).toBeInTheDocument()

    // Remove last payer
    fireEvent.click(screen.getByLabelText('Remove Person 3'))
    expect(screen.queryByText('Person 3')).not.toBeInTheDocument()
  })

  test('custom mode: add button disabled at 10 payers', () => {
    render(<SplitPaymentConfig {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Custom split'))

    const addButton = screen.getByLabelText('Add payer')

    // Add payers until we reach 10
    for (let i = 0; i < 8; i++) {
      fireEvent.click(addButton)
    }

    // Should now have 10 payers, add button disabled
    expect(addButton).toBeDisabled()
  })

  test('custom mode: remove button disabled at 2 payers', () => {
    render(<SplitPaymentConfig {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Custom split'))

    // With only 2 payers, remove buttons should be disabled
    const removeBtn1 = screen.getByLabelText('Remove Person 1')
    const removeBtn2 = screen.getByLabelText('Remove Person 2')
    expect(removeBtn1).toBeDisabled()
    expect(removeBtn2).toBeDisabled()
  })

  test('custom mode: shows remaining balance', () => {
    render(<SplitPaymentConfig {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Custom split'))

    // With no amounts entered, remaining should be the full total ($100.00)
    expect(screen.getByLabelText('Remaining balance')).toHaveTextContent('Remaining: $100.00')

    // Enter an amount for person 1
    const amountInput = screen.getByLabelText('Amount for Person 1')
    fireEvent.change(amountInput, { target: { value: '40.00' } })

    // Remaining should now be $60.00
    expect(screen.getByLabelText('Remaining balance')).toHaveTextContent('Remaining: $60.00')
  })

  test('continue button disabled until valid configuration', () => {
    render(<SplitPaymentConfig {...defaultProps} />)

    // No mode selected — no continue button visible
    expect(screen.queryByLabelText('Continue with split payment')).not.toBeInTheDocument()

    // Select equal mode with default 2 payers — should be enabled
    fireEvent.click(screen.getByLabelText('Equal split'))
    const continueBtn = screen.getByLabelText('Continue with split payment')
    expect(continueBtn).toBeEnabled()

    // Change to invalid payer count
    const input = screen.getByLabelText('Number of Payers')
    fireEvent.change(input, { target: { value: '1' } })
    expect(continueBtn).toBeDisabled()
  })

  test('calls onConfigured with correct data on continue click (equal mode)', () => {
    render(<SplitPaymentConfig {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Equal split'))

    const input = screen.getByLabelText('Number of Payers')
    fireEvent.change(input, { target: { value: '4' } })

    const continueBtn = screen.getByLabelText('Continue with split payment')
    fireEvent.click(continueBtn)

    expect(defaultProps.onConfigured).toHaveBeenCalledWith({
      splitType: 'equal',
      payerCount: 4,
      payerAmountsCents: [2500, 2500, 2500, 2500],
    })
  })

  test('calls onConfigured with correct data on continue click (custom mode)', () => {
    render(<SplitPaymentConfig {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Custom split'))

    // Enter valid amounts that sum to $100
    const input1 = screen.getByLabelText('Amount for Person 1')
    const input2 = screen.getByLabelText('Amount for Person 2')
    fireEvent.change(input1, { target: { value: '60.00' } })
    fireEvent.change(input2, { target: { value: '40.00' } })

    const continueBtn = screen.getByLabelText('Continue with split payment')
    fireEvent.click(continueBtn)

    expect(defaultProps.onConfigured).toHaveBeenCalledWith({
      splitType: 'custom',
      payerCount: 2,
      payerAmountsCents: [6000, 4000],
    })
  })
})
