'use client'

import { useState, useEffect } from 'react'

export default function ContactPage() {
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/vendors')
      .then(res => res.json())
      .then(data => {
        setVendors(data.vendors || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return (
    <main className="booking-container">
      <h1>Contact Us</h1>

      <p style={{ color: 'var(--color-text-light)', marginBottom: '1.5rem' }}>
        We'd love to hear from you. Reach out anytime.
      </p>

      <div style={{ marginBottom: '2rem' }}>
        <h3>Our Location</h3>
        <p>14310 Castle Dr.<br/>Fort Ritchie, MD 21719</p>
      </div>

      {loading ? (
        <p>Loading vendor information...</p>
      ) : (
        <div style={{ marginBottom: '2rem' }}>
          <h3>Our Vendors</h3>
          {vendors.map(vendor => (
            <div key={vendor.vendorId} style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--color-accent)', borderRadius: '8px' }}>
              <h4 style={{ marginBottom: '0.5rem' }}>{vendor.name}</h4>
              <p style={{ margin: '0.25rem 0' }}>
                <strong>Phone:</strong> {vendor.phone || 'N/A'}
              </p>
              <p style={{ margin: '0.25rem 0' }}>
                <strong>Email:</strong> {vendor.email}
              </p>
            </div>
          ))}
        </div>
      )}

      <div style={{ width: '100%', height: '400px', borderRadius: '12px', overflow: 'hidden' }}>
        <iframe
          width="100%"
          height="400"
          style={{ border: 0 }}
          loading="lazy"
          allowFullScreen
          src="https://maps.google.com/maps?q=14310+Castle+Dr,Fort+Ritchie,MD+21719&t=&z=15&ie=UTF8&iwloc=&output=embed"
        ></iframe>
      </div>
    </main>
  )
}
