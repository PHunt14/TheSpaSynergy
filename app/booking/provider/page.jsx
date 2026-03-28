'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'

function ProviderPageContent() {
  const params = useSearchParams()
  const router = useRouter()
  const service = params.get('service')
  const [vendors, setVendors] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
    <main>
      <h1>Select a Provider</h1>
      <p style={{ color: 'var(--color-text-light)' }}>
        Choose who you'd like to book with.
      </p>

      <div style={{ marginTop: '1.5rem' }}>
        {vendors.map(v => (
          <div
            key={v.vendorId}
            onClick={() => setSelected(v.vendorId)}
            style={{
              padding: '1rem',
              marginBottom: '1rem',
              borderRadius: '8px',
              cursor: 'pointer',
              background:
                selected === v.vendorId
                  ? 'var(--color-primary)'
                  : 'var(--color-accent)',
              color: selected === v.vendorId ? 'white' : 'var(--color-text)',
              transition: '0.2s ease',
            }}
          >
            {v.name}
          </div>
        ))}
      </div>

      {selected && (
        <button
          onClick={() => router.push(`/booking/time?service=${service}&vendor=${selected}`)}
          className="cta"
        >
          Continue
        </button>
      )}
    </main>
  )
}

export default function ProviderPage() {
  return (
    <Suspense fallback={<main><h1>Loading...</h1></main>}>
      <ProviderPageContent />
    </Suspense>
  )
}
