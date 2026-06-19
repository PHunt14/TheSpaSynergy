'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { calculateBundlePaymentSplit } from '../../../utils/bundlePaymentSplit.js'

const TIP_PRESETS = [
  { label: '15%', multiplier: 0.15 },
  { label: '20%', multiplier: 0.20 },
  { label: '25%', multiplier: 0.25 },
]

function TipSelection({ servicePrice, tipAmount, onTipChange }) {
  const [customMode, setCustomMode] = useState(false)
  const [customValue, setCustomValue] = useState('')

  const handlePreset = (multiplier) => {
    setCustomMode(false)
    setCustomValue('')
    onTipChange(Math.round(servicePrice * multiplier * 100) / 100)
  }

  const handleNoTip = () => {
    setCustomMode(false)
    setCustomValue('')
    onTipChange(0)
  }

  const handleCustom = () => {
    setCustomMode(true)
    onTipChange(0)
  }

  const handleCustomChange = (e) => {
    const val = e.target.value.replace(/[^0-9.]/g, '')
    setCustomValue(val)
    const parsed = parseFloat(val)
    onTipChange(isNaN(parsed) || parsed < 0 ? 0 : Math.round(parsed * 100) / 100)
  }

  const isPresetActive = (multiplier) => {
    if (customMode) return false
    const expected = Math.round(servicePrice * multiplier * 100) / 100
    return tipAmount === expected && tipAmount > 0
  }

  return (
    <div style={{
      background: 'var(--color-accent)', borderRadius: '12px', padding: '1.5rem',
      border: '1px solid var(--color-border)', marginBottom: '2rem'
    }}>
      <h3 style={{ marginTop: 0, marginBottom: '1rem', textAlign: 'center' }}>Add a Tip?</h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
        {TIP_PRESETS.map(({ label, multiplier }) => {
          const amount = Math.round(servicePrice * multiplier * 100) / 100
          const active = isPresetActive(multiplier)
          return (
            <button
              key={label}
              onClick={() => handlePreset(multiplier)}
              style={{
                padding: '1rem 0.5rem',
                borderRadius: '8px',
                border: active ? '2px solid var(--color-primary)' : '2px solid var(--color-border)',
                background: active ? 'var(--color-primary)' : 'white',
                color: active ? 'white' : 'var(--color-text)',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '1rem',
                textAlign: 'center',
              }}
            >
              <div>{label}</div>
              <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.8 }}>
                ${amount.toFixed(2)}
              </div>
            </button>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <button
          onClick={handleCustom}
          style={{
            padding: '0.75rem',
            borderRadius: '8px',
            border: customMode ? '2px solid var(--color-primary)' : '2px solid var(--color-border)',
            background: customMode ? 'var(--color-primary)' : 'white',
            color: customMode ? 'white' : 'var(--color-text)',
            cursor: 'pointer',
            fontWeight: '500',
          }}
        >
          Custom
        </button>
        <button
          onClick={handleNoTip}
          style={{
            padding: '0.75rem',
            borderRadius: '8px',
            border: tipAmount === 0 && !customMode ? '2px solid var(--color-primary)' : '2px solid var(--color-border)',
            background: tipAmount === 0 && !customMode ? 'var(--color-primary)' : 'white',
            color: tipAmount === 0 && !customMode ? 'white' : 'var(--color-text)',
            cursor: 'pointer',
            fontWeight: '500',
          }}
        >
          No Tip
        </button>
      </div>

      {customMode && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)',
              fontSize: '1.1rem', color: 'var(--color-text-light)'
            }}>$</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={customValue}
              onChange={handleCustomChange}
              autoFocus
              style={{
                width: '100%',
                padding: '1rem 1rem 1rem 2rem',
                borderRadius: '8px',
                border: '2px solid var(--color-primary)',
                fontSize: '1.2rem',
                fontWeight: '600',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function BundlePaymentContent() {
  const { bundleId } = useParams()

  const [appointments, setAppointments] = useState([])
  const [bundle, setBundle] = useState(null)
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [card, setCard] = useState(null)
  const [paying, setPaying] = useState(false)
  const [paid, setPaid] = useState(false)
  const [error, setError] = useState(null)
  const [tipAmount, setTipAmount] = useState(0)
  const [squareLocationId, setSquareLocationId] = useState(null)

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

        // Resolve Square location from the first appointment's vendor
        if (apts.length > 0) {
          const firstVendorId = apts[0].vendorId
          // Try to get squareLocationId from vendor, then fallback to staff
          fetch(`/api/vendors?vendorId=${firstVendorId}`)
            .then(r => r.json())
            .then(vData => {
              if (vData.vendor?.squareLocationId) {
                setSquareLocationId(vData.vendor.squareLocationId)
              } else {
                // Fallback: find any connected staff
                fetch(`/api/staff-schedules?vendorId=${firstVendorId}`)
                  .then(r => r.json())
                  .then(sData => {
                    const connected = (sData.schedules || []).find(s =>
                      s.squareLocationId && s.squareOAuthStatus === 'connected'
                    )
                    if (connected) setSquareLocationId(connected.squareLocationId)
                  })
                  .catch(() => {})
              }
            })
            .catch(() => {})
        }

        setLoading(false)
      })
      .catch(() => { setError('Failed to load bundle'); setLoading(false) })
  }, [bundleId])

  // Initialize Square when location loads
  useEffect(() => {
    if (!squareLocationId || paid) return
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
        if (!appId || !squareLocationId) return
        const payments = await window.Square.payments(appId, squareLocationId)
        const cardInstance = await payments.card()
        await cardInstance.attach('#card-container')
        setCard(cardInstance)
      } catch (err) {
        console.error('Square init error:', err)
      }
    }

    loadSquare()
    return () => { isMounted = false }
  }, [squareLocationId, paid])

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

      // Calculate the payment split using the utility
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

      // Process payment via multi-vendor bundle path
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
      <div style={{ textAlign: 'center', padding: '3rem 2rem' }}>
        <div style={{
          background: '#d4edda', border: '2px solid #c3e6cb', borderRadius: '12px',
          padding: '2rem', marginBottom: '2rem'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
          <h1 style={{ color: '#155724', marginBottom: '0.5rem' }}>Payment Received</h1>
          <p style={{ color: '#155724', fontSize: '1.25rem', fontWeight: '600' }}>
            ${totalDue.toFixed(2)}
            {tipAmount > 0 && (
              <span style={{ fontSize: '0.9rem', fontWeight: '400' }}> (includes ${tipAmount.toFixed(2)} tip)</span>
            )}
          </p>
          <p style={{ color: '#155724' }}>
            {appointments[0]?.customer?.name} · {bundle?.name || 'Package'}
          </p>
          <p style={{ color: '#155724', fontSize: '0.9rem' }}>
            {appointments.length} services paid across {[...new Set(appointments.map(a => a.vendorName))].join(', ')}
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
          {appointments.map(apt => (
            <div key={apt.appointmentId} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.5rem 0', borderBottom: '1px solid rgba(0,0,0,0.05)'
            }}>
              <div>
                <div style={{ fontWeight: '500' }}>{apt.service?.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
                  {apt.vendorName}{apt.staffName && ` · ${apt.staffName}`} · {apt.service?.duration} min
                </div>
              </div>
              <div style={{ fontWeight: '500', color: 'var(--color-text-light)', fontSize: '0.9rem' }}>
                ${apt.service?.price?.toFixed(2)}
              </div>
            </div>
          ))}

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

      {squareLocationId && (
        <TipSelection
          servicePrice={bundlePrice}
          tipAmount={tipAmount}
          onTipChange={setTipAmount}
        />
      )}

      <div style={{
        textAlign: 'center', padding: '1.5rem', background: 'white', borderRadius: '12px',
        border: '2px solid var(--color-primary)', marginBottom: '2rem'
      }}>
        <div style={{ fontSize: '0.9rem', color: 'var(--color-text-light)', marginBottom: '0.25rem' }}>Total Due</div>
        <div style={{ fontSize: '2.5rem', fontWeight: '700', color: 'var(--color-primary)' }}>
          ${totalDue.toFixed(2)}
        </div>
        {tipAmount > 0 && (
          <div style={{ fontSize: '0.9rem', color: 'var(--color-text-light)', marginTop: '0.25rem' }}>
            Package: ${bundlePrice.toFixed(2)} + Tip: ${tipAmount.toFixed(2)}
          </div>
        )}
      </div>

      {!squareLocationId ? (
        <div style={{ padding: '1.5rem', background: '#fff3cd', borderRadius: '8px', border: '1px solid #ffc107', textAlign: 'center' }}>
          <strong>Card payment not available</strong>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>Vendors in this package have not connected Square.</p>
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
            {paying ? 'Processing...' : `Pay $${totalDue.toFixed(2)}`}
          </button>
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
