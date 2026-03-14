'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

function FadeIn({ children, style }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.unobserve(el) } },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={{
        ...style,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
      }}
    >
      {children}
    </div>
  )
}

export default function ServicesPage() {
  const router = useRouter()
  const [vendors, setVendors] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = 'Our Services | The Spa Synergy'
    Promise.all([
      fetch('/api/vendors').then(r => r.json()),
      fetch('/api/services').then(r => r.json())
    ])
      .then(([vendorData, serviceData]) => {
        setVendors(vendorData.vendors || [])
        setServices((serviceData.services || []).filter(s => s.isActive !== false))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>

  const grouped = services.reduce((acc, s) => {
    if (!acc[s.vendorId]) acc[s.vendorId] = {}
    const cat = s.category || 'Other'
    if (!acc[s.vendorId][cat]) acc[s.vendorId][cat] = []
    acc[s.vendorId][cat].push(s)
    return acc
  }, {})

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center' }}>Our Services</h1>
      <p style={{ color: 'var(--color-text-light)', textAlign: 'center', marginBottom: '3rem' }}>
        Browse all of our services and book your next appointment.
      </p>

      {vendors.map(vendor => {
        const categories = grouped[vendor.vendorId]
        if (!categories) return null

        return (
          <FadeIn key={vendor.vendorId} style={{ marginBottom: '3rem' }}>
            <h2 style={{ borderBottom: '2px solid var(--color-primary)', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
              {vendor.name}
            </h2>

            <div className="grid-3-cols" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '1.5rem',
            }}>
              {Object.entries(categories).map(([category, catServices]) => (
                <FadeIn key={category} style={{
                  background: 'var(--color-accent)',
                  borderRadius: '12px',
                  border: '1px solid var(--color-border)',
                  padding: '1.5rem',
                }}>
                  <h3 style={{ color: 'var(--color-primary)', marginBottom: '1rem', marginTop: 0 }}>{category}</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {catServices.map(service => (
                      <div
                        key={service.serviceId}
                        onClick={() => router.push(`/booking/time?vendor=${vendor.vendorId}&service=${service.serviceId}`)}
                        style={{
                          padding: '0.75rem',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          background: 'white',
                          transition: '0.2s ease',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-primary)'; e.currentTarget.style.color = 'white' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = 'var(--color-text)' }}
                      >
                        <strong>{service.name}</strong>
                        {service.description && (
                          <div style={{ fontSize: '0.85rem', opacity: 0.9, margin: '0.25rem 0' }}>
                            {service.description}
                          </div>
                        )}
                        <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                          {service.duration} min • ${service.price}
                        </div>
                      </div>
                    ))}
                  </div>
                </FadeIn>
              ))}
            </div>
          </FadeIn>
        )
      })}
    </div>
  )
}
