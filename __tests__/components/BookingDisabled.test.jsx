import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import BookingDisabled from '../../app/components/BookingDisabled'

jest.mock('next/link', () => {
  return ({ children, href, className }) => <a href={href} className={className}>{children}</a>
})

describe('BookingDisabled', () => {
  test('renders default message when no vendor name', () => {
    render(<BookingDisabled />)
    expect(screen.getByText(/Give us a call to book today!/)).toBeInTheDocument()
  })

  test('renders vendor-specific message', () => {
    render(<BookingDisabled vendorName="Kera" />)
    expect(screen.getByText(/Give Kera a call to book today!/)).toBeInTheDocument()
  })

  test('renders phone link when provided', () => {
    render(<BookingDisabled phone="301-555-1234" />)
    const phoneLink = screen.getByRole('link', { name: /301-555-1234/ })
    expect(phoneLink).toHaveAttribute('href', 'tel:301-555-1234')
  })

  test('does not render phone when not provided', () => {
    render(<BookingDisabled />)
    expect(screen.queryByRole('link', { name: /tel:/ })).not.toBeInTheDocument()
  })

  test('renders resume date when disabledUntil provided', () => {
    render(<BookingDisabled disabledUntil="2025-08-15T00:00:00Z" />)
    expect(screen.getByText(/Online booking will resume on/)).toBeInTheDocument()
  })

  test('does not render resume date when not provided', () => {
    render(<BookingDisabled />)
    expect(screen.queryByText(/Online booking will resume/)).not.toBeInTheDocument()
  })

  test('renders back to home link', () => {
    render(<BookingDisabled />)
    const backLink = screen.getByRole('link', { name: /Back to Home/ })
    expect(backLink).toHaveAttribute('href', '/')
  })
})
