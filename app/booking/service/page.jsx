'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import BookingDisabled, { isBookingEnabled } from '../../components/BookingDisabled'

function ServicePageContent() {
  const [showDisabled, setShowDisabled] = useState(false)
  const params = useSearchParams()
  const router = useRouter()
  const vendor = params.get('vendor')
  const selectedCategory = params.get('category')
  const [services, setServices] = useState([])
  const [allServices, setAllServices] = useState([])
  const [vendorInfo, setVendorInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedAddons, setSelectedAddons] = useState({})
  const categoryRefs = useRef({})

  useEffect(() => {
    if (!vendor) return
    
    Promise.all([
      fetch(`/api/services?vendorId=${vendor}`).then(res => res.json()),
      fetch('/api/vendors').then(res => res.json())
    ])
      .then(([servicesData, vendorsData]) => {
        const serviceList = servicesData.services || []
        setAllServices(serviceList)
        const parentServices = serviceList.filter(s => !s.parentServiceId)
        const grouped = parentServices.reduce((acc, service) => {
          const category = service.category || 'Other'
          if (!acc[category]) acc[category] = []
          service._addons = serviceList.filter(a => a.parentServiceId === service.serviceId)
          acc[category].push(service)
          return acc
        }, {})
        setServices(grouped)
        setVendorInfo(vendorsData.vendors?.find(v => v.vendorId === vendor))
        setLoading(false)
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

  const handleServiceClick = (service) => {
    if (!isBookingEnabled) { setShowDisabled(true); return }
    const addons = selectedAddons[service.serviceId] || []
    if (addons.length > 0) {
      const allIds = [service.serviceId, ...addons].join(',')
      router.push(`/booking/time?vendor=${vendor}&services=${allIds}`)
    } else {
      router.push(`/booking/time?vendor=${vendor}&service=${service.serviceId}`)
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
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '0.8rem',
            fontWeight: 'bold',
            flexShrink: 0
          }}>
            [Icon]
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
              {categoryServices.map(service => {
                const addons = service._addons || []
                const selected = selectedAddons[service.serviceId] || []
                const addonTotal = selected.reduce((sum, id) => {
                  const addon = addons.find(a => a.serviceId === id)
                  return sum + (addon?.price || 0)
                }, 0)

                return (
                  <div key={service.serviceId}>
                    <div
                      onClick={() => handleServiceClick(service)}
                      style={{
                        padding: '1rem',
                        borderRadius: addons.length > 0 ? '8px 8px 0 0' : '8px',
                        cursor: 'pointer',
                        background: 'var(--color-accent)',
                        color: 'var(--color-text)',
                        transition: '0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--color-primary)'
                        e.currentTarget.style.color = 'white'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--color-accent)'
                        e.currentTarget.style.color = 'var(--color-text)'
                      }}
                    >
                      <strong>{service.name}</strong>
                      {service.description && (
                        <div style={{ fontSize: '0.85rem', opacity: 0.9, margin: '0.5rem 0' }}>
                          {service.description}
                        </div>
                      )}
                      <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                        {service.duration} min • ${service.price}
                        {addonTotal > 0 && ` (+$${addonTotal} add-ons)`}
                      </div>
                    </div>
                    {addons.length > 0 && (
                      <div style={{
                        background: '#f9f5f0',
                        borderRadius: '0 0 8px 8px',
                        padding: '0.75rem 1rem',
                        borderTop: '1px dashed var(--color-border)'
                      }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--color-text-light)' }}>
                          Available Add-ons:
                        </div>
                        {addons.map(addon => (
                          <label
                            key={addon.serviceId}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '0.5rem',
                              cursor: 'pointer', padding: '0.25rem 0', fontSize: '0.9rem'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selected.includes(addon.serviceId)}
                              onChange={(e) => toggleAddon(e, service.serviceId, addon.serviceId)}
                              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                            <span>{addon.name}</span>
                            <span style={{ marginLeft: 'auto', color: 'var(--color-text-light)', fontSize: '0.85rem' }}>
                              +${addon.price} ({addon.duration} min)
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
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
