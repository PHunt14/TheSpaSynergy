'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import BookingDisabled, { isBookingEnabled } from '../components/BookingDisabled'

const CONTACT_PHONE = '240-329-6537'

export default function BundlesPage() {
  const router = useRouter()
  const [bundles, setBundles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showDisabled, setShowDisabled] = useState(false)

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
  if (showDisabled) return <BookingDisabled />

  const bookable = bundles.filter(b => !b.contactOnly)
  const contactOnly = bundles.filter(b => b.contactOnly)

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Spa Packages</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '1rem' }}>
        Curated wellness experiences.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
        {bookable.map(bundle => {
          const groupLabel = bundle.minPeople && bundle.maxPeople
            ? bundle.maxPeople <= 2
              ? 'Up to 2 people'
              : `Groups of ${bundle.minPeople}–${bundle.maxPeople}`
            : null

          return (
            <div
              key={bundle.bundleId}
              onClick={() => isBookingEnabled ? router.push(`/booking/bundle?id=${bundle.bundleId}`) : setShowDisabled(true)}
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
              <p style={{ color: 'var(--color-text-light)', fontSize: '1rem', marginBottom: '1rem' }}>
                {bundle.description}
              </p>
              <p style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                ${bundle.price}
                {bundle.minPeople > 1 ? '' : ' per person'}
              </p>
              {groupLabel && (
                <p style={{ fontSize: '0.9rem', color: 'var(--color-text-light)' }}>{groupLabel}</p>
              )}
              {bundle.allowedDays?.length > 0 && (
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
                  📅 {bundle.allowedDays.map(d => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(', ')} only
                </p>
              )}
            </div>
          )
        })}
      </div>

      {contactOnly.length > 0 && (
        <>
          <h2 style={{ marginTop: '3rem', marginBottom: '1rem' }}>Special Events</h2>
          <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
            Text or call <a href={`tel:${CONTACT_PHONE}`} style={{ color: 'var(--color-primary-dark)', fontWeight: '600' }}>{CONTACT_PHONE}</a> to book these experiences.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
            {contactOnly.map(bundle => (
              <a
                key={bundle.bundleId}
                href={`tel:${CONTACT_PHONE}`}
                style={{
                  background: 'var(--color-accent)',
                  borderRadius: '12px',
                  padding: '2rem',
                  border: '2px dashed var(--color-primary)',
                  textAlign: 'center',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'transform 0.2s',
                  display: 'block'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <h3 style={{ marginBottom: '0.75rem', color: 'var(--color-primary)', fontSize: '1.3rem' }}>
                  {bundle.name}
                </h3>
                <p style={{ color: 'var(--color-text-light)', fontSize: '1rem', marginBottom: '1rem' }}>
                  {bundle.description}
                </p>
                <p style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--color-primary-dark)' }}>
                  📞 Call or Text to Book
                </p>
              </a>
            ))}
          </div>
        </>
      )}

      {bundles.length === 0 && (
        <p style={{ color: 'var(--color-text-light)', textAlign: 'center', marginTop: '2rem' }}>
          No packages available at this time. Check back soon!
        </p>
      )}
    </div>
  )
}
