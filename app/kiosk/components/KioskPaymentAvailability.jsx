'use client'

import SquareConfigError from './SquareConfigError'

/**
 * Renders the correct card-payment UI state for a kiosk page based on the
 * resolved Square status. Centralizes the availability decision tree that was
 * previously duplicated across the single, multi, and bundle kiosk pages:
 *
 *   config error / init error → loud SquareConfigError banner
 *   still resolving            → "Checking…" notice
 *   network error              → retryable notice
 *   not connected / reconnect  → soft "pay in person" notice
 *   connected                  → the payment form (passed as children)
 *
 * @param {Object} props
 * @param {{ code?: string, message?: string }|null} props.initError - Square SDK init/config error from useSquarePayment
 * @param {string|null} props.squareReason - 'config_error' | 'network_error' | 'needs_reconnect' | 'not_connected' | 'ok' | null (resolving)
 * @param {string|null} props.squareLocationId - resolved location; when set, the form (children) is shown
 * @param {() => void} [props.onRetry] - called when the user taps Retry after a network error; omit to hide the button
 * @param {boolean} [props.suppressNotConnected=false] - when true, render nothing (instead of the soft notice) in the not-connected state. Used when another payment mode (e.g. split) is active.
 * @param {string} [props.notConnectedText] - override the "not connected" body copy
 * @param {React.ReactNode} props.children - the payment form, rendered when connected
 */
export default function KioskPaymentAvailability({
  initError,
  squareReason,
  squareLocationId,
  onRetry,
  suppressNotConnected = false,
  notConnectedText = 'The provider has not connected Square. Please pay in person.',
  children,
}) {
  if (initError || squareReason === 'config_error') {
    return (
      <SquareConfigError
        code={initError?.code || 'config_error'}
        message={initError?.message || 'Card payments are temporarily unavailable due to a configuration issue.'}
      />
    )
  }

  if (squareLocationId) {
    return children
  }

  if (suppressNotConnected) return null

  if (squareReason === null) {
    return (
      <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-light)' }}>
        <p style={{ margin: 0, fontSize: '0.9rem' }}>Checking card payment availability…</p>
      </div>
    )
  }

  if (squareReason === 'network_error') {
    return (
      <div style={{ padding: '1.5rem', background: '#fff3cd', borderRadius: '8px', border: '1px solid #ffc107', textAlign: 'center' }}>
        <strong>Couldn&apos;t check card payment</strong>
        <p style={{ margin: '0.5rem 0 1rem', fontSize: '0.9rem' }}>There was a temporary network problem.</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="cta" style={{ display: 'inline-block' }}>
            Retry
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: '1.5rem', background: '#fff3cd', borderRadius: '8px', border: '1px solid #ffc107', textAlign: 'center' }}>
      <strong>Card payment not available</strong>
      <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
        {squareReason === 'needs_reconnect'
          ? 'The provider needs to reconnect Square in Dashboard → Settings.'
          : notConnectedText}
      </p>
    </div>
  )
}
