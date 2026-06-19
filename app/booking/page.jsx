'use client'

import { Suspense, useState } from 'react'
import { useRouter } from 'next/navigation'
import BookingDisabled, { isBookingEnabled } from '../components/BookingDisabled'
import { useServiceCatalog, ServiceCatalogGrid } from '../components/ServiceCatalog'

function BookingContent() {
  const router = useRouter()
  const [showDisabled, setShowDisabled] = useState(false)
  const catalog = useServiceCatalog({ maxServices: 4 })

  const handleContinue = () => {
    if (!isBookingEnabled) { setShowDisabled(true); return }
    if (catalog.selectedServices.length === 1) {
      router.push(`/booking/provider?service=${catalog.selectedServices[0].serviceId}`)
    } else {
      router.push(`/booking/bundle-time?services=${catalog.selectedServices.map(s => s.serviceId).join(',')}`)
    }
  }

  if (catalog.loading) return <div style={{ padding: '2rem' }}>Loading...</div>
  if (showDisabled) return <BookingDisabled />

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', paddingBottom: catalog.selectedServices.length > 0 ? '120px' : '2rem' }}>
      <h1 style={{ textAlign: 'center' }}>Book a Service</h1>
      <p style={{ color: 'var(--color-text-light)', textAlign: 'center', marginBottom: '0.5rem' }}>
        Browse our services and select what you&rsquo;d like to book.
      </p>
      <p style={{ color: 'var(--color-text-light)', textAlign: 'center', marginBottom: '1.5rem', fontSize: '1.1rem' }}>
        Select up to {catalog.maxServices} services, then continue to choose your provider.
      </p>

      <ServiceCatalogGrid
        {...catalog}
        onContinue={handleContinue}
        continueLabel="Continue to Provider Selection →"
      />
    </div>
  )
}

export default function Booking() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem' }}>Loading...</div>}>
      <BookingContent />
    </Suspense>
  )
}
