'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'

function BundleTimeContent() {
  const params = useSearchParams()
  const serviceIds = params.get('services')?.split(',') || []

  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedTime, setSelectedTime] = useState(null)
  const [availableSlots, setAvailableSlots] = useState([])
  const [loading, setLoading] = useState(false)
  const [services, setServices] = useState([])

  useEffect(() => {
    if (serviceIds.length === 0) return
    
    fetch('/api/services')
      .then(res => res.json())
      .then(data => {
        const selected = data.services?.filter(s => serviceIds.includes(s.serviceId)) || []
        setServices(selected)
      })
  }, [])

  useEffect(() => {
    if (serviceIds.length === 0 || !selectedDate) return

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

  const totalDuration = services.reduce((sum, s) => sum + s.duration, 0)
  const totalPrice = services.reduce((sum, s) => sum + s.price, 0)

  return (
    <main>
      <h1>Select Date & Time</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '1rem' }}>
        Bundle: {services.length} services • {totalDuration} min • ${totalPrice.toFixed(2)}
      </p>

      <div style={{ marginTop: '1.5rem' }}>
        <h3>Select Your Date</h3>
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
        <h3>Available Times</h3>
        {loading && <p>Loading available times...</p>}
        
        {!loading && availableSlots.length === 0 && (
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
          href={`/booking/confirm?services=${serviceIds.join(',')}&date=${selectedDate.toISOString()}&time=${selectedTime}`}
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
