'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'

function ServicePageContent() {
  const params = useSearchParams()
  const router = useRouter()
  const vendor = params.get('vendor')
  const [services, setServices] = useState([])
  const [vendorInfo, setVendorInfo] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!vendor) return
    
    Promise.all([
      fetch(`/api/services?vendorId=${vendor}`).then(res => res.json()),
      fetch('/api/vendors').then(res => res.json())
    ])
      .then(([servicesData, vendorsData]) => {
        const serviceList = servicesData.services || []
        const grouped = serviceList.reduce((acc, service) => {
          const category = service.category || 'Other'
          if (!acc[category]) acc[category] = []
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

  if (loading) return <main><h1>Loading...</h1></main>

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
          <div key={category} style={{ marginBottom: '2rem' }}>
            <h2 style={{ 
              fontSize: '1.2rem', 
              marginBottom: '1rem',
              color: 'var(--color-primary)',
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
                <div
                  key={service.serviceId}
                  onClick={() => router.push(`/booking/time?vendor=${vendor}&service=${service.serviceId}`)}
                  style={{
                    padding: '1rem',
                    borderRadius: '8px',
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
                  </div>
                </div>
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
