'use client'

import { useRef, useEffect, useCallback } from 'react'

/**
 * Shared kiosk payment form: card container, error display, and pay button.
 * Used by both single-appointment and bundle kiosk payment pages.
 *
 * Enhanced with:
 * - Error type–specific messaging (declined, config, network, partial, timeout)
 * - Idempotency UX: button disables within 100ms, 30-second timeout
 * - Retry logic with max retries for network errors
 * - Persistent error messages (no auto-dismiss)
 * - Never exposes raw errors, stack traces, Square references, or internal IDs
 */
export default function KioskPaymentForm({
  totalDue,
  paying,
  card,
  error,
  errorType,
  retryCount = 0,
  maxRetries = 3,
  partialPaymentRef,
  onPay,
  onRetry,
  onPayLater,
  onDismissError,
}) {
  const buttonRef = useRef(null)
  const timeoutRef = useRef(null)
  const clickedRef = useRef(false)

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  // Reset clickedRef when paying becomes false (response received or timeout)
  useEffect(() => {
    if (!paying) {
      clickedRef.current = false
    }
  }, [paying])

  const handlePay = useCallback(() => {
    if (clickedRef.current || paying || !card) return

    // Disable immediately within 100ms
    clickedRef.current = true
    if (buttonRef.current) {
      buttonRef.current.disabled = true
    }

    onPay()
  }, [paying, card, onPay])

  // Determine if button should be disabled
  const isButtonDisabled = paying || !card || clickedRef.current

  // Determine error message based on errorType
  const errorMessage = getErrorMessage(errorType, error, retryCount, maxRetries, partialPaymentRef)

  // Determine if retry button should be shown and enabled
  const showRetryButton = errorType === 'network' || errorType === 'timeout'
  const retryExhausted = retryCount >= maxRetries
  const showPayLaterButton = errorType === 'config' || (errorType === 'network' && retryExhausted)

  return (
    <>
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Card Information</label>
        <div id="card-container" style={{
          minHeight: '100px', padding: '1rem', background: 'white', borderRadius: '8px',
          border: '1px solid var(--color-border)'
        }}></div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            padding: '1rem',
            background: errorType === 'partial' ? '#fff3cd' : '#fee',
            border: `1px solid ${errorType === 'partial' ? '#ffc107' : '#f5c6cb'}`,
            borderRadius: '8px',
            color: errorType === 'partial' ? '#856404' : '#c33',
            marginBottom: '1rem',
            fontWeight: '500',
          }}
        >
          <p style={{ margin: 0 }}>{errorMessage}</p>

          {/* Partial payment: show reference ID */}
          {errorType === 'partial' && partialPaymentRef && (
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
              Reference: {partialPaymentRef}
            </p>
          )}

          {/* Network/timeout: show retry button */}
          {showRetryButton && onRetry && (
            <button
              onClick={onRetry}
              disabled={retryExhausted}
              className="cta"
              style={{
                marginTop: '0.75rem',
                padding: '0.75rem 1.5rem',
                fontSize: '1rem',
                opacity: retryExhausted ? 0.6 : 1,
              }}
            >
              Try Again
            </button>
          )}

          {/* Config error or exhausted retries: show Pay Later button */}
          {showPayLaterButton && onPayLater && (
            <button
              onClick={onPayLater}
              className="cta"
              style={{
                marginTop: '0.75rem',
                padding: '0.75rem 1.5rem',
                fontSize: '1rem',
                background: 'var(--color-secondary, #6c757d)',
              }}
            >
              Pay Later
            </button>
          )}

          {/* Dismiss button for errors that just need acknowledgment */}
          {onDismissError && errorType !== 'partial' && (
            <button
              onClick={onDismissError}
              style={{
                marginTop: '0.5rem',
                marginLeft: showRetryButton || showPayLaterButton ? '0.5rem' : '0',
                padding: '0.5rem 1rem',
                fontSize: '0.9rem',
                background: 'transparent',
                border: '1px solid currentColor',
                borderRadius: '4px',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      <button
        ref={buttonRef}
        onClick={handlePay}
        disabled={isButtonDisabled}
        className="cta"
        style={{ width: '100%', padding: '1.25rem', fontSize: '1.2rem', opacity: isButtonDisabled ? 0.6 : 1 }}
      >
        {paying ? (
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <span className="spinner" aria-hidden="true" style={{
              display: 'inline-block',
              width: '1rem',
              height: '1rem',
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: '#fff',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            Processing...
          </span>
        ) : (
          `Pay $${totalDue.toFixed(2)}`
        )}
      </button>

      {/* CSS for spinner animation */}
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  )
}

/**
 * Returns a user-friendly error message based on error type.
 * Never exposes raw errors, stack traces, Square references, or internal IDs.
 */
function getErrorMessage(errorType, error, retryCount, maxRetries, partialPaymentRef) {
  if (!errorType && !error) return null

  switch (errorType) {
    case 'declined':
      return 'Card declined \u2014 please try a different card'

    case 'config':
      return 'Card payment not available \u2014 please pay in person'

    case 'network':
      if (retryCount >= maxRetries) {
        return 'Something went wrong \u2014 please try again later or pay in person'
      }
      return 'Something went wrong \u2014 please try again'

    case 'partial':
      return 'A partial payment was processed. Please contact support with the reference below for assistance.'

    case 'timeout':
      return 'Request timed out \u2014 please try again'

    default:
      // Fallback: display generic error string if provided, but sanitize it
      if (error) {
        return sanitizeErrorMessage(error)
      }
      return null
  }
}

/**
 * Sanitize an error message to ensure no raw technical details are exposed.
 * Strips Square references, stack traces, internal IDs, and raw error objects.
 */
function sanitizeErrorMessage(message) {
  if (typeof message !== 'string') {
    return 'Something went wrong \u2014 please try again'
  }

  // Check for patterns that should never be shown to customers
  const forbiddenPatterns = [
    /square/i,
    /stack\s*trace/i,
    /Error:/,
    /\{.*".*":.*\}/s, // raw JSON objects
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, // UUIDs
  ]

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(message)) {
      return 'Something went wrong \u2014 please try again'
    }
  }

  return message
}
