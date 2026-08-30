import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import SquareConfigError from '../../app/kiosk/components/SquareConfigError'

describe('SquareConfigError', () => {
  test('renders as an alert with the configuration-problem heading', () => {
    render(<SquareConfigError code="env_mismatch" message="Square environment mismatch." />)
    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent(/configuration problem/i)
  })

  test('shows the specific message and pay-in-person guidance', () => {
    render(<SquareConfigError code="env_mismatch" message="Square environment mismatch: fix both env vars." />)
    expect(screen.getByText(/Square environment mismatch: fix both env vars\./)).toBeInTheDocument()
    expect(screen.getByText(/take payment in person/i)).toBeInTheDocument()
  })

  test('includes the error code for support/debugging', () => {
    render(<SquareConfigError code="missing_app_id" message="Missing app id." />)
    expect(screen.getByText(/code: missing_app_id/)).toBeInTheDocument()
  })

  test('omits the code suffix when no code is provided', () => {
    render(<SquareConfigError message="Something is wrong." />)
    expect(screen.queryByText(/code:/)).not.toBeInTheDocument()
  })
})
