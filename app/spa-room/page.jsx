'use client'

import ResourceBookingPage from '../components/ResourceBookingPage'

export default function SpaRoomPage() {
  return (
    <ResourceBookingPage
      resourceType="room"
      title="Book the Spa Room"
      description="Private spa room experiences for ultimate relaxation and rejuvenation. Select a service below to book."
      emptyMessage="No spa room services available right now."
      heroImage="https://the-spa-synergy-public.s3.us-east-1.amazonaws.com/vendorPictures/SpaRoom04.jpg"
      heroHeight={400}
    >
      {/* SpaRoom02 image below services */}
      <div style={{ marginTop: '2.5rem' }}>
        <div style={{
          borderRadius: '12px',
          overflow: 'hidden',
          height: '380px',
          backgroundColor: 'var(--color-accent)',
        }}>
          <div style={{
            width: '100%',
            height: '100%',
            backgroundImage: 'url(https://the-spa-synergy-public.s3.us-east-1.amazonaws.com/vendorPictures/SpaRoom02.jpeg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }} />
        </div>
      </div>
    </ResourceBookingPage>
  )
}
