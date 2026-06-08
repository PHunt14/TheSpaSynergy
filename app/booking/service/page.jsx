'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Legacy service booking page.
 *
 * Previously this page required a `?vendor=X` URL parameter to display
 * vendor-specific services. In the unified business model, vendor selection
 * is removed from the booking flow.
 *
 * This page now redirects to the unified booking page (/booking) which
 * displays the full service catalog grouped by category as the first step.
 *
 * Fulfills Requirements 13.4, 13.5:
 * - Remove vendor-based URL parameters from single-service booking flow
 * - Redirect old vendor-specific booking URLs to unified booking page
 */
function ServicePageContent() {
  const params = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    // Redirect to the unified booking page regardless of vendor param
    router.replace('/booking')
  }, [router])

  return (
    <main style={{ padding: '2rem', textAlign: 'center' }}>
      <p>Redirecting to booking...</p>
    </main>
  )
}

export default function ServicePage() {
  return (
    <Suspense fallback={<main><h1>Loading...</h1></main>}>
      <ServicePageContent />
    </Suspense>
  )
}
