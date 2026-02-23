'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function Booking() {
  const searchParams = useSearchParams()
  const preselect = searchParams.get('preselect')
  const [vendors, setVendors] = useState([])
  const [selected, setSelected] = useState(preselect)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/vendors')
      .then(res => {
        console.log('Vendors API response status:', res.status)
        return res.json()
      })
      .then(data => {
        console.log('Vendors data:', data)
        setVendors(data.vendors || [])
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading vendors:', err)
        alert('Failed to load vendors. Check console for details.')
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
