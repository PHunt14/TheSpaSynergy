'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * /booking now redirects to /services.
 *
 * In the unified business model, the services page IS the booking entry point —
 * clients browse services, select what they want, then proceed to provider/time selection.
 */
export default function Booking() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/services')
  }, [router])

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <p>Redirecting to services...</p>
    </div>
  )
}
