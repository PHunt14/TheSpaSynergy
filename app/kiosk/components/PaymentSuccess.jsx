'use client'

import Link from 'next/link'

/**
 * Shared payment success screen for the kiosk.
 */
export default function PaymentSuccess({ totalDue, tipAmount, customerName, subtitle }) {
  return (
    <div style={{ textAlign: 'center', padding: '3rem 2rem' }}>
      <div style={{
        background: '#d4edda', border: '2px solid #c3e6cb', borderRadius: '12px',
        padding: '2rem', marginBottom: '2rem'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
        <h1 style={{ color: '#155724', marginBottom: '0.5rem' }}>Payment Received</h1>
        <p style={{ color: '#155724', fontSize: '1.25rem', fontWeight: '600' }}>
          ${totalDue.toFixed(2)}
          {tipAmount > 0 && (
            <span style={{ fontSize: '0.9rem', fontWeight: '400' }}> (includes ${tipAmount.toFixed(2)} tip)</span>
          )}
        </p>
        <p style={{ color: '#155724' }}>
          {customerName}
        </p>
        {subtitle && (
          <p style={{ color: '#155724', fontSize: '0.9rem' }}>
            {subtitle}
          </p>
        )}
      </div>
      <Link href="/kiosk" className="cta" style={{ display: 'inline-block' }}>
        ← Back to checkout list
      </Link>
    </div>
  )
}
