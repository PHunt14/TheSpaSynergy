'use client'

import { useState, useEffect, useRef } from 'react'
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
  const [selectedServices, setSelectedServices] = useState([])
  const [categoryFilter, setCategoryFilter] = useState('All')

  useEffect(() => {
    document.title = 'Our Services | The Spa Synergy'
    Promise.all([
      fetch('/api/vendors').then(r => r.json()),
      fetch('/api/services').then(r => r.json())
    ])
      .then(([vendorData, serviceData]) => {
        const v = [...(vendorData.vendors || [])]
        for (let i = v.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [v[i], v[j]] = [v[j], v[i]]
        }
        setVendors(v)
        setServices((serviceData.services || []).filter(s => s.isActive !== false))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const toggleService = (service) => {
    setSelectedServices(prev =>
      prev.find(s => s.serviceId === service.serviceId)
        ? prev.filter(s => s.serviceId !== service.serviceId)
        : [...prev, service]
    )
  }

  const totalPrice = selectedServices.reduce((sum, s) => sum + s.price, 0)
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration, 0)

  const handleContinue = () => {
    if (selectedServices.length === 1) {
      const s = selectedServices[0]
      router.push(`/booking/time?vendor=${s.vendorId}&service=${s.serviceId}`)
    } else {
      router.push(`/booking/bundle-time?services=${selectedServices.map(s => s.serviceId).join(',')}`)
    }
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>

  const allCategories = ['All', ...new Set(services.map(s => s.category || 'Other'))]

  const filtered = categoryFilter === 'All' ? services : services.filter(s => (s.category || 'Other') === categoryFilter)

  const grouped = filtered.reduce((acc, s) => {
    if (!acc[s.vendorId]) acc[s.vendorId] = {}
    const cat = s.category || 'Other'
    if (!acc[s.vendorId][cat]) acc[s.vendorId][cat] = []
    acc[s.vendorId][cat].push(s)
    return acc
  }, {})

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', paddingBottom: selectedServices.length > 0 ? '120px' : '2rem' }}>
      <h1 style={{ textAlign: 'center' }}>Our Services</h1>
      <p style={{ color: 'var(--color-text-light)', textAlign: 'center', marginBottom: '0.5rem' }}>
        Browse all of our services and book your next appointment.
      </p>
      <p style={{ color: 'var(--color-text-light)', textAlign: 'center', marginBottom: '1.5rem', fontSize: '1.1rem' }}>
        Select one or more services, then continue to book.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.5rem', marginBottom: '2.5rem' }}>
        {allCategories.map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '999px',
              border: '2px solid var(--color-primary)',
              background: categoryFilter === cat ? 'var(--color-primary)' : 'transparent',
              color: categoryFilter === cat ? 'white' : 'var(--color-primary)',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: 500,
              transition: '0.2s ease',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {vendors.map(vendor => {
        const categories = grouped[vendor.vendorId]
        if (!categories) return null

        const isFiltered = categoryFilter !== 'All'
        const allVendorServices = isFiltered ? Object.values(categories).flat() : null

        return (
          <FadeIn key={vendor.vendorId} style={{ marginBottom: '3rem' }}>
            <h2 style={{ borderBottom: '2px solid var(--color-primary)', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
              {vendor.name}
            </h2>

            {isFiltered ? (
              <div className="grid-3-cols" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '1.5rem',
              }}>
                {allVendorServices.map(service => {
                  const isSelected = selectedServices.find(s => s.serviceId === service.serviceId)
                  return (
                    <FadeIn key={service.serviceId} style={{
                      padding: '0.75rem',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--color-primary)' : 'var(--color-accent)',
                      color: isSelected ? 'white' : 'var(--color-text)',
                      border: isSelected ? '2px solid var(--color-primary-dark)' : '1px solid var(--color-border)',
                      transition: '0.2s ease',
                    }}>
                      <div onClick={() => toggleService(service)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong>{service.name}</strong>
                          <span style={{ fontSize: '1.2rem', opacity: 0.7 }}>{isSelected ? '✓' : '+'}</span>
                        </div>
                        {service.description && (
                          <div style={{ fontSize: '1rem', opacity: 0.9, margin: '0.25rem 0' }}>
                            {service.description}
                          </div>
                        )}
                        <div style={{ fontSize: '1.05rem', opacity: 0.8 }}>
                          {service.duration} min • ${service.price}
                        </div>
                      </div>
                    </FadeIn>
                  )
                })}
              </div>
            ) : (
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
                    <h3 style={{
                      color: 'var(--color-primary-dark)',
                      marginBottom: '1rem',
                      marginTop: 0,
                      textAlign: 'center',
                      borderBottom: '2px solid var(--color-primary)',
                      paddingBottom: '0.5rem',
                    }}>{category}</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {catServices.map(service => {
                        const isSelected = selectedServices.find(s => s.serviceId === service.serviceId)
                        return (
                          <div
                            key={service.serviceId}
                            onClick={() => toggleService(service)}
                            style={{
                              padding: '0.75rem',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              background: isSelected ? 'var(--color-primary)' : 'white',
                              color: isSelected ? 'white' : 'var(--color-text)',
                              border: isSelected ? '2px solid var(--color-primary-dark)' : '2px solid transparent',
                              transition: '0.2s ease',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <strong>{service.name}</strong>
                              <span style={{ fontSize: '1.2rem', opacity: 0.7 }}>{isSelected ? '✓' : '+'}</span>
                            </div>
                            {service.description && (
                              <div style={{ fontSize: '1rem', opacity: 0.9, margin: '0.25rem 0' }}>
                                {service.description}
                              </div>
                            )}
                            <div style={{ fontSize: '1.05rem', opacity: 0.8 }}>
                              {service.duration} min • ${service.price}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </FadeIn>
                ))}
              </div>
            )}
          </FadeIn>
        )
      })}

      {/* Sticky bottom bar */}
      {selectedServices.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'white',
          borderTop: '2px solid var(--color-primary)',
          padding: '1rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 1000,
          boxShadow: '0 -4px 12px rgba(0,0,0,0.1)',
        }}>
          <div>
            <strong>{selectedServices.length} service{selectedServices.length > 1 ? 's' : ''} selected</strong>
            <span style={{ color: 'var(--color-text-light)', marginLeft: '1rem' }}>
              {totalDuration} min • ${totalPrice.toFixed(2)}
            </span>
          </div>
          <button onClick={handleContinue} className="cta" style={{ margin: 0 }}>
            Continue to Booking →
          </button>
        </div>
      )}
    </div>
  )
}
