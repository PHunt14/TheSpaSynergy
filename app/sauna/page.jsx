'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SaunaPage() {
  const router = useRouter()
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    document.title = 'Book the Sauna | The Spa Synergy'
    fetch('/api/services')
      .then(r => r.json())
      .then(data => {
        const sauna = (data.services || []).filter(s => s.isActive !== false && s.resourceType === 'sauna')
        setServices(sauna)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleBook = () => {
    if (!selected) return
    router.push(`/booking/time?vendor=${selected.vendorId}&service=${selected.serviceId}`)
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{
        height: '300px',
        backgroundImage: 'url(https://the-spa-synergy-public.s3.us-east-1.amazonaws.com/vendorPictures/sauna-00.JPEG)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        borderRadius: '16px',
        marginBottom: '2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--color-accent)',
      }} />

      <h1 style={{ textAlign: 'center' }}>Book the Sauna</h1>
      <p style={{ color: 'var(--color-text-light)', textAlign: 'center', marginBottom: '2rem' }}>
        Infrared sauna sessions for detox and deep relaxation. Select a session below to book.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {services.map(service => {
          const isSelected = selected?.serviceId === service.serviceId
          return (
            <div
              key={service.serviceId}
              onClick={() => setSelected(service)}
              style={{
                padding: '1.25rem',
                borderRadius: '12px',
                cursor: 'pointer',
                background: isSelected ? 'var(--color-primary-dark)' : 'var(--color-accent)',
                color: isSelected ? 'white' : 'var(--color-text)',
                border: isSelected ? '2px solid var(--color-primary-dark)' : '2px solid var(--color-border)',
                transition: '0.2s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '1.15rem' }}>{service.name}</strong>
                <span style={{ fontSize: '1.2rem', opacity: 0.7 }}>{isSelected ? '✓' : '+'}</span>
              </div>
              {service.description && (
                <div style={{ fontSize: '1rem', opacity: 0.9, margin: '0.25rem 0' }}>{service.description}</div>
              )}
              <div style={{ fontSize: '1.05rem', opacity: 0.8 }}>
                {service.duration} min • ${service.price}
              </div>
            </div>
          )
        })}
      </div>

      {services.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--color-text-light)' }}>No sauna sessions available right now.</p>
      )}

      {selected && (
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <button onClick={handleBook} className="cta" style={{ margin: 0 }}>
            Continue to Booking →
          </button>
        </div>
      )}
    </div>
  )
}
