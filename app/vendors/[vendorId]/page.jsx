'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

export default function VendorDetailPage() {
  const params = useParams()
  const vendorId = params.vendorId
  const [vendor, setVendor] = useState(null)
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)

  const groupedServices = services.reduce((acc, service) => {
    const category = service.category || 'Other'
    if (!acc[category]) acc[category] = { count: 0, services: [] }
    acc[category].count++
    acc[category].services.push(service)
    return acc
  }, {})

  useEffect(() => {
    Promise.all([
      fetch('/api/vendors').then(res => res.json()),
      fetch(`/api/services?vendorId=${vendorId}`).then(res => res.json())
    ])
      .then(([vendorsData, servicesData]) => {
        const foundVendor = vendorsData.vendors?.find(v => v.vendorId === vendorId)
        setVendor(foundVendor)
        setServices(servicesData.services || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [vendorId])

  useEffect(() => {
    if (vendor) {
      document.title = `${vendor.name} | The Spa Synergy`
      
      const structuredData = {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "name": vendor.name,
        "description": vendor.description,
        "telephone": vendor.phone,
        "email": vendor.email,
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "14310 Castle Dr",
          "addressLocality": "Fort Ritchie",
          "addressRegion": "MD",
          "postalCode": "21719"
        }
      }
      
      let script = document.querySelector('script[type="application/ld+json"]')
      if (!script) {
        script = document.createElement('script')
        script.type = 'application/ld+json'
        document.head.appendChild(script)
      }
      script.textContent = JSON.stringify(structuredData)
    }
  }, [vendor])

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>
  if (!vendor) return <div style={{ padding: '2rem' }}>Vendor not found</div>

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <Link href="/vendors" style={{ color: 'var(--color-primary)', marginBottom: '2rem', display: 'inline-block' }}>
        ← Back to Vendors
      </Link>

      <div style={{
        height: '300px',
        background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: '1.5rem',
        fontWeight: 'bold',
        marginBottom: '2rem'
      }}>
        [Hero Image]
      </div>

      <h1>{vendor.name}</h1>
      <p style={{ color: 'var(--color-text-light)', fontSize: '1.1rem', marginBottom: '1rem' }}>
        {vendor.description || 'Welcome to our professional services. We are dedicated to providing exceptional experiences tailored to your unique needs.'}
      </p>
      {vendor.phone && (
        <p style={{ fontSize: '1.1rem', marginBottom: '3rem' }}>
          <strong>Contact:</strong> <a href={`tel:${vendor.phone}`} style={{ color: 'var(--color-primary-dark)', textDecoration: 'none' }}>{vendor.phone}</a>
        </p>
      )}

      <div className="grid-3-cols" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem', marginBottom: '3rem' }}>
        <style jsx>{`
          @media (max-width: 768px) {
            div[style*="repeat(3, 1fr)"] {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
        <div style={{
          background: 'var(--color-accent)',
          padding: '0.5rem',
          borderRadius: '12px',
          textAlign: 'center'
        }}>
          <div style={{
            width: '100%',
            height: '150px',
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white'
          }}>
            [Gallery Photo 1]
          </div>
        </div>
        <div style={{
          background: 'var(--color-accent)',
          padding: '0.5rem',
          borderRadius: '12px',
          textAlign: 'center'
        }}>
          <div style={{
            width: '100%',
            height: '150px',
            background: 'linear-gradient(135deg, #f093fb, #f5576c)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white'
          }}>
            [Gallery Photo 2]
          </div>
        </div>
        <div style={{
          background: 'var(--color-accent)',
          padding: '0.5rem',
          borderRadius: '12px',
          textAlign: 'center'
        }}>
          <div style={{
            width: '100%',
            height: '150px',
            background: 'linear-gradient(135deg, #4facfe, #00f2fe)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white'
          }}>
            [Gallery Photo 3]
          </div>
        </div>
      </div>

      <h2 style={{ marginBottom: '1.5rem' }}>Service Categories</h2>
      {services.length === 0 ? (
        <p style={{ color: 'var(--color-text-light)' }}>No services available at this time.</p>
      ) : (
        <div className="grid-3-cols" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '3rem' }}>
        <style jsx>{`
          @media (max-width: 768px) {
            div[style*="repeat(3, 1fr)"] {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
          {Object.entries(groupedServices).map(([category, data]) => (
            <div
              key={category}
              style={{
                background: 'var(--color-accent)',
                padding: '1.5rem',
                borderRadius: '12px',
                border: '1px solid var(--color-border)',
              }}
            >
              <h3 style={{ marginBottom: '0.5rem', color: 'var(--color-primary)', fontSize: '1.1rem' }}>{category}</h3>
              <p style={{ color: 'var(--color-text-light)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                {data.count} {data.count === 1 ? 'service' : 'services'} available
              </p>
              <Link href={`/booking/service?vendor=${vendorId}&category=${encodeURIComponent(category)}`} className="cta" style={{ display: 'inline-block', fontSize: '0.9rem', padding: '0.6rem 1.2rem' }}>
                Book Now
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
