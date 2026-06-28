'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, useMemo, useCallback, Suspense } from 'react'
import PropTypes from 'prop-types'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import BookingDisabled, { isBookingEnabled } from '../../../components/BookingDisabled'
import { calculateServiceSchedule, calculateTotalBundleDuration } from '../../../utils/sequentialAvailability'

function BundleTimeContent() {
  const params = useSearchParams()
  const router = useRouter()
  const bundleId = params.get('bundleId')
  const initialServiceIds = useMemo(
    () => params.get('services')?.split(',').filter(Boolean) || [],
    [params]
  )

  const [services, setServices] = useState([])
  const [bufferMinutes, setBufferMinutes] = useState(15)
  const [loading, setLoading] = useState(true)

  const [selectedDate, setSelectedDate] = useState(new Date(Date.now() + 86400000))
  const [multiDay, setMultiDay] = useState(false)
  const [serviceOrder, setServiceOrder] = useState(initialServiceIds)
  const [userReordered, setUserReordered] = useState(false)

  const [slots, setSlots] = useState([])
  const [suggestedOrder, setSuggestedOrder] = useState(initialServiceIds)
  const [apiTotalDuration, setApiTotalDuration] = useState(0)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState(null)
  const [selectedStartTime, setSelectedStartTime] = useState(null)

  const servicesById = useMemo(
    () => Object.fromEntries(services.map(s => [s.serviceId, s])),
    [services]
  )

  // Load services once (no vendor fetch needed)
  useEffect(() => {
    if (initialServiceIds.length === 0) {
      setLoading(false)
      return
    }
    fetch('/api/services')
      .then(r => r.json())
      .then(svcData => {
        const selected = (svcData.services || []).filter(s => initialServiceIds.includes(s.serviceId))
        setServices(selected)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading services:', err)
        setLoading(false)
      })
  }, [initialServiceIds])

  const formatDateParam = (d) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  // Fetch sequential availability when date, order, or multiDay changes
  useEffect(() => {
    if (!isBookingEnabled || serviceOrder.length < 2 || !selectedDate) return

    setSlotsLoading(true)
    setSelectedStartTime(null)
    setSlotsError(null)

    const dateStr = formatDateParam(selectedDate)
    const orderParam = userReordered ? `&order=${serviceOrder.join(',')}` : ''
    const multiDayParam = multiDay ? '&multiDay=true' : ''
    const url = `/api/availability/sequential?serviceIds=${serviceOrder.join(',')}&date=${dateStr}${orderParam}${multiDayParam}`

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setSlotsError(data.error)
          setSlots([])
        } else {
          setSlots(data.slots || [])
          setApiTotalDuration(data.totalDuration || 0)
          if (!userReordered && data.suggestedOrder?.length > 0) {
            setSuggestedOrder(data.suggestedOrder)
            setServiceOrder(data.suggestedOrder)
          }
        }
        setSlotsLoading(false)
      })
      .catch(err => {
        console.error('Error loading sequential availability:', err)
        setSlotsError('Failed to load availability. Please try again.')
        setSlotsLoading(false)
      })
  }, [selectedDate, serviceOrder, multiDay, userReordered])

  // Ordered services list (respects serviceOrder)
  const orderedServices = useMemo(
    () => serviceOrder.map(id => servicesById[id]).filter(Boolean),
    [serviceOrder, servicesById]
  )

  // Compute total duration client-side (for display before slots load)
  const clientTotalDuration = useMemo(
    () => calculateTotalBundleDuration(orderedServices, bufferMinutes),
    [orderedServices, bufferMinutes]
  )

  const totalDuration = apiTotalDuration || clientTotalDuration

  // Live schedule preview for the currently-selected start time
  const schedulePreview = useMemo(() => {
    if (!selectedStartTime || orderedServices.length === 0) return []
    return calculateServiceSchedule(orderedServices, selectedStartTime, bufferMinutes)
  }, [selectedStartTime, orderedServices, bufferMinutes])

  const moveService = useCallback((index, direction) => {
    const target = index + direction
    if (target < 0 || target >= serviceOrder.length) return
    const next = [...serviceOrder]
    ;[next[index], next[target]] = [next[target], next[index]]
    setServiceOrder(next)
    setUserReordered(true)
  }, [serviceOrder])

  const resetToSuggestedOrder = () => {
    setServiceOrder(suggestedOrder)
    setUserReordered(false)
  }

  const proceed = () => {
    if (!selectedStartTime) return
    const queryParams = new URLSearchParams({
      services: serviceOrder.join(','),
      date: formatDateParam(selectedDate),
      time: selectedStartTime
    })
    if (bundleId) queryParams.set('bundleId', bundleId)
    if (multiDay) queryParams.set('multiDay', 'true')
    router.push(`/booking/bundle/confirm?${queryParams}`)
  }

  if (!isBookingEnabled) return <BookingDisabled />

  if (initialServiceIds.length === 0) {
    return (
      <main style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        <h1>No Services Selected</h1>
        <p style={{ color: 'var(--color-text-light)' }}>
          Please choose services first.
        </p>
        <button
          type="button"
          onClick={() => router.push('/booking/bundle')}
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

  return (
    <main style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <h1>Select Date & Time</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '1rem' }}>
        {orderedServices.length} services • {formatDuration(totalDuration)} total
        {bufferMinutes > 0 && orderedServices.length > 1 && (
          <> (includes {bufferMinutes} min buffer between services)</>
        )}
      </p>

      <OrderingPanel
        orderedServices={orderedServices}
        onMove={moveService}
        userReordered={userReordered}
        onReset={resetToSuggestedOrder}
      />

      <div style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Select Your Date</h3>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
            <input
              type="checkbox"
              checked={multiDay}
              onChange={(e) => setMultiDay(e.target.checked)}
            />
            <span>Split across consecutive days (spa weekend)</span>
          </label>
        </div>

        <div className="spa-datepicker">
          <DatePicker
            selected={selectedDate}
            onChange={setSelectedDate}
            minDate={new Date()}
            inline
          />
        </div>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h3>Available Start Times</h3>
        {slotsLoading && <p>Loading available times...</p>}
        {slotsError && (
          <p style={{ color: '#c0392b' }}>{slotsError}</p>
        )}
        {!slotsLoading && !slotsError && slots.length === 0 && (
          <div style={{
            background: 'var(--color-accent)',
            padding: '1.5rem',
            borderRadius: '12px',
            marginBottom: '1rem'
          }}>
            <p style={{ marginBottom: 0 }}>
              No available times for this date. Try another date{multiDay ? '' : ', toggle multi-day scheduling,'} or reorder the services.
            </p>
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: '0.75rem'
        }}>
          {!slotsLoading && slots.map(slot => (
            <button
              key={slot.startTime}
              type="button"
              onClick={() => setSelectedStartTime(slot.startTime)}
              style={{
                padding: '1rem',
                borderRadius: '8px',
                cursor: 'pointer',
                background: selectedStartTime === slot.startTime ? 'var(--color-primary)' : 'var(--color-accent)',
                color: selectedStartTime === slot.startTime ? 'white' : 'var(--color-text)',
                border: 'none',
                transition: '0.2s ease',
                textAlign: 'center',
                fontWeight: 500,
                font: 'inherit'
              }}
            >
              {formatTimeDisplay(slot.startTime)}
            </button>
          ))}
        </div>
      </div>

      {selectedStartTime && schedulePreview.length > 0 && (
        <SchedulePreview
          schedule={schedulePreview}
          servicesById={servicesById}
          multiDay={multiDay}
          apiSlot={slots.find(s => s.startTime === selectedStartTime)}
        />
      )}

      {selectedStartTime && (
        <button
          type="button"
          onClick={proceed}
          className="cta"
          style={{ marginTop: '2rem' }}
        >
          Continue to Confirmation
        </button>
      )}
    </main>
  )
}

