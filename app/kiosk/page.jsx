'use client'

import { useState, useEffect } from 'react'
import { Suspense } from 'react'
import Link from 'next/link'

function KioskContent() {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadAppointments = () => {
    setLoading(true)
    fetch('/api/kiosk/appointments')
      .then(res => res.json())
      .then(data => {
        setAppointments(data.appointments || [])
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load appointments')
        setLoading(false)
      })
  }

  useEffect(() => { loadAppointments() }, [])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(loadAppointments, 60000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (dateTime) => {
    try {
      return new Date(dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    } catch { return dateTime }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Today&rsquo;s Checkout</h1>
          <p style={{ color: 'var(--color-text-light)', margin: '0.5rem 0 0' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <button onClick={loadAppointments} style={{
          padding: '0.75rem 1.5rem', borderRadius: '8px', border: '1px solid var(--color-border)',
          background: 'white', cursor: 'pointer', fontSize: '1rem'
        }}>
          ↻ Refresh
        </button>
      </div>

      {loading && <p>Loading appointments...</p>}
      {error && <p style={{ color: '#c33' }}>{error}</p>}

      {!loading && appointments.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '4rem 2rem', background: 'var(--color-accent)',
          borderRadius: '12px', border: '1px solid var(--color-border)'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
          <h2 style={{ color: 'var(--color-text-light)' }}>All caught up!</h2>
          <p style={{ color: 'var(--color-text-light)' }}>No unpaid appointments for today.</p>
        </div>
      )}

      {!loading && appointments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {appointments.map(apt => (
            <Link
              key={apt.appointmentId}
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
          ))}
        </div>
      )}
    </div>
  )
}

export default function KioskPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <KioskContent />
    </Suspense>
  )
}
