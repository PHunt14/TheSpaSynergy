'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Redirect to the combined Services & Extras page (Extras tab).
 * Extras management has been merged into /dashboard/services.
 */
export default function ExtrasRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/dashboard/services?tab=extras')
  }, [router])

  return (
    <div style={{ padding: '2rem' }}>
      <p>Redirecting to Services & Extras...</p>
    </div>
  )
}
