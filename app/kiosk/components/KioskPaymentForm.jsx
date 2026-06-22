'use client'

/**
 * Shared kiosk payment form: card container, error display, and pay button.
 * Used by both single-appointment and bundle kiosk payment pages.
 */
export default function KioskPaymentForm({ totalDue, paying, card, error, onPay }) {
  return (
    <>
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Card Information</label>
        <div id="card-container" style={{
          minHeight: '100px', padding: '1rem', background: 'white', borderRadius: '8px',
          border: '1px solid var(--color-border)'
        }}></div>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: '#fee', border: '1px solid #f5c6cb', borderRadius: '8px', color: '#c33', marginBottom: '1rem', fontWeight: '500' }}>
          {error}
        </div>
      )}

      <button
        onClick={onPay}
        disabled={paying || !card}
        className="cta"
        style={{ width: '100%', padding: '1.25rem', fontSize: '1.2rem', opacity: (paying || !card) ? 0.6 : 1 }}
      >
        {paying ? 'Processing...' : `Pay $${totalDue.toFixed(2)}`}
      </button>
    </>
  )
}
