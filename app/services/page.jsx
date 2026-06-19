'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import BookingDisabled, { isBookingEnabled } from '../components/BookingDisabled'
import PropTypes from 'prop-types'

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

function CategoryBlock({ category, catServices, selectedServices, getAddons, toggleService }) {
  return (
    <FadeIn style={{
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
          const addons = getAddons(service.serviceId)
          return (
            <ServiceTile key={service.serviceId} service={service} isSelected={isSelected} addons={addons} onToggle={toggleService} />
          )
        })}
      </div>
    </FadeIn>
  )
}

CategoryBlock.propTypes = {
  category: PropTypes.string.isRequired,
  catServices: PropTypes.array.isRequired,
  selectedServices: PropTypes.array.isRequired,
  getAddons: PropTypes.func.isRequired,
  toggleService: PropTypes.func.isRequired,
}

function ServiceTile({ service, isSelected, addons, onToggle }) {
  return (
    <div>
      <div onClick={() => onToggle(service)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(service) }} style={{
        padding: '0.75rem',
        borderRadius: addons.length > 0 ? '8px 8px 0 0' : '8px',
        cursor: 'pointer',
        background: isSelected ? 'var(--color-primary)' : 'white',
        color: isSelected ? 'white' : 'var(--color-text)',
        border: isSelected ? '2px solid var(--color-primary-dark)' : '2px solid transparent',
        transition: '0.2s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>{service.name}</strong>
          <span style={{ fontSize: '1.2rem', opacity: 0.7 }}>{isSelected ? '✓' : '+'}</span>
        </div>
        {service.description && <div style={{ fontSize: '1rem', opacity: 0.9, margin: '0.25rem 0' }}>{service.description}</div>}
        <div style={{ fontSize: '1.05rem', opacity: 0.8 }}>{service.duration} min • ${service.price}</div>
      </div>
      {addons.length > 0 && (
        <div style={{ background: '#f9f5f0', padding: '0.5rem 0.75rem', borderTop: '1px dashed var(--color-border)', fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
          Add-ons: {addons.map(a => `${a.name} (+$${a.price})`).join(', ')}
        </div>
      )}
    </div>
  )
}

ServiceTile.propTypes = {
  service: PropTypes.object.isRequired,
  isSelected: PropTypes.object,
  addons: PropTypes.array.isRequired,
  onToggle: PropTypes.func.isRequired,
}

export default function ServicesPage() {
  const router = useRouter()
  const [vendors, setVendors] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedServices, setSelectedServices] = useState([])
  const [quantities, setQuantities] = useState({})
  const [categoryFilter, setCategoryFilter] = useState('All')

  const [allServicesRaw, setAllServicesRaw] = useState([])

  const [bundles, setBundles] = useState([])

  useEffect(() => {
    Promise.all([
      fetch('/api/vendors').then(r => r.json()),
      fetch('/api/services').then(r => r.json()),
      fetch('/api/bundles').then(r => r.json())
    ])
      .then(([vendorData, serviceData, bundleData]) => {
        const v = [...(vendorData.vendors || [])]
        for (let i = v.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [v[i], v[j]] = [v[j], v[i]]
        }
        setVendors(v)
        const active = (serviceData.services || []).filter(s => s.isActive !== false)
        setAllServicesRaw(active)
        // Only show parent services (not addons) in the main list
        setServices(active.filter(s => !(s.parentServiceIds?.length > 0)))
        setBundles((bundleData.bundles || []).filter(b => b.isActive))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const MAX_SERVICES = 4

  const toggleService = (service) => {
    setSelectedServices(prev => {
      if (prev.find(s => s.serviceId === service.serviceId)) {
        setQuantities(q => { const next = { ...q }; delete next[service.serviceId]; return next })
        return prev.filter(s => s.serviceId !== service.serviceId)
      }
      return prev.length >= MAX_SERVICES ? prev : [...prev, service]
    })
  }

  const totalPrice = selectedServices.reduce((sum, s) => sum + s.price * (quantities[s.serviceId] || 1), 0)
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration * (quantities[s.serviceId] || 1), 0)

  const [showDisabled, setShowDisabled] = useState(false)

  const handleContinue = () => {
    if (!isBookingEnabled) { setShowDisabled(true); return }
    if (selectedServices.length === 1) {
      const s = selectedServices[0]
      const qty = quantities[s.serviceId] || 1
      const quantityParam = qty > 1 ? `&quantity=${qty}` : ''
      router.push(`/booking/time?vendor=${s.vendorId}&service=${s.serviceId}${quantityParam}`)
    } else {
      const qtyParams = selectedServices
        .filter(s => (quantities[s.serviceId] || 1) > 1)
        .map(s => `${s.serviceId}:${quantities[s.serviceId]}`)
      const qtyParam = qtyParams.length > 0 ? `&quantities=${qtyParams.join(',')}` : ''
      router.push(`/booking/bundle-time?services=${selectedServices.map(s => s.serviceId).join(',')}${qtyParam}`)
    }
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>
  if (showDisabled) {
    const v = selectedServices.length > 0 ? vendors.find(v => v.vendorId === selectedServices[0].vendorId) : null
    return <BookingDisabled phone={v?.phone} vendorName={v?.name} />
  }

  const getAddons = (serviceId) => allServicesRaw.filter(s => s.parentServiceIds?.includes(serviceId))

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
        Select up to {MAX_SERVICES} services, then continue to book.
      </p>

      {bundles.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #f3e8ff, #fce4ec)',
          borderRadius: '12px',
          padding: '1.5rem 2rem',
          marginBottom: '2.5rem',
          border: '2px solid var(--color-primary)',
          textAlign: 'center'
        }}>
          <h3 style={{ margin: '0 0 0.5rem', color: 'var(--color-primary-dark)' }}>
            ✨ Spa Packages Available
          </h3>
          <p style={{ color: 'var(--color-text)', marginBottom: '1rem', fontSize: '1rem' }}>
            Save with our curated wellness packages — bundled services at a discount.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            {bundles.slice(0, 3).map(bundle => (
              <span key={bundle.bundleId} style={{
                background: 'white',
                padding: '0.4rem 1rem',
                borderRadius: '999px',
                fontSize: '0.9rem',
                border: '1px solid var(--color-border)'
              }}>
                {bundle.name} — ${bundle.price}{bundle.contactOnly ? ' (call to book)' : ''}
              </span>
            ))}
            {bundles.length > 3 && (
              <span style={{ padding: '0.4rem 1rem', fontSize: '0.9rem', color: 'var(--color-text-light)' }}>
                +{bundles.length - 3} more
              </span>
            )}
          </div>
          <a href="/bundles" className="cta" style={{ display: 'inline-block', margin: 0 }}>
            View All Packages →
          </a>
        </div>
      )}

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
                  const addons = getAddons(service.serviceId)
                  return (
                    <FadeIn key={service.serviceId} style={{
                      borderRadius: '8px',
                      cursor: 'pointer',
                      border: isSelected ? '2px solid var(--color-primary-dark)' : '1px solid var(--color-border)',
                      transition: '0.2s ease',
                      overflow: 'hidden',
                    }}>
                      <div onClick={() => toggleService(service)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleService(service) }} style={{
                        padding: '0.75rem',
                        background: isSelected ? 'var(--color-primary)' : 'var(--color-accent)',
                        color: isSelected ? 'white' : 'var(--color-text)',
                      }}>
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
                      {addons.length > 0 && (
                        <div style={{
                          background: '#f9f5f0', padding: '0.5rem 0.75rem',
                          borderTop: '1px dashed var(--color-border)',
                          fontSize: '0.85rem', color: 'var(--color-text-light)'
                        }}>
                          Add-ons: {addons.map(a => `${a.name} (+$${a.price})`).join(', ')}
                        </div>
                      )}
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
                  <CategoryBlock key={category} category={category} catServices={catServices} selectedServices={selectedServices} getAddons={getAddons} toggleService={toggleService} />
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
          zIndex: 1000,
          boxShadow: '0 -4px 12px rgba(0,0,0,0.1)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
          {selectedServices.some(s => (s.maxQuantityPerBooking || 1) > 1) && (
            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)', display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
              {selectedServices.filter(s => (s.maxQuantityPerBooking || 1) > 1).map(s => {
                const qty = quantities[s.serviceId] || 1
                const maxQty = s.maxQuantityPerBooking
                return (
                  <div key={s.serviceId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                    <span>{s.name}:</span>
                    <button
                      type="button"
                      onClick={() => setQuantities(prev => ({ ...prev, [s.serviceId]: Math.max(1, qty - 1) }))}
                      disabled={qty <= 1}
                      style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid var(--color-border)', background: 'white', cursor: qty <= 1 ? 'not-allowed' : 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >−</button>
                    <span style={{ fontWeight: 600, minWidth: '20px', textAlign: 'center' }}>{qty}</span>
                    <button
                      type="button"
                      onClick={() => setQuantities(prev => ({ ...prev, [s.serviceId]: Math.min(maxQty, qty + 1) }))}
                      disabled={qty >= maxQty}
                      style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid var(--color-border)', background: 'white', cursor: qty >= maxQty ? 'not-allowed' : 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >+</button>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>(max {maxQty})</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
