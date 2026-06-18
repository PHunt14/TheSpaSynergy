'use client'

import ResourceBookingPage from '../components/ResourceBookingPage'

export default function SaunaPage() {
  return (
    <ResourceBookingPage
      resourceType="sauna"
      title="Book the Sauna"
      description="Infrared sauna sessions for detox and deep relaxation. Select a session below to book."
      emptyMessage="No sauna sessions available right now."
      heroImage="https://the-spa-synergy-public.s3.us-east-1.amazonaws.com/vendorPictures/sauna_on-00.JPEG"
      heroStyle={{ backgroundPosition: 'center 35%', transform: 'rotate(2.4deg) scale(1.15)' }}
    />
  )
}
