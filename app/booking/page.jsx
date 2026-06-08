'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import BookingDisabled, { isBookingEnabled } from '../components/BookingDisabled'
import PropTypes from 'prop-types'

function FadeIn({ children, style }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
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

FadeIn.propTypes = {
  children: PropTypes.node,
  style: PropTypes.object,
}

function ServiceTile({ service, isSelected, onToggle, disabled }) {
  return (
    <div
      onClick={() => !disabled && onToggle(service)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!disabled) onToggle(service) } }}
      aria-pressed={!!isSelected}
      aria-disabled={disabled && !isSelected}
      style={{
        padding: '1rem',
        borderRadius: '8px',
        cursor: disabled && !isSelected ? 'not-allowed' : 'pointer',
        background: isSelected ? 'var(--color-primary)' : 'white',
        color: isSelected ? 'white' : 'var(--color-text)',
        border: isSelected ? '2px solid var(--color-primary-dark)' : '2px solid var(--color-border)',
        opacity: disabled && !isSelected ? 0.5 : 1,
        transition: '0.2s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>{service.name}</strong>
        <span style={{ fontSize: '1.2rem', opacity: 0.7 }}>{isSelected ? '✓' : '+'}</span>
      </div>
      {service.description && (
        <div style={{ fontSize: '0.95rem', opacity: 0.85, margin: '0.25rem 0' }}>
          {service.description}
        </div>
      )}
      <div style={{ fontSize: '1.05rem', opacity: 0.8, marginTop: '0.25rem' }}>
        {service.duration} min • ${service.price}
      </div>
    </div>
  )
}

ServiceTile.propTypes = {
  service: PropTypes.object.isRequired,
  isSelected: PropTypes.bool,
  onToggle: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
}

/**
 * Groups services by category.
 * Each service may appear in multiple category groups if it has multiple categories.
 * Services with empty/null categories go in "Other".
 */
function groupServicesByCategory(services) {
  const groups = {}

  for (const service of services) {
    const cats = service.categories && Array.isArray(service.categories) && service.categories.length > 0
      ? service.categories
      : ['Other']

    for (const cat of cats) {
      const categoryName = cat || 'Other'
      if (!groups[categoryName]) groups[categoryName] = []
      groups[categoryName].push(service)
    }
  }

  return groups
}

/**
 * Gets unique category names from services list, sorted alphabetically with "Other" at end.
 */
function getCategories(services) {
  const categorySet = new Set()

  for (const service of services) {
    if (service.categories && Array.isArray(service.categories) && service.categories.length > 0) {
      for (const cat of service.categories) {
        categorySet.add(cat || 'Other')
      }
    } else {
      categorySet.add('Other')
    }
  }

  const categories = [...categorySet].sort((a, b) => {
    if (a === 'Other') return 1
    if (b === 'Other') return -1
    return a.localeCompare(b)
  })

  return categories
}

function BookingContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedServices, setSelectedServices] = useState([])
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [showDisabled, setShowDisabled] = useState(false)

  const MAX_SERVICES = 4

  useEffect(() => {
    fetch('/api/services')
      .then(r => r.json())
      .then((serviceData) => {
        const active = (serviceData.services || []).filter(s => s.isActive !== false)
        // Only show parent services (not addons) in the main list
        setServices(active.filter(s => !(s.parentServiceIds?.length > 0)))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const toggleService = (service) => {
    setSelectedServices(prev => {
      if (prev.find(s => s.serviceId === service.serviceId)) {
        return prev.filter(s => s.serviceId !== service.serviceId)
      }
      return prev.length >= MAX_SERVICES ? prev : [...prev, service]
    })
  }

  const totalPrice = selectedServices.reduce((sum, s) => sum + s.price, 0)
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration, 0)

  const handleContinue = () => {
    if (!isBookingEnabled) { setShowDisabled(true); return }
    if (selectedServices.length === 1) {
      const s = selectedServices[0]
      router.push(`/booking/provider?service=${s.serviceId}`)
    } else {
      router.push(`/booking/bundle-time?services=${selectedServices.map(s => s.serviceId).join(',')}`)
    }
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>
  if (showDisabled) return <BookingDisabled />

  const categories = getCategories(services)
  const allCategories = ['All', ...categories]

  // Filter services by selected category
  const filteredServices = categoryFilter === 'All'
    ? services
    : services.filter(s => {
        const cats = s.categories && Array.isArray(s.categories) && s.categories.length > 0
          ? s.categories
          : ['Other']
        return cats.includes(categoryFilter)
      })

  // Group filtered services by category
  const grouped = groupServicesByCategory(filteredServices)

  // Sort category groups: alphabetical with "Other" at end
  const sortedGroupKeys = Object.keys(grouped).sort((a, b) => {
    if (a === 'Other') return 1
    if (b === 'Other') return -1
    return a.localeCompare(b)
  })

  const atMaxSelection = selectedServices.length >= MAX_SERVICES

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', paddingBottom: selectedServices.length > 0 ? '120px' : '2rem' }}>
      <h1 style={{ textAlign: 'center' }}>Book a Service</h1>
      <p style={{ color: 'var(--color-text-light)', textAlign: 'center', marginBottom: '0.5rem' }}>
        Browse our services and select what you&rsquo;d like to book.
      </p>
      <p style={{ color: 'var(--color-text-light)', textAlign: 'center', marginBottom: '1.5rem', fontSize: '1.1rem' }}>
        Select up to {MAX_SERVICES} services, then continue to choose your provider.
      </p>

      {/* Category filter buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.5rem', marginBottom: '2.5rem' }}>
        {allCategories.map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            aria-pressed={categoryFilter === cat}
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

      {/* Selection indicator */}
      {atMaxSelection && (
        <p style={{ textAlign: 'center', color: 'var(--color-primary-dark)', fontWeight: 500, marginBottom: '1.5rem' }}>
          Maximum of {MAX_SERVICES} services selected
        </p>
      )}

      {/* Services grouped by category */}
      {sortedGroupKeys.map(category => (
        <FadeIn key={category} style={{ marginBottom: '2.5rem' }}>
          <h2 style={{
            color: 'var(--color-primary-dark)',
            borderBottom: '2px solid var(--color-primary)',
            paddingBottom: '0.5rem',
            marginBottom: '1rem',
          }}>
            {category}
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1rem',
          }}>
            {grouped[category].map(service => {
              const isSelected = !!selectedServices.find(s => s.serviceId === service.serviceId)
              return (
                <ServiceTile
                  key={service.serviceId}
                  service={service}
                  isSelected={isSelected}
                  onToggle={toggleService}
                  disabled={atMaxSelection && !isSelected}
                />
              )
            })}
          </div>
        </FadeIn>
      ))}

      {filteredServices.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--color-text-light)', marginTop: '2rem' }}>
          No services found in this category.
        </p>
      )}

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
          zIndex: 1000,
          boxShadow: '0 -4px 12px rgba(0,0,0,0.1)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <strong>{selectedServices.length} service{selectedServices.length > 1 ? 's' : ''} selected</strong>
              <span style={{ color: 'var(--color-text-light)', marginLeft: '1rem' }}>
                {totalDuration} min • ${totalPrice.toFixed(2)}
              </span>
              {selectedServices.length >= MAX_SERVICES && (
                <span style={{ marginLeft: '0.75rem', fontSize: '0.85rem', color: 'var(--color-primary-dark)', fontWeight: 500 }}>
                  (max reached)
                </span>
              )}
            </div>
            <button onClick={handleContinue} className="cta" style={{ margin: 0 }}>
              Continue to Provider Selection →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Booking() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem' }}>Loading...</div>}>
      <BookingContent />
    </Suspense>
  )
}
