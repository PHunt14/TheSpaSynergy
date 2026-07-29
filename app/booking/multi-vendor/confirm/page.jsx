'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, useMemo, Suspense } from 'react'
import PropTypes from 'prop-types'
import BookingDisabled, { isBookingEnabled } from '../../../components/BookingDisabled'
import { calculateBundlePrice, validateBundleServices } from '../../../utils/bundleDiscount'
import { calculateBundlePaymentSplit } from '../../../utils/bundlePaymentSplit'
import { calculateServiceSchedule } from '../../../utils/sequentialAvailability'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime12h(time24) {
  if (!time24) return ''
  const [hStr, mStr] = time24.split(':')
  const h = Number.parseInt(hStr, 10)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${mStr} ${period}`
}

function buildDateTimeISO(date, time24) {
  return `${date}T${time24}:00`
}

// ─── Main Component ──────────────────────────────────────────────────────────

function MultiVendorConfirmContent() {
  const params = useSearchParams()
  const router = useRouter()

  const serviceIds = useMemo(
    () => params.get('services')?.split(',').filter(Boolean) || [],
    [params]
  )
  const date = params.get('date')
  const time = params.get('time')
  const bundleIdParam = params.get('bundleId') || null

  // Reference data
  const [services, setServices] = useState([])
  const [vendors, setVendors] = useState([])
  const [bundleSettings, setBundleSettings] = useState({})
  // staffPublicById: serviceId → Array<{ visibleId, staffName, vendorId }> — populated from public lookups
  const [staffByService, setStaffByService] = useState({})
  const [predefinedBundle, setPredefinedBundle] = useState(null)
  const [bufferMinutes, setBufferMinutes] = useState(15)

  // Load / flow state
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  // Customer form
  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '', phone: '', smsOptIn: false })

  // Staff overrides: serviceId → staffId (only set when customer changes the auto-assigned staff)
  const [staffOverrides, setStaffOverrides] = useState({})

  // Payment method
  const [paymentMethod, setPaymentMethod] = useState('in-person')
  const [card, setCard] = useState(null)

  // ─── Load reference data ───────────────────────────────────────────────────
  useEffect(() => {
    if (serviceIds.length === 0 || !date || !time) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      try {
        const [svcData, vndData, stgData, bdlData] = await Promise.all([
          fetch('/api/services').then(r => r.json()),
          fetch('/api/vendors').then(r => r.json()),
          fetch('/api/bundle-settings').then(r => r.json()),
          bundleIdParam ? fetch('/api/bundles').then(r => r.json()) : Promise.resolve({ bundles: [] })
        ])
        if (cancelled) return

        const allServices = svcData.services || []
        const orderedServices = serviceIds
          .map(id => allServices.find(s => s.serviceId === id))
          .filter(Boolean)

        if (orderedServices.length !== serviceIds.length) {
          setLoadError('One or more services could not be loaded.')
          setLoading(false)
          return
        }

        const allVendors = vndData.vendors || []
        const firstVendor = allVendors.find(v => v.vendorId === orderedServices[0]?.vendorId)
        const buffer = firstVendor?.bufferMinutes ?? 15

        // Look up each staff via the public visibleId endpoint (name + vendor only)
        const allStaffIds = new Set()
        for (const svc of orderedServices) {
          for (const sid of svc.allowedStaff || []) allStaffIds.add(sid)
        }
        const staffEntries = await Promise.all(
          Array.from(allStaffIds).map(sid =>
            fetch(`/api/staff-schedules?visibleId=${encodeURIComponent(sid)}`)
              .then(r => r.json())
              .then(d => (d.schedule ? { visibleId: d.schedule.visibleId, staffName: d.schedule.staffName, vendorId: d.schedule.vendorId } : null))
              .catch(() => null)
          )
        )
        const staffMap = {}
        for (const e of staffEntries) {
          if (e && e.visibleId) staffMap[e.visibleId] = e
        }
        // Build per-service eligible staff list
        const perService = {}
        for (const svc of orderedServices) {
          perService[svc.serviceId] = (svc.allowedStaff || [])
            .map(sid => staffMap[sid])
            .filter(Boolean)
        }

        // Pre-defined bundle info (if applicable)
        const bundleMatch = bundleIdParam
          ? (bdlData.bundles || []).find(b => b.bundleId === bundleIdParam)
          : null

        if (cancelled) return

        setServices(orderedServices)
        setVendors(allVendors)
        setBundleSettings(stgData.settings || {})
        setStaffByService(perService)
        setPredefinedBundle(bundleMatch || null)
        setBufferMinutes(buffer)
        setLoading(false)
      } catch (err) {
        console.error('Error loading confirm data:', err)
        if (!cancelled) {
          setLoadError('Failed to load booking details. Please try again.')
          setLoading(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [serviceIds, date, time, bundleIdParam])

  // ─── Derived values ────────────────────────────────────────────────────────

  const vendorsById = useMemo(
    () => Object.fromEntries(vendors.map(v => [v.vendorId, v])),
    [vendors]
  )

  const houseVendor = useMemo(
    () => vendors.find(v => v.isHouse) || null,
    [vendors]
  )

  const priceBreakdown = useMemo(() => {
    if (services.length === 0) {
      return { subtotal: 0, discountPercent: 0, discountAmount: 0, total: 0 }
    }
    return calculateBundlePrice({
      services,
      predefinedBundle: predefinedBundle?.discountPercent > 0 ? predefinedBundle : null,
      bundleSettings
    })
  }, [services, predefinedBundle, bundleSettings])

  const paymentSplit = useMemo(() => {
    if (services.length === 0 || !houseVendor) {
      return { total: 0, houseFee: 0, vendorShares: [], bundlePayments: [] }
    }
    return calculateBundlePaymentSplit({
      services,
      discountAmount: priceBreakdown.discountAmount,
      houseVendorId: houseVendor.vendorId
    })
  }, [services, priceBreakdown.discountAmount, houseVendor])

  // Client-side schedule preview (pure)
  const orderedSchedule = useMemo(() => {
    if (services.length === 0 || !time) return []
    return calculateServiceSchedule(services, time, bufferMinutes)
  }, [services, time, bufferMinutes])

  // Per-service assignment preview: override wins, else first eligible staff from vendor (best-effort preview)
  // Authoritative assignment is performed server-side by /api/bundles/book.
  const resolvedAssignments = useMemo(() => {
    return orderedSchedule.map(entry => {
      const svc = services.find(s => s.serviceId === entry.serviceId)
      const eligible = staffByService[entry.serviceId] || []
      const overrideId = staffOverrides[entry.serviceId]
      const chosen = overrideId
        ? eligible.find(s => s.visibleId === overrideId) || null
        : eligible[0] || null
      return {
        serviceId: entry.serviceId,
        serviceName: svc?.name || entry.serviceId,
        vendorId: svc?.vendorId,
        vendorName: vendorsById[svc?.vendorId]?.name || '',
        startTime: entry.startTime,
        endTime: entry.endTime,
        staffId: chosen?.visibleId || null,
        staffName: chosen?.staffName || '',
        isOverride: !!overrideId
      }
    })
  }, [orderedSchedule, services, staffByService, staffOverrides, vendorsById])

  // Card payment availability: every non-house vendor must have Square credentials
  const vendorsMissingSquare = useMemo(() => {
    if (!houseVendor) return []
    const uniqueVendorIds = [...new Set(services.map(s => s.vendorId))]
    return uniqueVendorIds
      .filter(vid => vid !== houseVendor.vendorId)
      .map(vid => vendorsById[vid])
      .filter(v => v && (!v.squareAccessToken || !v.squareLocationId))
  }, [services, vendorsById, houseVendor])

  const cardPaymentAvailable = vendorsMissingSquare.length === 0 && !!houseVendor

  // Force in-person when card isn't available
  useEffect(() => {
    if (!cardPaymentAvailable && paymentMethod === 'card') {
      setPaymentMethod('in-person')
    }
  }, [cardPaymentAvailable, paymentMethod])

  const bundleValidation = useMemo(
    () => (services.length > 0 ? validateBundleServices(services) : { valid: false, error: 'Loading...' }),
    [services]
  )

  // ─── Square card form setup ────────────────────────────────────────────────
  // Primary merchant for tokenization: house vendor if house fees exist, else first non-house vendor with credentials
  const squareLocationId = useMemo(() => {
    if (paymentSplit.houseFee > 0 && houseVendor?.squareLocationId) return houseVendor.squareLocationId
    const firstWithCreds = services
      .map(s => vendorsById[s.vendorId])
      .find(v => v && !v.isHouse && v.squareLocationId)
    return firstWithCreds?.squareLocationId || houseVendor?.squareLocationId || null
  }, [paymentSplit.houseFee, houseVendor, services, vendorsById])

  useEffect(() => {
    if (!isBookingEnabled || paymentMethod !== 'card' || !squareLocationId) return
    let isMounted = true

    const initSquare = async () => {
      if (!window.Square) return
      try {
        const appId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
        if (!appId) return
        const payments = await window.Square.payments(appId, squareLocationId)
        const cardInstance = await payments.card()
        await cardInstance.attach('#card-container')
        if (isMounted) setCard(cardInstance)
      } catch (err) {
        console.error('Square init error:', err)
      }
    }

    const loadSquare = () => {
      if (window.Square) { initSquare(); return }
      const script = document.createElement('script')
      script.src = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production'
        ? 'https://web.squarecdn.com/v1/square.js'
        : 'https://sandbox.web.squarecdn.com/v1/square.js'
      script.async = true
      script.onload = () => { if (isMounted) initSquare() }
      document.body.appendChild(script)
    }

    loadSquare()
    return () => { isMounted = false }
  }, [paymentMethod, squareLocationId])

  // ─── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (!formData.firstName || !formData.lastName) {
      setSubmitError('Please enter your first and last name.')
      return
    }
    if (!formData.email && !formData.phone) {
      setSubmitError('Please provide at least an email or phone number.')
      return
    }
    if (!bundleValidation.valid) {
      setSubmitError(bundleValidation.error || 'Invalid bundle selection.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      // Tokenize card first if paying online (fail fast before creating appointments)
      let cardToken = null
      if (paymentMethod === 'card') {
        if (!card) {
          setSubmitError('Card form is not ready yet.')
          setSubmitting(false)
          return
        }
        const tokenResult = await card.tokenize()
        if (tokenResult.status !== 'OK') {
          setSubmitError('Card tokenization failed. Please re-enter card details.')
          setSubmitting(false)
          return
        }
        cardToken = tokenResult.token
      }

      // Send only *actual* overrides (explicit customer choices)
      const overridesToSend = Object.keys(staffOverrides).length > 0 ? staffOverrides : undefined

      // 1. Create bundle + appointments
      const bookResponse = await fetch('/api/bundles/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceIds,
          bundleId: bundleIdParam || undefined,
          date,
          startTime: time,
          serviceOrder: serviceIds,
          customer: { name: `${formData.firstName} ${formData.lastName}`.trim(), email: formData.email, phone: formData.phone, smsOptIn: formData.smsOptIn },
          staffOverrides: overridesToSend
        })
      })
      const bookData = await bookResponse.json()
      if (!bookResponse.ok || !bookData.success) {
        setSubmitError(bookData.error || 'Failed to create booking. Please try another time.')
        setSubmitting(false)
        return
      }

      const { bundleId } = bookData

      // 2. Process card payment if applicable
      if (paymentMethod === 'card' && cardToken) {
        const paymentResponse = await fetch('/api/payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceId: cardToken,
            amount: priceBreakdown.total,
            bundleId,
            bundlePayments: paymentSplit.bundlePayments
          })
        })
        const paymentData = await paymentResponse.json()
        if (!paymentResponse.ok || !paymentData.success) {
          setSubmitError(
            (paymentData.details || paymentData.error || 'Payment failed') +
              ' Your booking was created but payment was not captured. Please contact the spa.'
          )
          setSubmitting(false)
          return
        }
      }

      // 3. Redirect to success page
      const successParams = new URLSearchParams({
        id: bundleId,
        dateTime: buildDateTimeISO(date, time),
        service: services.map(s => s.name).join(', '),
        payment: paymentMethod,
        total: priceBreakdown.total.toFixed(2),
        confirmation: 'required'
      })
      router.push(`/booking/success?${successParams}`)
    } catch (err) {
      console.error('Submission error:', err)
      setSubmitError('Unexpected error processing your booking. Please try again.')
      setSubmitting(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!isBookingEnabled) return <BookingDisabled />

  if (serviceIds.length === 0 || !date || !time) {
    return (
      <main style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        <h1>Missing Booking Details</h1>
        <p style={{ color: 'var(--color-text-light)' }}>
          Booking details are missing. Please start from the service selection step.
        </p>
        <button
          type="button"
          onClick={() => router.push('/booking/multi-vendor')}
          className="cta"
          style={{ marginTop: '1rem' }}
        >
          Back to Service Selection
        </button>
      </main>
    )
  }

  if (loading) {
    return (
      <main style={{ padding: '2rem' }}>
        <h1>Loading...</h1>
      </main>
    )
  }

  if (loadError) {
    return (
      <main style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        <h1>Unable to Load Booking</h1>
        <p style={{ color: '#c0392b' }}>{loadError}</p>
      </main>
    )
  }

  return (
    <main style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <h1>Review & Confirm</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '1.5rem' }}>
        Review your schedule, confirm your contact details, and complete payment.
      </p>

      <PendingConfirmationNotice />

      <SchedulePreview
        assignments={resolvedAssignments}
        staffByService={staffByService}
        date={date}
        onChangeStaff={(serviceId, staffId) => {
          setStaffOverrides(prev => {
            const next = { ...prev }
            if (!staffId) delete next[serviceId]
            else next[serviceId] = staffId
            return next
          })
        }}
      />

      <PriceBreakdown breakdown={priceBreakdown} />

      {paymentSplit.bundlePayments.length > 0 && (
        <VendorSplitSummary
          vendorShares={paymentSplit.vendorShares}
          houseFee={paymentSplit.houseFee}
          houseVendor={houseVendor}
          vendorsById={vendorsById}
        />
      )}

      <form onSubmit={handleSubmit} style={{ marginTop: '2rem' }}>
        <CustomerForm formData={formData} setFormData={setFormData} />

        <PaymentSection
          cardPaymentAvailable={cardPaymentAvailable}
          vendorsMissingSquare={vendorsMissingSquare}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
        />

        {submitError && (
          <div style={{
            background: '#fdecea', border: '1px solid #c0392b', borderRadius: '8px',
            padding: '0.75rem 1rem', marginTop: '1rem', color: '#c0392b', fontSize: '0.9rem'
          }}>
            {submitError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || (paymentMethod === 'card' && !card)}
          className="cta"
          style={{ width: '100%', marginTop: '1.5rem' }}
        >
          {submitting
            ? 'Processing...'
            : paymentMethod === 'card'
              ? `Confirm & Pay $${priceBreakdown.total.toFixed(2)}`
              : 'Confirm Booking'}
        </button>
      </form>
    </main>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function PendingConfirmationNotice() {
  return (
    <div style={{
      background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px',
      padding: '1rem', marginBottom: '1.5rem'
    }}>
      <strong>⚠️ Vendor Confirmation Required</strong>
      <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
        This bundle requires confirmation from each vendor before your appointment is finalized.
        You will be notified once all vendors have confirmed.
      </p>
    </div>
  )
}

function SchedulePreview({ assignments, staffByService, date, onChangeStaff }) {
  return (
    <section style={{
      background: 'var(--color-accent)', borderRadius: '12px',
      padding: '1.25rem', marginBottom: '1.5rem'
    }}>
      <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Your Schedule</h2>
      <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
        {date ? new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'long', month: 'short', day: 'numeric', year: 'numeric'
        }) : ''}
      </p>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {assignments.map((a, idx) => {
          const eligible = staffByService[a.serviceId] || []
          return (
            <li
              key={a.serviceId}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.75rem',
                alignItems: 'center',
                padding: '0.75rem 0',
                borderBottom: idx < assignments.length - 1 ? '1px solid rgba(0,0,0,0.08)' : 'none'
              }}
            >
              <div style={{ minWidth: '9rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                {formatTime12h(a.startTime)} – {formatTime12h(a.endTime)}
              </div>
              <div style={{ flex: 1, minWidth: '12rem' }}>
                <div style={{ fontWeight: 500 }}>{a.serviceName}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
                  {a.vendorName}
                </div>
              </div>
              <div style={{ minWidth: '12rem' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', display: 'block' }}>
                  Staff
                </label>
                {eligible.length > 1 ? (
                  <select
                    value={a.isOverride ? a.staffId || '' : ''}
                    onChange={(e) => onChangeStaff(a.serviceId, e.target.value)}
                    style={{
                      padding: '0.4rem 0.6rem', borderRadius: '6px',
                      border: '1px solid var(--color-border, #ccc)', fontSize: '0.9rem',
                      width: '100%', background: 'white'
                    }}
                  >
                    <option value="">Auto-assign</option>
                    {eligible.map(s => (
                      <option key={s.visibleId} value={s.visibleId}>
                        {s.staffName || s.visibleId}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                    {a.staffName || 'Assigned at booking'}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
        Final staff assignments are confirmed when you submit the booking.
      </p>
    </section>
  )
}

SchedulePreview.propTypes = {
  assignments: PropTypes.array.isRequired,
  staffByService: PropTypes.object.isRequired,
  date: PropTypes.string,
  onChangeStaff: PropTypes.func.isRequired
}

function PriceBreakdown({ breakdown }) {
  return (
    <section style={{
      background: 'var(--color-accent)', borderRadius: '12px',
      padding: '1.25rem', marginBottom: '1.5rem'
    }}>
      <h2 style={{ marginTop: 0 }}>Price</h2>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
        <span>Subtotal</span>
        <span>${breakdown.subtotal.toFixed(2)}</span>
      </div>
      {breakdown.discountAmount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', color: 'var(--color-primary-dark)' }}>
          <span>Bundle discount ({breakdown.discountPercent}%)</span>
          <span>−${breakdown.discountAmount.toFixed(2)}</span>
        </div>
      )}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: '0.6rem',
        marginTop: '0.6rem', fontWeight: 'bold', fontSize: '1.1rem'
      }}>
        <span>Total</span>
        <span>${breakdown.total.toFixed(2)}</span>
      </div>
    </section>
  )
}

PriceBreakdown.propTypes = {
  breakdown: PropTypes.shape({
    subtotal: PropTypes.number,
    discountPercent: PropTypes.number,
    discountAmount: PropTypes.number,
    total: PropTypes.number
  }).isRequired
}

function VendorSplitSummary({ vendorShares, houseFee, houseVendor, vendorsById }) {
  return (
    <section style={{
      background: 'var(--color-accent)', borderRadius: '12px',
      padding: '1.25rem', marginBottom: '1.5rem'
    }}>
      <h2 style={{ marginTop: 0, marginBottom: '0.25rem' }}>Payment Split</h2>
      <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
        Your total is split across vendors automatically.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {vendorShares
          .filter(s => s.amount > 0)
          .map(share => (
            <li
              key={share.vendorId}
              style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '0.4rem 0', borderBottom: '1px solid rgba(0,0,0,0.05)'
              }}
            >
              <span>{vendorsById[share.vendorId]?.name || share.vendorId}</span>
              <span>${share.amount.toFixed(2)}</span>
            </li>
          ))}
        {houseFee > 0 && houseVendor && (
          <li style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '0.4rem 0', fontSize: '0.85rem', color: 'var(--color-text-light)'
          }}>
            <span>{houseVendor.name || 'Platform fee'}</span>
            <span>${houseFee.toFixed(2)}</span>
          </li>
        )}
      </ul>
    </section>
  )
}

VendorSplitSummary.propTypes = {
  vendorShares: PropTypes.array.isRequired,
  houseFee: PropTypes.number.isRequired,
  houseVendor: PropTypes.object,
  vendorsById: PropTypes.object.isRequired
}

function CustomerForm({ formData, setFormData }) {
  const inputStyle = {
    width: '100%', padding: '0.75rem', borderRadius: '8px',
    border: '1px solid var(--color-border)', fontSize: '1rem'
  }
  return (
    <section>
      <h2>Your Information</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.4rem' }}>First Name *</label>
          <input
            type="text" required value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.4rem' }}>Last Name *</label>
          <input
            type="text" required value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            style={inputStyle}
          />
        </div>
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.4rem' }}>Email {!formData.phone ? '*' : ''}</label>
        <input
          type="email" value={formData.email}
          required={!formData.phone}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.4rem' }}>Phone {!formData.email ? '*' : ''}</label>
        <input
          type="tel" value={formData.phone}
          required={!formData.email}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          style={inputStyle}
        />
        {!formData.email && !formData.phone && (
          <p style={{ fontSize: '0.8rem', color: '#d32f2f', margin: '0.25rem 0 0' }}>Please provide at least an email or phone number</p>
        )}
      </div>
      {formData.phone && (
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox" checked={formData.smsOptIn}
            onChange={(e) => setFormData({ ...formData, smsOptIn: e.target.checked })}
            style={{ marginTop: '0.25rem' }}
          />
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
            I agree to receive automated SMS appointment updates (confirmations, reminders, cancellations).
            Msg & data rates may apply. Reply STOP to cancel.
            {' '}<a href="/privacy" target="_blank" style={{ color: 'var(--color-primary)' }}>Privacy Policy</a>
            {' '}& <a href="/terms" target="_blank" style={{ color: 'var(--color-primary)' }}>Terms</a>.
          </span>
        </label>
      </div>
      )}
    </section>
  )
}

CustomerForm.propTypes = {
  formData: PropTypes.object.isRequired,
  setFormData: PropTypes.func.isRequired
}

function PaymentSection({ cardPaymentAvailable, vendorsMissingSquare, paymentMethod, setPaymentMethod }) {
  if (!cardPaymentAvailable) {
    return (
      <section style={{ marginTop: '1.5rem' }}>
        <h2>Payment</h2>
        <div style={{
          padding: '1rem', borderRadius: '8px', border: '2px solid var(--color-primary)',
          background: 'var(--color-accent)'
        }}>
          <strong>Pay in person</strong>
          <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.9rem' }}>
            {vendorsMissingSquare.length > 0
              ? `Card payment is unavailable because ${vendorsMissingSquare.map(v => v.name || v.vendorId).join(', ')} ${vendorsMissingSquare.length > 1 ? 'have' : 'has'} not connected Square. Please pay at your appointment.`
              : 'Please pay at your appointment.'}
          </p>
        </div>
      </section>
    )
  }

  return (
    <section style={{ marginTop: '1.5rem' }}>
      <h2>Payment</h2>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <label style={{
          flex: 1, padding: '1rem', borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
          border: '2px solid', borderColor: paymentMethod === 'card' ? 'var(--color-primary)' : 'var(--color-border)',
          background: paymentMethod === 'card' ? 'var(--color-accent)' : 'white'
        }}>
          <input
            type="radio" name="paymentMethod" value="card"
            checked={paymentMethod === 'card'}
            onChange={(e) => setPaymentMethod(e.target.value)}
            style={{ marginRight: '0.5rem' }}
          />
          Pay Now (Card)
        </label>
        <label style={{
          flex: 1, padding: '1rem', borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
          border: '2px solid', borderColor: paymentMethod === 'in-person' ? 'var(--color-primary)' : 'var(--color-border)',
          background: paymentMethod === 'in-person' ? 'var(--color-accent)' : 'white'
        }}>
          <input
            type="radio" name="paymentMethod" value="in-person"
            checked={paymentMethod === 'in-person'}
            onChange={(e) => setPaymentMethod(e.target.value)}
            style={{ marginRight: '0.5rem' }}
          />
          Pay In-Person
        </label>
      </div>

      {paymentMethod === 'card' && (
        <div>
          <label style={{ display: 'block', marginBottom: '0.4rem' }}>Card Information *</label>
          <div
            id="card-container"
            style={{
              minHeight: '100px', padding: '1rem', background: 'white',
              borderRadius: '8px', border: '1px solid var(--color-border)'
            }}
          />
        </div>
      )}
    </section>
  )
}

PaymentSection.propTypes = {
  cardPaymentAvailable: PropTypes.bool.isRequired,
  vendorsMissingSquare: PropTypes.array.isRequired,
  paymentMethod: PropTypes.string.isRequired,
  setPaymentMethod: PropTypes.func.isRequired
}

// ─── Default export ──────────────────────────────────────────────────────────

export default function MultiVendorConfirmPage() {
  return (
    <Suspense fallback={<main style={{ padding: '2rem' }}><h1>Loading...</h1></main>}>
      <MultiVendorConfirmContent />
    </Suspense>
  )
}
