import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import Footer from '../../app/components/Footer'

// Mock next/link to render a plain anchor
jest.mock('next/link', () => {
  return ({ children, href }) => <a href={href}>{children}</a>
})

describe('Footer', () => {
  beforeEach(() => {
    render(<Footer />)
  })

  test('renders business name', () => {
    expect(screen.getByText('The Spa Synergy')).toBeInTheDocument()
  })

  test('renders address', () => {
    expect(screen.getByText(/Fort Ritchie, MD 21719/)).toBeInTheDocument()
  })

  test('renders navigation links', () => {
    expect(screen.getByRole('link', { name: 'Practitioners' })).toHaveAttribute('href', '/vendors')
    expect(screen.getByRole('link', { name: 'Packages' })).toHaveAttribute('href', '/bundles')
    expect(screen.getByRole('link', { name: 'Book Now' })).toHaveAttribute('href', '/booking')
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/contact')
    expect(screen.getByRole('link', { name: 'Vendor Dashboard' })).toHaveAttribute('href', '/dashboard')
  })

  test('renders current year in copyright', () => {
    const year = new Date().getFullYear().toString()
    expect(screen.getByText(new RegExp(year))).toBeInTheDocument()
  })
})
