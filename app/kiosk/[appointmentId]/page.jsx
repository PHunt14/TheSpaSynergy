'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'

function PaymentContent() {
  const { appointmentId } = useParams()

  const [appointment, setAppointment] = useState(null)
  const [vendor, setVendor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [card, setCard] = useState(null)
  const [paying, setPaying] = useState(false)
  const [paid, setPaid] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Fetch this specific appointment
    fetch(`/api/kiosk/appointments?appointmentId=${appointmentId}`)
      .then(res => res.json())
      .then(data => {
        const apt = (data.appointments || [])[0] || null
        setAppointment(apt)
        setLoading(false)
        // Fetch the appointment's vendor for Square location
        if (apt?.vendorId) {
          fetch(`/api/vendors?vendorId=${apt.vendorId}`)
            .then(res => res.json())
            .then(vData => setVendor(vData.vendor))
            .catch(() => {})
        }
      })
      .catch(() => { setError('Failed to load appointment'); setLoading(false) })
  }, [appointmentId])

  // Initialize Square when vendor loads
  useEffect(() => {
    if (!vendor?.squareLocationId || paid) return
    let isMounted = true

    const loadSquare = async () => {
      const src = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production'
        ? 'https://web.squarecdn.com/v1/square.js'
        : 'https://sandbox.web.squarecdn.com/v1/square.js'

      if (!window.Square) {
        const script = document.createElement('script')
        script.src = src
        script.async = true
        script.onload = () => { if (isMounted) initSquare() }
        document.body.appendChild(script)
      } else {
        if (isMounted) initSquare()
      }
    }

    const initSquare = async () => {
      try {
        const appId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
        const locationId = vendor.squareLocationId
        if (!appId || !locationId) return
        const payments = await window.Square.payments(appId, locationId)
        const cardInstance = await payments.card()
        await cardInstance.attach('#card-container')
        setCard(cardInstance)
      } catch (err) {
        console.error('Square init error:', err)
      }
    }

    loadSquare()
    return () => { isMounted = false }
  }, [vendor, paid])

  const handlePay = async () => {
    if (!card || !appointment) return
    setPaying(true)
    setError(null)

    try {
      const tokenResult = await card.tokenize()
      if (tokenResult.status !== 'OK') {
        setError('Card error — please try again')
        setPaying(false)
        return
      }

      // Process payment — routes to the correct vendor/staff automatically
      const payRes = await fetch('/api/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: tokenResult.token,
          amount: appointment.service.price,
          vendorId: appointment.vendorId,
          staffId: appointment.staffId || undefined,
        })
      })
      const payData = await payRes.json()

      if (!payData.success) {
        setError('Payment failed: ' + (payData.error || 'Unknown error'))
        setPaying(false)
        return
      }

      // Mark appointment as paid
      await fetch('/api/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId,
          paymentId: payData.paymentId,
          paymentStatus: 'paid',
          paymentAmount: appointment.service.price,
          status: 'confirmed',
        })
      })

      setPaid(true)
    } catch (err) {
      setError('Payment error — please try again')
    } finally {
      setPaying(false)
    }
  }

  if (loading) return <p>Loading...</p>

  if (!appointment) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <h2>Appointment not found</h2>
        <p style={{ color: 'var(--color-text-light)' }}>This appointment may have already been paid.</p>
        <Link href="/kiosk" className="cta" style={{ display: 'inline-block', marginTop: '1rem' }}>
          ← Back to list
        </Link>
      </div>
    )
  }

  if (paid) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 2rem' }}>
        <div style={{
          background: '#d4edda', border: '2px solid #c3e6cb', borderRadius: '12px',
          padding: '2rem', marginBottom: '2rem'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
          <h1 style={{ color: '#155724', marginBottom: '0.5rem' }}>Payment Received</h1>
          <p style={{ color: '#155724', fontSize: '1.25rem', fontWeight: '600' }}>
            ${appointment.service.price.toFixed(2)}
          </p>
          <p style={{ color: '#155724' }}>
            {appointment.customer?.name} · {appointment.vendorName}
          </p>
        </div>
        <Link href="/kiosk" className="cta" style={{ display: 'inline-block' }}>
          ← Back to checkout list
        </Link>
      </div>
    )
  }

  const formatTime = (dateTime) => {
    try {
      return new Date(dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    } catch { return dateTime }
  }

  return (
    <div>
      <Link href="/kiosk" style={{ color: 'var(--color-primary)', display: 'inline-block', marginBottom: '1.5rem' }}>
        ← Back to list
      </Link>

      <div style={{
        background: 'var(--color-accent)', borderRadius: '12px', padding: '1.5rem',
        border: '1px solid var(--color-border)', marginBottom: '2rem'
      }}>
        <h2 style={{ marginTop: 0 }}>Appointment Summary</h2>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span>{appointment.service?.name} ({appointment.service?.duration} min)</span>
          <span style={{ fontWeight: '600' }}>${appointment.service?.price?.toFixed(2)}</span>
        </div>
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
          <p style={{ margin: '0.25rem 0' }}><strong>Customer:</strong> {appointment.customer?.name}</p>
          <p style={{ margin: '0.25rem 0' }}><strong>Time:</strong> {formatTime(appointment.dateTime)}</p>
          <p style={{ margin: '0.25rem 0' }}><strong>Vendor:</strong> {appointment.vendorName}</p>
          {appointment.staffName && <p style={{ margin: '0.25rem 0' }}><strong>With:</strong> {appointment.staffName}</p>}
        </div>
      </div>

      <div style={{
        textAlign: 'center', padding: '1.5rem', background: 'white', borderRadius: '12px',
        border: '2px solid var(--color-primary)', marginBottom: '2rem'
      }}>
        <div style={{ fontSize: '0.9rem', color: 'var(--color-text-light)', marginBottom: '0.25rem' }}>Total Due</div>
        <div style={{ fontSize: '2.5rem', fontWeight: '700', color: 'var(--color-primary)' }}>
          ${appointment.service?.price?.toFixed(2)}
        </div>
      </div>

      {!vendor?.squareLocationId ? (
        <div style={{ padding: '1.5rem', background: '#fff3cd', borderRadius: '8px', border: '1px solid #ffc107', textAlign: 'center' }}>
          <strong>Card payment not available</strong>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>This vendor has not connected Square.</p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Card Information</label>
            <div id="card-container" style={{
              minHeight: '100px', padding: '1rem', background: 'white', borderRadius: '8px',
              border: '1px solid var(--color-border)'
            }}></div>
          </div>

          {error && (
            <div style={{ padding: '1rem', background: '#fee', border: '1px solid #f5c6cb', borderRadius: '8px', color: '#c33', marginBottom: '1rem', fontWeight: '500' }}>
              {error}
            </div>
          )}

          <button
            onClick={handlePay}
            disabled={paying || !card}
            className="cta"
            style={{ width: '100%', padding: '1.25rem', fontSize: '1.2rem', opacity: (paying || !card) ? 0.6 : 1 }}
          >
            {paying ? 'Processing...' : `Pay $${appointment.service?.price?.toFixed(2)}`}
          </button>
        </>
      )}
    </div>
  )
}

export default function KioskPaymentPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <PaymentContent />
    </Suspense>
  )
}
