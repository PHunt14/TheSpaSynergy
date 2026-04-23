'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import BookingDisabled, { isBookingEnabled } from '../../components/BookingDisabled'

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const DAY_LABELS = { sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday' }

function BundleTimeContent() {
  const params = useSearchParams()
  const bundleId = params.get('bundleId')
  const serviceIds = params.get('services')?.split(',') || []
  const people = params.get('people')

  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedTime, setSelectedTime] = useState(null)
  const [availableSlots, setAvailableSlots] = useState([])
  const [loading, setLoading] = useState(false)
  const [services, setServices] = useState([])
  const [vendorInfo, setVendorInfo] = useState(null)
  const [bundle, setBundle] = useState(null)

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
      fetch('/api/vendors').then(res => res.json()),
      fetch('/api/bundles').then(res => res.json())
    ]).then(([serviceData, vendorData, bundleData]) => {
      const selected = serviceData.services?.filter(s => serviceIds.includes(s.serviceId)) || []
      setServices(selected)
      if (selected.length > 0) {
        const vnd = vendorData.vendors?.find(v => v.vendorId === selected[0].vendorId)
        setVendorInfo(vnd)
      }
      if (bundleId) {
        setBundle(bundleData.bundles?.find(b => b.bundleId === bundleId))
      }
    })
  }, [])

  useEffect(() => {
    if (!isBookingEnabled || serviceIds.length === 0 || !selectedDate) return

    setLoading(true)
    setSelectedTime(null)

    const dateStr = selectedDate.toISOString().split('T')[0]
    const vendorId = services[0]?.vendorId

    if (!vendorId) return

    fetch(`/api/availability?vendorId=${vendorId}&serviceId=${serviceIds[0]}&date=${dateStr}`)
      .then(res => res.json())
      .then(data => {
        setAvailableSlots(data.availableSlots || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [selectedDate, services])

  if (!isBookingEnabled) return <BookingDisabled phone={vendorInfo?.phone} vendorName={vendorInfo?.name} />

  const totalDuration = services.reduce((sum, s) => sum + s.duration, 0)
  const totalPrice = services.reduce((sum, s) => sum + s.price, 0)

  return (
    <main>
      <h1>Select Date & Time</h1>
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
        <div className="spa-datepicker">
          <DatePicker
            selected={selectedDate}
            onChange={setSelectedDate}
            minDate={new Date()}
            filterDate={isAllowedDay}
            inline
          />
        </div>
      </div>

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
              onClick={() => setSelectedTime(slot.display)}
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

      {selectedTime && (
        <Link
          href={`/booking/confirm?${bundleId ? `bundleId=${bundleId}&` : ''}services=${serviceIds.join(',')}&date=${selectedDate.toISOString()}&time=${selectedTime}${people ? `&people=${people}` : ''}`}
          className="cta"
        >
          Continue
        </Link>
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
