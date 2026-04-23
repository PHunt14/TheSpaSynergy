'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

function FadeIn({ children, style }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.unobserve(el) } },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={{
        ...style,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
      }}
    >
      {children}
    </div>
  )
}

const teamData = {
  'vendor-selene-glow-studio': [
    {
      firstName: 'Jylian',
      fullName: 'Jylian Hafer',
      role: 'Owner',
      photo: 'https://the-spa-synergy-public.s3.amazonaws.com/vendorPictures/JylianHafer_SeleneGlow_Profile00.jpeg',
      alt: 'Jylian Hafer - Owner of Selene Glow Studio',
      bio: 'Jylian Hafer is the founder of Selene Glow Studio and a licensed beauty professional with over 15 years of experience in the beauty and wellness industry. With training and licensure in cosmetology, barbering, nail technology, and esthetics, Jylian brings a well-rounded and personalized approach to skincare and self-care. She believes that healthy, radiant skin is achieved through both professional treatments and intentional rituals of care. At Selene Glow Studio, her goal is to create a calming space where clients feel welcomed, supported, and empowered to glow with confidence - where radiance meets ritual.',
    },
  ],
  'vendor-kera-studio': [
    {
      firstName: 'Stacey',
      fullName: 'Stacey Green',
      role: 'Owner',
      photo: 'https://the-spa-synergy-public.s3.amazonaws.com/vendorPictures/StaceyGreen_Kera_Profile00.jpg',
      alt: 'Stacey Green - Owner of The Kera Studio',
      bio: 'Stacey is the owner of The Kera Studio. Stacey has been in the beauty industry for over 24 years, specializing in the maintenance and care of hair, skin & nails, and customizing your routines, lessons and services for your needs and goals.',
    },
    {
      firstName: 'Trinity',
      fullName: 'Trinity Swire',
      role: 'Independent Stylist',
      photo: 'https://the-spa-synergy-public.s3.amazonaws.com/vendorPictures/TrinitySwire_Kera_Profile00.jpeg',
      alt: 'Trinity Swire - Independent Stylist at The Kera Studio',
      bio: 'Meet Trinity Swire! Independent Stylist and service provider with The Kera Studio',
    },
  ],
  'vendor-winsome-woods': [
    {
      firstName: 'Makaila',
      fullName: 'Makaila',
      role: 'Owner',
      photo: 'https://the-spa-synergy-public.s3.amazonaws.com/vendorPictures/Makaila_Winsome_Profile01.jpg',
      alt: 'Makaila - Owner of Winsome Woods',
      bio: 'Makaila has been in the massage and natural healing world for almost 2 decades. Focusing on energy and natural remedies for stress relief and relaxation, with services that are ever expanding as she learns the communities needs.',
    },
  ],
}

