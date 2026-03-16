'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function BundleBookingContent() {
  const searchParams = useSearchParams()
  const bundleId = searchParams.get('id')
  const [bundle, setBundle] = useState(null)
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!bundleId) return

    Promise.all([
      fetch('/api/bundles').then(res => res.json()),
      fetch('/api/services').then(res => res.json())
    ])
      .then(([bundlesData, servicesData]) => {
        const foundBundle = bundlesData.bundles?.find(b => b.bundleId === bundleId)
        setBundle(foundBundle)
        
        if (foundBundle) {
          const bundleServices = servicesData.services?.filter(s => 
            foundBundle.serviceIds.includes(s.serviceId)
          ) || []
          setServices(bundleServices)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [bundleId])

  if (loading) return <main><h1>Loading...</h1></main>
  if (!bundle) return <main><h1>Bundle not found</h1></main>

  return (
    <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <Link href="/booking" style={{ color: 'var(--color-primary)', marginBottom: '2rem', display: 'inline-block' }}>
        ← Back to Booking
      </Link>

      <h1>{bundle.name}</h1>
      <p style={{ color: 'var(--color-text-light)', fontSize: '1.1rem', marginBottom: '2rem' }}>
        {bundle.description}
      </p>

      <div style={{ background: 'var(--color-accent)', padding: '2rem', borderRadius: '12px', marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Included Services</h3>
        {services.map(service => (
          <div key={service.serviceId} style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span><strong>{service.name}</strong></span>
              <span>{service.duration} min</span>
            </div>
          </div>
        ))}
        <div style={{ marginTop: '1.5rem', fontSize: '1.3rem', fontWeight: 'bold' }}>
          Total: ${bundle.price}
        </div>
      </div>

      <Link
        href={`/booking/bundle-time?bundleId=${bundle.bundleId}&services=${bundle.serviceIds.join(',')}`}
        className="cta"
      >
        Continue to Schedule
      </Link>
    </main>
  )
}

export default function BundleBooking() {
  return (
    <Suspense fallback={<main><h1>Loading...</h1></main>}>
      <BundleBookingContent />
    </Suspense>
  )
}
