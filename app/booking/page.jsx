'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function Booking() {
  const [vendors, setVendors] = useState([])
  const [selected, setSelected] = useState(null)
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

      <div style={{ marginTop: '1.5rem' }}>
        {vendors.map(vendor => (
          <div
            key={vendor.vendorId}
            onClick={() => setSelected(vendor.vendorId)}
            style={{
              padding: '1rem',
              marginBottom: '1rem',
              borderRadius: '8px',
              cursor: 'pointer',
              background:
                selected === vendor.vendorId
                  ? 'var(--color-primary)'
                  : 'var(--color-accent)',
              color: selected === vendor.vendorId ? 'white' : 'var(--color-text)',
              transition: '0.2s ease',
            }}
          >
            <strong>{vendor.name}</strong>
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
