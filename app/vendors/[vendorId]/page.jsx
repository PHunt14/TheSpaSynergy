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
      <p style={{ color: 'var(--color-text-light)', fontSize: '1.1rem', marginBottom: '3rem' }}>
        {vendor.description || 'Welcome to our professional services. We are dedicated to providing exceptional experiences tailored to your unique needs.'}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
        <div style={{
          background: 'var(--color-accent)',
          padding: '1.5rem',
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
            color: 'white',
            marginBottom: '1rem'
          }}>
            [Gallery Photo 1]
          </div>
        </div>
        <div style={{
          background: 'var(--color-accent)',
          padding: '1.5rem',
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
            color: 'white',
            marginBottom: '1rem'
          }}>
            [Gallery Photo 2]
          </div>
        </div>
        <div style={{
          background: 'var(--color-accent)',
          padding: '1.5rem',
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
            color: 'white',
            marginBottom: '1rem'
          }}>
            [Gallery Photo 3]
          </div>
        </div>
      </div>

      <h2 style={{ marginBottom: '1.5rem' }}>Services Offered</h2>
      {services.length === 0 ? (
        <p style={{ color: 'var(--color-text-light)' }}>No services available at this time.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
          {services.map(service => (
            <Link
              key={service.serviceId}
              href={`/booking/time?vendor=${vendorId}&service=${service.serviceId}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div style={{
                background: 'var(--color-accent)',
                padding: '1.5rem',
                borderRadius: '12px',
                border: '1px solid var(--color-border)',
                cursor: 'pointer',
                transition: 'transform 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <h3 style={{ marginBottom: '0.5rem' }}>{service.name}</h3>
                <p style={{ color: 'var(--color-text-light)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                  {service.duration} minutes
                </p>
                <p style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>
                  ${service.price}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div style={{ marginTop: '3rem', textAlign: 'center' }}>
        <Link href={`/booking/service?vendor=${vendorId}`} className="cta">
          Book an Appointment
        </Link>
      </div>
    </div>
  )
}
