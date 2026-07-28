'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import TipSelection from '../components/TipSelection'
import useSquarePayment, { resolveSquareLocation } from '../components/useSquarePayment'
import KioskPaymentForm from '../components/KioskPaymentForm'
import PaymentSuccess from '../components/PaymentSuccess'
import TotalDueDisplay from '../components/TotalDueDisplay'
import ServiceLineItems from '../components/ServiceLineItems'
import formatTime from '../components/formatTime'
import { calculateBundlePaymentSplit } from '../../utils/bundlePaymentSplit.js'

function MultiPaymentContent() {
  const searchParams = useSearchParams()
  const ids = searchParams.get('ids')?.split(',') || []

  const [appointments, setAppointments] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [paid, setPaid] = useState(false)
  const [error, setError] = useState(null)
  const [tipAmount, setTipAmount] = useState(0)
  const [squareLocationId, setSquareLocationId] = useState(null)

  const { card } = useSquarePayment(squareLocationId, paid)

  useEffect(() => {
    if (ids.length === 0) { setLoading(false); return }

    Promise.all([
      ...ids.map(id => fetch(`/api/kiosk/appointments?appointmentId=${id}`).then(r => r.json())),
      fetch('/api/vendors').then(r => r.json()),
    ])
      .then(results => {
        const vendorData = results.pop()
        setVendors(vendorData.vendors || [])

        const apts = results.flatMap(r => r.appointments || [])
        setAppointments(apts)

        if (apts.length > 0) {
          resolveSquareLocation(apts[0].vendorId, setSquareLocationId)
        }

        setLoading(false)
      })
      .catch(() => { setError('Failed to load appointments'); setLoading(false) })
  }, [])

  const totalPrice = appointments.reduce((sum, apt) => sum + (apt.service?.price || 0), 0)
  const totalDue = totalPrice + tipAmount
  const houseVendor = vendors.find(v => v.isHouse)
  const customerName = appointments[0]?.customer?.name || 'Customer'

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

      const uniqueVendors = [...new Set(appointments.map(a => a.vendorId))]
      let payRes

      if (uniqueVendors.length === 1) {
        payRes = await fetch('/api/payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceId: tokenResult.token,
            amount: totalPrice,
            tipAmount: tipAmount > 0 ? tipAmount : undefined,
            vendorId: appointments[0].vendorId,
            staffId: appointments[0].staffId || undefined,
            serviceIds: appointments.map(a => a.serviceId),
          })
        })
      } else {
        const services = appointments.map(apt => ({
          price: apt.service?.price || 0,
          vendorId: apt.vendorId,
          staffId: apt.staffId || undefined,
          houseFeeEnabled: apt.service?.houseFeeEnabled || false,
          houseFeeAmount: apt.service?.houseFeeAmount || 0,
        }))
        const split = calculateBundlePaymentSplit({
          services,
          discountAmount: 0,
          houseVendorId: houseVendor?.vendorId || '',
        })
        // Enrich bundlePayments with staffId where we can resolve it
        const enrichedPayments = split.bundlePayments.map(bp => {
          if (bp.isHouseFee) return bp
          // Find the appointment that matches this vendor to get staffId
          const matchingApt = appointments.find(a => a.vendorId === bp.vendorId)
          return { ...bp, staffId: matchingApt?.staffId || undefined }
        })
        payRes = await fetch('/api/payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceId: tokenResult.token,
            amount: totalPrice,
            tipAmount: tipAmount > 0 ? tipAmount : undefined,
            bundlePayments: enrichedPayments,
          })
        })
      }

      const payData = await payRes.json()

      if (!payData.success) {
        setError('Payment failed: ' + (payData.details || payData.error || 'Unknown error'))
        setPaying(false)
        return
      }

      await Promise.all(
        appointments.map(apt =>
          fetch('/api/appointments', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              appointmentId: apt.appointmentId,
              paymentId: payData.paymentId,
              paymentStatus: 'paid',
              paymentAmount: apt.service?.price || 0,
              tipAmount: tipAmount > 0 ? Math.round((tipAmount / appointments.length) * 100) / 100 : undefined,
              status: 'confirmed',
            })
          })
        )
      )

      setPaid(true)
    } catch (err) {
      setError('Payment error — please try again')
      console.error('Multi-payment error:', err)
    } finally {
      setPaying(false)
    }
  }

  if (loading) return <p>Loading...</p>

  if (appointments.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <h2>No appointments found</h2>
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
        customerName={customerName}
        subtitle={`${appointments.length} services paid in one transaction`}
      />
    )
  }

  return (
    <div>
      <Link href="/kiosk" style={{ color: 'var(--color-primary)', display: 'inline-block', marginBottom: '1.5rem' }}>
        ← Back to list
      </Link>

      <div style={{
        background: '#f0f8ff', borderRadius: '12px', padding: '1.5rem',
        border: '2px solid var(--color-primary)', marginBottom: '2rem'
      }}>
        <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-primary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
          🧾 Combined Checkout
        </div>
        <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>{customerName}</h2>
        <p style={{ margin: '0.25rem 0', color: 'var(--color-text-light)' }}>
          <strong>Time:</strong> {formatTime(appointments[0]?.dateTime)}
        </p>

        <div style={{ borderTop: '1px solid var(--color-border)', marginTop: '1rem', paddingTop: '1rem' }}>
          <ServiceLineItems appointments={appointments} />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '1.1rem', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '2px solid var(--color-border)' }}>
            <span>Total</span>
            <span>${totalPrice.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {squareLocationId && (
        <TipSelection servicePrice={totalPrice} tipAmount={tipAmount} onTipChange={setTipAmount} />
      )}

      <TotalDueDisplay totalDue={totalDue} tipAmount={tipAmount} priceLabel="Services" priceAmount={totalPrice} />

      {!squareLocationId ? (
        <div style={{ padding: '1.5rem', background: '#fff3cd', borderRadius: '8px', border: '1px solid #ffc107', textAlign: 'center' }}>
          <strong>Card payment not available</strong>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>Vendor has not connected Square.</p>
        </div>
      ) : (
        <KioskPaymentForm totalDue={totalDue} paying={paying} card={card} error={error} onPay={handlePay} />
      )}
    </div>
  )
}

export default function KioskMultiPaymentPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <MultiPaymentContent />
    </Suspense>
  )
}
