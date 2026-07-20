'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { calculateBundlePaymentSplit } from '../../../utils/bundlePaymentSplit.js'
import { dollarsToCents } from '../../../utils/splitCalculator'
import TipSelection from '../../components/TipSelection'
import useSquarePayment, { resolveSquareLocation } from '../../components/useSquarePayment'
import KioskPaymentForm from '../../components/KioskPaymentForm'
import PaymentSuccess from '../../components/PaymentSuccess'
import TotalDueDisplay from '../../components/TotalDueDisplay'
import ServiceLineItems from '../../components/ServiceLineItems'
import formatTime from '../../components/formatTime'
import SplitPaymentConfig from '../../components/SplitPaymentConfig'

function BundlePaymentContent() {
  const { bundleId } = useParams()
  const router = useRouter()

  const [appointments, setAppointments] = useState([])
  const [bundle, setBundle] = useState(null)
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [paid, setPaid] = useState(false)
  const [error, setError] = useState(null)
  const [tipAmount, setTipAmount] = useState(0)
  const [squareLocationId, setSquareLocationId] = useState(null)
  const [paymentMode, setPaymentMode] = useState(null) // null | 'full' | 'split'
  const [splitError, setSplitError] = useState(null)

  const { card } = useSquarePayment(squareLocationId, paid || paymentMode !== 'full')

  useEffect(() => {
    Promise.all([
      fetch(`/api/kiosk/appointments?bundleId=${bundleId}`).then(r => r.json()),
      fetch('/api/bundles').then(r => r.json()),
      fetch('/api/vendors').then(r => r.json()),
    ])
      .then(([aptData, bundleData, vendorData]) => {
        const apts = aptData.appointments || []
        setAppointments(apts)
        setVendors(vendorData.vendors || [])

        const foundBundle = bundleData.bundles?.find(b => b.bundleId === bundleId)
        setBundle(foundBundle)

        if (apts.length > 0) {
          resolveSquareLocation(apts[0].vendorId, setSquareLocationId)
        }

        setLoading(false)
      })
      .catch(() => { setError('Failed to load bundle'); setLoading(false) })
  }, [bundleId])

  // Calculate bundle price and payment split
  const subtotal = appointments.reduce((sum, apt) => sum + (apt.service?.price || 0), 0)
  const bundlePrice = bundle?.price || subtotal
  const discountAmount = subtotal - bundlePrice
  const houseVendor = vendors.find(v => v.isHouse)

  const totalDue = bundlePrice + tipAmount

  const handlePay = async () => {
    if (!card || appointments.length === 0) return
    setPaying(true)
    setError(null)

    try {
      const tokenResult = await card.tokenize()
      if (tokenResult.status !== 'OK') {
        setError('Card error — please try again')
        setPaying(false)
        return
      }

      const services = appointments.map(apt => ({
        price: apt.service?.price || 0,
        vendorId: apt.vendorId,
        houseFeeEnabled: apt.service?.houseFeeEnabled || false,
        houseFeeAmount: apt.service?.houseFeeAmount || 0,
      }))

      const split = calculateBundlePaymentSplit({
        services,
        discountAmount: discountAmount > 0 ? discountAmount : 0,
        houseVendorId: houseVendor?.vendorId || '',
      })

      const payRes = await fetch('/api/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: tokenResult.token,
          amount: bundlePrice,
          tipAmount: tipAmount > 0 ? tipAmount : undefined,
          bundlePayments: split.bundlePayments,
          bundleId,
        })
      })
      const payData = await payRes.json()

      if (!payData.success) {
        setError('Payment failed: ' + (payData.details || payData.error || 'Unknown error'))
        setPaying(false)
        return
      }

      setPaid(true)
    } catch (err) {
      setError('Payment error — please try again')
      console.error('Bundle payment error:', err)
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
          bundleId,
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

  if (loading) return <p>Loading...</p>

  if (appointments.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <h2>Bundle not found</h2>
        <p style={{ color: 'var(--color-text-light)' }}>No appointments found for this package.</p>
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
        customerName={`${appointments[0]?.customer?.name} · ${bundle?.name || 'Package'}`}
        subtitle={`${appointments.length} services paid across ${[...new Set(appointments.map(a => a.vendorName))].join(', ')}`}
      />
    )
  }

  const alreadyPaid = appointments.every(apt => apt.paymentId)

  if (alreadyPaid) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
        <h2>Already Paid</h2>
        <p style={{ color: 'var(--color-text-light)' }}>This package has already been paid.</p>
        <Link href="/kiosk" className="cta" style={{ display: 'inline-block', marginTop: '1rem' }}>
          ← Back to list
        </Link>
      </div>
    )
  }

  return (
    <div>
      <Link href="/kiosk" style={{ color: 'var(--color-primary)', display: 'inline-block', marginBottom: '1.5rem' }}>
        ← Back to list
      </Link>

      <div style={{
        background: 'linear-gradient(135deg, #f3e8ff, #fce4ec)', borderRadius: '12px', padding: '1.5rem',
        border: '2px solid var(--color-primary)', marginBottom: '2rem'
      }}>
        <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-primary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
          📦 Package Checkout
        </div>
        <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>{bundle?.name || 'Package'}</h2>
        <p style={{ margin: '0.25rem 0', color: 'var(--color-text-light)' }}>
          <strong>Customer:</strong> {appointments[0]?.customer?.name}
        </p>
        <p style={{ margin: '0.25rem 0', color: 'var(--color-text-light)' }}>
          <strong>Time:</strong> {formatTime(appointments[0]?.dateTime)}
        </p>

        <div style={{ borderTop: '1px solid var(--color-border)', marginTop: '1rem', paddingTop: '1rem' }}>
          <h4 style={{ margin: '0 0 0.75rem' }}>Included Services</h4>
          <ServiceLineItems appointments={appointments} />

          <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '2px solid var(--color-border)' }}>
            {discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
            )}
            {discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: '#4CAF50' }}>
                <span>Package Discount ({bundle?.discountPercent || 0}%)</span>
                <span>-${discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '1.1rem' }}>
              <span>Package Total</span>
              <span>${bundlePrice.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Mode Selector */}
      <fieldset style={{ border: 'none', padding: 0, margin: '0 0 1.5rem 0' }}>
        <legend style={{ fontWeight: '600', marginBottom: '0.75rem', fontSize: '1rem' }}>How would you like to pay?</legend>
        {(bundlePrice === 0 || appointments.length === 0) && (
          <p role="alert" style={{ color: '#c33', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
            Payment cannot be processed for this bundle.
          </p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={() => { setPaymentMode('full'); setSplitError(null) }}
            disabled={bundlePrice === 0 || appointments.length === 0}
            aria-pressed={paymentMode === 'full'}
            aria-label="Pay Full Amount"
            style={{
              padding: '1rem', borderRadius: '8px', cursor: (bundlePrice === 0 || appointments.length === 0) ? 'not-allowed' : 'pointer',
              border: paymentMode === 'full' ? '2px solid var(--color-primary)' : '2px solid var(--color-border)',
              background: paymentMode === 'full' ? 'var(--color-primary)' : 'white',
              color: paymentMode === 'full' ? 'white' : 'var(--color-text)',
              fontWeight: '500', fontSize: '0.95rem',
              opacity: (bundlePrice === 0 || appointments.length === 0) ? 0.5 : 1,
            }}
          >
            💳 Pay Full Amount
          </button>
          <button
            type="button"
            onClick={() => { setPaymentMode('split'); setSplitError(null) }}
            disabled={bundlePrice === 0 || appointments.length === 0}
            aria-pressed={paymentMode === 'split'}
            aria-label="Split Payment"
            style={{
              padding: '1rem', borderRadius: '8px', cursor: (bundlePrice === 0 || appointments.length === 0) ? 'not-allowed' : 'pointer',
              border: paymentMode === 'split' ? '2px solid var(--color-primary)' : '2px solid var(--color-border)',
              background: paymentMode === 'split' ? 'var(--color-primary)' : 'white',
              color: paymentMode === 'split' ? 'white' : 'var(--color-text)',
              fontWeight: '500', fontSize: '0.95rem',
              opacity: (bundlePrice === 0 || appointments.length === 0) ? 0.5 : 1,
            }}
          >
            👥 Split Payment
          </button>
        </div>
      </fieldset>

      {/* Full Payment Flow */}
      {paymentMode === 'full' && (
        <>
          {squareLocationId && (
            <TipSelection
              servicePrice={bundlePrice}
              tipAmount={tipAmount}
              onTipChange={setTipAmount}
            />
          )}

          <TotalDueDisplay totalDue={totalDue} tipAmount={tipAmount} priceLabel="Package" priceAmount={bundlePrice} />

          {!squareLocationId ? (
            <div style={{ padding: '1.5rem', background: '#fff3cd', borderRadius: '8px', border: '1px solid #ffc107', textAlign: 'center' }}>
              <strong>Card payment not available</strong>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>Vendors in this package have not connected Square.</p>
            </div>
          ) : (
            <KioskPaymentForm totalDue={totalDue} paying={paying} card={card} error={error} onPay={handlePay} />
          )}
        </>
      )}

      {/* Split Payment Flow */}
      {paymentMode === 'split' && (
        <>
          <SplitPaymentConfig
            totalAmountCents={dollarsToCents(bundlePrice)}
            onConfigured={handleSplitConfigured}
          />
          {splitError && (
            <p role="alert" style={{ color: '#c33', fontSize: '0.9rem', textAlign: 'center', marginTop: '0.5rem' }}>
              {splitError}
            </p>
          )}
        </>
      )}
    </div>
  )
}

export default function KioskBundlePaymentPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <BundlePaymentContent />
    </Suspense>
  )
}
