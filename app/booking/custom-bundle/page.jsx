'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function CustomBundlePage() {
  const [vendors, setVendors] = useState([])
  const [allServices, setAllServices] = useState([])
  const [selectedServices, setSelectedServices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/vendors').then(res => res.json()),
      fetch('/api/services').then(res => res.json())
    ])
      .then(([vendorsData, servicesData]) => {
        setVendors(vendorsData.vendors || [])
        setAllServices(servicesData.services?.filter(s => s.isActive) || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const toggleService = (service) => {
    if (selectedServices.find(s => s.serviceId === service.serviceId)) {
      setSelectedServices(selectedServices.filter(s => s.serviceId !== service.serviceId))
    } else {
      setSelectedServices([...selectedServices, service])
    }
  }

  const totalPrice = selectedServices.reduce((sum, s) => sum + s.price, 0)
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration, 0)

  const servicesByVendor = allServices.reduce((acc, service) => {
    if (!acc[service.vendorId]) acc[service.vendorId] = {}
    const category = service.category || 'Other'
    if (!acc[service.vendorId][category]) acc[service.vendorId][category] = []
    acc[service.vendorId][category].push(service)
    return acc
  }, {})

  if (loading) return <main><h1>Loading...</h1></main>

  return (
    <main style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <Link href="/booking" style={{ color: 'var(--color-primary)', marginBottom: '2rem', display: 'inline-block' }}>
        ← Back to Booking
      </Link>

      <h1>Build Your Spa Day Bundle</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        Select multiple services to create your personalized package.
      </p>

      {selectedServices.length > 0 && (
        <div style={{
          background: 'var(--color-accent)',
          padding: '1.5rem',
          borderRadius: '12px',
          marginBottom: '2rem',
          border: '2px solid var(--color-primary)'
        }}>
          <h3 style={{ marginBottom: '1rem' }}>Your Bundle ({selectedServices.length} services)</h3>
          {selectedServices.map(service => (
            <div key={service.serviceId} style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
              <span>{service.name}</span>
              <span>${service.price}</span>
            </div>
          ))}
          <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid var(--color-border)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.2rem' }}>
            <span>Total: {totalDuration} min</span>
            <span>${totalPrice.toFixed(2)}</span>
          </div>
          <Link
            href={`/booking/bundle-time?services=${selectedServices.map(s => s.serviceId).join(',')}`}
            className="cta"
            style={{ marginTop: '1rem', display: 'inline-block' }}
          >
            Continue to Booking
          </Link>
        </div>
      )}

      {Object.entries(servicesByVendor).map(([vendorId, categoriesObj]) => {
        const vendor = vendors.find(v => v.vendorId === vendorId)
        if (!vendor) return null

        return (
          <div key={vendorId} style={{ marginBottom: '3rem' }}>
            <h2 style={{ marginBottom: '1.5rem' }}>{vendor.name}</h2>
            {Object.entries(categoriesObj).map(([category, services]) => (
              <div key={category} style={{ marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '1rem', color: 'var(--color-primary)' }}>{category}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                  {services.map(service => {
                    const isSelected = selectedServices.find(s => s.serviceId === service.serviceId)
                    return (
                      <div
                        key={service.serviceId}
                        onClick={() => toggleService(service)}
                        style={{
                          background: isSelected ? 'var(--color-primary)' : 'var(--color-accent)',
                          padding: '1rem',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          border: isSelected ? '2px solid var(--color-primary-dark)' : '1px solid var(--color-border)',
                          transition: '0.2s'
                        }}
                      >
                        <h4 style={{ marginBottom: '0.5rem', color: isSelected ? 'white' : 'var(--color-text)' }}>
                          {service.name}
                        </h4>
                        <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: isSelected ? 'white' : 'var(--color-text-light)' }}>
                          {service.duration} min
                        </p>
                        <p style={{ fontWeight: 'bold', color: isSelected ? 'white' : 'var(--color-primary)' }}>
                          ${service.price}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </main>
  )
}
