'use client'

import { useSearchParams } from 'next/navigation'
import { useState, Suspense } from 'react'
import Link from 'next/link'

const providers = [
  { id: 1, name: 'Sarah – Massage Therapist' },
  { id: 2, name: 'Emily – Esthetician' },
  { id: 3, name: 'Jenna – Hair Stylist' },
]

function ProviderPageContent() {
  const params = useSearchParams()
  const service = params.get('service')
  const [selected, setSelected] = useState(null)

  return (
    <main>
      <h1>Select a Provider</h1>
      <p style={{ color: 'var(--color-text-light)' }}>
        Choose who you'd like to book with.
      </p>

      <div style={{ marginTop: '1.5rem' }}>
        {providers.map(p => (
          <div
            key={p.id}
            onClick={() => setSelected(p.id)}
            style={{
              padding: '1rem',
              marginBottom: '1rem',
              borderRadius: '8px',
              cursor: 'pointer',
              background:
                selected === p.id
                  ? 'var(--color-primary)'
                  : 'var(--color-accent)',
              color: selected === p.id ? 'white' : 'var(--color-text)',
              transition: '0.2s ease',
            }}
          >
            {p.name}
          </div>
        ))}
      </div>

      {selected && (
        <Link
          href={`/booking/time?service=${service}&provider=${selected}`}
          className="cta"
        >
          Continue
        </Link>
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
