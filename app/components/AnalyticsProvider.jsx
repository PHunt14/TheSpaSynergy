'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Amplify } from 'aws-amplify'
import { record } from 'aws-amplify/analytics'
import outputs from '../../amplify_outputs.json'

Amplify.configure(outputs, { ssr: true })

export default function AnalyticsProvider({ children }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    record({
      name: 'PageView',
      attributes: { url: pathname },
    })
  }, [pathname, searchParams])

  return children
}
