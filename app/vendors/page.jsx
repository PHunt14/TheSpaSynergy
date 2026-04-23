'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function VendorsPage() {
  const router = useRouter()
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = 'Our Practitioners | The Spa Synergy'
    fetch('/api/vendors')
      .then(res => res.json())
      .then(data => {
        const v = [...(data.vendors || [])]
        for (let i = v.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [v[i], v[j]] = [v[j], v[i]]
        }
        setVendors(v)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Meet Our Practitioners</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '3rem' }}>
        Discover our talented practitioners and their unique services.
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
            'vendor-selene-glow-studio': 'https://the-spa-synergy-public.s3.amazonaws.com/vendorPictures/JylianHafer_SeleneGlow_Profile00.jpeg',
          }
          const imageUrl = vendorImages[vendor.vendorId]

          return (
            <div
              key={vendor.vendorId}
              onClick={() => router.push(`/vendors/${vendor.vendorId}`)}
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
