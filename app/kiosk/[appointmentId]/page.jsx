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
  const [paymentMode, setPaymentMode] = useState(null) // null | 'full' | 'split' | 'custom'
  const [splitError, setSplitError] = useState(null)
  const [customAmount, setCustomAmount] = useState('')
  const [customAmountError, setCustomAmountError] = useState(null)

  // Initialize Square card as soon as we have a location — card-container is always in the DOM
  const { card } = useSquarePayment(squareLocationId, paid)

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

  // Parse custom amount for the custom payment mode
  const parsedCustomAmount = parseFloat(customAmount)
  const isCustomAmountValid = !isNaN(parsedCustomAmount) &&
    parsedCustomAmount >= 0.50 &&
    parsedCustomAmount <= 9999.99 &&
    /^\d+(\.\d{1,2})?$/.test(customAmount)

  const baseAmount = paymentMode === 'custom' && isCustomAmountValid
    ? parsedCustomAmount
    : (appointment?.service?.price || 0)
  const totalDue = baseAmount + tipAmount

  const handlePay = async () => {
    if (!card || !appointment) return
    if (paymentMode === 'custom' && !isCustomAmountValid) return
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

      // Custom amount payment — routes through the custom charge API but tied to this appointment
      if (paymentMode === 'custom' && isCustomAmountValid) {
        payRes = await fetch('/api/payment/custom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceId: tokenResult.token,
            amount: parsedCustomAmount,
            description: `Custom charge for ${appointment.service?.name || 'appointment'} — ${appointment.customer?.name || 'Walk-in'}`,
            clientName: appointment.customer?.name || undefined,
            tipAmount: tipAmount > 0 ? tipAmount : undefined,
          })
        })
      } else if (appointment.isGroupPayment && appointment.groupId) {
        // Multi-provider group payment (e.g., couples head bath)
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
            appointmentId,
          })
        })
      }

      const payData = await payRes.json()

      if (paymentMode === 'custom') {
        // Custom charge API returns { success, paymentId } or { success: false, error }
        if (!payData.success) {
          setError(payData.error || 'Payment failed — please try again')
          setPaying(false)
          return
        }

        // Update appointment as paid with custom amount
        await fetch('/api/appointments', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appointmentId,
            paymentId: payData.paymentId,
            paymentStatus: 'paid',
            paymentAmount: parsedCustomAmount,
            tipAmount: tipAmount > 0 ? tipAmount : undefined,
            status: 'confirmed',
          })
        })

        setPaid(true)
        return
      }

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
      // Determine which identifier to send: groupId for multi-provider, appointmentId for single
      const sessionBody = {
        action: 'createSession',
        splitType,
        payerCount,
        payerAmountsCents,
      }

      if (appointment.isGroupPayment && appointment.groupId) {
        sessionBody.groupId = appointment.groupId
      } else {
        sessionBody.appointmentId = appointmentId
      }

      const res = await fetch('/api/payment/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionBody),
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
  // Allow split for group (multi-provider) appointments OR any single-service appointment
  const canSplitPay = appointment && appointment.service?.price > 0

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

      {squareLocationId && (paymentMode !== 'custom' || isCustomAmountValid) && (
        <TipSelection
          servicePrice={paymentMode === 'custom' ? parsedCustomAmount : (appointment.service?.price || 0)}
          tipAmount={tipAmount}
          onTipChange={setTipAmount}
        />
      )}

      <TotalDueDisplay totalDue={totalDue} tipAmount={tipAmount} priceLabel={paymentMode === 'custom' ? 'Custom Amount' : 'Service'} priceAmount={baseAmount} />

      {/* Payment Mode Selector */}
      {canSplitPay && !paymentMode && (
        <fieldset style={{ border: 'none', padding: 0, margin: '0 0 1.5rem 0' }}>
          <legend style={{ fontWeight: '600', marginBottom: '0.75rem', fontSize: '1rem' }}>How would you like to pay?</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={() => { setPaymentMode('full'); setSplitError(null) }}
              aria-label="Pay Full Amount"
              style={{
                padding: '1rem', borderRadius: '8px', cursor: 'pointer',
                border: '2px solid var(--color-border)',
                background: 'white', color: 'var(--color-text)',
                fontWeight: '500', fontSize: '0.95rem',
              }}
            >
              Pay Full Amount
            </button>
            <button
              type="button"
              onClick={() => { setPaymentMode('custom'); setTipAmount(0); setSplitError(null) }}
              aria-label="Custom Amount"
              style={{
                padding: '1rem', borderRadius: '8px', cursor: 'pointer',
                border: '2px solid var(--color-border)',
                background: 'white', color: 'var(--color-text)',
                fontWeight: '500', fontSize: '0.95rem',
              }}
            >
              Custom Amount
            </button>
            <button
              type="button"
              onClick={() => { setPaymentMode('split'); setTipAmount(0); setSplitError(null) }}
              aria-label="Split Payment"
              style={{
                padding: '1rem', borderRadius: '8px', cursor: 'pointer',
                border: '2px solid var(--color-border)',
                background: 'white', color: 'var(--color-text)',
                fontWeight: '500', fontSize: '0.95rem',
              }}
            >
              Split Payment
            </button>
          </div>
        </fieldset>
      )}

      {/* Custom Amount Input */}
      {paymentMode === 'custom' && (
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Enter Amount
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)',
              fontSize: '1.1rem', color: 'var(--color-text-light)', fontWeight: '500'
            }}>$</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={customAmount}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.]/g, '')
                setCustomAmount(val)
                if (customAmountError) setCustomAmountError(null)
              }}
              onBlur={() => {
                if (!customAmount) { setCustomAmountError(null); return }
                if (isNaN(parsedCustomAmount) || parsedCustomAmount < 0.50) {
                  setCustomAmountError('Minimum charge is $0.50')
                } else if (parsedCustomAmount > 9999.99) {
                  setCustomAmountError('Maximum charge is $9,999.99')
                } else if (!/^\d+(\.\d{1,2})?$/.test(customAmount)) {
                  setCustomAmountError('Maximum 2 decimal places')
                } else {
                  setCustomAmountError(null)
                }
              }}
              style={{
                width: '100%',
                padding: '1rem 1rem 1rem 2.5rem',
                borderRadius: '8px',
                border: customAmountError ? '2px solid #c33' : '2px solid var(--color-border)',
                fontSize: '1.2rem',
                fontWeight: '600',
                boxSizing: 'border-box',
              }}
            />
          </div>
          {customAmountError && (
            <p style={{ color: '#c33', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>{customAmountError}</p>
          )}
          <p style={{ color: 'var(--color-text-light)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
            Service price: ${appointment?.service?.price?.toFixed(2)} · Enter any amount ($0.50 – $9,999.99)
          </p>
        </div>
      )}

      {/* Full Payment Flow (default for non-group or when 'full' or 'custom' selected) */}
      {/* Card form is always rendered so Square SDK can attach; hidden until user picks 'full' or 'custom' */}
      <div style={canSplitPay && paymentMode !== 'full' && paymentMode !== 'custom' ? { position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' } : undefined}>
        {!squareLocationId ? (
          (!canSplitPay || paymentMode === 'full' || paymentMode === 'custom') ? (
            <div style={{ padding: '1.5rem', background: '#fff3cd', borderRadius: '8px', border: '1px solid #ffc107', textAlign: 'center' }}>
              <strong>Card payment not available</strong>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>This vendor has not connected Square.</p>
            </div>
          ) : null
        ) : (
          <KioskPaymentForm totalDue={totalDue} paying={paying} card={card} error={error} onPay={handlePay} />
        )}
      </div>

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
