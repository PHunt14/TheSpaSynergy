'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function BundlesPage() {
  const [bundles, setBundles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/bundles')
      .then(res => res.json())
      .then(data => {
        setBundles(data.bundles?.filter(b => b.isActive) || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Service Bundles</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '3rem' }}>
        Save with our curated service packages or create your own custom bundle.
      </p>

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
        
        <div
          style={{
            background: 'var(--color-accent)',
            borderRadius: '12px',
            padding: '2rem',
            border: '2px dashed var(--color-primary)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '200px',
          }}
        >
          <h3 style={{ marginBottom: '0.75rem', color: 'var(--color-primary)', fontSize: '1.3rem' }}>
            Custom Bundle
          </h3>
          <p style={{ color: 'var(--color-text-light)', fontSize: '0.95rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            Create your own personalized spa day package
          </p>
          <Link href="/booking/custom-bundle" className="cta" style={{ display: 'inline-block' }}>
            Create Bundle
          </Link>
        </div>
      </div>
    </div>
  )
}
