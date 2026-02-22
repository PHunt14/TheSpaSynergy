'use client'

import { useState, useEffect } from 'react'

export default function Appointments() {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedVendor, setSelectedVendor] = useState('vendor-winsome')
  const [vendors, setVendors] = useState([])
  const [showReschedule, setShowReschedule] = useState(null)
  const [newDateTime, setNewDateTime] = useState('')

  useEffect(() => {
    fetch('/api/vendors')
      .then(res => res.json())
      .then(data => {
        setVendors(data.vendors || [])
      })
  }, [])

  const loadAppointments = () => {
    if (!selectedVendor) return

    setLoading(true)
    fetch(`/api/dashboard?vendorId=${selectedVendor}`)
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

  useEffect(() => {
    loadAppointments()
  }, [selectedVendor])

  const handleCancel = async (appointmentId) => {
    if (!confirm('Are you sure you want to cancel this appointment?')) return

    try {
      const response = await fetch('/api/appointments/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId })
      })

      if (response.ok) {
        alert('Appointment cancelled successfully!')
        loadAppointments()
      } else {
        alert('Failed to cancel appointment')
      }
    } catch (error) {
      console.error('Error cancelling appointment:', error)
      alert('Error cancelling appointment')
    }
  }

  const handleReschedule = async (appointmentId) => {
    if (!newDateTime) {
      alert('Please enter a new date and time')
      return
    }

    try {
      const response = await fetch('/api/appointments/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, newDateTime })
      })

      if (response.ok) {
        alert('Appointment rescheduled successfully!')
        setShowReschedule(null)
        setNewDateTime('')
        loadAppointments()
      } else {
        alert('Failed to reschedule appointment')
      }
    } catch (error) {
      console.error('Error rescheduling appointment:', error)
      alert('Error rescheduling appointment')
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed': return '#4CAF50'
      case 'pending': return '#FF9800'
      case 'cancelled': return '#F44336'
      default: return '#999'
    }
  }

  return (
    <div>
      <h1>Appointments</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        View and manage your bookings.
      </p>

      <div style={{ marginBottom: '2rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
          Select Vendor:
        </label>
        <select
          value={selectedVendor}
          onChange={(e) => setSelectedVendor(e.target.value)}
          style={{
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid var(--color-border)',
            fontSize: '1rem',
            minWidth: '250px'
          }}
        >
          {vendors.map(vendor => (
            <option key={vendor.vendorId} value={vendor.vendorId}>
              {vendor.name}
            </option>
          ))}
        </select>
      </div>

      {loading && <p>Loading appointments...</p>}

      {!loading && appointments.length === 0 && (
        <p style={{ color: 'var(--color-text-light)' }}>
          No appointments found.
        </p>
      )}

      {!loading && appointments.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            background: 'var(--color-accent)',
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            <thead>
              <tr style={{ background: 'var(--color-primary)', color: 'white' }}>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Date & Time</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Service</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Customer</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Contact</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Price</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Status</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map(apt => (
                <tr key={apt.appointmentId} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '1rem' }}>{apt.dateTime}</td>
                  <td style={{ padding: '1rem' }}>
                    {apt.service?.name || 'N/A'}
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
                      {apt.service?.duration} min
                    </div>
                  </td>
                  <td style={{ padding: '1rem' }}>{apt.customer?.name || 'N/A'}</td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.9rem' }}>{apt.customer?.email}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
                      {apt.customer?.phone}
                    </div>
                  </td>
                  <td style={{ padding: '1rem' }}>${apt.service?.price || 0}</td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '12px',
                      fontSize: '0.85rem',
                      background: getStatusColor(apt.status),
                      color: 'white'
                    }}>
                      {apt.status === 'confirmed' ? 'Paid' : apt.status === 'pending' ? 'Unpaid' : 'Cancelled'}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {apt.status !== 'cancelled' && (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => setShowReschedule(apt.appointmentId)}
                          style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '4px',
                            border: 'none',
                            background: '#2196F3',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '0.85rem'
                          }}
                        >
                          Reschedule
                        </button>
                        <button
                          onClick={() => handleCancel(apt.appointmentId)}
                          style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '4px',
                            border: 'none',
                            background: '#F44336',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '0.85rem'
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showReschedule && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '8px',
            maxWidth: '400px',
            width: '90%'
          }}>
            <h3>Reschedule Appointment</h3>
            <p style={{ marginBottom: '1rem', color: 'var(--color-text-light)' }}>
              Enter new date and time (e.g., "12/25/2024 2:00 PM")
            </p>
            <input
              type="text"
              value={newDateTime}
              onChange={(e) => setNewDateTime(e.target.value)}
              placeholder="MM/DD/YYYY HH:MM AM/PM"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                fontSize: '1rem',
                marginBottom: '1rem'
              }}
            />
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={() => handleReschedule(showReschedule)}
                className="cta"
                style={{ flex: 1 }}
              >
                Confirm
              </button>
              <button
                onClick={() => {
                  setShowReschedule(null)
                  setNewDateTime('')
                }}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: 'white',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
