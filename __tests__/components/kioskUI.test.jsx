import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import KioskPaymentForm from '../../app/kiosk/components/KioskPaymentForm'
import KioskPage from '../../app/kiosk/page'

// Mock next/link for KioskPage tests
jest.mock('next/link', () => {
  return ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>
})

// Mock the useSquarePayment hook used by CustomChargeForm
jest.mock('../../app/kiosk/components/useSquarePayment', () => {
  return () => ({ card: null })
})

// Mock modules needed by KioskPage that have ESM issues in jsdom
jest.mock('../../app/kiosk/components/formatTime', () => {
  return (d) => d || ''
})

jest.mock('../../app/kiosk/components/AppointmentCard', () => {
  return ({ apt }) => <div data-testid="appointment-card">{apt?.customer?.name}</div>
})

jest.mock('../../app/kiosk/components/CustomChargeForm', () => {
  return () => <div data-testid="custom-charge-form">Custom Charge Form</div>
})

describe('KioskPaymentForm', () => {
  const defaultProps = {
    totalDue: 50,
    paying: false,
    card: { tokenize: jest.fn() },
    error: null,
    errorType: undefined,
    retryCount: 0,
    maxRetries: 3,
    partialPaymentRef: undefined,
    onPay: jest.fn(),
    onRetry: jest.fn(),
    onPayLater: jest.fn(),
    onDismissError: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('payment button disables on click', () => {
    const onPay = jest.fn()
    render(<KioskPaymentForm {...defaultProps} onPay={onPay} />)

    const button = screen.getByRole('button', { name: /Pay \$50\.00/i })
    expect(button).not.toBeDisabled()

    fireEvent.click(button)

    expect(onPay).toHaveBeenCalledTimes(1)
    expect(button).toBeDisabled()
  })

  test('30-second timeout re-enables button (paying transitions from true to false)', () => {
    const { rerender } = render(
      <KioskPaymentForm {...defaultProps} paying={true} />
    )

    // While paying=true, button shows "Processing..." and is disabled
    const processingButton = screen.getByRole('button', { name: /Processing/i })
    expect(processingButton).toBeDisabled()

    // Simulate timeout: parent sets paying back to false
    rerender(<KioskPaymentForm {...defaultProps} paying={false} />)

    const payButton = screen.getByRole('button', { name: /Pay \$50\.00/i })
    expect(payButton).not.toBeDisabled()
  })

  test('declined card shows correct message and retains form data', () => {
    render(
      <KioskPaymentForm
        {...defaultProps}
        error="Card declined"
        errorType="declined"
      />
    )

    // Correct user-facing message displayed
    expect(
      screen.getByText(/Card declined — please try a different card/i)
    ).toBeInTheDocument()

    // Payment button still rendered (form data retained - user can retry with different card)
    expect(screen.getByRole('button', { name: /Pay \$50\.00/i })).toBeInTheDocument()
  })

  test('inPersonRequired shows in-person message and pay-later button', () => {
    const onPayLater = jest.fn()
    render(
      <KioskPaymentForm
        {...defaultProps}
        error="Config error"
        errorType="config"
        onPayLater={onPayLater}
      />
    )

    // In-person message displayed
    expect(
      screen.getByText(/Card payment not available — please pay in person/i)
    ).toBeInTheDocument()

    // Pay Later button is visible
    const payLaterButton = screen.getByRole('button', { name: /Pay Later/i })
    expect(payLaterButton).toBeInTheDocument()

    // Pay Later button works
    fireEvent.click(payLaterButton)
    expect(onPayLater).toHaveBeenCalledTimes(1)
  })

  test('network error shows retry button', () => {
    const onRetry = jest.fn()
    render(
      <KioskPaymentForm
        {...defaultProps}
        error="Network error"
        errorType="network"
        retryCount={0}
        maxRetries={3}
        onRetry={onRetry}
      />
    )

    // Generic user-facing message
    expect(
      screen.getByText(/Something went wrong — please try again/i)
    ).toBeInTheDocument()

    // Retry button is visible and enabled
    const retryButton = screen.getByRole('button', { name: /Try Again/i })
    expect(retryButton).toBeInTheDocument()
    expect(retryButton).not.toBeDisabled()

    fireEvent.click(retryButton)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  test('network error retry exhausted shows pay-later and disables retry', () => {
    const onPayLater = jest.fn()
    render(
      <KioskPaymentForm
        {...defaultProps}
        error="Network error"
        errorType="network"
        retryCount={3}
        maxRetries={3}
        onRetry={jest.fn()}
        onPayLater={onPayLater}
      />
    )

    // Exhausted message
    expect(
      screen.getByText(/Something went wrong — please try again later or pay in person/i)
    ).toBeInTheDocument()

    // Retry button is disabled
    const retryButton = screen.getByRole('button', { name: /Try Again/i })
    expect(retryButton).toBeDisabled()

    // Pay Later button is shown
    const payLaterButton = screen.getByRole('button', { name: /Pay Later/i })
    expect(payLaterButton).toBeInTheDocument()
    fireEvent.click(payLaterButton)
    expect(onPayLater).toHaveBeenCalledTimes(1)
  })

  test('error messages do not auto-dismiss', () => {
    jest.useFakeTimers()

    render(
      <KioskPaymentForm
        {...defaultProps}
        error="Card declined"
        errorType="declined"
      />
    )

    expect(
      screen.getByText(/Card declined — please try a different card/i)
    ).toBeInTheDocument()

    // Advance time significantly — error should still be there
    act(() => {
      jest.advanceTimersByTime(60000)
    })

    expect(
      screen.getByText(/Card declined — please try a different card/i)
    ).toBeInTheDocument()

    jest.useRealTimers()
  })

  test('partial payment shows reference ID', () => {
    render(
      <KioskPaymentForm
        {...defaultProps}
        error="Partial payment"
        errorType="partial"
        partialPaymentRef="pay_abc123"
      />
    )

    // Partial payment message
    expect(
      screen.getByText(/partial payment was processed/i)
    ).toBeInTheDocument()

    // Reference ID displayed
    expect(screen.getByText(/pay_abc123/)).toBeInTheDocument()
  })
})

describe('Kiosk Page', () => {
  beforeEach(() => {
    // Mock fetch to resolve with empty appointments and providers
    global.fetch = jest.fn((url) => {
      if (url === '/api/kiosk/appointments') {
        return Promise.resolve({
          json: () => Promise.resolve({ appointments: [] }),
        })
      }
      if (url === '/api/providers') {
        return Promise.resolve({
          json: () => Promise.resolve({ providers: [] }),
        })
      }
      return Promise.resolve({
        json: () => Promise.resolve({}),
      })
    })
  })

  afterEach(() => {
    global.fetch.mockRestore?.()
    delete global.fetch
  })

  test('Custom Charge button is visible on kiosk page', async () => {
    await act(async () => {
      render(<KioskPage />)
    })

    // Wait for the loading state to finish and Custom Charge button to appear
    const customChargeButton = await screen.findByRole('button', { name: /Custom Charge/i })
    expect(customChargeButton).toBeInTheDocument()
  })
})
