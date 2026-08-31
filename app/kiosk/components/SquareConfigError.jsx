'use client'

/**
 * Loud, unmissable banner shown when Square is misconfigured or the payment
 * form fails to initialize. Unlike the soft "not connected" notice, this is a
 * hard error state: it means card payments cannot work until someone fixes the
 * configuration, so it is styled as a red alert and names the specific problem.
 *
 * @param {{ code?: string, message: string }} props
 */
export default function SquareConfigError({ code, message }) {
  return (
    <div
      role="alert"
      style={{
        padding: '1.5rem',
        background: '#f8d7da',
        borderRadius: '8px',
        border: '2px solid #dc3545',
        textAlign: 'center',
        color: '#721c24',
      }}
    >
      <strong style={{ display: 'block', fontSize: '1rem', marginBottom: '0.5rem' }}>
        Card payment unavailable — configuration problem
      </strong>
      <p style={{ margin: 0, fontSize: '0.9rem' }}>{message}</p>
      <p style={{ margin: '0.75rem 0 0', fontSize: '0.8rem', opacity: 0.85 }}>
        Please take payment in person and let the provider know.
        {code ? ` (code: ${code})` : ''}
      </p>
    </div>
  )
}
