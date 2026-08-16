'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useEffect, useMemo, Suspense } from 'react'
import BookingDisabled, { isBookingEnabled } from '../../components/BookingDisabled'
import NewClientCheckbox from '../../components/NewClientCheckbox'
import ExtrasSelector from '../../components/ExtrasSelector'
import { calculateExtrasCost } from '../../utils/extrasCalculator'
import { calculateBundlePrice } from '../../utils/bundleDiscount'
import PropTypes from 'prop-types'

function AppointmentSummary({ allServiceDetails, totalPrice, totalDuration, date, time, timeFrame, staffName, people, getQty }) {
  return (
    <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--color-accent)', borderRadius: '8px' }}>
      <h3>Appointment Summary</h3>
      {allServiceDetails.map(svc => {
        const qty = getQty ? getQty(svc) : 1
        return (
          <div key={svc.serviceId} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span>{qty > 1 ? `${qty}× ` : ''}{svc.name} ({svc.duration} min{qty > 1 ? ' each' : ''})</span>
            <span>${(svc.price * qty).toFixed(2)}</span>
          </div>
        )
      })}
      {(allServiceDetails.length > 1 || allServiceDetails.some(s => (getQty ? getQty(s) : 1) > 1)) && (
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem', marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
          <span>Total ({totalDuration} min)</span>
          <span>${totalPrice.toFixed(2)}</span>
        </div>
      )}
      <p style={{ marginTop: '0.75rem' }}><strong>Date:</strong> {date ? new Date(date).toLocaleDateString() : 'N/A'}</p>
      <p><strong>Time:</strong> {timeFrame ? timeFrame.charAt(0).toUpperCase() + timeFrame.slice(1) : time}</p>
      {staffName && <p><strong>With:</strong> {decodeURIComponent(staffName)}</p>}
      {!!people && <p><strong>Group Size:</strong> {people} people</p>}
    </div>
  )
}

