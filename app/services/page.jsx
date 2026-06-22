'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import BookingDisabled, { isBookingEnabled } from '../components/BookingDisabled'
import { useServiceCatalog, ServiceCatalogGrid } from '../components/ServiceCatalog'
import { useState, Suspense } from 'react'

function ServicesContent() {
  const router = useRouter()
  const params = useSearchParams()
  const initialCategory = params.get('category') || 'All'
  const [showDisabled, setShowDisabled] = useState(false)
  const catalog = useServiceCatalog({ maxServices: 4, initialCategory })

  const handleContinue = () => {
    if (!isBookingEnabled) { setShowDisabled(true); return }
    if (catalog.selectedServices.length === 1) {
      const svc = catalog.selectedServices[0]
      // Sauna is provider-independent — skip to time picker
      if (svc.resourceType === 'sauna') {
        router.push(`/booking/time?service=${svc.serviceId}`)
      } else {
        router.push(`/booking/provider?service=${svc.serviceId}`)
      }
    } else {
      router.push(`/booking/bundle-time?services=${catalog.selectedServices.map(s => s.serviceId).join(',')}`)
    }
  }

  if (catalog.loading) return <div style={{ padding: '2rem' }}>Loading...</div>
  if (showDisabled) return <BookingDisabled />

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', paddingBottom: catalog.selectedServices.length > 0 ? '120px' : '2rem' }}>
      <h1 style={{ textAlign: 'center' }}>Our Services</h1>
      <p style={{ color: 'var(--color-text-light)', textAlign: 'center', marginBottom: '0.5rem' }}>
        Browse all of our services and book your next appointment.
      </p>
      <p style={{ color: 'var(--color-text-light)', textAlign: 'center', marginBottom: '1.5rem', fontSize: '1.1rem' }}>
        Select up to {catalog.maxServices} services, then continue to book.
      </p>

      <ServiceCatalogGrid
        {...catalog}
        onContinue={handleContinue}
        continueLabel="Proceed to Booking →"
      />
    </div>
  )
}

export default function ServicesPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem' }}>Loading...</div>}>
      <ServicesContent />
    </Suspense>
  )
}