// ───────────────────────────────────────────────────────────────────────────────

function OrderingPanel({ orderedServices, onMove, userReordered, onReset }) {
  return (
    <section style={{
      background: 'var(--color-accent)',
      borderRadius: '12px',
      padding: '1rem 1.25rem',
      marginTop: '1rem'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Service Order</h3>
        {userReordered && (
          <button
            type="button"
            onClick={onReset}
            style={{
              background: 'transparent',
              border: '1px solid var(--color-border, #ccc)',
              borderRadius: '6px',
              padding: '0.3rem 0.75rem',
              cursor: 'pointer',
              fontSize: '0.8rem',
              color: 'var(--color-text-light)'
            }}
          >
            Reset to suggested
          </button>
        )}
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', margin: '0 0 0.75rem 0' }}>
        {userReordered ? 'Custom order' : 'Suggested order (for best availability)'}. Use the arrows to reorder.
      </p>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {orderedServices.map((svc, idx) => (
          <li
            key={svc.serviceId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.5rem 0.75rem',
              background: 'white',
              borderRadius: '8px',
              marginBottom: '0.4rem'
            }}
          >
            <span style={{ fontWeight: 600, color: 'var(--color-primary)', minWidth: '1.5rem' }}>
              {idx + 1}.
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500 }}>{svc.name}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
                {svc.duration} min
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <button
                type="button"
                onClick={() => onMove(idx, -1)}
                disabled={idx === 0}
                aria-label={`Move ${svc.name} up`}
                style={arrowBtnStyle(idx === 0)}
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => onMove(idx, 1)}
                disabled={idx === orderedServices.length - 1}
                aria-label={`Move ${svc.name} down`}
                style={arrowBtnStyle(idx === orderedServices.length - 1)}
              >
                ▼
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

OrderingPanel.propTypes = {
  orderedServices: PropTypes.array.isRequired,
  onMove: PropTypes.func.isRequired,
  userReordered: PropTypes.bool.isRequired,
  onReset: PropTypes.func.isRequired
}

function arrowBtnStyle(disabled) {
  return {
    width: '1.75rem',
    height: '1.25rem',
    border: '1px solid var(--color-border, #ccc)',
    borderRadius: '4px',
    background: disabled ? '#f3f3f3' : 'white',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '0.7rem',
    opacity: disabled ? 0.4 : 1,
    padding: 0
  }
}

// ───────────────────────────────────────────────────────────────────────────────

function SchedulePreview({ schedule, servicesById, multiDay, apiSlot }) {
  const apiScheduleByServiceId = useMemo(() => {
    if (!apiSlot?.schedule) return {}
    return Object.fromEntries(apiSlot.schedule.map(s => [s.serviceId, s]))
  }, [apiSlot])

  const endTime = schedule[schedule.length - 1]?.endTime

  return (
    <section style={{
      marginTop: '2rem',
      padding: '1.25rem',
      background: 'var(--color-accent)',
      borderRadius: '12px'
    }}>
      <h3 style={{ marginTop: 0 }}>Your Schedule</h3>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {schedule.map((entry, idx) => {
          const svc = servicesById[entry.serviceId]
          const apiEntry = apiScheduleByServiceId[entry.serviceId]
          const day = multiDay && apiEntry?.day != null ? apiEntry.day : null
          return (
            <li
              key={entry.serviceId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '0.6rem 0',
                borderBottom: idx < schedule.length - 1 ? '1px solid rgba(0,0,0,0.08)' : 'none'
              }}
            >
              <div style={{ minWidth: '8rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                {formatTimeDisplay(entry.startTime)} – {formatTimeDisplay(entry.endTime)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{svc?.name || entry.serviceId}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
                  {svc?.duration} min
                  {day != null && <> • Day {day + 1}</>}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
      {endTime && (
        <p style={{ margin: '1rem 0 0 0', fontSize: '0.9rem', color: 'var(--color-text-light)' }}>
          Bundle ends at <strong>{formatTimeDisplay(endTime)}</strong>
        </p>
      )}
    </section>
  )
}

SchedulePreview.propTypes = {
  schedule: PropTypes.array.isRequired,
  servicesById: PropTypes.object.isRequired,
  multiDay: PropTypes.bool.isRequired,
  apiSlot: PropTypes.object
}

// ───────────────────────────────────────────────────────────────────────────────

function formatTimeDisplay(time24) {
  if (!time24) return ''
  const [hStr, mStr] = time24.split(':')
  const h = Number.parseInt(hStr, 10)
  const m = mStr
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m} ${period}`
}

function formatDuration(minutes) {
  if (!minutes) return '0 min'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// ───────────────────────────────────────────────────────────────────────────────

export default function BundleTimePage() {
  return (
    <Suspense fallback={<main style={{ padding: '2rem' }}><h1>Loading...</h1></main>}>
      <BundleTimeContent />
    </Suspense>
  )
}
