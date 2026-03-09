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
        Discover our talented professionals and their unique services.
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
              background: (vendor.vendorId === 'vendor-kera' || vendor.vendorId === 'vendor-winsome') ? 'var(--color-bg)' : 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '1.2rem',
              fontWeight: 'bold',
              borderRadius: '12px 12px 0 0'
            }}>
              {vendor.vendorId === 'vendor-kera' ? (
                <img 
                  src="https://the-spa-synergy-public.s3.amazonaws.com/vendorPictures/Kera_Logo00.jpg" 
                  alt="The Kera Studio Logo"
                  style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }}
                />
              ) : vendor.vendorId === 'vendor-winsome' ? (
                <img 
                  src="https://the-spa-synergy-public.s3.amazonaws.com/vendorPictures/Winsome_Hero00.jpg" 
                  alt="Winsome Woods"
                  style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }}
                />
              ) : (
                '[Vendor Photo]'
              )}
            </div>
            <div style={{ padding: '1.5rem', borderRadius: '0 0 12px 12px' }}>
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
