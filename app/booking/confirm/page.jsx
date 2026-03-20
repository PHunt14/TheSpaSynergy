'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'

function ConfirmPageContent() {
  const params = useSearchParams()
  // Single service params
  const vendor = params.get('vendor')
  const service = params.get('service')
  // Multi-service param
  const servicesParam = params.get('services')
  const date = params.get('date')
  const time = params.get('time')

  const bundleId = params.get('bundleId')
  const staffId = params.get('staffId')
  const staffName = params.get('staffName')
  const peopleParam = params.get('people')
  const people = peopleParam ? parseInt(peopleParam) : null
  const isBundle = !!servicesParam
  const serviceIds = servicesParam ? servicesParam.split(',') : service ? [service] : []

  const [formData, setFormData] = useState({ name: '', email: '', phone: '', smsOptIn: false })
  const [loading, setLoading] = useState(false)
  const [card, setCard] = useState(null)
  const [allServiceDetails, setAllServiceDetails] = useState([])
  const [vendorDetails, setVendorDetails] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('in-person')

  // For single service, use the first service detail
  const serviceDetails = allServiceDetails.length === 1 ? allServiceDetails[0] : null
  const totalPrice = allServiceDetails.reduce((sum, s) => sum + (s?.price || 0), 0) * (people || 1)
  const totalDuration = allServiceDetails.reduce((sum, s) => sum + (s?.duration || 0), 0)

  useEffect(() => {
    if (serviceIds.length === 0) return

    // Fetch all services to find the selected ones
    fetch('/api/services')
      .then(res => res.json())
      .then(data => {
        const selected = (data.services || []).filter(s => serviceIds.includes(s.serviceId))
        setAllServiceDetails(selected)
        if (selected.some(s => s.cardPaymentDisabled)) setPaymentMethod('in-person')
      })

    // Fetch vendor details (use vendor param or derive from first service)
    const vendorId = vendor
    if (vendorId) {
      fetch(`/api/vendors?vendorId=${vendorId}`)
        .then(res => res.json())
        .then(data => setVendorDetails(data.vendor))
    }
  }, [])

  // If no vendor param (bundle case), derive from first loaded service
  useEffect(() => {
    if (!vendor && allServiceDetails.length > 0 && !vendorDetails) {
      const vendorId = allServiceDetails[0].vendorId
      fetch(`/api/vendors?vendorId=${vendorId}`)
        .then(res => res.json())
        .then(data => setVendorDetails(data.vendor))
    }
  }, [allServiceDetails])

  useEffect(() => {
    if (paymentMethod !== 'card' || !vendorDetails) return

    let isMounted = true

    const loadSquare = async () => {
      if (!window.Square) {
        const script = document.createElement('script')
        script.src = 'https://sandbox.web.squarecdn.com/v1/square.js'
        script.async = true
        script.onload = () => { if (isMounted) initializeSquare() }
        document.body.appendChild(script)
      } else {
        if (isMounted) initializeSquare()
      }
    }

    loadSquare()
    return () => { isMounted = false }
  }, [paymentMethod, vendorDetails])

  const initializeSquare = async () => {
    if (!window.Square) return
    try {
      const appId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
      const locationId = vendorDetails?.squareLocationId || process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID
      if (!appId || !locationId) return
      const payments = await window.Square.payments(appId, locationId)
      const cardInstance = await payments.card()
      await cardInstance.attach('#card-container')
      setCard(cardInstance)
    } catch (error) {
      console.error('Square initialization error:', error)
    }
  }

  const buildDateTimeISO = () => {
    const dateOnly = date.split('T')[0]
    const timeFormatted = time.replace(' AM', '').replace(' PM', '')
    const isPM = time.includes('PM')
    const [hours, minutes] = timeFormatted.split(':')
    let hour24 = parseInt(hours)
    if (isPM && hour24 !== 12) hour24 += 12
    if (!isPM && hour24 === 12) hour24 = 0
    return `${dateOnly}T${hour24.toString().padStart(2, '0')}:${minutes}:00`
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (allServiceDetails.length === 0) return
    setLoading(true)

    try {
      let paymentId = null

      if (paymentMethod === 'card') {
        if (!card) { alert('Please enter card information'); setLoading(false); return }
        const result = await card.tokenize()
        if (result.status !== 'OK') { alert('Card tokenization failed'); setLoading(false); return }

        const paymentResponse = await fetch('/api/payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceId: result.token,
            amount: totalPrice,
            vendorId: vendor || allServiceDetails[0]?.vendorId
          })
        })
        const paymentData = await paymentResponse.json()
        if (!paymentData.success) { alert('Payment failed: ' + paymentData.error); setLoading(false); return }
        paymentId = paymentData.paymentId
      }

      const dateTimeISO = buildDateTimeISO()
      const status = (bundleId || hasConsultation) ? 'pending-confirmation' : (paymentMethod === 'card' ? 'confirmed' : 'pending')

      // Create one appointment per service
      const results = await Promise.all(
        allServiceDetails.map(svc =>
          fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vendorId: svc.vendorId,
              serviceId: svc.serviceId,
              staffId: staffId || undefined,
              bundleId: bundleId || undefined,
              dateTime: dateTimeISO,
              customer: formData,
              status,
              paymentId,
              ...(people ? { people } : {})
            })
          }).then(r => r.json())
        )
      )

      // Create bundle booking record
      if (bundleId) {
        const appointmentIds = results.filter(r => r.appointmentId).map(r => r.appointmentId)
        const uniqueVendorIds = [...new Set(allServiceDetails.map(s => s.vendorId))]
        const confirmations = {}
        uniqueVendorIds.forEach(v => { confirmations[v] = 'pending' })

        await fetch('/api/bundles', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bundleId,
            status: 'pending-confirmation',
            vendorConfirmations: confirmations,
            appointmentIds,
            customer: formData,
            dateTime: dateTimeISO
          })
        })
      }

      const firstSuccess = results.find(r => r.appointmentId)
      if (firstSuccess) {
        const successUrl = new URLSearchParams({
          id: firstSuccess.appointmentId,
          dateTime: dateTimeISO,
          service: allServiceDetails.map(s => s.name).join(', '),
          payment: paymentMethod
        })
        if (bundleId || hasConsultation) successUrl.set('confirmation', 'required')
        if (staffName) successUrl.set('staffName', staffName)
        if (people) successUrl.set('people', people)
        window.location.href = `/booking/success?${successUrl}`
      } else {
        alert('Appointment creation failed')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Error processing booking')
    } finally {
      setLoading(false)
    }
  }

  const hasConsultation = allServiceDetails.some(s => s.requiresConsultation)
  const cardDisabled = allServiceDetails.some(s => s.cardPaymentDisabled)
  const requiresConfirmation = !!bundleId || hasConsultation

  return (
    <main>
      <h1>Review Booking</h1>
      {requiresConfirmation && (
        <div style={{
          background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px', padding: '1rem', marginBottom: '1rem'
        }}>
          <strong>⚠️ {bundleId ? 'Vendor Confirmation Required' : 'Consultation Required'}</strong>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
            {bundleId
              ? 'This bundle requires confirmation from each vendor before your appointment is finalized. You will be notified once confirmed.'
              : 'The vendor will contact you to confirm your preferred date and time.'}
          </p>
        </div>
      )}
      <p style={{ color: 'var(--color-text-light)' }}>
        Review your appointment details and enter your information.
      </p>

      <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--color-accent)', borderRadius: '8px' }}>
        <h3>Appointment Summary</h3>
        {allServiceDetails.map(svc => (
          <div key={svc.serviceId} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span>{svc.name} ({svc.duration} min)</span>
            <span>${svc.price}</span>
          </div>
        ))}
        {allServiceDetails.length > 1 && (
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem', marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
            <span>Total ({totalDuration} min)</span>
            <span>${totalPrice.toFixed(2)}</span>
          </div>
        )}
        <p style={{ marginTop: '0.75rem' }}><strong>Date:</strong> {date ? new Date(date).toLocaleDateString() : 'N/A'}</p>
        <p><strong>Time:</strong> {time}</p>
        {staffName && <p><strong>With:</strong> {decodeURIComponent(staffName)}</p>}
        {people && <p><strong>Group Size:</strong> {people} people</p>}
      </div>

      <form onSubmit={handleSubmit} style={{ marginTop: '2rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Full Name *</label>
          <input type="text" required value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Email *</label>
          <input type="email" required value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Phone *</label>
          <input type="tel" required value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={formData.smsOptIn}
              onChange={(e) => setFormData({ ...formData, smsOptIn: e.target.checked })}
              style={{ marginTop: '0.25rem' }} />
            <span style={{ fontSize: '0.9rem', color: 'var(--color-text-light)' }}>
              I agree to receive text message updates about my appointment from The Spa Synergy. Msg & data rates may apply. Reply STOP to opt out.
            </span>
          </label>
        </div>

        <div style={{ marginTop: '2rem', marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Payment Method *</label>
          {(bundleId || cardDisabled) ? (
            <div style={{ padding: '1rem', borderRadius: '8px', border: '2px solid var(--color-primary)', background: 'var(--color-accent)', textAlign: 'center' }}>
              Pay In-Person {bundleId ? '(Required for bundles)' : '(Card payment not available for this service)'}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <label style={{
                flex: 1, padding: '1rem', borderRadius: '8px', border: '2px solid',
                borderColor: paymentMethod === 'card' ? 'var(--color-primary)' : 'var(--color-border)',
                background: paymentMethod === 'card' ? 'var(--color-accent)' : 'white',
                cursor: 'pointer', textAlign: 'center'
              }}>
                <input type="radio" name="paymentMethod" value="card"
                  checked={paymentMethod === 'card'} onChange={(e) => setPaymentMethod(e.target.value)}
                  style={{ marginRight: '0.5rem' }} />
                Pay Now (Card)
              </label>
              <label style={{
                flex: 1, padding: '1rem', borderRadius: '8px', border: '2px solid',
                borderColor: paymentMethod === 'in-person' ? 'var(--color-primary)' : 'var(--color-border)',
                background: paymentMethod === 'in-person' ? 'var(--color-accent)' : 'white',
                cursor: 'pointer', textAlign: 'center'
              }}>
                <input type="radio" name="paymentMethod" value="in-person"
                  checked={paymentMethod === 'in-person'} onChange={(e) => setPaymentMethod(e.target.value)}
                  style={{ marginRight: '0.5rem' }} />
                Pay In-Person
              </label>
            </div>
          )}
        </div>

        {paymentMethod === 'card' && (
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Payment Information *</label>
            <div id="card-container" style={{
              minHeight: '100px', padding: '1rem', background: 'white', borderRadius: '8px', border: '1px solid var(--color-border)'
            }}></div>
          </div>
        )}

        <button type="submit" disabled={loading || (paymentMethod === 'card' && !card)}
          className="cta" style={{ width: '100%', marginTop: '1rem' }}>
          {loading ? 'Processing...' : paymentMethod === 'card' ? 'Submit & Pay' : 'Submit Booking'}
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