export default function VendorDetailPage() {
  const params = useParams()
  const vendorId = params.vendorId
  const [vendor, setVendor] = useState(null)
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedProfile, setSelectedProfile] = useState(null)

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

  const team = teamData[vendorId]

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <Link href="/vendors" style={{ color: 'var(--color-primary)', marginBottom: '2rem', display: 'inline-block' }}>
        ← Back to Vendors
      </Link>

      {/* Vendor Name & Hero */}
      <FadeIn>
        <div style={{
          height: '300px',
          background: (vendorId === 'vendor-kera-studio' || vendorId === 'vendor-winsome-woods') ? 'var(--color-bg)' : 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '1.5rem',
          fontWeight: 'bold',
          marginBottom: '2rem',
          overflow: 'hidden'
        }}>
          {vendorId === 'vendor-kera-studio' ? (
            <img
              src="https://the-spa-synergy-public.s3.amazonaws.com/vendorPictures/Kera_Logo00.jpg"
              alt="The Kera Studio Logo"
              style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain', borderRadius: '12px' }}
            />
          ) : vendorId === 'vendor-winsome-woods' ? (
            <img
              src="https://the-spa-synergy-public.s3.amazonaws.com/vendorPictures/Winsome_Hero00.jpg"
              alt="Winsome Woods"
              style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain', borderRadius: '12px' }}
            />
          ) : (
            '[Hero Image]'
          )}
        </div>
        <h1>{vendor.name}</h1>
      </FadeIn>

      {/* Tagline */}
      <FadeIn>
        <p style={{ color: 'var(--color-text-light)', fontSize: '1.1rem', marginBottom: '3rem' }}>
          {vendor.description || 'Welcome to our professional services. We are dedicated to providing exceptional experiences tailored to your unique needs.'}
        </p>
      </FadeIn>

      {/* Services */}
      <FadeIn style={{ marginBottom: '3rem' }}>
        <h2 style={{ marginBottom: '1.5rem' }}>Services</h2>
        {services.length === 0 ? (
          <p style={{ color: 'var(--color-text-light)' }}>No services available at this time.</p>
        ) : (
          <div className="grid-3-cols" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
            {Object.entries(groupedServices).map(([category, data]) => (
              <FadeIn key={category}>
                <div style={{
                  background: 'var(--color-accent)',
                  padding: '1.5rem',
                  borderRadius: '12px',
                  border: '1px solid var(--color-border)',
                }}>
                  <h3 style={{ marginBottom: '0.5rem', marginTop: 0, color: 'var(--color-primary)', fontSize: '1.1rem' }}>{category}</h3>
                  <p style={{ color: 'var(--color-text-light)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    {data.count} {data.count === 1 ? 'service' : 'services'} available
                  </p>
                  <Link href={`/booking/service?vendor=${vendorId}&category=${encodeURIComponent(category)}`} className="cta" style={{ display: 'inline-block', fontSize: '0.9rem', padding: '0.6rem 1.2rem' }}>
                    Book Now
                  </Link>
                </div>
              </FadeIn>
            ))}
          </div>
        )}
      </FadeIn>

      {/* Meet Our Team */}
      {team && (
        <FadeIn style={{ marginBottom: '3rem', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '1.5rem' }}>Meet Our Team</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '2rem' }}>
            {team.map(member => (
              <FadeIn key={member.firstName} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <img
                  src={member.photo}
                  alt={member.alt}
                  onClick={() => setSelectedProfile(member)}
                  style={{ width: '300px', height: '300px', objectFit: 'cover', borderRadius: '12px', border: '3px solid var(--color-primary)', cursor: 'pointer' }}
                />
                <div style={{ width: '3px', height: '20px', background: 'var(--color-primary)' }} />
                <div style={{ border: '3px solid var(--color-primary)', borderRadius: '12px', padding: '1.5rem', maxWidth: '600px' }}>
                  <p style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--color-text)', margin: 0 }}>
                    {member.firstName}
                  </p>
                </div>
              </FadeIn>
            ))}
          </div>
        </FadeIn>
      )}

      {/* Contact */}
      <FadeIn style={{ marginBottom: '3rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>Contact</h2>
        <div style={{
          background: 'var(--color-accent)',
          borderRadius: '12px',
          padding: '1.5rem',
          border: '1px solid var(--color-border)',
        }}>
          {vendor.phone && (
            <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
              <strong>Phone:</strong>{' '}
              <a href={`tel:${vendor.phone}`} style={{ color: 'var(--color-primary-dark)', textDecoration: 'none' }}>{vendor.phone}</a>
            </p>
          )}
          {vendor.email && (
            <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
              <strong>Email:</strong>{' '}
              <a href={`mailto:${vendor.email}`} style={{ color: 'var(--color-primary-dark)', textDecoration: 'none' }}>{vendor.email}</a>
            </p>
          )}
          {(vendor.socialFacebook || vendor.socialInstagram || vendor.socialTiktok || vendor.socialWebsite || vendor.googlePlaceId) && (
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {vendor.googlePlaceId && (
                <a href={`https://search.google.com/local/writereview?placeid=${vendor.googlePlaceId}`} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'white', background: 'var(--color-primary)', textDecoration: 'none', fontSize: '0.9rem', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: '500' }}>⭐ Review us on Google</a>
              )}
              {vendor.socialFacebook && (
                <a href={vendor.socialFacebook} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--color-primary-dark)', textDecoration: 'none', fontSize: '1rem' }}>Facebook</a>
              )}
              {vendor.socialInstagram && (
                <a href={vendor.socialInstagram} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--color-primary-dark)', textDecoration: 'none', fontSize: '1rem' }}>Instagram</a>
              )}
              {vendor.socialTiktok && (
                <a href={vendor.socialTiktok} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--color-primary-dark)', textDecoration: 'none', fontSize: '1rem' }}>TikTok</a>
              )}
              {vendor.socialWebsite && (
                <a href={vendor.socialWebsite} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--color-primary-dark)', textDecoration: 'none', fontSize: '1rem' }}>Website</a>
              )}
            </div>
          )}
        </div>
      </FadeIn>

      {/* Profile Overlay Modal */}
      {selectedProfile && (
        <div
          onClick={() => setSelectedProfile(null)}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '2rem'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '600px',
              width: '100%',
              position: 'relative'
            }}
          >
            <button
              onClick={() => setSelectedProfile(null)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'none',
                border: 'none',
                fontSize: '1.5rem',
                cursor: 'pointer',
                color: 'var(--color-text)'
              }}
            >
              ×
            </button>
            <h3 style={{ marginBottom: '1rem', color: 'var(--color-primary-dark)' }}>{selectedProfile.fullName}</h3>
            <p style={{ fontSize: '1rem', lineHeight: '1.6', color: 'var(--color-text)' }}>
              {selectedProfile.bio}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
