'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'

function ProviderPageContent() {
  const params = useSearchParams()
  const router = useRouter()
  const serviceId = params.get('service')
  const [staff, setStaff] = useState([])
  const [serviceName, setServiceName] = useState('')
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!serviceId) {
      setError('No service selected')
      setLoading(false)
      return
    }

    fetch(`/api/eligible-staff?serviceId=${serviceId}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load providers')
        return res.json()
      })
      .then(data => {
        setStaff(data.staff || [])
        setServiceName(data.serviceName || '')
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load providers')
        setLoading(false)
      })
  }, [serviceId])

  const handleContinue = () => {
    if (selected === 'any') {
      // "Any Available" — navigate with just serviceId (no staffId)
      router.push(`/booking/time?service=${serviceId}`)
    } else {
      // Specific staff member — navigate with serviceId and staffId
      router.push(`/booking/time?service=${serviceId}&staffId=${selected}`)
    }
  }

  if (loading) {
    return (
      <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <p>Loading providers...</p>
      </main>
    )
  }

  if (error) {
    return (
      <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <h1>Select a Provider</h1>
        <p style={{ color: 'var(--color-error, #d32f2f)' }}>{error}</p>
      </main>
    )
  }

  // If no eligible staff, show message (Req 5.7)
  if (staff.length === 0) {
    return (
      <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <h1>Select a Provider</h1>
        {serviceName && (
          <p style={{ color: 'var(--color-text-light)', marginBottom: '1rem' }}>
            Service: <strong>{serviceName}</strong>
          </p>
        )}
        <div style={{
          background: 'var(--color-accent)',
          padding: '1.5rem',
          borderRadius: '12px',
        }}>
          <p>No providers are available for this service at this time.</p>
        </div>
      </main>
    )
  }

  return (
    <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Select a Provider</h1>
      {serviceName && (
        <p style={{ color: 'var(--color-text-light)', marginBottom: '0.25rem' }}>
          Service: <strong>{serviceName}</strong>
        </p>
      )}
      <p style={{ color: 'var(--color-text-light)', marginBottom: '1.5rem' }}>
        Choose who you&rsquo;d like to book with, or select &ldquo;Any Available&rdquo; for the earliest time.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {/* "Any Available" as the first option (Req 5.2) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setSelected('any')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected('any') }
          }}
          aria-pressed={selected === 'any'}
          style={{
            padding: '1rem 1.25rem',
            borderRadius: '8px',
            cursor: 'pointer',
            background: selected === 'any' ? 'var(--color-primary)' : 'var(--color-accent)',
            color: selected === 'any' ? 'white' : 'var(--color-text)',
            border: selected === 'any' ? '2px solid var(--color-primary-dark)' : '2px solid transparent',
            transition: '0.2s ease',
            fontWeight: 500,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.2rem' }}>✨</span>
            <div>
              <div style={{ fontWeight: 600 }}>Any Available</div>
              <div style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: '0.15rem' }}>
                Show all available times across all providers
              </div>
            </div>
          </div>
        </div>

        {/* Staff members sorted alphabetically (handled by API) */}
        {staff.map(member => (
          <div
            key={member.visibleId}
            role="button"
            tabIndex={0}
            onClick={() => setSelected(member.visibleId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(member.visibleId) }
            }}
            aria-pressed={selected === member.visibleId}
            style={{
              padding: '1rem 1.25rem',
              borderRadius: '8px',
              cursor: 'pointer',
              background: selected === member.visibleId ? 'var(--color-primary)' : 'var(--color-accent)',
              color: selected === member.visibleId ? 'white' : 'var(--color-text)',
              border: selected === member.visibleId ? '2px solid var(--color-primary-dark)' : '2px solid transparent',
              transition: '0.2s ease',
            }}
          >
            {member.staffName}
          </div>
        ))}
      </div>

      {selected && (
        <button
          onClick={handleContinue}
          className="cta"
          style={{ marginTop: '2rem' }}
        >
          Continue to Select Time →
        </button>
      )}
    </main>
  )
}

export default function ProviderPage() {
  return (
    <Suspense fallback={<main style={{ padding: '2rem' }}><p>Loading...</p></main>}>
      <ProviderPageContent />
    </Suspense>
  )
}
