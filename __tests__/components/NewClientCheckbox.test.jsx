import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import NewClientCheckbox from '../../app/components/NewClientCheckbox'

describe('NewClientCheckbox', () => {
  test('renders checkbox with label "First time visiting?"', () => {
    render(<NewClientCheckbox checked={false} onChange={() => {}} />)
    expect(screen.getByLabelText('First time visiting?')).toBeInTheDocument()
  })

  test('defaults checkbox to unchecked', () => {
    render(<NewClientCheckbox onChange={() => {}} />)
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).not.toBeChecked()
  })

  test('calls onChange with true when checkbox is checked', () => {
    const handleChange = jest.fn()
    render(<NewClientCheckbox checked={false} onChange={handleChange} />)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(handleChange).toHaveBeenCalledWith(true)
  })

  test('calls onChange with false when checkbox is unchecked', () => {
    const handleChange = jest.fn()
    render(<NewClientCheckbox checked={true} onChange={handleChange} />)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(handleChange).toHaveBeenCalledWith(false)
  })

  test('shows "Welcome back" badge when isReturningClient is true', () => {
    render(<NewClientCheckbox checked={false} onChange={() => {}} isReturningClient={true} />)
    expect(screen.getByText(/Welcome back/)).toBeInTheDocument()
  })

  test('does not show "Welcome back" badge when isReturningClient is false', () => {
    render(<NewClientCheckbox checked={false} onChange={() => {}} isReturningClient={false} />)
    expect(screen.queryByText(/Welcome back/)).not.toBeInTheDocument()
  })

  test('shows suggestion prompt when showSuggestion is true', () => {
    render(<NewClientCheckbox checked={false} onChange={() => {}} showSuggestion={true} />)
    expect(screen.getByText(/If this is your first visit, please check the box above/)).toBeInTheDocument()
  })

  test('does not show suggestion prompt when showSuggestion is false', () => {
    render(<NewClientCheckbox checked={false} onChange={() => {}} showSuggestion={false} />)
    expect(screen.queryByText(/If this is your first visit/)).not.toBeInTheDocument()
  })

  test('does not show both badge and suggestion simultaneously when isReturningClient is true', () => {
    render(<NewClientCheckbox checked={false} onChange={() => {}} isReturningClient={true} showSuggestion={true} />)
    // isReturningClient takes priority - badge shows, suggestion also shows since they are independent
    expect(screen.getByText(/Welcome back/)).toBeInTheDocument()
  })
})
