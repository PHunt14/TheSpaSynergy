'use client'

import { useState, useEffect, useMemo } from 'react'
import { fetchAuthSession } from 'aws-amplify/auth'
import {
  DEFAULT_START_HOUR,
  DEFAULT_END_HOUR,
  SLOT_MINUTES,
  getWeekStart,
  getWeekDates,
  getMonthDates,
  isSameDay,
  parseAppointmentDate,
  generateTimeSlots,
  getBlockPosition,
  getDateRangeForView,
} from '../../utils/calendar'

// ── Constants ─────────────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ── Utility Functions ─────────────────────────────────────────

function isToday(date) {
  return isSameDay(date, new Date())
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

// ── Appointment Block Component ───────────────────────────────

function AppointmentBlock({ appointment, startHour, onClick }) {
  const aptDate = parseAppointmentDate(appointment.rawDateTime)
  if (!aptDate) return null

  const duration = appointment.service?.duration || 30
  const { top, height } = getBlockPosition(aptDate, duration, startHour)

  const statusColor = appointment.status === 'cancelled' ? '#dc3545'
    : appointment.paymentStatus === 'paid' || appointment.status === 'confirmed' ? '#4CAF50'
    : '#FF9800'

  return (
    <div
      onClick={() => onClick(appointment)}
      title={`${appointment.customer?.name || 'Walk-in'} — ${appointment.service?.name || 'Service'} (${duration} min)`}
      style={{
        position: 'absolute',
        top: `${top}px`,
        left: '4px',
        right: '4px',
        height: `${height}px`,
        background: statusColor + '22',
        borderLeft: `3px solid ${statusColor}`,
        borderRadius: '4px',
        padding: '2px 6px',
        fontSize: '0.75rem',
        overflow: 'hidden',
        cursor: 'pointer',
        zIndex: 2,
        lineHeight: '1.2',
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'}
      onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
    >
      <div style={{ fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {appointment.customer?.name || 'Walk-in'}
      </div>
      {height > 24 && (
        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--color-text-light)', fontSize: '0.7rem' }}>
          {appointment.service?.name}
        </div>
      )}
    </div>
  )
}

// ── Appointment Detail Modal ──────────────────────────────────

function AppointmentDetail({ appointment, onClose }) {
  if (!appointment) return null
  const aptDate = parseAppointmentDate(appointment.rawDateTime)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: '12px', padding: '2rem',
          maxWidth: '400px', width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Appointment Details</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--color-text-light)' }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <p style={{ margin: 0 }}><strong>Customer:</strong> {appointment.customer?.name || 'Walk-in'}</p>
          <p style={{ margin: 0 }}><strong>Service:</strong> {appointment.service?.name} ({appointment.service?.duration} min)</p>
          <p style={{ margin: 0 }}><strong>Price:</strong> ${appointment.service?.price?.toFixed(2)}</p>
          {appointment.staffName && <p style={{ margin: 0 }}><strong>With:</strong> {appointment.staffName}</p>}
          {aptDate && <p style={{ margin: 0 }}><strong>Time:</strong> {formatTime(aptDate)}</p>}
          {aptDate && <p style={{ margin: 0 }}><strong>Date:</strong> {aptDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>}
          <p style={{ margin: 0 }}><strong>Status:</strong> <span style={{
            padding: '0.15rem 0.5rem', borderRadius: '8px', fontSize: '0.85rem',
            background: appointment.status === 'confirmed' ? '#d4edda' : appointment.status === 'cancelled' ? '#f8d7da' : '#fff3cd',
            color: appointment.status === 'confirmed' ? '#155724' : appointment.status === 'cancelled' ? '#721c24' : '#856404',
          }}>{appointment.status}</span></p>
          {appointment.paymentStatus && <p style={{ margin: 0 }}><strong>Payment:</strong> {appointment.paymentStatus}</p>}
          {appointment.customer?.phone && <p style={{ margin: 0 }}><strong>Phone:</strong> {appointment.customer.phone}</p>}
        </div>
      </div>
    </div>
  )
}

// ── Time Block Day Column ─────────────────────────────────────

function TimeBlockColumn({ date, appointments, startHour, endHour, onAppointmentClick }) {
  const slots = generateTimeSlots(startHour, endHour)
  const dayAppointments = appointments.filter(apt => {
    const d = parseAppointmentDate(apt.rawDateTime)
    return d && isSameDay(d, date) && apt.status !== 'cancelled'
  })

  return (
    <div style={{ position: 'relative', minHeight: `${slots.length * 40}px` }}>
      {/* Grid lines */}
      {slots.map((slot, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: `${i * 40}px`,
            left: 0,
            right: 0,
            height: '40px',
            borderBottom: '1px solid var(--color-border)',
            background: slot.minute === 0 ? 'transparent' : 'rgba(0,0,0,0.01)',
          }}
        />
      ))}
      {/* Appointment blocks */}
      {dayAppointments.map(apt => (
        <AppointmentBlock
          key={apt.appointmentId}
          appointment={apt}
          startHour={startHour}
          onClick={onAppointmentClick}
        />
      ))}
    </div>
  )
}

// ── Month View ────────────────────────────────────────────────

function MonthView({ currentDate, appointments, onAppointmentClick }) {
  const dates = getMonthDates(currentDate)
  const firstDayOffset = dates[0].getDay()

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', background: 'var(--color-border)' }}>
        {DAY_LABELS.map(d => (
          <div key={d} style={{ background: 'var(--color-accent)', padding: '0.5rem', textAlign: 'center', fontWeight: '600', fontSize: '0.85rem' }}>
            {d}
          </div>
        ))}
        {/* Empty cells for offset */}
        {Array.from({ length: firstDayOffset }, (_, i) => (
          <div key={`empty-${i}`} style={{ background: 'white', padding: '0.5rem', minHeight: '100px' }} />
        ))}
        {dates.map(date => {
          const dayApts = appointments.filter(apt => {
            const d = parseAppointmentDate(apt.rawDateTime)
            return d && isSameDay(d, date) && apt.status !== 'cancelled'
          }).sort((a, b) => new Date(a.rawDateTime) - new Date(b.rawDateTime))

          return (
            <div
              key={date.toISOString()}
              style={{
                background: isToday(date) ? '#e8f4fd' : 'white',
                padding: '0.5rem',
                minHeight: '100px',
                overflow: 'hidden',
              }}
            >
              <div style={{
                fontWeight: isToday(date) ? '700' : '500',
                fontSize: '0.85rem',
                marginBottom: '0.25rem',
                color: isToday(date) ? 'var(--color-primary)' : 'var(--color-text)',
              }}>
                {date.getDate()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {dayApts.slice(0, 3).map(apt => (
                  <div
                    key={apt.appointmentId}
                    onClick={() => onAppointmentClick(apt)}
                    style={{
                      fontSize: '0.7rem',
                      padding: '2px 4px',
                      borderRadius: '3px',
                      background: (apt.paymentStatus === 'paid' || apt.status === 'confirmed') ? '#4CAF5022' : '#FF980022',
                      borderLeft: `2px solid ${(apt.paymentStatus === 'paid' || apt.status === 'confirmed') ? '#4CAF50' : '#FF9800'}`,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {apt.customer?.name || 'Walk-in'}
                  </div>
                ))}
                {dayApts.length > 3 && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-light)' }}>
                    +{dayApts.length - 3} more
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Calendar Component ───────────────────────────────────

export default function Calendar() {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [userVendorId, setUserVendorId] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [vendors, setVendors] = useState([])
  const [view, setView] = useState('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedAppointment, setSelectedAppointment] = useState(null)
  const [startHour, setStartHour] = useState(DEFAULT_START_HOUR)
  const [endHour, setEndHour] = useState(DEFAULT_END_HOUR)

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
  }, [userVendorId, currentDate, view])

  const loadAppointments = () => {
    if (!userVendorId) return
    setLoading(true)

    const { start, end } = getDateRangeForView(view, currentDate)
    const params = new URLSearchParams({
      vendorId: userVendorId,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    })

    fetch(`/api/dashboard?${params}`)
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

  // Navigation
  const navigateDate = (direction) => {
    const newDate = new Date(currentDate)
    if (view === 'day') newDate.setDate(newDate.getDate() + direction)
    else if (view === 'week') newDate.setDate(newDate.getDate() + (direction * 7))
    else newDate.setMonth(newDate.getMonth() + direction)
    setCurrentDate(newDate)
  }

  const goToToday = () => setCurrentDate(new Date())

  // Header label
  const headerLabel = useMemo(() => {
    if (view === 'day') {
      return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    }
    if (view === 'week') {
      const dates = getWeekDates(currentDate)
      const start = dates[0]
      const end = dates[6]
      if (start.getMonth() === end.getMonth()) {
        return `${start.toLocaleDateString('en-US', { month: 'long' })} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`
      }
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    }
    return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }, [view, currentDate])

  // Time slots for the grid
  const timeSlots = useMemo(() => generateTimeSlots(startHour, endHour), [startHour, endHour])

  if (!userVendorId) return <div style={{ padding: '2rem' }}>Loading...</div>

  return (
    <div>
      {/* Top bar: title + vendor selector + view toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ margin: 0 }}>Calendar</h1>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {userRole === 'admin' && vendors.length > 0 && (
            <select
              value={userVendorId || ''}
              onChange={(e) => setUserVendorId(e.target.value)}
              style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
            >
              {vendors.map(vendor => (
                <option key={vendor.vendorId} value={vendor.vendorId}>{vendor.name}</option>
              ))}
            </select>
          )}
          <div style={{ display: 'flex', background: 'var(--color-accent)', borderRadius: '8px', padding: '3px' }}>
            {['day', 'week', 'month'].map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: '0.4rem 0.9rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: view === v ? 'var(--color-primary)' : 'transparent',
                  color: view === v ? 'white' : 'var(--color-text)',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '0.9rem',
                  textTransform: 'capitalize',
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Navigation bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button onClick={() => navigateDate(-1)} style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer', fontSize: '0.9rem' }}>←</button>
          <button onClick={goToToday} className="cta" style={{ padding: '0.4rem 1rem', fontSize: '0.9rem' }}>Today</button>
          <button onClick={() => navigateDate(1)} style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer', fontSize: '0.9rem' }}>→</button>
        </div>
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{headerLabel}</h2>
        {/* Hour range adjuster (day/week only) */}
        {view !== 'month' && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem' }}>
            <select value={startHour} onChange={(e) => setStartHour(Number(e.target.value))} style={{ padding: '0.3rem', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '0.8rem' }}>
              {Array.from({ length: 12 }, (_, i) => i).map(h => (
                <option key={h} value={h}>{h === 0 ? '12 AM' : h < 12 ? `${h} AM` : `${h - 12} PM`}</option>
              ))}
            </select>
            <span>–</span>
            <select value={endHour} onChange={(e) => setEndHour(Number(e.target.value))} style={{ padding: '0.3rem', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '0.8rem' }}>
              {Array.from({ length: 12 }, (_, i) => i + 12).map(h => (
                <option key={h} value={h}>{h === 12 ? '12 PM' : h < 24 ? `${h - 12} PM` : '12 AM'}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading && <p style={{ textAlign: 'center', color: 'var(--color-text-light)' }}>Loading appointments...</p>}

      {/* Day View — Time Block */}
      {!loading && view === 'day' && (
        <div style={{ display: 'flex', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
          {/* Time labels */}
          <div style={{ width: '60px', flexShrink: 0, background: 'var(--color-accent)' }}>
            {timeSlots.map((slot, i) => (
              <div key={i} style={{ height: '40px', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingRight: '8px', paddingTop: '2px', fontSize: '0.7rem', color: 'var(--color-text-light)', borderBottom: '1px solid var(--color-border)' }}>
                {slot.minute === 0 ? `${slot.hour === 0 ? 12 : slot.hour > 12 ? slot.hour - 12 : slot.hour}${slot.hour < 12 ? 'a' : 'p'}` : ''}
              </div>
            ))}
          </div>
          {/* Day column */}
          <div style={{ flex: 1, position: 'relative' }}>
            <TimeBlockColumn
              date={currentDate}
              appointments={appointments}
              startHour={startHour}
              endHour={endHour}
              onAppointmentClick={setSelectedAppointment}
            />
          </div>
        </div>
      )}

      {/* Week View — Time Block */}
      {!loading && view === 'week' && (
        <div style={{ display: 'flex', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'auto' }}>
          {/* Time labels */}
          <div style={{ width: '50px', flexShrink: 0, background: 'var(--color-accent)' }}>
            {/* Header spacer */}
            <div style={{ height: '36px', borderBottom: '2px solid var(--color-border)' }} />
            {timeSlots.map((slot, i) => (
              <div key={i} style={{ height: '40px', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingRight: '6px', paddingTop: '2px', fontSize: '0.65rem', color: 'var(--color-text-light)', borderBottom: '1px solid var(--color-border)' }}>
                {slot.minute === 0 ? `${slot.hour === 0 ? 12 : slot.hour > 12 ? slot.hour - 12 : slot.hour}${slot.hour < 12 ? 'a' : 'p'}` : ''}
              </div>
            ))}
          </div>
          {/* Day columns */}
          {getWeekDates(currentDate).map((date, idx) => (
            <div key={idx} style={{ flex: 1, minWidth: '100px', borderLeft: '1px solid var(--color-border)' }}>
              {/* Day header */}
              <div style={{
                height: '36px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderBottom: '2px solid var(--color-border)',
                background: isToday(date) ? 'var(--color-primary)' : 'var(--color-accent)',
                color: isToday(date) ? 'white' : 'var(--color-text)',
              }}>
                <div style={{ fontSize: '0.7rem', fontWeight: '500' }}>{DAY_LABELS[date.getDay()]}</div>
                <div style={{ fontSize: '0.85rem', fontWeight: '700' }}>{date.getDate()}</div>
              </div>
              {/* Time block column */}
              <TimeBlockColumn
                date={date}
                appointments={appointments}
                startHour={startHour}
                endHour={endHour}
                onAppointmentClick={setSelectedAppointment}
              />
            </div>
          ))}
        </div>
      )}

      {/* Month View — Card List */}
      {!loading && view === 'month' && (
        <MonthView
          currentDate={currentDate}
          appointments={appointments}
          onAppointmentClick={setSelectedAppointment}
        />
      )}

      {/* Appointment Detail Modal */}
      {selectedAppointment && (
        <AppointmentDetail
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
        />
      )}
    </div>
  )
}
