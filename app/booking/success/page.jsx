'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'

function SuccessContent() {
  const params = useSearchParams()
  const appointmentId = params.get('id')
  const dateTime = params.get('dateTime')
  const serviceName = params.get('service')
  const paymentMethod = params.get('payment')

  return (
    <main style={{ textAlign: 'center', maxWidth: '600px', margin: '0 auto', padding: '2rem' }}>
      <div style={{
        background: '#d4edda',
        border: '2px solid #c3e6cb',
        borderRadius: '12px',
        padding: '2rem',
        marginBottom: '2rem'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
        <h1 style={{ color: '#155724', marginBottom: '1rem' }}>Booking Confirmed!</h1>
        <p style={{ color: '#155724', fontSize: '1.1rem' }}>
          Your appointment has been successfully booked.
        </p>
      </div>

      <div style={{
        background: 'var(--color-accent)',
        borderRadius: '12px',
        padding: '2rem',
        textAlign: 'left',
        marginBottom: '2rem'
      }}>
        <h2 style={{ marginTop: 0 }}>Appointment Details</h2>
        <div style={{ marginBottom: '1rem' }}>
          <strong>Confirmation ID:</strong>
          <div style={{ 
            fontFamily: 'monospace', 
            fontSize: '0.9rem', 
            background: 'white', 
            padding: '0.5rem', 
            borderRadius: '4px',
            marginTop: '0.25rem',
            wordBreak: 'break-all'
          }}>
            {appointmentId}
          </div>
        </div>
        {serviceName && (
          <p><strong>Service:</strong> {serviceName}</p>
        )}
        {dateTime && (
          <p><strong>Date & Time:</strong> {new Date(dateTime).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          })}</p>
        )}
        {paymentMethod && (
          <p><strong>Payment:</strong> {paymentMethod === 'card' ? 'Paid' : 'Pay at appointment'}</p>
        )}
      </div>

      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        A confirmation has been sent to your email. Please save your confirmation ID for your records.
      </p>

      <Link href="/" className="cta">
        Return to Home
      </Link>
    </main>
  )
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<main><h1>Loading...</h1></main>}>
      <SuccessContent />
    </Suspense>
  )
}
