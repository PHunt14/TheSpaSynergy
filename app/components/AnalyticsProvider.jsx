'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export default function AnalyticsProvider({ children }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    try {
      const { record } = require('aws-amplify/analytics')
      record({ name: 'PageView', attributes: { url: pathname } })
    } catch {
      // Analytics not configured (e.g., missing Pinpoint app ID in CI/test)
    }
  }, [pathname, searchParams])

  return children
}
