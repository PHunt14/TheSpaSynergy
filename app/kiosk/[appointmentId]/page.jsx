'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import TipSelection from '../components/TipSelection'
import useSquarePayment, { resolveSquareLocation } from '../components/useSquarePayment'
import KioskPaymentForm from '../components/KioskPaymentForm'
import PaymentSuccess from '../components/PaymentSuccess'
import TotalDueDisplay from '../components/TotalDueDisplay'
import formatTime from '../components/formatTime'
import SplitPaymentConfig from '../components/SplitPaymentConfig'
import { dollarsToCents } from '../../utils/splitCalculator'

function PaymentContent() {
  const { appointmentId } = useParams()
  const router = useRouter()

  const [appointment, setAppointment] = useState(null)
  const [squareLocationId, setSquareLocationId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [paid, setPaid] = useState(false)
  const [error, setError] = useState(null)
  const [tipAmount, setTipAmount] = useState(0)
  const [paymentMode, setPaymentMode] = useState(null) // null | 'full' | 'split'
  const [splitError, setSplitError] = useState(null)

  const { card } = useSquarePayment(squareLocationId, paid || paymentMode === 'split')

  useEffect(() => {
    fetch(`/api/kiosk/appointments?appointmentId=${appointmentId}`)
      .then(res => res.json())
      .then(data => {
        const apt = (data.appointments || [])[0] || null
        setAppointment(apt)
        setLoading(false)

        if (apt?.staffId) {
          fetch(`/api/staff-schedules?visibleId=${apt.staffId}`)
            .then(res => res.json())
            .then(sData => {
              const staff = sData.schedule
              if (staff?.squareLocationId && staff?.squareOAuthStatus === 'connected') {
                setSquareLocationId(staff.squareLocationId)
              } else {
                resolveSquareLocation(apt.vendorId, setSquareLocationId)
              }
            })
            .catch(() => resolveSquareLocation(apt?.vendorId, setSquareLocationId))
        } else if (apt?.vendorId) {
          resolveSquareLocation(apt.vendorId, setSquareLocationId)
        }
      })
      .catch(() => { setError('Failed to load appointment'); setLoading(false) })
  }, [appointmentId])

  const totalDue = (appointment?.service?.price || 0) + tipAmount

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

      let payRes

      // Multi-provider group payment (e.g., couples head bath)
      if (appointment.isGroupPayment && appointment.groupId) {
        payRes = await fetch('/api/payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceId: tokenResult.token,
            amount: appointment.service.price,
            tipAmount: tipAmount > 0 ? tipAmount : undefined,
            multiProvider: true,
            paymentSplit: {
              serviceId: appointment.serviceId,
              assignedStaff: appointment.groupStaff.map(s => ({
                staffId: s.staffId,
                vendorId: s.vendorId,
                staffName: s.staffName,
              })),
              groupId: appointment.groupId,
            },
          })
        })
      } else {
        // Single provider payment
        payRes = await fetch('/api/payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceId: tokenResult.token,
            amount: appointment.service.price,
            tipAmount: tipAmount > 0 ? tipAmount : undefined,
            vendorId: appointment.vendorId,
            staffId: appointment.staffId || undefined,
            serviceIds: [appointment.serviceId],
          })
        })
      }

      const payData = await payRes.json()

      if (!payData.success) {
        setError('Payment failed: ' + (payData.details || payData.error || 'Unknown error'))
        setPaying(false)
        return
      }

      // For group payments, all appointments are already marked paid by the API.
      // For single payments, update the appointment record.
      if (!appointment.isGroupPayment) {
        await fetch('/api/appointments', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appointmentId,
            paymentId: payData.paymentId,
            paymentStatus: 'paid',
            paymentAmount: appointment.service.price,
            tipAmount: tipAmount > 0 ? tipAmount : undefined,
            status: 'confirmed',
            paymentRaw: JSON.stringify({
              houseFee: payData.housePaymentId ? { paymentId: payData.housePaymentId, amount: payData.houseFeeAmount } : null,
              staffPayments: [{ staffId: appointment.staffId, paymentId: payData.paymentId, amount: payData.staffAmount || appointment.service.price }],
              tipAmount: tipAmount || 0,
              processedAt: new Date().toISOString(),
            }),
          })
        })
      }

      setPaid(true)
    } catch (err) {
      setError('Payment error — please try again')
    } finally {
      setPaying(false)
    }
  }

  const handleSplitConfigured = async ({ splitType, payerCount, payerAmountsCents }) => {
    setSplitError(null)
    try {
      const res = await fetch('/api/payment/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createSession',
          groupId: appointment.groupId,
          splitType,
          payerCount,
          payerAmountsCents,
        }),
      })
      const data = await res.json()

      if (!res.ok || data.error) {
        setSplitError(data.error || 'Failed to create split payment session')
        return
      }

      router.push(`/payment/split/${data.sessionId}`)
    } catch (err) {
      setSplitError('Failed to create split payment session — please try again')
      console.error('Split session creation error:', err)
    }
  }

  // Determine if this service supports customer split payment
  const canSplitPay = appointment?.isGroupPayment && appointment?.groupId

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
      <PaymentSuccess
        totalDue={totalDue}
        tipAmount={tipAmount}
        customerName={`${appointment.customer?.name} · ${appointment.vendorName}`}
      />
    )
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
        {appointment.isGroupPayment && (
          <div style={{ background: '#f0f8ff', borderRadius: '8px', padding: '0.75rem', margin: '0.75rem 0', border: '1px solid #cce5ff' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-primary)', marginBottom: '0.5rem' }}>
              👥 Multi-provider service ({appointment.groupSize} staff)
            </div>
            {appointment.groupStaff?.map((s, i) => (
              <div key={i} style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
                {s.staffName || s.staffId} — {s.vendorName}
              </div>
            ))}
          </div>
        )}
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
          <p style={{ margin: '0.25rem 0' }}><strong>Customer:</strong> {appointment.customer?.name}</p>
          <p style={{ margin: '0.25rem 0' }}><strong>Time:</strong> {formatTime(appointment.dateTime)}</p>
          <p style={{ margin: '0.25rem 0' }}><strong>Vendor:</strong> {appointment.vendorName}</p>
          {appointment.staffName && !appointment.isGroupPayment && <p style={{ margin: '0.25rem 0' }}><strong>With:</strong> {appointment.staffName}</p>}
        </div>
      </div>

      {squareLocationId && (
        <TipSelection
          servicePrice={appointment.service?.price || 0}
          tipAmount={tipAmount}
          onTipChange={setTipAmount}
        />
      )}

      <TotalDueDisplay totalDue={totalDue} tipAmount={tipAmount} priceLabel="Service" priceAmount={appointment.service?.price || 0} />

      {/* Payment Mode Selector for group (multi-provider) services */}
      {canSplitPay && !paymentMode && (
        <fieldset style={{ border: 'none', padding: 0, margin: '0 0 1.5rem 0' }}>
          <legend style={{ fontWeight: '600', marginBottom: '0.75rem', fontSize: '1rem' }}>How would you like to pay?</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={() => { setPaymentMode('full'); setSplitError(null) }}
              aria-pressed={paymentMode === 'full'}
              aria-label="Pay Full Amount"
              style={{
                padding: '1rem', borderRadius: '8px', cursor: 'pointer',
                border: '2px solid var(--color-border)',
                background: 'white',
                color: 'var(--color-text)',
                fontWeight: '500', fontSize: '0.95rem',
              }}
            >
              💳 Pay Full Amount
            </button>
            <button
              type="button"
              onClick={() => { setPaymentMode('split'); setSplitError(null) }}
              aria-pressed={paymentMode === 'split'}
              aria-label="Split Payment"
              style={{
                padding: '1rem', borderRadius: '8px', cursor: 'pointer',
                border: '2px solid var(--color-border)',
                background: 'white',
                color: 'var(--color-text)',
                fontWeight: '500', fontSize: '0.95rem',
              }}
            >
              👥 Split Payment
            </button>
          </div>
        </fieldset>
      )}

      {/* Full Payment Flow (default for non-group or when 'full' selected) */}
      {(!canSplitPay || paymentMode === 'full') && (
        <>
          {!squareLocationId ? (
            <div style={{ padding: '1.5rem', background: '#fff3cd', borderRadius: '8px', border: '1px solid #ffc107', textAlign: 'center' }}>
              <strong>Card payment not available</strong>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>This vendor has not connected Square.</p>
            </div>
          ) : (
            <KioskPaymentForm totalDue={totalDue} paying={paying} card={card} error={error} onPay={handlePay} />
          )}
        </>
      )}

      {/* Split Payment Flow */}
      {canSplitPay && paymentMode === 'split' && (
        <>
          <SplitPaymentConfig
            totalAmountCents={dollarsToCents(appointment.service?.price || 0)}
            onConfigured={handleSplitConfigured}
          />
          {splitError && (
            <p role="alert" style={{ color: '#c33', fontSize: '0.9rem', textAlign: 'center', marginTop: '0.5rem' }}>
              {splitError}
            </p>
          )}
        </>
      )}

      {/* Back button when in a mode */}
      {canSplitPay && paymentMode && (
        <button
          type="button"
          onClick={() => { setPaymentMode(null); setError(null); setSplitError(null) }}
          style={{
            display: 'block', margin: '1rem auto 0', background: 'none', border: 'none',
            color: 'var(--color-primary)', cursor: 'pointer', fontSize: '0.9rem',
          }}
        >
          ← Change payment method
        </button>
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
