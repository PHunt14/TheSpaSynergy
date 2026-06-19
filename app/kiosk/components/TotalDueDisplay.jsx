'use client'

/**
 * Shared "Total Due" display card for kiosk payment pages.
 */
export default function TotalDueDisplay({ totalDue, tipAmount, priceLabel, priceAmount }) {
  return (
    <div style={{
      textAlign: 'center', padding: '1.5rem', background: 'white', borderRadius: '12px',
      border: '2px solid var(--color-primary)', marginBottom: '2rem'
    }}>
      <div style={{ fontSize: '0.9rem', color: 'var(--color-text-light)', marginBottom: '0.25rem' }}>Total Due</div>
      <div style={{ fontSize: '2.5rem', fontWeight: '700', color: 'var(--color-primary)' }}>
        ${totalDue.toFixed(2)}
      </div>
      {tipAmount > 0 && (
        <div style={{ fontSize: '0.9rem', color: 'var(--color-text-light)', marginTop: '0.25rem' }}>
          {priceLabel}: ${priceAmount.toFixed(2)} + Tip: ${tipAmount.toFixed(2)}
        </div>
      )}
    </div>
  )
}