AppointmentSummary.propTypes = {
  allServiceDetails: PropTypes.array.isRequired,
  totalPrice: PropTypes.number.isRequired,
  totalDuration: PropTypes.number.isRequired,
  date: PropTypes.string,
  time: PropTypes.string,
  timeFrame: PropTypes.string,
  staffName: PropTypes.string,
  people: PropTypes.number,
  getQty: PropTypes.func,
}

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
  const multiProvider = params.get('multiProvider') === 'true'
  const quantityParam = params.get('quantity')
  const quantity = quantityParam ? parseInt(quantityParam) : 1
  const quantityMode = params.get('mode') || 'sequential'
  const quantitiesParam = params.get('quantities')
  const timeFrame = params.get('timeFrame') // Time frame for useTimeFrames bundles
  // Parse per-service quantities (format: "svc-id:2,svc-id2:3")
  const perServiceQuantities = quantitiesParam
    ? Object.fromEntries(quantitiesParam.split(',').map(entry => { const [id, qty] = entry.split(':'); return [id, parseInt(qty)] }))
    : {}
  const isBundle = !!servicesParam
  const serviceIds = servicesParam ? servicesParam.split(',') : service ? [service] : []
  const scheduleParam = params.get('schedule')
  const bundleSchedule = scheduleParam ? JSON.parse(decodeURIComponent(scheduleParam)) : null

  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '', phone: '', smsOptIn: false, notes: '' })
  const [loading, setLoading] = useState(false)
  const [card, setCard] = useState(null)
  const [applePay, setApplePay] = useState(null)
  const [googlePay, setGooglePay] = useState(null)
  const [allServiceDetails, setAllServiceDetails] = useState([])
  const [vendorDetails, setVendorDetails] = useState(null)
  const [staffSquareConnected, setStaffSquareConnected] = useState(null) // null=loading, true/false
  const [paymentMethod, setPaymentMethod] = useState('in-person')
  const [isNewClient, setIsNewClient] = useState(false)
  const [isReturningClient, setIsReturningClient] = useState(false)
  const [showSuggestion, setShowSuggestion] = useState(false)
  const [bundleExtras, setBundleExtras] = useState([]) // Extras available for the bundle
  const [selectedExtras, setSelectedExtras] = useState([]) // Selected extra IDs
  const [bundleDetails, setBundleDetails] = useState(null) // Bundle metadata (useTimeFrames, discountPercent, etc.)

  // For single service, use the first service detail
  const serviceDetails = allServiceDetails.length === 1 ? allServiceDetails[0] : null
  const getQty = (svc) => perServiceQuantities[svc.serviceId] || quantity || 1

  // Calculate base service price (before extras)
  const baseServicePrice = multiProvider
    ? allServiceDetails.reduce((sum, s) => sum + (s?.price || 0), 0)
    : allServiceDetails.reduce((sum, s) => sum + (s?.price || 0) * getQty(s), 0) * (people || 1)

  // Calculate extras cost using selected extras from the available list
  const extrasCost = useMemo(() => {
    if (selectedExtras.length === 0 || bundleExtras.length === 0) return { items: [], grandTotal: 0 }
    const selected = bundleExtras.filter(e => selectedExtras.includes(e.extraId))
    return calculateExtrasCost(selected, people || 1)
  }, [selectedExtras, bundleExtras, people])

  // Apply bundle discount to base services only, then add extras at full price
  const bundleDiscountedBase = useMemo(() => {
    if (!bundleDetails?.discountPercent || allServiceDetails.length === 0) {
      return baseServicePrice
    }
    const result = calculateBundlePrice({
      services: allServiceDetails.map(s => ({ price: (s?.price || 0) * getQty(s) * (people || 1) })),
      predefinedBundle: bundleDetails.discountPercent > 0 ? bundleDetails : null,
      bundleSettings: null,
    })
    return result.total
  }, [bundleDetails, allServiceDetails, people, quantity, perServiceQuantities])

  // Total = discounted base + extras at full price
  const totalPrice = (bundleDetails?.discountPercent > 0 ? bundleDiscountedBase : baseServicePrice) + extrasCost.grandTotal

  const totalDuration = allServiceDetails.reduce((sum, s) => sum + (s?.duration || 0) * getQty(s), 0)
  const multiProviderGuests = multiProvider && allServiceDetails.length > 0
    ? (allServiceDetails[0]?.minPeople || 2)
    : null

  useEffect(() => {
    if (serviceIds.length === 0) return

    // Parallel fetch: services, bundle details, and extras in a single Promise.all (Req 6.1)
    const fetchPromises = [
      fetch('/api/services').then(res => res.json()),
    ]

    // If this is a bundle booking, fetch bundle details and extras in parallel
    if (bundleId) {
      fetchPromises.push(
        fetch(`/api/bundles`).then(res => res.json()),
        fetch(`/api/extras?bundleId=${bundleId}`).then(res => res.json())
      )
    }

    Promise.all(fetchPromises)
      .then(([servicesData, bundlesData, extrasData]) => {
        // Process services
        const selected = (servicesData.services || []).filter(s => serviceIds.includes(s.serviceId))
        setAllServiceDetails(selected)
        if (selected.some(s => s.cardPaymentDisabled)) setPaymentMethod('in-person')
        if (typeof window !== 'undefined' && window.gtag && selected.length > 0) {
          window.gtag('event', 'begin_checkout', {
            value: selected.reduce((sum, s) => sum + (s.price || 0), 0) * (people || 1),
            currency: 'USD',
            items: selected.map(s => ({ item_id: s.serviceId, item_name: s.name, price: s.price }))
          })
        }

        // Process bundle details (retain in state for session - Req 6.4)
        if (bundlesData) {
          const bundle = (bundlesData.bundles || []).find(b => b.bundleId === bundleId)
          if (bundle) setBundleDetails(bundle)
        }

        // Process extras - only set if there are active extras (Req 3.1, 3.2)
        if (extrasData?.extras?.length > 0) {
          setBundleExtras(extrasData.extras)
        }
      })
      .catch(err => {
        console.error('Error fetching booking data:', err)
      })

    // Fetch staff Square status if a staff member is assigned
    // For "Any Available" (no staffId), we defer Square check until after auto-assignment
    if (staffId) {
      fetch(`/api/staff-schedules?visibleId=${staffId}`)
        .then(res => res.json())
        .then(data => {
          const staff = data.schedule || data.schedules?.[0]
          setStaffSquareConnected(!!staff?.squareLocationId && staff?.squareOAuthStatus !== 'error')
        })
        .catch(() => setStaffSquareConnected(false))
    } else {
      // "Any Available" — assume card payment may be available (auto-assigned staff may have Square)
      setStaffSquareConnected(true)
    }

    // Fetch vendor details (use vendor param or derive from first service)
    const vendorId = vendor
    if (vendorId) {
      fetch(`/api/vendors?vendorId=${vendorId}`)
        .then(res => res.json())
        .then(data => setVendorDetails(data.vendor))
    }
  }, [])

  // If no vendor param (bundle case or "Any Available"), derive from first loaded service or fetch house provider
  useEffect(() => {
    if (!vendor && allServiceDetails.length > 0 && !vendorDetails) {
      const vendorId = allServiceDetails[0].vendorId
      if (vendorId) {
        fetch(`/api/vendors?vendorId=${vendorId}`)
          .then(res => res.json())
          .then(data => setVendorDetails(data.vendor))
      } else {
        // Unified model: services don't have vendorId — fetch the house provider for Square form initialization
        fetch('/api/vendors')
          .then(res => res.json())
          .then(data => {
            const house = (data.vendors || []).find(v => v.isHouse)
            if (house) setVendorDetails(house)
            else if (data.vendors?.length > 0) setVendorDetails(data.vendors[0])
          })
      }
    }
  }, [allServiceDetails])

  useEffect(() => {
    if (!isBookingEnabled || paymentMethod !== 'card' || !vendorDetails) return

    let isMounted = true

    const loadSquare = async () => {
      if (!window.Square) {
        const script = document.createElement('script')
        script.src = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production'
          ? 'https://web.squarecdn.com/v1/square.js'
          : 'https://sandbox.web.squarecdn.com/v1/square.js'
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

  // Returning-client detection: query Client secondary indexes on phone/email blur
  const handleClientLookup = async ({ phone, email }) => {
    if (!phone && !email) return
    try {
      const params = new URLSearchParams()
      if (phone) params.set('phone', phone)
      if (email) params.set('email', email)
      const res = await fetch(`/api/clients/lookup?${params}`)
      if (!res.ok) return // Silently ignore failures
      const data = await res.json()
      if (data.found) {
        setIsReturningClient(true)
        setShowSuggestion(false)
      } else {
        setIsReturningClient(false)
        if (!isNewClient) {
          setShowSuggestion(true)
        }
      }
    } catch {
      // Silently ignore lookup failures without blocking booking
    }
  }

  if (!isBookingEnabled) return <BookingDisabled phone={vendorDetails?.phone} vendorName={vendorDetails?.name} />

  const initializeSquare = async () => {
    if (!window.Square) return
    try {
      const appId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
      const locationId = vendorDetails?.squareLocationId
      if (!appId || !locationId) return
      const payments = await window.Square.payments(appId, locationId)

      // Card form
      const cardInstance = await payments.card()
      await cardInstance.attach('#card-container')
      setCard(cardInstance)

      const walletPaymentRequest = payments.paymentRequest({
        countryCode: 'US',
        currencyCode: 'USD',
        total: { amount: totalPrice.toFixed(2), label: 'The Spa Synergy' }
      })

      // Apple Pay
      try {
        const applePayInstance = await payments.applePay(walletPaymentRequest)
        setApplePay(applePayInstance)
      } catch { /* Apple Pay not available on this device/browser */ }

      // Google Pay
      try {
        const googlePayInstance = await payments.googlePay(walletPaymentRequest)
        await googlePayInstance.attach('#google-pay-container')
        setGooglePay(googlePayInstance)
      } catch { /* Google Pay not available on this device/browser */ }
    } catch (error) {
      console.error('Square initialization error:', error)
    }
  }

  const buildDateTimeISO = () => {
    const dateOnly = date.split('T')[0]
    // For time frame bookings, use midnight placeholder (Req 1.2)
    if (timeFrame && !time) {
      return `${dateOnly}T00:00:00`
    }
    const timeFormatted = time.replace(' AM', '').replace(' PM', '')
    const isPM = time.includes('PM')
    const [hours, minutes] = timeFormatted.split(':')
    let hour24 = parseInt(hours)
    if (isPM && hour24 !== 12) hour24 += 12
    if (!isPM && hour24 === 12) hour24 = 0
    return `${dateOnly}T${hour24.toString().padStart(2, '0')}:${minutes}:00`
  }

  // Build a dateTimeISO for a specific service using its scheduled start time (HH:MM format)
  const buildDateTimeForService = (serviceId) => {
    if (!bundleSchedule) return buildDateTimeISO()
    const entry = bundleSchedule.find(e => e.serviceId === serviceId)
    if (!entry || !entry.startTime) return buildDateTimeISO()
    const dateOnly = date.split('T')[0]
    return `${dateOnly}T${entry.startTime}:00`
  }

  const processPaymentWithToken = async (token, assignedStaffId) => {
    const paymentResponse = await fetch('/api/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceId: token,
        amount: totalPrice,
        vendorId: vendor || allServiceDetails[0]?.vendorId,
        staffId: assignedStaffId || staffId || undefined,
        serviceIds: allServiceDetails.map(s => s.serviceId),
        people: people || undefined
      })
    })
    const paymentData = await paymentResponse.json()
    if (!paymentData.success) throw new Error(paymentData.error || 'Payment failed')
    return paymentData.paymentId
  }

  /**
   * Handles the "Any Available" payment flow:
   * 1. Creates appointments (API auto-assigns staff)
   * 2. Processes payment through assigned staff's Square credentials
   * 3. Updates appointments with payment info
   * 4. Navigates to success page
   */
  const getCustomerData = () => ({ name: `${formData.firstName} ${formData.lastName}`.trim(), email: formData.email, phone: formData.phone, smsOptIn: formData.smsOptIn, notes: formData.notes, isNewClient })

  // Handle toggling an extra selection
  const handleExtraToggle = (extraId) => {
    setSelectedExtras(prev =>
      prev.includes(extraId)
        ? prev.filter(id => id !== extraId)
        : [...prev, extraId]
    )
  }

  const handleAnyAvailablePayment = async (token) => {
    const dateTimeISO = buildDateTimeISO()
    const customerData = getCustomerData()
    const isResource = allServiceDetails.every(s => s.resourceType === 'sauna' || s.resourceType === 'room')
    const status = isResource ? 'confirmed' : 'pending-confirmation'

    // Build extras payload from selected extras
    const extrasPayload = selectedExtras.length > 0
      ? selectedExtras.map(id => ({ extraId: id }))
      : undefined

    const appointmentResults = await Promise.all(
      allServiceDetails.map(svc => {
        const svcQty = getQty(svc)
        return fetch('/api/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serviceId: svc.serviceId,
            bundleId: bundleId || undefined,
            dateTime: dateTimeISO,
            customer: customerData,
            status,
            ...(people ? { people } : {}),
            ...(svcQty > 1 ? { quantity: svcQty, quantityMode } : {}),
            ...(timeFrame ? { timeFrame } : {}),
            isNewClient,
            ...(extrasPayload ? { extras: extrasPayload } : {}),
          })
        }).then(r => r.json())
      })
    )

    const firstSuccess = appointmentResults.find(r => r.success)
    if (!firstSuccess) {
      throw new Error(appointmentResults[0]?.error || 'Appointment creation failed')
    }

    const assignedStaffId = firstSuccess.staffId
    let paymentId = null
    try {
      paymentId = await processPaymentWithToken(token, assignedStaffId)
    } catch (payError) {
      console.error('Payment failed after appointment creation:', payError)
      alert('Appointment booked but payment failed: ' + payError.message + '. Please pay in person.')
    }

    if (paymentId) {
      await Promise.all(
        appointmentResults.filter(r => r.appointmentId).map(r =>
          fetch('/api/appointments', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              appointmentId: r.appointmentId,
              paymentId,
              paymentStatus: 'paid',
              paymentAmount: totalPrice
            })
          })
        )
      )
    }

    const successUrl = new URLSearchParams({
      id: firstSuccess.appointmentId || firstSuccess.appointmentIds?.[0] || firstSuccess.groupId,
      dateTime: dateTimeISO,
      service: allServiceDetails.map(s => s.name).join(', '),
      payment: paymentId ? 'card' : 'in-person',
      total: totalPrice.toFixed(2)
    })
    if (requiresConfirmation) successUrl.set('confirmation', 'required')
    if (people) successUrl.set('people', people)
    if (quantity > 1) successUrl.set('quantity', String(quantity))
    window.location.href = `/booking/success?${successUrl}`
  }

  const createAppointments = async (paymentId, pMethod, assignedStaffIdOverride) => {
    const dateTimeISO = buildDateTimeISO()
    const customerData = getCustomerData()
    const isResource = allServiceDetails.every(s => s.resourceType === 'sauna' || s.resourceType === 'room')
    const status = isResource ? 'confirmed' : 'pending-confirmation'
    const isSauna = allServiceDetails.every(s => s.resourceType === 'sauna')
    const effectiveStaffId = isSauna ? 'resource-sauna' : (assignedStaffIdOverride || staffId)

    // Build extras payload from selected extras
    const extrasPayload = selectedExtras.length > 0
      ? selectedExtras.map(id => ({ extraId: id }))
      : undefined

    // Multi-provider booking: single API call creates all appointments
    if (multiProvider) {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: allServiceDetails[0]?.vendorId || vendor,
          serviceId: allServiceDetails[0]?.serviceId || service,
          dateTime: dateTimeISO,
          customer: customerData,
          status,
          multiProvider: true,
          providersRequired: allServiceDetails[0]?.providersRequired || 2,
          ...(paymentId ? { paymentId, paymentStatus: 'paid', paymentAmount: totalPrice } : {}),
          ...(timeFrame ? { timeFrame } : {}),
          isNewClient,
          ...(extrasPayload ? { extras: extrasPayload } : {}),
        })
      })
      const result = await response.json()

      if (result.success) {
        const successUrl = new URLSearchParams({
          id: result.appointmentIds?.[0] || result.groupId,
          dateTime: dateTimeISO,
          service: allServiceDetails.map(s => s.name).join(', '),
          payment: pMethod,
          total: totalPrice.toFixed(2),
          multiProvider: 'true',
          guests: String(multiProviderGuests || 2)
        })
        if (requiresConfirmation) successUrl.set('confirmation', 'required')
        window.location.href = `/booking/success?${successUrl}`
      } else {
        const errorMsg = result.error || 'Appointment creation failed'
        if (errorMsg.includes('already booked') || errorMsg.includes('no longer available')) {
          alert(`${errorMsg}. Please go back and select a different time.`)
          window.history.back()
        } else {
          alert(errorMsg)
        }
      }
      return
    }

    const results = await Promise.all(
      allServiceDetails.map(svc => {
        const svcQty = getQty(svc)
        const svcDateTime = buildDateTimeForService(svc.serviceId)
        // For sauna, use the house vendor (kera-studio) as the vendorId
        const svcVendorId = svc.resourceType === 'sauna' ? 'vendor-kera-studio' : (svc.vendorId || vendor)
        return fetch('/api/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendorId: svcVendorId,
            serviceId: svc.serviceId,
            staffId: svc.resourceType === 'sauna' ? 'resource-sauna' : (effectiveStaffId || undefined),
            bundleId: bundleId || undefined,
            dateTime: svcDateTime,
            customer: customerData,
            status,
            paymentId,
            ...(paymentId ? { paymentStatus: 'paid', paymentAmount: totalPrice } : {}),
            ...(people ? { people } : {}),
            ...(svcQty > 1 ? { quantity: svcQty, quantityMode } : {}),
            ...(timeFrame ? { timeFrame } : {}),
            isNewClient,
            ...(extrasPayload ? { extras: extrasPayload } : {}),
          })
        }).then(r => r.json())
      })
    )

    if (bundleId) {
      const appointmentIds = results.filter(r => r.appointmentId || r.appointmentIds).flatMap(r => r.appointmentIds || [r.appointmentId])
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
          customer: customerData,
          dateTime: dateTimeISO
        })
      })
    }

    const firstSuccess = results.find(r => r.appointmentId || r.appointmentIds)
    const firstError = results.find(r => r.error)
    if (firstSuccess && !firstError) {
      const successUrl = new URLSearchParams({
        id: firstSuccess.appointmentId || firstSuccess.appointmentIds?.[0] || firstSuccess.groupId,
        dateTime: dateTimeISO,
        service: allServiceDetails.map(s => s.name).join(', '),
        payment: pMethod,
        total: totalPrice.toFixed(2)
      })
      if (requiresConfirmation) successUrl.set('confirmation', 'required')
      if (staffName) successUrl.set('staffName', staffName)
      if (people) successUrl.set('people', people)
      if (quantity > 1) successUrl.set('quantity', String(quantity))
      window.location.href = `/booking/success?${successUrl}`
    } else {
      const errorMsg = firstError?.error || 'Appointment creation failed'
      if (errorMsg.includes('already booked') || errorMsg.includes('no longer available')) {
        alert(`${errorMsg}. Please go back and select a different time.`)
        window.history.back()
      } else {
        alert(errorMsg)
      }
    }
  }

  const handleWalletPay = (type) => async () => {
    if (!formData.firstName || !formData.lastName || (!formData.email && !formData.phone)) {
      alert('Please fill in your name and at least one contact method (email or phone)')
      return
    }
    setLoading(true)
    try {
      const instance = type === 'apple' ? applePay : googlePay
      const result = await instance.tokenize()
      if (result.status !== 'OK') { alert('Payment failed'); setLoading(false); return }

      // "Any Available" with wallet pay: create appointment first for auto-assignment (Req 5.5, 6.1)
      if (!staffId) {
        await handleAnyAvailablePayment(result.token)
        return
      }

      // Specific staff selected — standard wallet payment flow
      const paymentId = await processPaymentWithToken(result.token, staffId)
      await createAppointments(paymentId, 'card')
    } catch (error) {
      console.error('Wallet payment error:', error)
      alert('Payment failed: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (allServiceDetails.length === 0) return
    if (!formData.firstName || !formData.lastName) { alert('Please enter your first and last name'); return }
    if (!formData.email && !formData.phone) { alert('Please provide at least an email or phone number'); return }
    setLoading(true)

    try {
      // "Any Available" with card payment: create appointment first to get assigned staffId,
      // then process payment through the assigned staff's Square credentials (Req 5.5, 5.6, 6.1)
      if (!staffId && paymentMethod === 'card') {
        if (!card) { alert('Please enter card information'); setLoading(false); return }
        const result = await card.tokenize()
        if (result.status !== 'OK') { alert('Card tokenization failed'); setLoading(false); return }

        await handleAnyAvailablePayment(result.token)
        return
      }

      // Standard flow: staffId is known (specific staff selected) or in-person payment
      let paymentId = null

      if (paymentMethod === 'card') {
        if (!card) { alert('Please enter card information'); setLoading(false); return }
        const result = await card.tokenize()
        if (result.status !== 'OK') { alert('Card tokenization failed'); setLoading(false); return }

        paymentId = await processPaymentWithToken(result.token, staffId)
      }

      await createAppointments(paymentId, paymentMethod)
    } catch (error) {
      console.error('Error:', error)
      alert('Error processing booking')
    } finally {
      setLoading(false)
    }
  }

  const hasConsultation = allServiceDetails.some(s => s.requiresConsultation)
  const cardDisabled = allServiceDetails.some(s => s.cardPaymentDisabled)
  const squareAvailable = !!staffSquareConnected
  const requiresConfirmation = !allServiceDetails.every(s => s.resourceType === 'sauna' || s.resourceType === 'room')

  return (
    <main>
      <h1>Review Booking</h1>
      {requiresConfirmation && (
        <div style={{
          background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px', padding: '1rem', marginBottom: '1rem'
        }}>
          <strong>⚠️ {bundleId ? 'Vendor Confirmation Required' : 'Confirmation Required'}</strong>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
            {bundleId
              ? 'This bundle requires confirmation from each vendor before your appointment is finalized. You will be notified once confirmed.'
              : 'This service requires confirmation. The vendor will contact you to confirm your preferred date and time.'}
          </p>
        </div>
      )}
      <p style={{ color: 'var(--color-text-light)' }}>
        Review your appointment details and enter your information.
      </p>

      <AppointmentSummary
        allServiceDetails={allServiceDetails}
        totalPrice={totalPrice}
        totalDuration={totalDuration}
        date={date}
        time={time}
        timeFrame={timeFrame}
        staffName={multiProvider ? null : staffName}
        people={multiProviderGuests || people}
        getQty={getQty}
      />

      {/* Time frame booking notice (Req 1.5) */}
      {timeFrame && (
        <div style={{ marginTop: '1rem', padding: '1rem', background: '#e3f2fd', borderRadius: '8px', border: '1px solid #90caf9' }}>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>
            🕐 You selected a <strong>{timeFrame.charAt(0).toUpperCase() + timeFrame.slice(1)}</strong> time frame. The vendor will contact you to confirm the exact appointment time.
          </p>
        </div>
      )}

      {(Object.keys(perServiceQuantities).length > 0 || quantity > 1) && (
        <div style={{ marginTop: '1rem', padding: '1rem', background: '#e3f2fd', borderRadius: '8px', border: '1px solid #90caf9' }}>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>
            📋 {Object.keys(perServiceQuantities).length > 0
              ? allServiceDetails.filter(s => getQty(s) > 1).map(s => `${getQty(s)}× ${s.name}`).join(', ')
              : `${quantity}× ${allServiceDetails[0]?.name || 'Service'}`
            } — {quantityMode === 'parallel' ? 'all at the same time (multiple staff)' : 'back-to-back with the same staff'}
          </p>
        </div>
      )}

      {multiProvider && (
        <div style={{ marginTop: '1rem', padding: '1rem', background: '#e8f5e9', borderRadius: '8px', border: '1px solid #a5d6a7' }}>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>
            🎉 This is a couples/group service for <strong>{multiProviderGuests || 2} guests</strong>. Staff will be automatically assigned.
          </p>
        </div>
      )}

      {/* Extras selector for bundle bookings (Req 3.1, 3.2) */}
      {bundleExtras.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <ExtrasSelector
            extras={bundleExtras}
            selectedExtras={selectedExtras}
            onToggle={handleExtraToggle}
            groupSize={people || 1}
          />
          {extrasCost.grandTotal > 0 && (
            <div style={{ padding: '0.75rem 1rem', background: 'var(--color-accent)', borderRadius: '8px', marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}>
                <span>Extras Total:</span>
                <span style={{ fontWeight: 600 }}>+${extrasCost.grandTotal.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.05rem', fontWeight: 'bold', marginTop: '0.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem' }}>
                <span>Booking Total:</span>
                <span>${totalPrice.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ marginTop: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>First Name *</label>
            <input type="text" required value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Last Name *</label>
            <input type="text" required value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Email {!formData.phone ? '*' : ''}</label>
          <input type="email" value={formData.email}
            required={!formData.phone}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            onBlur={(e) => { if (e.target.value) handleClientLookup({ email: e.target.value, phone: formData.phone }) }}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Phone {!formData.email ? '*' : ''}</label>
          <input type="tel" value={formData.phone}
            required={!formData.email}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            onBlur={(e) => { if (e.target.value) handleClientLookup({ phone: e.target.value, email: formData.email }) }}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
          {!formData.email && !formData.phone && (
            <p style={{ fontSize: '0.8rem', color: '#d32f2f', margin: '0.25rem 0 0' }}>Please provide at least an email or phone number</p>
          )}
        </div>

        {formData.phone && (
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={formData.smsOptIn}
              onChange={(e) => setFormData({ ...formData, smsOptIn: e.target.checked })}
              style={{ marginTop: '0.25rem' }} />
            <span style={{ fontSize: '0.9rem', color: 'var(--color-text-light)' }}>
              I agree to receive automated SMS appointment updates from The Spa Synergy (e.g. confirmations, reminders, cancellations). Msg frequency: ~1–5 msgs per booking. Msg & data rates may apply. Reply STOP to cancel, HELP for help. Consent is not required to book. <a href="/privacy" target="_blank" style={{ color: 'var(--color-primary)' }}>Privacy Policy</a> & <a href="/terms" target="_blank" style={{ color: 'var(--color-primary)' }}>Terms</a>.
            </span>
          </label>
        </div>
        )}

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Notes (optional)</label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Any special requests, preferences, or info for your provider (e.g. 'schedule haircuts simultaneously if possible')"
            rows="3"
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem', resize: 'vertical' }}
          />
        </div>

        <NewClientCheckbox
          checked={isNewClient}
          onChange={(checked) => {
            setIsNewClient(checked)
            if (checked) setShowSuggestion(false)
          }}
          isReturningClient={isReturningClient}
          showSuggestion={showSuggestion}
        />

        {/* Consultation notice for new clients (Req 2.6) */}
        {isNewClient && (
          <div style={{
            padding: '0.75rem 1rem', background: '#fff3cd', border: '1px solid #ffc107',
            borderRadius: '8px', marginBottom: '1rem', fontSize: '0.9rem'
          }}>
            <strong>📋 Consultation Notice:</strong> As a first-time client, the vendor will schedule a consultation prior to your appointment.
          </div>
        )}

        <div style={{ marginTop: '2rem', marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Payment Method *</label>
          {(bundleId || cardDisabled || !squareAvailable) ? (
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
            {(applePay || googlePay) && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Express Checkout</label>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {applePay && (
                    <button type="button" onClick={handleWalletPay('apple')} disabled={loading}
                      style={{ flex: 1, minWidth: '140px', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'black', color: 'white', fontSize: '1rem', cursor: 'pointer', fontWeight: '500' }}>
                       Pay
                    </button>
                  )}
                  <div id="google-pay-container" style={{ flex: 1, minWidth: '140px' }}></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1rem 0' }}>
                  <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
                  <span style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>or pay with card</span>
                  <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
                </div>
              </div>
            )}
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Card Information *</label>
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
