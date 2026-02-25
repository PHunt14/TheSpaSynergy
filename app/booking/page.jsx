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

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Our Professionals</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '3rem' }}>
        Choose a professional to get started.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '2rem',
        marginBottom: '4rem'
      }}>
        {vendors.map(vendor => (
          <div
            key={vendor.vendorId}
            onClick={() => router.push(`/booking/service?vendor=${vendor.vendorId}`)}
            style={{
              background: 'var(--color-accent)',
              borderRadius: '12px',
              overflow: 'hidden',
              transition: 'transform 0.2s',
              cursor: 'pointer',
              border: '1px solid var(--color-border)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{
              height: '200px',
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '1.2rem',
              fontWeight: 'bold'
            }}>
              [Vendor Photo]
            </div>
            <div style={{ padding: '1.5rem' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>{vendor.name}</h3>
              <p style={{ color: 'var(--color-text-light)', fontSize: '0.95rem' }}>
                {vendor.description || 'Professional services tailored to your needs.'}
              </p>
            </div>
          </div>
        ))}
      </div>
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
