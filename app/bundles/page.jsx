'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function BundlesPage() {
  const router = useRouter()
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
        Save with our curated service packages.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
        {bundles.map(bundle => (
          <div
            key={bundle.bundleId}
            onClick={() => router.push(`/booking/bundle?id=${bundle.bundleId}`)}
            style={{
              background: 'var(--color-accent)',
              borderRadius: '12px',
              padding: '2rem',
              border: '2px solid var(--color-primary)',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'transform 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
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
          </div>
        ))}
      </div>

      {bundles.length === 0 && (
        <p style={{ color: 'var(--color-text-light)', textAlign: 'center', marginTop: '2rem' }}>
          No bundles available at this time. Check back soon!
        </p>
      )}
    </div>
  )
}
