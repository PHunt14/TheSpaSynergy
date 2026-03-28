'use client'

import Link from 'next/link'

export const isBookingEnabled = process.env.NEXT_PUBLIC_BOOKING_ENABLED === 'true'

export default function BookingDisabled({ phone, vendorName }) {
  return (
    <main style={{ textAlign: 'center', padding: '4rem 2rem' }}>
      <h1>We&rsquo;re Getting Ready!</h1>
      <p style={{ fontSize: '1.2rem', color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        Online booking is not available right now.
        {vendorName ? ` Give ${vendorName} a call to book today!` : ' Give us a call to book today!'}
      </p>
      {phone && (
        <p style={{ fontSize: '1.4rem', marginBottom: '2rem' }}>
          <a href={`tel:${phone}`} style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>
            📞 {phone}
          </a>
        </p>
      )}
      <Link href="/" className="cta">
        ← Back to Home
      </Link>
    </main>
  )
}
