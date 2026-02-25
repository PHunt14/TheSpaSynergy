'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function BookingContent() {
  const searchParams = useSearchParams()
  const preselect = searchParams.get('preselect')
  const [vendors, setVendors] = useState([])
  const [bundles, setBundles] = useState([])
  const [selected, setSelected] = useState(preselect)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/vendors').then(res => res.json()),
      fetch('/api/bundles').then(res => res.json())
    ])
      .then(([vendorsData, bundlesData]) => {
        setVendors(vendorsData.vendors || [])
        setBundles(bundlesData.bundles?.filter(b => b.isActive) || [])
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
      <h1>Select a Vendor</h1>
      <p style={{ color: 'var(--color-text-light)' }}>
        Choose who you'd like to book with.
      </p>

      {bundles.length > 0 && (
        <div style={{ marginTop: '2rem', marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Bundled Services</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {bundles.map(bundle => (
              <div
                key={bundle.bundleId}
                style={{
                  background: 'var(--color-accent)',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  border: '2px solid var(--color-primary)',
                }}
              >
                <h3 style={{ marginBottom: '0.5rem', color: 'var(--color-primary)' }}>{bundle.name}</h3>
                <p style={{ color: 'var(--color-text-light)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                  {bundle.description}
                </p>
                <p style={{ fontSize: '1.3rem', fontWeight: 'bold', marginBottom: '1rem' }}>
                  ${bundle.price}
                </p>
                <Link href={`/booking/bundle?id=${bundle.bundleId}`} className="cta" style={{ display: 'inline-block' }}>
                  Book Bundle
                </Link>
              </div>
            ))}
            <div
              style={{
                background: 'var(--color-accent)',
                borderRadius: '12px',
                padding: '1.5rem',
                border: '2px dashed var(--color-primary)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '200px',
              }}
            >
              <h3 style={{ marginBottom: '0.5rem', color: 'var(--color-primary)' }}>Spa Day Bundle</h3>
              <p style={{ color: 'var(--color-text-light)', fontSize: '0.9rem', marginBottom: '1rem', textAlign: 'center' }}>
                Create a custom bundle
              </p>
              <Link href="/booking/custom-bundle" className="cta" style={{ display: 'inline-block' }}>
                Create Bundle
              </Link>
            </div>
          </div>
        </div>
      )}

      <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Individual Services</h2>
      <div style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
        {vendors.map(vendor => (
          <div
            key={vendor.vendorId}
            onClick={() => setSelected(vendor.vendorId)}
            style={{
              background: selected === vendor.vendorId ? 'var(--color-primary)' : 'var(--color-accent)',
              borderRadius: '12px',
              overflow: 'hidden',
              cursor: 'pointer',
              border: selected === vendor.vendorId ? '3px solid var(--color-primary-dark)' : '1px solid var(--color-border)',
              transition: '0.2s ease',
            }}
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
              <strong style={{ color: selected === vendor.vendorId ? 'white' : 'var(--color-text)' }}>
                {vendor.name}
              </strong>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', opacity: 0.8, color: selected === vendor.vendorId ? 'white' : 'var(--color-text-light)' }}>
                {vendor.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <Link
          href={`/booking/service?vendor=${selected}`}
          className="cta"
        >
          Continue
        </Link>
      )}
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
