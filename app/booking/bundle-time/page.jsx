'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import BookingDisabled, { isBookingEnabled } from '../../components/BookingDisabled'
import TimeFrameSelector from '../../components/TimeFrameSelector'

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const DAY_LABELS = { sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday' }

function BundleTimeContent() {
  const params = useSearchParams()
  const bundleId = params.get('bundleId')
  const serviceIds = params.get('services')?.split(',') || []
  const people = params.get('people')
  const quantitiesParam = params.get('quantities')

  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedTime, setSelectedTime] = useState(null)
  const [selectedTimeFrame, setSelectedTimeFrame] = useState(null)
  const [selectedSchedule, setSelectedSchedule] = useState(null)
  const [availableSlots, setAvailableSlots] = useState([])
  const [loading, setLoading] = useState(false)
  const [services, setServices] = useState([])
  const [bundle, setBundle] = useState(null)
  const [availableDates, setAvailableDates] = useState(null)
  const [dataReady, setDataReady] = useState(false)

  const useTimeFrames = bundle?.useTimeFrames === true
  const allowedDays = bundle?.allowedDays?.length > 0 ? bundle.allowedDays : null

  const isAllowedDay = (date) => {
    if (!allowedDays) return true
    const dayName = DAY_NAMES[date.getDay()]
    return allowedDays.includes(dayName)
  }

  // Find the next allowed date from today
  useEffect(() => {
    if (!allowedDays) return
    const today = new Date()
    for (let i = 0; i < 7; i++) {
      const candidate = new Date(today)
      candidate.setDate(today.getDate() + i)
      if (isAllowedDay(candidate)) {
        setSelectedDate(candidate)
        break
      }
    }
  }, [bundle])

  useEffect(() => {
    if (serviceIds.length === 0) return
    
    Promise.all([
      fetch('/api/services').then(res => res.json()),
      fetch('/api/bundles').then(res => res.json())
    ]).then(([serviceData, bundleData]) => {
      const selected = serviceData.services?.filter(s => serviceIds.includes(s.serviceId)) || []
      setServices(selected)
      if (bundleId) {
        setBundle(bundleData.bundles?.find(b => b.bundleId === bundleId))
      }
      setDataReady(true)
    })
  }, [])

  const fetchAvailableDates = (date) => {
    if (serviceIds.length === 0) return
    const month = date.getMonth() + 1
    const year = date.getFullYear()
    const daysParam = allowedDays ? `&allowedDays=${allowedDays.join(',')}` : ''
    fetch(`/api/available-dates?serviceId=${serviceIds[0]}&month=${month}&year=${year}${daysParam}`)
      .then(res => res.json())
      .then(data => setAvailableDates(new Set(data.availableDates || [])))
      .catch(() => {})
  }

  useEffect(() => {
    if (services.length > 0 && isBookingEnabled) {
      // Wait for bundle to load if bundleId is present, so allowedDays can filter
      if (bundleId && !bundle) return
      // Skip fetching available dates for time-frame bundles (Requirement 6.5)
      if (useTimeFrames) return
      fetchAvailableDates(selectedDate || new Date())
    }
  }, [services, bundle])

  const isDateAvailable = (date) => {
    if (allowedDays && !isAllowedDay(date)) return false
    // For time-frame bundles, all allowed days are available (no slot-level check)
    if (useTimeFrames) return true
    if (!availableDates) return true
    return availableDates.has(date.toISOString().split('T')[0])
  }

  const getDayClassName = (date) => {
    if (allowedDays && !isAllowedDay(date)) return 'unavailable-day'
    if (useTimeFrames) return ''
    if (!availableDates) return ''
    return availableDates.has(date.toISOString().split('T')[0]) ? '' : 'unavailable-day'
  }

  // Only fetch time slots for non-time-frame bundles (Requirement 1.3, 6.5)
  useEffect(() => {
    if (!isBookingEnabled || serviceIds.length === 0 || !selectedDate) return
    // Skip availability API for time-frame bundles
    if (useTimeFrames) return
    // Don't fetch times for disallowed days
    if (allowedDays && !isAllowedDay(selectedDate)) {
      setAvailableSlots([])
      return
    }

    setLoading(true)
    setSelectedTime(null)

    const dateStr = selectedDate.toISOString().split('T')[0]

    // Use bundle-availability for multi-service, single-service availability otherwise
    const url = serviceIds.length > 1
      ? `/api/bundle-availability?serviceIds=${serviceIds.join(',')}&date=${dateStr}${bundleId ? `&bundleId=${bundleId}` : ''}`
      : `/api/availability?serviceId=${serviceIds[0]}&date=${dateStr}`

    fetch(url)
      .then(res => res.json())
      .then(data => {
        setAvailableSlots(data.availableSlots || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [selectedDate, services])

  if (!isBookingEnabled) return <BookingDisabled />

  const totalDuration = services.reduce((sum, s) => sum + s.duration, 0)
  const totalPrice = services.reduce((sum, s) => sum + s.price, 0)

  // Build the confirmation URL based on selection mode
  const buildConfirmUrl = () => {
    const bundlePart = bundleId ? `bundleId=${bundleId}&` : ''
    const peoplePart = people ? `&people=${people}` : ''
    const quantitiesPart = quantitiesParam ? `&quantities=${quantitiesParam}` : ''
    const baseParams = `${bundlePart}services=${serviceIds.join(',')}&date=${selectedDate.toISOString()}${peoplePart}${quantitiesPart}`

    if (useTimeFrames) {
      return `/booking/confirm?${baseParams}&timeFrame=${selectedTimeFrame}`
    }

    const schedulePart = selectedSchedule ? `&schedule=${encodeURIComponent(JSON.stringify(selectedSchedule))}` : ''
    return `/booking/confirm?${baseParams}&time=${selectedTime}${schedulePart}`
  }

  // Determine if the proceed button should be enabled
  const canProceed = useTimeFrames
    ? selectedDate && selectedTimeFrame
    : selectedTime

  return (
    <main>
      <h1>Select Date {useTimeFrames ? '& Time Preference' : '& Time'}</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '1rem' }}>
        {bundle?.name || 'Package'}: {services.length} services • {totalDuration} min
      </p>

      {allowedDays && (
        <div style={{
          background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px',
          padding: '0.75rem 1rem', marginBottom: '1.5rem', fontSize: '0.9rem'
        }}>
          📅 Available <strong>{allowedDays.map(d => DAY_LABELS[d]).join(', ')}</strong> only.
        </div>
      )}

      <div style={{ marginTop: '1.5rem' }}>
        <h3>Select Your Date</h3>
        {!dataReady ? (
          <p>Loading calendar...</p>
        ) : (
          <div className="spa-datepicker">
            <DatePicker
              selected={selectedDate}
              onChange={(date) => {
                setSelectedDate(date)
              }}
              onMonthChange={useTimeFrames ? undefined : fetchAvailableDates}
              minDate={new Date()}
              filterDate={isDateAvailable}
              dayClassName={getDayClassName}
              inline
            />
          </div>
        )}
      </div>

      {/* Time Frame Selection (for useTimeFrames bundles) */}
      {useTimeFrames && dataReady && (
        <div style={{ marginTop: '2rem' }}>
          <h3>Select Your Preferred Time</h3>
          <p style={{ color: 'var(--color-text-light)', marginBottom: '1rem', fontSize: '0.9rem' }}>
            Choose a general time preference. The vendor will confirm the exact time with you.
          </p>
          <TimeFrameSelector
            selectedFrame={selectedTimeFrame}
            onSelect={(frame) => {
              setSelectedTimeFrame(frame)
            }}
            disabled={!selectedDate}
          />
        </div>
      )}

      {/* Time Slot Grid (for standard bundles without useTimeFrames) */}
      {!useTimeFrames && (
        <div style={{ marginTop: '2rem' }}>
          <h3>Available Times</h3>
          {loading && <p>Loading available times...</p>}
          
          {!loading && availableSlots.length === 0 && selectedDate && (
            <p style={{ color: 'var(--color-text-light)' }}>
              No available times for this date. Please select another date.
            </p>
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
                onClick={() => { setSelectedTime(slot.display); setSelectedSchedule(slot.schedule || null) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedTime(slot.display); setSelectedSchedule(slot.schedule || null) } }}
                style={{
                  padding: '1rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: selectedTime === slot.display ? 'var(--color-primary)' : 'var(--color-accent)',
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
      )}

      {/* Proceed button */}
      {canProceed && (
        <Link
          href={buildConfirmUrl()}
          className="cta"
        >
          Continue
        </Link>
      )}

      {/* Show disabled state for time-frame mode when date is selected but no time frame */}
      {useTimeFrames && selectedDate && !selectedTimeFrame && (
        <div style={{ marginTop: '2rem' }}>
          <button
            type="button"
            className="cta"
            disabled
            aria-disabled="true"
            style={{ opacity: 0.5, cursor: 'not-allowed', width: '100%' }}
          >
            Continue
          </button>
          <p style={{ color: '#dc3545', marginTop: '0.5rem', fontSize: '0.9rem', textAlign: 'center' }}>
            Please select a time frame to continue.
          </p>
        </div>
      )}
    </main>
  )
}

export default function BundleTimePage() {
  return (
    <Suspense fallback={<main><h1>Loading...</h1></main>}>
      <BundleTimeContent />
    </Suspense>
  )
}
