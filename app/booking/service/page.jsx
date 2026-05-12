'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import BookingDisabled, { isBookingEnabled } from '../../components/BookingDisabled'
import PropTypes from 'prop-types'

function ServiceCard({ service, isExpanded, selectedAddons, onServiceClick, onToggleAddon, onBook, quantity, onQuantityChange }) {
  const addons = service._addons || []
  const selected = selectedAddons[service.serviceId] || []
  const addonTotal = selected.reduce((sum, id) => {
    const addon = addons.find(a => a.serviceId === id)
    return sum + (addon?.price || 0)
  }, 0)
  const addonDuration = selected.reduce((sum, id) => {
    const addon = addons.find(a => a.serviceId === id)
    return sum + (addon?.duration || 0)
  }, 0)
  const maxQty = service.maxQuantityPerBooking || 1
  const currentQty = quantity || 1

  return (
    <div>
      <div
        onClick={() => onServiceClick(service)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onServiceClick(service) }}
        style={{
          padding: '1rem',
          borderRadius: isExpanded ? '8px 8px 0 0' : '8px',
          cursor: 'pointer',
          background: isExpanded ? 'var(--color-primary)' : 'var(--color-accent)',
          color: isExpanded ? 'white' : 'var(--color-text)',
          transition: '0.2s ease',
        }}
        onMouseEnter={(e) => {
          if (!isExpanded) { e.currentTarget.style.background = 'var(--color-primary)'; e.currentTarget.style.color = 'white' }
        }}
        onMouseLeave={(e) => {
          if (!isExpanded) { e.currentTarget.style.background = 'var(--color-accent)'; e.currentTarget.style.color = 'var(--color-text)' }
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>{service.name}</strong>
          {addons.length > 0 && <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>{isExpanded ? '▲' : '▼ add-ons'}</span>}
        </div>
        {service.description && <div style={{ fontSize: '0.85rem', opacity: 0.9, margin: '0.5rem 0' }}>{service.description}</div>}
        <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>{service.duration} min • ${service.price}</div>
      </div>

      {isExpanded && (
        <div style={{ background: '#f9f5f0', borderRadius: '0 0 8px 8px', padding: '0.75rem 1rem', borderTop: '1px dashed var(--color-border)' }}>
          {addons.length > 0 && (
            <>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--color-text-light)' }}>Optional Add-ons:</div>
              {addons.map(addon => (
                <label key={addon.serviceId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.35rem 0', fontSize: '0.9rem' }}>
                  <input type="checkbox" checked={selected.includes(addon.serviceId)} onChange={(e) => onToggleAddon(e, service.serviceId, addon.serviceId)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                  <span>{addon.name}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--color-text-light)', fontSize: '0.85rem' }}>+${addon.price} ({addon.duration} min)</span>
                </label>
              ))}
            </>
          )}

          {maxQty > 1 && (
            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: addons.length > 0 ? '1px solid var(--color-border)' : 'none' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--color-text-light)' }}>Quantity:</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onQuantityChange(service.serviceId, Math.max(1, currentQty - 1)) }}
                  disabled={currentQty <= 1}
                  aria-label="Decrease quantity"
                  style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid var(--color-border)', background: 'white', cursor: currentQty <= 1 ? 'not-allowed' : 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >−</button>
                <span style={{ fontSize: '1.1rem', fontWeight: 600, minWidth: '24px', textAlign: 'center' }}>{currentQty}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onQuantityChange(service.serviceId, Math.min(maxQty, currentQty + 1)) }}
                  disabled={currentQty >= maxQty}
                  aria-label="Increase quantity"
                  style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid var(--color-border)', background: 'white', cursor: currentQty >= maxQty ? 'not-allowed' : 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >+</button>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>(max {maxQty})</span>
              </div>
            </div>
          )}

          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
              Total: ${(service.price + addonTotal) * currentQty}
              <span style={{ fontWeight: 400, color: 'var(--color-text-light)', marginLeft: '0.5rem' }}>({(service.duration + addonDuration) * currentQty} min{currentQty > 1 ? ' total' : ''})</span>
            </div>
            <button onClick={(e) => onBook(e, service)} className="cta" style={{ margin: 0, padding: '0.5rem 1.25rem', fontSize: '0.9rem' }}>
              Book{currentQty > 1 ? ` ${currentQty}×` : ''}{selected.length > 0 ? ` with ${selected.length} add-on${selected.length > 1 ? 's' : ''}` : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

ServiceCard.propTypes = {
  service: PropTypes.object.isRequired,
  isExpanded: PropTypes.bool,
  selectedAddons: PropTypes.object,
  onServiceClick: PropTypes.func.isRequired,
  onToggleAddon: PropTypes.func.isRequired,
  onBook: PropTypes.func.isRequired,
  quantity: PropTypes.number,
  onQuantityChange: PropTypes.func.isRequired,
}

function ServicePageContent() {
  const [showDisabled, setShowDisabled] = useState(false)
  const params = useSearchParams()
  const router = useRouter()
  const vendor = params.get('vendor')
  const selectedCategory = params.get('category')
  const [services, setServices] = useState([])
  const [vendorInfo, setVendorInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedService, setExpandedService] = useState(null)
  const [selectedAddons, setSelectedAddons] = useState({})
  const [quantities, setQuantities] = useState({})
  const categoryRefs = useRef({})

  const groupServicesByCategory = (serviceList) => {
    const parentServices = serviceList.filter(s => !(s.parentServiceIds?.length > 0))
    return parentServices.reduce((acc, service) => {
      const category = service.category || 'Other'
      if (!acc[category]) acc[category] = []
      service._addons = serviceList.filter(a => a.parentServiceIds?.includes(service.serviceId))
      acc[category].push(service)
      return acc
    }, {})
  }

  useEffect(() => {
    if (!vendor) return
    
    Promise.all([
      fetch(`/api/services?vendorId=${vendor}`).then(res => res.json()),
      fetch('/api/vendors').then(res => res.json())
    ])
      .then(([servicesData, vendorsData]) => {
        const grouped = groupServicesByCategory(servicesData.services || [])
        setServices(grouped)
        const vnd = vendorsData.vendors?.find(v => v.vendorId === vendor)
        setVendorInfo(vnd)
        setLoading(false)
        if (typeof window !== 'undefined' && window.gtag) {
          const allServices = Object.values(grouped).flat()
          window.gtag('event', 'view_item_list', {
            item_list_name: vnd?.name || vendor,
            items: allServices.map(s => ({ item_id: s.serviceId, item_name: s.name, price: s.price }))
          })
        }
      })
      .catch(err => {
        console.error('Error loading services:', err)
        setLoading(false)
      })
  }, [vendor])

  useEffect(() => {
    if (!loading && selectedCategory && categoryRefs.current[selectedCategory]) {
      setTimeout(() => {
        const element = categoryRefs.current[selectedCategory]
        if (element) {
          const yOffset = -100
          const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset
          window.scrollTo({ top: y, behavior: 'smooth' })
        }
      }, 100)
    }
  }, [loading, selectedCategory])

  const toggleAddon = (e, parentId, addonId) => {
    e.stopPropagation()
    setSelectedAddons(prev => {
      const current = prev[parentId] || []
      const updated = current.includes(addonId)
        ? current.filter(id => id !== addonId)
        : [...current, addonId]
      return { ...prev, [parentId]: updated }
    })
  }

  const handleQuantityChange = (serviceId, qty) => {
    setQuantities(prev => ({ ...prev, [serviceId]: qty }))
  }

  const handleServiceClick = (service) => {
    if (!isBookingEnabled) { setShowDisabled(true); return }
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'select_item', {
        item_list_name: vendorInfo?.name || vendor,
        items: [{ item_id: service.serviceId, item_name: service.name, price: service.price }]
      })
    }
    if (service._addons?.length > 0 || (service.maxQuantityPerBooking || 1) > 1) {
      setExpandedService(prev => prev === service.serviceId ? null : service.serviceId)
      return
    }
    const multiProviderParam = service.providersRequired > 1 ? '&multiProvider=true' : ''
    router.push(`/booking/time?vendor=${vendor}&service=${service.serviceId}${multiProviderParam}`)
  }

  const handleBook = (e, service) => {
    e.stopPropagation()
    if (!isBookingEnabled) { setShowDisabled(true); return }
    const addons = selectedAddons[service.serviceId] || []
    const qty = quantities[service.serviceId] || 1
    const multiProviderParam = service.providersRequired > 1 ? '&multiProvider=true' : ''
    const quantityParam = qty > 1 ? `&quantity=${qty}` : ''
    if (addons.length > 0) {
      const allIds = [service.serviceId, ...addons].join(',')
      router.push(`/booking/time?vendor=${vendor}&services=${allIds}${multiProviderParam}${quantityParam}`)
    } else {
      router.push(`/booking/time?vendor=${vendor}&service=${service.serviceId}${multiProviderParam}${quantityParam}`)
    }
  }

  if (loading) return <main><h1>Loading...</h1></main>
  if (showDisabled) return <BookingDisabled phone={vendorInfo?.phone} vendorName={vendorInfo?.name} />

  return (
    <main>
      {vendorInfo && (
        <div style={{
          background: 'var(--color-accent)',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '2rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem',
          maxWidth: '600px',
          margin: '0 auto 2rem auto'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
            flexShrink: 0
          }}>
          </div>
          <div>
            <h2 style={{ margin: '0 0 0.25rem 0' }}>{vendorInfo.name}</h2>
            <p style={{ margin: 0, color: 'var(--color-text-light)', fontSize: '0.9rem' }}>
              {vendorInfo.description}
            </p>
          </div>
        </div>
      )}

      <h1 style={{ textAlign: 'center' }}>Select a Service</h1>
      <p style={{ color: 'var(--color-text-light)', textAlign: 'center' }}>
        Choose the service you'd like to book.
      </p>

      <div style={{ marginTop: '1.5rem' }}>
        {Object.entries(services).map(([category, categoryServices]) => (
          <div 
            key={category} 
            ref={el => categoryRefs.current[category] = el}
            style={{ 
              marginBottom: '2rem',
              padding: selectedCategory === category ? '1rem' : '0',
              background: selectedCategory === category ? 'var(--color-accent)' : 'transparent',
              borderRadius: '12px',
              transition: 'all 0.3s ease'
            }}
          >
            <h2 style={{ 
              fontSize: '1.2rem', 
              marginBottom: '1rem',
              color: selectedCategory === category ? 'var(--color-primary-dark)' : 'var(--color-primary)',
              borderBottom: '2px solid var(--color-primary)',
              paddingBottom: '0.5rem',
              textAlign: 'center'
            }}>
              {category}
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '1rem'
            }}>
              {categoryServices.map(service => (
                <ServiceCard
                  key={service.serviceId}
                  service={service}
                  isExpanded={expandedService === service.serviceId}
                  selectedAddons={selectedAddons}
                  onServiceClick={handleServiceClick}
                  onToggleAddon={toggleAddon}
                  onBook={handleBook}
                  quantity={quantities[service.serviceId] || 1}
                  onQuantityChange={handleQuantityChange}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}

export default function ServicePage() {
  return (
    <Suspense fallback={<main><h1>Loading...</h1></main>}>
      <ServicePageContent />
    </Suspense>
  )
}
