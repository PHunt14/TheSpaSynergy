'use client'

import { useState, useEffect } from 'react'
import { fetchAuthSession } from 'aws-amplify/auth'

export default function Appointments() {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [userVendorId, setUserVendorId] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [vendors, setVendors] = useState([])
  const [showReschedule, setShowReschedule] = useState(null)
  const [newDateTime, setNewDateTime] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)

  useEffect(() => {
    loadUserVendor()
  }, [])

  const loadUserVendor = async () => {
    try {
      const session = await fetchAuthSession()
      const vendorId = session.tokens?.idToken?.payload['custom:vendorId']
      const role = session.tokens?.idToken?.payload['custom:role'] || 'staff'
      setUserVendorId(vendorId)
      setUserRole(role)
    } catch (error) {
      console.error('Error loading user vendor:', error)
      setLoading(false)
    }
  }

  useEffect(() => {
    if (userRole === 'admin' || userRole === 'superadmin') {
      // Admin/superadmin can see all vendors
      fetch('/api/vendors')
        .then(res => res.json())
        .then(data => {
          setVendors(data.vendors || [])
          // Only set initial vendor if not already set
          if (!userVendorId && data.vendors?.length > 0) {
            setUserVendorId(data.vendors[0].vendorId)
          }
        })
    }
  }, [userRole])

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

  useEffect(() => {
    if (userVendorId) {
      loadAppointments()
    }
  }, [userVendorId])

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

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage
  const indexOfFirstItem = indexOfLastItem - itemsPerPage
  const currentAppointments = appointments.slice(indexOfFirstItem, indexOfLastItem)
  const totalPages = Math.ceil(appointments.length / itemsPerPage)

  return (
    <div>
      <h1>Appointments</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        View and manage your bookings.
      </p>

      {(userRole === 'admin' || userRole === 'superadmin') && vendors.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Select Vendor:
          </label>
          <select
            value={userVendorId || ''}
            onChange={(e) => setUserVendorId(e.target.value)}
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
      )}

      {!userVendorId && <p>Loading...</p>}

      {loading && userVendorId && <p>Loading appointments...</p>}

      {!loading && appointments.length === 0 && (
        <p style={{ color: 'var(--color-text-light)' }}>
          No appointments found.
        </p>
      )}

      {!loading && appointments.length > 0 && (
        <>
          <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <label style={{ marginRight: '0.5rem' }}>Show:</label>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value))
                  setCurrentPage(1)
                }}
                style={{
                  padding: '0.5rem',
                  borderRadius: '4px',
                  border: '1px solid var(--color-border)'
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span style={{ marginLeft: '1rem', color: 'var(--color-text-light)' }}>
                Showing {indexOfFirstItem + 1}-{Math.min(indexOfLastItem, appointments.length)} of {appointments.length}
              </span>
            </div>
          </div>

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
              {currentAppointments.map(apt => (
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

        {totalPages > 1 && (
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                border: '1px solid var(--color-border)',
                background: currentPage === 1 ? '#f5f5f5' : 'white',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
              }}
            >
              Previous
            </button>
            <span style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center' }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                border: '1px solid var(--color-border)',
                background: currentPage === totalPages ? '#f5f5f5' : 'white',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
              }}
            >
              Next
            </button>
          </div>
        )}
      </>
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
