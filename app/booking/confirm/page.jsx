'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'

function ConfirmPageContent() {
  const params = useSearchParams()
  const vendor = params.get('vendor')
  const service = params.get('service')
  const date = params.get('date')
  const time = params.get('time')

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: ''
  })
  const [loading, setLoading] = useState(false)
  const [card, setCard] = useState(null)
  const [serviceDetails, setServiceDetails] = useState(null)

  useEffect(() => {
    // Fetch service details for pricing
    fetch(`/api/services?vendorId=${vendor}`)
      .then(res => res.json())
      .then(data => {
        const selectedService = data.services?.find(s => s.serviceId === service)
        setServiceDetails(selectedService)
      })
  }, [vendor, service])

  useEffect(() => {
    // Initialize Square Web Payments SDK
    let isMounted = true
    
    const loadSquare = async () => {
      if (!window.Square) {
        const script = document.createElement('script')
        script.src = 'https://sandbox.web.squarecdn.com/v1/square.js'
        script.async = true
        script.onload = () => {
          if (isMounted) initializeSquare()
        }
        document.body.appendChild(script)
      } else {
        if (isMounted) initializeSquare()
      }
    }
    
    loadSquare()
    
    return () => {
      isMounted = false
    }
  }, [])

  const initializeSquare = async () => {
    if (!window.Square) return

    try {
      const appId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
      const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID
      
      console.log('Initializing Square with:', { appId, locationId })
      
      if (!appId || !locationId) {
        console.error('Missing Square credentials in environment variables')
        return
      }
      
      const payments = await window.Square.payments(appId, locationId)
      const cardInstance = await payments.card()
      await cardInstance.attach('#card-container')
      setCard(cardInstance)
      console.log('Square card initialized successfully')
    } catch (error) {
      console.error('Square initialization error:', error)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!card || !serviceDetails) return

    setLoading(true)

    try {
      // Tokenize card
      const result = await card.tokenize()
      if (result.status === 'OK') {
        // Process payment
        const paymentResponse = await fetch('/api/payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceId: result.token,
            amount: serviceDetails.price,
            vendorId: vendor
          })
        })

        const paymentData = await paymentResponse.json()

        if (paymentData.success) {
          // Create appointment
          const appointmentResponse = await fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vendorId: vendor,
              serviceId: service,
              dateTime: `${new Date(date).toLocaleDateString()} ${time}`,
              customer: formData,
              status: 'confirmed',
              paymentId: paymentData.paymentId
            })
          })

          if (appointmentResponse.ok) {
            alert('Appointment booked successfully!')
            window.location.href = '/'
          } else {
            alert('Payment processed but appointment creation failed')
          }
        } else {
          alert('Payment failed: ' + paymentData.error)
        }
      } else {
        alert('Card tokenization failed')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Error processing payment')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main>
      <h1>Confirm Booking</h1>
      <p style={{ color: 'var(--color-text-light)' }}>
        Review your appointment details and enter your information.
      </p>

      <div style={{ 
        marginTop: '1.5rem', 
        padding: '1rem', 
        background: 'var(--color-accent)', 
        borderRadius: '8px' 
      }}>
        <h3>Appointment Summary</h3>
        <p><strong>Date:</strong> {new Date(date).toLocaleDateString()}</p>
        <p><strong>Time:</strong> {time}</p>
        {serviceDetails && (
          <p><strong>Price:</strong> ${serviceDetails.price}</p>
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ marginTop: '2rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            Full Name *
          </label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              fontSize: '1rem'
            }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            Email *
          </label>
          <input
            type="email"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              fontSize: '1rem'
            }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            Phone *
          </label>
          <input
            type="tel"
            required
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              fontSize: '1rem'
            }}
          />
        </div>

        <div style={{ marginTop: '2rem', marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            Payment Information *
          </label>
          <div 
            id="card-container"
            style={{
              minHeight: '100px',
              padding: '1rem',
              background: 'white',
              borderRadius: '8px',
              border: '1px solid var(--color-border)'
            }}
          ></div>
        </div>

        <button
          type="submit"
          disabled={loading || !card}
          className="cta"
          style={{ width: '100%', marginTop: '1rem' }}
        >
          {loading ? 'Processing...' : 'Confirm & Pay'}
        </button>
      </form>
    </main>
  )
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={<main><h1>Loading...</h1></main>}>
      <ConfirmPageContent />
    </Suspense>
  )
}
