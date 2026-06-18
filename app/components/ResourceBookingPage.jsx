'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Shared booking page component for resource-based services (sauna, spa room, etc.)
 *
 * @param {Object} props
 * @param {string} props.resourceType - The resource type to filter services by ('sauna', 'room')
 * @param {string} props.title - Page heading
 * @param {string} props.description - Subheading description text
 * @param {string} props.emptyMessage - Message when no services available
 * @param {string} props.heroImage - URL for the hero background image
 * @param {Object} [props.heroStyle] - Additional styles for the hero image div
 * @param {number} [props.heroHeight] - Height of the hero container in px (default 300)
 * @param {React.ReactNode} [props.children] - Additional content to render after the service list
 */
export default function ResourceBookingPage({
  resourceType,
  title,
  description,
  emptyMessage,
  heroImage,
  heroStyle = {},
  heroHeight = 300,
  children,
}) {
  const router = useRouter()
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    fetch('/api/services')
      .then(r => r.json())
      .then(data => {
        const filtered = (data.services || []).filter(s => s.isActive !== false && s.resourceType === resourceType)
        setServices(filtered)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [resourceType])

  const handleBook = () => {
    if (!selected) return
    router.push(`/booking/time?vendor=${selected.vendorId}&service=${selected.serviceId}`)
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{
        height: `${heroHeight}px`,
        borderRadius: '16px',
        marginBottom: '2rem',
        overflow: 'hidden',
        backgroundColor: 'var(--color-accent)',
      }}>
        <div style={{
          width: '100%',
          height: '100%',
          backgroundImage: `url(${heroImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          ...heroStyle,
        }} />
      </div>

      <h1 style={{ textAlign: 'center' }}>{title}</h1>
      <p style={{ color: 'var(--color-text-light)', textAlign: 'center', marginBottom: '2rem' }}>
        {description}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {services.map(service => {
          const isSelected = selected?.serviceId === service.serviceId
          return (
            <div
              key={service.serviceId}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(service)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(service); } }}
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
        <p style={{ textAlign: 'center', color: 'var(--color-text-light)' }}>{emptyMessage}</p>
      )}

      {children}

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
