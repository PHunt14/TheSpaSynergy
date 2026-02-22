'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'

function ServicePageContent() {
  const params = useSearchParams()
  const vendor = params.get('vendor')
  const [services, setServices] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!vendor) return
    
    fetch(`/api/services?vendorId=${vendor}`)
      .then(res => res.json())
      .then(data => {
        const serviceList = data.services || []
        // Group by category
        const grouped = serviceList.reduce((acc, service) => {
          const category = service.category || 'Other'
          if (!acc[category]) acc[category] = []
          acc[category].push(service)
          return acc
        }, {})
        setServices(grouped)
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
      <h1>Select a Service</h1>
      <p style={{ color: 'var(--color-text-light)' }}>
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
              paddingBottom: '0.5rem'
            }}>
              {category}
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: window.innerWidth > 768 ? 'repeat(3, 1fr)' : '1fr',
              gap: '1rem'
            }}>
              {categoryServices.map(service => (
                <div
                  key={service.serviceId}
                  onClick={() => setSelected(service.serviceId)}
                  style={{
                    padding: '1rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background:
                      selected === service.serviceId
                        ? 'var(--color-primary)'
                        : 'var(--color-accent)',
                    color: selected === service.serviceId ? 'white' : 'var(--color-text)',
                    transition: '0.2s ease',
                  }}
                >
                  <strong>{service.name}</strong>
                  <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                    {service.duration} min • ${service.price}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <Link
          href={`/booking/time?vendor=${vendor}&service=${selected}`}
          className="cta"
        >
          Continue
        </Link>
      )}
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
