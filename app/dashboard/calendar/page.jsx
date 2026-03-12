'use client'

import { useState, useEffect } from 'react'
import { fetchAuthSession } from 'aws-amplify/auth'

export default function Calendar() {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [userVendorId, setUserVendorId] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [vendors, setVendors] = useState([])
  const [view, setView] = useState('week') // 'day' or 'week'
  const [currentDate, setCurrentDate] = useState(new Date())

  useEffect(() => {
    loadUserVendor()
  }, [])

  const loadUserVendor = async () => {
    try {
      const session = await fetchAuthSession()
      const vendorId = session.tokens?.idToken?.payload['custom:vendorId']
      const role = session.tokens?.idToken?.payload['custom:role'] || 'vendor'
      setUserVendorId(vendorId)
      setUserRole(role)
      
      // For vendor and owner roles, lock to their vendor
      if ((role === 'vendor' || role === 'owner') && vendorId) {
        setUserVendorId(vendorId)
      }
    } catch (error) {
      console.error('Error loading user vendor:', error)
      setLoading(false)
    }
  }

  useEffect(() => {
    if (userRole === 'admin') {
      fetch('/api/vendors')
        .then(res => res.json())
        .then(data => {
          setVendors(data.vendors || [])
          if (!userVendorId && data.vendors?.length > 0) {
            setUserVendorId(data.vendors[0].vendorId)
          }
        })
    }
  }, [userRole])

  useEffect(() => {
    if (userVendorId) {
      loadAppointments()
    }
  }, [userVendorId, currentDate])

  const loadAppointments = () => {
    if (!userVendorId) return

    setLoading(true)
    fetch(`/api/dashboard?vendorId=${userVendorId}`)
      .then(res => res.json())
      .then(data => {
        setAppointments(data.appointments || [])
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading appointments:', err)
        setLoading(false)
      })
  }

  const getWeekDates = () => {
    const start = new Date(currentDate)
    start.setDate(start.getDate() - start.getDay()) // Start on Sunday
    const dates = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(start)
      date.setDate(start.getDate() + i)
      dates.push(date)
    }
    return dates
  }

  const getAppointmentsForDate = (date) => {
    const dateStr = date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
    return appointments.filter(apt => {
      const aptDate = new Date(apt.dateTime).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
      return aptDate === dateStr && apt.status !== 'cancelled'
    }).sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
  }

  const navigateDate = (direction) => {
    const newDate = new Date(currentDate)
    if (view === 'day') {
      newDate.setDate(newDate.getDate() + direction)
    } else {
      newDate.setDate(newDate.getDate() + (direction * 7))
    }
    setCurrentDate(newDate)
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  const formatTime = (dateTime) => {
    const date = new Date(dateTime)
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  const isToday = (date) => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  if (!userVendorId) return <div>Loading...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Calendar</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {userRole === 'admin' && vendors.length > 0 && (
            <select
              value={userVendorId || ''}
              onChange={(e) => setUserVendorId(e.target.value)}
              style={{
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                fontSize: '1rem'
              }}
            >
              {vendors.map(vendor => (
                <option key={vendor.vendorId} value={vendor.vendorId}>
                  {vendor.name}
                </option>
              ))}
            </select>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--color-accent)', borderRadius: '8px', padding: '0.25rem' }}>
            <button
              onClick={() => setView('day')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                background: view === 'day' ? 'var(--color-primary)' : 'transparent',
                color: view === 'day' ? 'white' : 'var(--color-text)',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              Day
            </button>
            <button
              onClick={() => setView('week')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                background: view === 'week' ? 'var(--color-primary)' : 'transparent',
                color: view === 'week' ? 'white' : 'var(--color-text)',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              Week
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            onClick={() => navigateDate(-1)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              background: 'white',
              cursor: 'pointer'
            }}
          >
            ← Previous
          </button>
          <button
            onClick={goToToday}
            className="cta"
          >
            Today
          </button>
          <button
            onClick={() => navigateDate(1)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              background: 'white',
              cursor: 'pointer'
            }}
          >
            Next →
          </button>
        </div>
        <h2 style={{ margin: 0 }}>
          {view === 'day' 
            ? currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
            : `Week of ${getWeekDates()[0].toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
          }
        </h2>
      </div>

      {loading && <p>Loading appointments...</p>}

      {!loading && view === 'day' && (
        <div style={{ background: 'var(--color-accent)', borderRadius: '8px', padding: '1.5rem' }}>
          {getAppointmentsForDate(currentDate).length === 0 ? (
            <p style={{ color: 'var(--color-text-light)', textAlign: 'center', padding: '2rem' }}>
              No appointments scheduled for this day
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {getAppointmentsForDate(currentDate).map(apt => (
                <div
                  key={apt.appointmentId}
                  style={{
                    background: 'white',
                    padding: '1rem',
                    borderRadius: '8px',
                    borderLeft: `4px solid ${apt.status === 'confirmed' ? '#4CAF50' : '#FF9800'}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.25rem' }}>
                      {formatTime(apt.dateTime)}
                    </div>
                    <div style={{ color: 'var(--color-text)', marginBottom: '0.25rem' }}>
                      {apt.service?.name} ({apt.service?.duration} min)
                    </div>
                    <div style={{ color: 'var(--color-text-light)', fontSize: '0.9rem' }}>
                      {apt.customer?.name} • {apt.customer?.phone}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.25rem' }}>
                      ${apt.service?.price}
                    </div>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '12px',
                      fontSize: '0.85rem',
                      background: apt.status === 'confirmed' ? '#4CAF50' : '#FF9800',
                      color: 'white'
                    }}>
                      {apt.status === 'confirmed' ? 'Paid' : 'Unpaid'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && view === 'week' && (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem', minWidth: '900px' }}>
            {getWeekDates().map((date, index) => {
              const dayAppointments = getAppointmentsForDate(date)
              return (
                <div
                  key={index}
                  style={{
                    background: 'var(--color-accent)',
                    borderRadius: '8px',
                    padding: '1rem',
                    minHeight: '400px',
                    border: isToday(date) ? '2px solid var(--color-primary)' : 'none'
                  }}
                >
                  <div style={{ 
                    textAlign: 'center', 
                    marginBottom: '1rem', 
                    paddingBottom: '0.5rem', 
                    borderBottom: '2px solid var(--color-border)',
                    fontWeight: 'bold'
                  }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--color-text-light)' }}>
                      {date.toLocaleDateString('en-US', { weekday: 'short' })}
                    </div>
                    <div style={{ 
                      fontSize: '1.5rem', 
                      color: isToday(date) ? 'var(--color-primary)' : 'var(--color-text)'
                    }}>
                      {date.getDate()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {dayAppointments.length === 0 ? (
                      <p style={{ color: 'var(--color-text-light)', fontSize: '0.85rem', textAlign: 'center' }}>
                        No appointments
                      </p>
                    ) : (
                      dayAppointments.map(apt => (
                        <div
                          key={apt.appointmentId}
                          style={{
                            background: 'white',
                            padding: '0.75rem',
                            borderRadius: '6px',
                            borderLeft: `3px solid ${apt.status === 'confirmed' ? '#4CAF50' : '#FF9800'}`,
                            fontSize: '0.85rem'
                          }}
                        >
                          <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                            {formatTime(apt.dateTime)}
                          </div>
                          <div style={{ color: 'var(--color-text)', marginBottom: '0.25rem' }}>
                            {apt.service?.name}
                          </div>
                          <div style={{ color: 'var(--color-text-light)', fontSize: '0.8rem' }}>
                            {apt.customer?.name}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
