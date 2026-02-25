'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function VendorsPage() {
  const [vendors, setVendors] = useState([])
  const [bundles, setBundles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = 'Our Vendors | The Spa Synergy'
    Promise.all([
      fetch('/api/vendors').then(res => res.json()),
      fetch('/api/bundles').then(res => res.json())
    ])
      .then(([vendorsData, bundlesData]) => {
        setVendors(vendorsData.vendors || [])
        setBundles(bundlesData.bundles?.filter(b => b.isActive) || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Our Vendors</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '3rem' }}>
        Discover our talented professionals and their unique services.
      </p>

      {bundles.length > 0 && (
        <div style={{ marginBottom: '4rem' }}>
          <h2 style={{ fontSize: '1.8rem', marginBottom: '1.5rem' }}>Bundled Services</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
            {bundles.map(bundle => (
              <div
                key={bundle.bundleId}
                style={{
                  background: 'var(--color-accent)',
                  borderRadius: '12px',
                  padding: '2rem',
                  border: '2px solid var(--color-primary)',
                }}
              >
                <h3 style={{ marginBottom: '0.75rem', color: 'var(--color-primary)', fontSize: '1.3rem' }}>
                  {bundle.name}
                </h3>
                <p style={{ color: 'var(--color-text-light)', fontSize: '0.95rem', marginBottom: '1rem' }}>
                  {bundle.description}
                </p>
                <p style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>
                  ${bundle.price}
                </p>
                <Link href={`/booking/bundle?id=${bundle.bundleId}`} className="cta" style={{ display: 'inline-block' }}>
                  Book Bundle
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 style={{ fontSize: '1.8rem', marginBottom: '1.5rem' }}>Our Professionals</h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '2rem'
      }}>
        {vendors.map(vendor => (
          <Link
            key={vendor.vendorId}
            href={`/vendors/${vendor.vendorId}`}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div style={{
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
          </Link>
        ))}
      </div>
    </div>
  )
}
