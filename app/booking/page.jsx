'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

function BookingContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const preselect = searchParams.get('preselect')
function BookingContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const preselect = searchParams.get('preselect')
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/vendors')
      .then(res => res.json())
      .then(res => res.json())
      .then(data => {
        setVendors(data.vendors || [])
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading data:', err)
        console.error('Error loading data:', err)
        setLoading(false)
      })
  }, [])

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>
  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Our Professionals</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '3rem' }}>
        Discover our talented professionals and their unique services.
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
        {vendors.map(vendor => {
          const vendorImages = {
            'vendor-kera-studio': 'https://the-spa-synergy-public.s3.amazonaws.com/vendorPictures/Kera_Logo00.jpg',
            'vendor-winsome-woods': 'https://the-spa-synergy-public.s3.amazonaws.com/vendorPictures/Winsome_Hero00.jpg',
          }
          const imageUrl = vendorImages[vendor.vendorId]

          return (
            <div
              key={vendor.vendorId}
              onClick={() => router.push(`/booking/service?vendor=${vendor.vendorId}`)}
              style={{
                borderRadius: '12px',
                overflow: 'hidden',
                background: 'var(--color-accent)',
                cursor: 'pointer',
                transition: 'transform 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div style={{
                height: '250px',
                backgroundImage: imageUrl ? `url(${imageUrl})` : 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }} />
              <div style={{ padding: '1.5rem' }}>
                <h3>{vendor.name}</h3>
                <p style={{ color: 'var(--color-text-light)' }}>
                  {vendor.description || 'Professional services tailored to your needs.'}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Booking() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem' }}>Loading...</div>}>
      <BookingContent />
    </Suspense>
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
