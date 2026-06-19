'use client'

import Link from 'next/link'

/**
 * Renders a single appointment as a tappable card in the kiosk list.
 */
export default function AppointmentCard({ apt, formatTime }) {
  return (
    <Link
      href={`/kiosk/${apt.appointmentId}`}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '1.5rem', background: 'white', borderRadius: '12px',
        border: '1px solid var(--color-border)', textDecoration: 'none', color: 'inherit',
        cursor: 'pointer'
      }}
    >
      <div>
        <div style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.25rem' }}>
          {apt.customer?.name || 'Walk-in'}
        </div>
        <div style={{ color: 'var(--color-text-light)', fontSize: '0.9rem' }}>
          {apt.service?.name || 'Service'} · {apt.service?.duration} min
          {apt.staffName && ` · ${apt.staffName}`}
        </div>
        <div style={{ color: 'var(--color-primary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
          {apt.vendorName}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--color-primary)' }}>
          ${apt.service?.price?.toFixed(2) || '0.00'}
        </div>
        <div style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>
          {formatTime(apt.dateTime)}
        </div>
      </div>
    </Link>
  )
}
