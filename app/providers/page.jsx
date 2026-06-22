'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ProvidersPage() {
  const router = useRouter()
  const [providers, setProviders] = useState([])
  const [staffByProvider, setStaffByProvider] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/providers?includeStaff=true')
      .then(res => res.json())
      .then(data => {
        const p = [...(data.providers || [])]
        // Shuffle providers for display using crypto-safe random
        for (let i = p.length - 1; i > 0; i--) {
          const arr = new Uint32Array(1)
          crypto.getRandomValues(arr)
          const j = arr[0] % (i + 1);
          [p[i], p[j]] = [p[j], p[i]]
        }
        setProviders(p)

        // Group active staff members by provider vendorId
        const grouped = {}
        for (const provider of p) {
          if (provider.staff && provider.staff.length > 0) {
            grouped[provider.vendorId] = provider.staff
          }
        }
        setStaffByProvider(grouped)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Our Team</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '3rem' }}>
        Meet our providers and their talented staff members.
      </p>

      <div style={{ display: 'grid', gap: '2.5rem', marginBottom: '4rem' }}>
        {providers.map(provider => {
          const providerImages = {
            'vendor-kera-studio': 'https://the-spa-synergy-public.s3.amazonaws.com/vendorPictures/Kera_Logo00.jpg',
            'vendor-winsome-woods': 'https://the-spa-synergy-public.s3.amazonaws.com/vendorPictures/Winsome_Hero00.jpg',
            'vendor-selene-glow-studio': 'https://the-spa-synergy-public.s3.amazonaws.com/vendorPictures/JylianHafer_SeleneGlow_Profile00.jpeg',
          }
          const imageUrl = providerImages[provider.vendorId]
          const staff = staffByProvider[provider.vendorId] || []

          return (
            <div
              key={provider.vendorId}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/providers/${provider.vendorId}`)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/providers/${provider.vendorId}`); } }}
              style={{
                borderRadius: '12px',
                overflow: 'hidden',
                background: 'var(--color-accent)',
                border: '1px solid var(--color-border)',
                cursor: 'pointer',
                transition: 'transform 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              {/* Provider header with image */}
              <div style={{
                height: '200px',
                backgroundImage: imageUrl ? `url(${imageUrl})` : 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                backgroundSize: 'cover',
                backgroundPosition: provider.vendorId === 'vendor-selene-glow-studio' ? 'center 30%' : 'center',
              }} />

              <div style={{ padding: '1.5rem' }}>
                <h2 style={{ marginBottom: '0.5rem' }}>{provider.name}</h2>
                {provider.description && (
                  <p style={{ color: 'var(--color-text-light)', marginBottom: '1rem', lineHeight: '1.5' }}>
                    {provider.description}
                  </p>
                )}

                {/* Active staff members grouped under this provider */}
                {staff.length > 0 && (
                  <div style={{ marginTop: '1rem' }}>
                    <h4 style={{ marginBottom: '0.75rem', color: 'var(--color-text)', fontSize: '0.95rem' }}>
                      Staff Members
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                      {staff.map(member => (
                        <div
                          key={member.visibleId}
                          style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '20px',
                            background: 'var(--color-bg)',
                            border: '1px solid var(--color-border)',
                            fontSize: '0.9rem',
                            color: 'var(--color-text)',
                          }}
                        >
                          {member.staffName}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
