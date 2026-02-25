'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'

function TimePageContent() {
  const params = useSearchParams()
  const service = params.get('service')
  const vendor = params.get('vendor')

  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedTime, setSelectedTime] = useState(null)
  const [availableSlots, setAvailableSlots] = useState([])
  const [loading, setLoading] = useState(false)
  const [serviceInfo, setServiceInfo] = useState(null)

  useEffect(() => {
    if (!service) return
    
    fetch('/api/services')
      .then(res => res.json())
      .then(data => {
        const svc = data.services?.find(s => s.serviceId === service)
        setServiceInfo(svc)
      })
  }, [service])

  useEffect(() => {
    if (!vendor || !service || !selectedDate) return

    setLoading(true)
    setSelectedTime(null)

    const dateStr = selectedDate.toISOString().split('T')[0] // YYYY-MM-DD

    fetch(`/api/availability?vendorId=${vendor}&serviceId=${service}&date=${dateStr}`)
      .then(res => res.json())
      .then(data => {
        setAvailableSlots(data.availableSlots || [])
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading availability:', err)
        setLoading(false)
      })
  }, [vendor, service, selectedDate])

  return (
    <main>
      <h1>Select Date & Time</h1>
      {serviceInfo && (
        <p style={{ color: 'var(--color-text-light)', marginBottom: '0.5rem' }}>
          {serviceInfo.name} • {serviceInfo.duration} min • ${serviceInfo.price}
        </p>
      )}
      <p style={{ color: 'var(--color-text-light)' }}>
        Choose a date and time that works for you.
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
          gridTemplateColumns: window.innerWidth > 768 ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
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
        <Link
          href={`/booking/confirm?vendor=${vendor}&service=${service}&date=${selectedDate.toISOString()}&time=${selectedTime}`}
          className="cta"
        >
          Continue
        </Link>
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
