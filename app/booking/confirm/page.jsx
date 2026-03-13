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
  const [vendorDetails, setVendorDetails] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('in-person') // 'card' or 'in-person'

  useEffect(() => {
    // Fetch service details for pricing
    fetch(`/api/services?vendorId=${vendor}`)
      .then(res => res.json())
      .then(data => {
        const selectedService = data.services?.find(s => s.serviceId === service)
        setServiceDetails(selectedService)
        // Force in-person payment for consultation services
        if (selectedService?.requiresConsultation) {
          setPaymentMethod('in-person')
        }
      })
    
    // Fetch vendor details for Square credentials
    fetch(`/api/vendors?vendorId=${vendor}`)
      .then(res => res.json())
      .then(data => {
        setVendorDetails(data.vendor)
      })
  }, [vendor, service])

  useEffect(() => {
    // Only initialize Square if payment method is card and vendor details are loaded
    if (paymentMethod !== 'card' || !vendorDetails) return

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
  }, [paymentMethod, vendorDetails])

  const initializeSquare = async () => {
    if (!window.Square) return

    try {
      // Use vendor's Square Application ID if available, otherwise fall back to platform credentials
      const appId = vendorDetails?.squareApplicationId || process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
      const locationId = vendorDetails?.squareLocationId || process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID
      
      console.log('Initializing Square with:', { appId, locationId, hasVendorDetails: !!vendorDetails })
      
      if (!appId || !locationId) {
        console.error('Missing Square credentials for vendor')
        return
      }
      
      const payments = await window.Square.payments(appId, locationId)
      const cardInstance = await payments.card()
      await cardInstance.attach('#card-container')
      setCard(cardInstance)
      console.log('Square card form initialized successfully')
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

      // Create appointment with proper ISO datetime
      const dateOnly = date.split('T')[0]
      const timeFormatted = time.replace(' AM', '').replace(' PM', '')
      const isPM = time.includes('PM')
      const [hours, minutes] = timeFormatted.split(':')
      let hour24 = parseInt(hours)
      if (isPM && hour24 !== 12) hour24 += 12
      if (!isPM && hour24 === 12) hour24 = 0
      const time24 = `${hour24.toString().padStart(2, '0')}:${minutes}`
      
      const dateTimeISO = `${dateOnly}T${time24}:00`
      
      const appointmentResponse = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: vendor,
          serviceId: service,
          dateTime: dateTimeISO,
          customer: formData,
          status: paymentMethod === 'card' ? 'confirmed' : 'pending',
          paymentId
        })
      })

      const appointmentData = await appointmentResponse.json()

      if (appointmentResponse.ok && appointmentData.appointmentId) {
        const successUrl = new URLSearchParams({
          id: appointmentData.appointmentId,
          dateTime: dateTimeISO,
          service: serviceDetails.name,
          payment: paymentMethod
        })
        window.location.href = `/booking/success?${successUrl}`
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
      {serviceDetails?.requiresConsultation && (
        <div style={{
          background: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem'
        }}>
          <strong>⚠️ Consultation Required</strong>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
            The vendor will contact you to confirm your preferred date and time.
          </p>
        </div>
      )}
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
        <p><strong>Date:</strong> {date ? new Date(date).toLocaleDateString() : 'N/A'}</p>
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
          {serviceDetails?.requiresConsultation ? (
            <div style={{
              padding: '1rem',
              borderRadius: '8px',
              border: '2px solid var(--color-primary)',
              background: 'var(--color-accent)',
              textAlign: 'center'
            }}>
              Pay In-Person (Required for consultation services)
            </div>
          ) : (
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
          )}
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
