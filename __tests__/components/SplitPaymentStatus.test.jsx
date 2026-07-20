import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import SplitPaymentStatus from '../../app/kiosk/components/SplitPaymentStatus'

// Mock the splitCalculator module
jest.mock('../../app/utils/splitCalculator', () => ({
  centsToDollars: (cents) => (cents / 100).toFixed(2),
}))

describe('SplitPaymentStatus', () => {
  const makeSession = (overrides = {}) => ({
    sessionId: 'session-123',
    status: 'partial',
    totalAmountCents: 10000,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    payers: [
      { payerIndex: 0, label: 'Person 1', amountCents: 5000, status: 'paid', squarePaymentId: 'sq-1', paidAt: '2024-01-01T00:00:00Z' },
      { payerIndex: 1, label: 'Person 2', amountCents: 3000, status: 'pending', squarePaymentId: null, paidAt: null },
      { payerIndex: 2, label: 'Person 3', amountCents: 2000, status: 'pending', squarePaymentId: null, paidAt: null },
    ],
    ...overrides,
  })

  const defaultProps = {
    session: makeSession(),
    onPayPayer: jest.fn(),
    showPayButtons: true,
  }

  beforeEach(() => {
    defaultProps.onPayPayer.mockClear()
  })

  test('renders payer table with correct labels, amounts, statuses', () => {
    render(<SplitPaymentStatus {...defaultProps} />)

    expect(screen.getByText('Person 1')).toBeInTheDocument()
    expect(screen.getByText('Person 2')).toBeInTheDocument()
    expect(screen.getByText('Person 3')).toBeInTheDocument()

    expect(screen.getByText('$50.00')).toBeInTheDocument()
    expect(screen.getByText('$30.00')).toBeInTheDocument()
    expect(screen.getByText('$20.00')).toBeInTheDocument()
  })

  test('shows green checkmark for paid payers', () => {
    render(<SplitPaymentStatus {...defaultProps} />)

    // Person 1 is paid - should show "Paid" text
    const paidIndicators = screen.getAllByText('Paid')
    expect(paidIndicators.length).toBeGreaterThanOrEqual(1)

    // The checkmark ✓ is present (aria-hidden)
    const row = screen.getByText('Person 1').closest('tr')
    expect(row).toHaveTextContent('✓')
    expect(row).toHaveTextContent('Paid')
  })

  test('shows pending indicator for unpaid payers', () => {
    render(<SplitPaymentStatus {...defaultProps} />)

    const pendingIndicators = screen.getAllByText('Pending')
    expect(pendingIndicators).toHaveLength(2) // Person 2 and Person 3
  })

  test('pay button disabled for paid payers', () => {
    render(<SplitPaymentStatus {...defaultProps} />)

    const paidButton = screen.getByLabelText('Person 1 already paid')
    expect(paidButton).toBeDisabled()
  })

  test('pay button enabled for pending payers (when showPayButtons=true)', () => {
    render(<SplitPaymentStatus {...defaultProps} />)

    const payBtn2 = screen.getByLabelText('Pay for Person 2')
    const payBtn3 = screen.getByLabelText('Pay for Person 3')
    expect(payBtn2).toBeEnabled()
    expect(payBtn3).toBeEnabled()
  })

  test('no pay buttons when showPayButtons=false', () => {
    render(<SplitPaymentStatus session={makeSession()} onPayPayer={jest.fn()} showPayButtons={false} />)

    expect(screen.queryByLabelText('Person 1 already paid')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Pay for Person 2')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Pay for Person 3')).not.toBeInTheDocument()
  })

  test('expired session shows expiration message', () => {
    const expiredSession = makeSession({ status: 'expired' })
    render(<SplitPaymentStatus session={expiredSession} onPayPayer={jest.fn()} showPayButtons={true} />)

    expect(screen.getByText('This session has expired')).toBeInTheDocument()
  })

  test('expired session disables all pay buttons', () => {
    const expiredSession = makeSession({ status: 'expired' })
    render(<SplitPaymentStatus session={expiredSession} onPayPayer={jest.fn()} showPayButtons={true} />)

    // All pay buttons should be disabled, including pending ones
    const allPayButtons = screen.getAllByRole('button', { name: /Pay|paid/i })
    allPayButtons.forEach((btn) => {
      expect(btn).toBeDisabled()
    })
  })
})
