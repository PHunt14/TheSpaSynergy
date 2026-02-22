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
  const [paymentMethod, setPaymentMethod] = useState('card') // 'card' or 'in-person'

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
    if (!serviceDetails) return

    setLoading(true)

    try {
      let paymentId = null

      // Only process payment if paying by card
      if (paymentMethod === 'card') {
        if (!card) {
          alert('Please enter card information')
          setLoading(false)
          return
        }

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

          if (!paymentData.success) {
            alert('Payment failed: ' + paymentData.error)
            setLoading(false)
            return
          }

          paymentId = paymentData.paymentId
        } else {
          alert('Card tokenization failed')
          setLoading(false)
          return
        }
      }

      // Create appointment
      const appointmentResponse = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: vendor,
          serviceId: service,
          dateTime: `${date} ${time}`,
          customer: formData,
          status: paymentMethod === 'card' ? 'confirmed' : 'pending',
          paymentId
        })
      })

      if (appointmentResponse.ok) {
        alert(`Appointment booked successfully! ${paymentMethod === 'in-person' ? 'Payment due at appointment.' : ''}`)
        window.location.href = '/'
      } else {
        alert(paymentMethod === 'card' ? 'Payment processed but appointment creation failed' : 'Appointment creation failed')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Error processing booking')
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
        {serviceDetails && (
          <p><strong>Service:</strong> {serviceDetails.name}</p>
        )}
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
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
            Payment Method *
          </label>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <label style={{ 
              flex: 1,
              padding: '1rem',
              borderRadius: '8px',
              border: '2px solid',
              borderColor: paymentMethod === 'card' ? 'var(--color-primary)' : 'var(--color-border)',
              background: paymentMethod === 'card' ? 'var(--color-accent)' : 'white',
              cursor: 'pointer',
              textAlign: 'center'
            }}>
              <input
                type="radio"
                name="paymentMethod"
                value="card"
                checked={paymentMethod === 'card'}
                onChange={(e) => setPaymentMethod(e.target.value)}
                style={{ marginRight: '0.5rem' }}
              />
              Pay Now (Card)
            </label>
            <label style={{ 
              flex: 1,
              padding: '1rem',
              borderRadius: '8px',
              border: '2px solid',
              borderColor: paymentMethod === 'in-person' ? 'var(--color-primary)' : 'var(--color-border)',
              background: paymentMethod === 'in-person' ? 'var(--color-accent)' : 'white',
              cursor: 'pointer',
              textAlign: 'center'
            }}>
              <input
                type="radio"
                name="paymentMethod"
                value="in-person"
                checked={paymentMethod === 'in-person'}
                onChange={(e) => setPaymentMethod(e.target.value)}
                style={{ marginRight: '0.5rem' }}
              />
              Pay In-Person
            </label>
          </div>
        </div>

        {paymentMethod === 'card' && (
          <div style={{ marginBottom: '1rem' }}>
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
        )}

        <button
          type="submit"
          disabled={loading || (paymentMethod === 'card' && !card)}
          className="cta"
          style={{ width: '100%', marginTop: '1rem' }}
        >
          {loading ? 'Processing...' : paymentMethod === 'card' ? 'Confirm & Pay' : 'Confirm Booking'}
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
