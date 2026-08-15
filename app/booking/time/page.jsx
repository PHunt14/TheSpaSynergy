'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import BookingDisabled, { isBookingEnabled } from '../../components/BookingDisabled'

function TimePageContent() {
  const params = useSearchParams()
  const service = params.get('service')
  const vendor = params.get('vendor')
  const staffId = params.get('staffId') // New unified flow: specific staff member
  const multiProvider = params.get('multiProvider') === 'true'
  const quantityParam = params.get('quantity')
  const quantity = quantityParam ? parseInt(quantityParam) : 1

  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedTime, setSelectedTime] = useState(null)
  const [availableSlots, setAvailableSlots] = useState([])
  const [loading, setLoading] = useState(false)
  const [serviceInfo, setServiceInfo] = useState(null)
  const [vendorInfo, setVendorInfo] = useState(null)
  const [assignedStaff, setAssignedStaff] = useState(null)
  const [bookingBlocked, setBookingBlocked] = useState(false)
  const [disabledUntil, setDisabledUntil] = useState(null)
  const [availableDates, setAvailableDates] = useState(null)
  const [datesLoading, setDatesLoading] = useState(true)
  const [quantityMode, setQuantityMode] = useState('sequential')
  const [slotVerifying, setSlotVerifying] = useState(false)

  // Compute the first selectable date based on service resource type
  const getFirstSelectableDate = (svc) => {
    if (svc?.resourceType === 'sauna' || svc?.resourceType === 'room') {
      return new Date()
    }
    return new Date(Date.now() + 86400000) // Tomorrow
  }

  useEffect(() => {
    if (!service) return
    
    // Fetch service info
    fetch('/api/services')
      .then(res => res.json())
      .then(data => {
        const svc = data.services?.find(s => s.serviceId === service)
        setServiceInfo(svc)
        // Auto-set the first selectable date so availability is fetched immediately (Requirement 8.1)
        if (!selectedDate) {
          const firstDate = getFirstSelectableDate(svc)
          setSelectedDate(firstDate)
          // Also fetch available dates for the calendar immediately
          if (isBookingEnabled) fetchAvailableDates(firstDate)
        }
      })
    
    // Fetch vendor info only if vendor param is provided (legacy flow)
    if (vendor) {
      fetch('/api/providers')
        .then(res => res.json())
        .then(data => {
          const vnd = (data.providers || data.vendors || []).find(v => v.vendorId === vendor)
          setVendorInfo(vnd)
        })
    }
  }, [service, vendor])

  const fetchAvailableDates = (date) => {
    if (!service) return
    setDatesLoading(true)
    const month = date.getMonth() + 1
    const year = date.getFullYear()
    const vendorParam = vendor ? `&vendorId=${vendor}` : ''
    const staffParam = staffId ? `&staffId=${staffId}` : ''
    fetch(`/api/available-dates?serviceId=${service}${vendorParam}${staffParam}&month=${month}&year=${year}`)
      .then(res => res.json())
      .then(data => {
        setAvailableDates(new Set(data.availableDates || []))
        setDatesLoading(false)
      })
      .catch(() => { setDatesLoading(false) })
  }

  useEffect(() => {
    if (service && selectedDate && isBookingEnabled) fetchAvailableDates(selectedDate)
  }, [staffId])

  const isDateAvailable = (date) => {
    if (!availableDates || datesLoading) return false
    const dateStr = date.toISOString().split('T')[0]
    return availableDates.has(dateStr)
  }

  const getDayClassName = (date) => {
    if (!availableDates || datesLoading) return 'unavailable-day'
    const dateStr = date.toISOString().split('T')[0]
    return availableDates.has(dateStr) ? '' : 'unavailable-day'
  }

  useEffect(() => {
    if (!service || !selectedDate || !isBookingEnabled) return

    setLoading(true)
    setSelectedTime(null)

    const dateStr = selectedDate.toISOString().split('T')[0] // YYYY-MM-DD

    const multiProviderParam = multiProvider ? '&multiProvider=true' : ''
    const quantityParams = quantity > 1 ? `&quantity=${quantity}&mode=${quantityMode}` : ''
    // Build availability URL: unified flow uses serviceId + optional staffId
    const vendorParam = vendor ? `&vendorId=${vendor}` : ''
    const staffParam = staffId ? `&staffId=${staffId}` : ''
    fetch(`/api/availability?serviceId=${service}&date=${dateStr}${vendorParam}${staffParam}${multiProviderParam}${quantityParams}`)
      .then(res => res.json())
      .then(data => {
        if (data.bookingDisabled) {
          setBookingBlocked(true)
          setDisabledUntil(data.disabledUntil || null)
          setAvailableSlots([])
        } else {
          setAvailableSlots(data.availableSlots || [])
        }
        setAssignedStaff(multiProvider ? null : (data.assignedStaff || null))
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading availability:', err)
        setLoading(false)
      })
  }, [vendor, service, selectedDate, quantityMode])

  if (!isBookingEnabled || bookingBlocked) return <BookingDisabled phone={vendorInfo?.phone} vendorName={vendorInfo?.name} disabledUntil={disabledUntil} />

  return (
    <main>
      <h1>Select Date & Time</h1>
      {serviceInfo && (
        <>
          <p style={{ color: 'var(--color-text-light)', marginBottom: '0.5rem' }}>
            {serviceInfo.name} • {quantity > 1 ? `${quantity}× ` : ''}{serviceInfo.duration} min • ${serviceInfo.price}{quantity > 1 ? ` each` : ''}
          </p>
          {serviceInfo.requiresConsultation && (
            <div style={{
              background: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1rem'
            }}>
              <strong>⚠️ Confirmation Required</strong>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
                This service requires confirmation. Select your preferred date and time below, and the vendor will contact you to confirm.
              </p>
            </div>
          )}
        </>
      )}

      {quantity > 1 && serviceInfo && (serviceInfo.allowedStaff?.length || 0) >= quantity && (
        <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.9rem' }}>Scheduling Preference:</label>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setQuantityMode('sequential')}
              style={{
                flex: 1, padding: '0.75rem', borderRadius: '8px', border: '2px solid',
                borderColor: quantityMode === 'sequential' ? 'var(--color-primary)' : 'var(--color-border)',
                background: quantityMode === 'sequential' ? 'var(--color-accent)' : 'white',
                cursor: 'pointer', fontSize: '0.85rem', textAlign: 'center'
              }}
            >
              <strong>Back-to-back</strong><br />
              <span style={{ color: 'var(--color-text-light)' }}>Same stylist, one after another</span>
            </button>
            <button
              type="button"
              onClick={() => setQuantityMode('parallel')}
              style={{
                flex: 1, padding: '0.75rem', borderRadius: '8px', border: '2px solid',
                borderColor: quantityMode === 'parallel' ? 'var(--color-primary)' : 'var(--color-border)',
                background: quantityMode === 'parallel' ? 'var(--color-accent)' : 'white',
                cursor: 'pointer', fontSize: '0.85rem', textAlign: 'center'
              }}
            >
              <strong>Same time</strong><br />
              <span style={{ color: 'var(--color-text-light)' }}>Multiple stylists at once</span>
            </button>
          </div>
        </div>
      )}
      <p style={{ color: 'var(--color-text-light)' }}>
        {serviceInfo?.requiresConsultation ? 'Choose your preferred date and time.' : 'Choose a date and time that works for you.'}
      </p>

      <div style={{ marginTop: '1.5rem' }}>
        <h3>{serviceInfo?.requiresConsultation ? 'Preferred Date' : 'Select Your Date'}</h3>
        <div className={`spa-datepicker${datesLoading ? ' spa-datepicker--loading' : ''}`}>
          <DatePicker
            selected={selectedDate}
            onChange={setSelectedDate}
            onMonthChange={fetchAvailableDates}
            minDate={serviceInfo?.resourceType === 'sauna' || serviceInfo?.resourceType === 'room' ? new Date() : new Date(Date.now() + 86400000)}
            filterDate={isDateAvailable}
            dayClassName={getDayClassName}
            inline
          />
        </div>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h3>{serviceInfo?.requiresConsultation ? 'Preferred Time' : 'Available Times'}</h3>
        {(loading || !selectedDate) && <p>Loading available times...</p>}
        
        {!loading && selectedDate && availableSlots.length === 0 && (
          <div style={{
            background: 'var(--color-accent)',
            padding: '1.5rem',
            borderRadius: '12px',
            marginBottom: '1rem'
          }}>
            <p style={{ marginBottom: '1rem' }}>
              No available times for this date.
            </p>
            {vendorInfo && vendorInfo.phone && (
              <p>
                Please call us directly to schedule: <a href={`tel:${vendorInfo.phone}`} style={{ fontWeight: 'bold', color: 'var(--color-primary)' }}>{vendorInfo.phone}</a>
              </p>
            )}
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: '1rem'
        }}>
          {!loading && availableSlots.map(slot => (
            <div
              key={slot.time}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedTime(slot.display)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedTime(slot.display); } }}
              style={{
                padding: '1rem',
                borderRadius: '8px',
                cursor: 'pointer',
                background:
                  selectedTime === slot.display
                    ? 'var(--color-primary)'
                    : 'var(--color-accent)',
                color: selectedTime === slot.display ? 'white' : 'var(--color-text)',
                transition: '0.2s ease',
                textAlign: 'center',
                fontWeight: '500'
              }}
            >
              {slot.display}
            </div>
          ))}
        </div>
      </div>

      {selectedTime && (
        <button
          className="cta"
          disabled={slotVerifying}
          onClick={async () => {
            setSlotVerifying(true)
            // Re-fetch availability and verify the selected slot is still free (Requirement 8.4)
            const dateStr = selectedDate.toISOString().split('T')[0]
            const multiProviderParam = multiProvider ? '&multiProvider=true' : ''
            const quantityParams = quantity > 1 ? `&quantity=${quantity}&mode=${quantityMode}` : ''
            const vendorParam = vendor ? `&vendorId=${vendor}` : ''
            const staffParam = staffId ? `&staffId=${staffId}` : ''
            try {
              const res = await fetch(`/api/availability?serviceId=${service}&date=${dateStr}${vendorParam}${staffParam}${multiProviderParam}${quantityParams}`)
              const data = await res.json()
              const freshSlots = data.availableSlots || []
              const stillAvailable = freshSlots.some(s => s.display === selectedTime)
              if (!stillAvailable) {
                alert('Sorry, this time slot was just booked by someone else. Please select a different time.')
                setAvailableSlots(freshSlots)
                setSelectedTime(null)
                setSlotVerifying(false)
                return
              }
            } catch (e) {
              // If re-check fails, proceed anyway — server-side check will catch conflicts
            }
            setSlotVerifying(false)
            const url = `/booking/confirm?service=${service}&date=${selectedDate.toISOString()}&time=${selectedTime}${vendor ? `&vendor=${vendor}` : ''}${staffId ? `&staffId=${staffId}` : ''}${multiProvider ? '&multiProvider=true' : ''}${quantity > 1 ? `&quantity=${quantity}&mode=${quantityMode}` : ''}${assignedStaff ? `&staffId=${assignedStaff.id}&staffName=${encodeURIComponent(assignedStaff.name)}` : ''}`
            window.location.href = url
          }}
        >
          {slotVerifying ? 'Verifying availability...' : 'Continue'}
        </button>
      )}
    </main>
  )
}

export default function TimePage() {
  return (
    <Suspense fallback={<main><h1>Loading...</h1></main>}>
      <TimePageContent />
    </Suspense>
  )
}
