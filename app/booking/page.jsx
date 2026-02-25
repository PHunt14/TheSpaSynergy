'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

function BookingContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const preselect = searchParams.get('preselect')
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/vendors')
      .then(res => res.json())
      .then(data => {
        setVendors(data.vendors || [])
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading data:', err)
        setLoading(false)
      })
  }, [])

  if (loading) return <main><h1>Loading...</h1></main>

  return (
    <main>
      <h1>Our Professionals</h1>
      <p style={{ color: 'var(--color-text-light)' }}>
        Choose a professional to get started.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginTop: '2rem' }}>
        {vendors.map(vendor => (
          <div
            key={vendor.vendorId}
            onClick={() => router.push(`/booking/service?vendor=${vendor.vendorId}`)}
            style={{
              background: 'var(--color-accent)',
              borderRadius: '12px',
              overflow: 'hidden',
              cursor: 'pointer',
              border: '1px solid var(--color-border)',
              transition: '0.2s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{
              height: '150px',
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '1rem',
              fontWeight: 'bold'
            }}>
              [Vendor Icon]
            </div>
            <div style={{ padding: '1.5rem' }}>
              <strong style={{ color: 'var(--color-text)' }}>
                {vendor.name}
              </strong>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', opacity: 0.8, color: 'var(--color-text-light)' }}>
                {vendor.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}

export default function Booking() {
  return (
    <Suspense fallback={<main><h1>Loading...</h1></main>}>
      <BookingContent />
    </Suspense>
  )
}
