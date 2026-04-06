'use client'

import { useState, useEffect } from 'react'
import { fetchAuthSession } from 'aws-amplify/auth'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'

export default function Appointments() {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [userVendorId, setUserVendorId] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [vendors, setVendors] = useState([])
  const [showReschedule, setShowReschedule] = useState(null)
  const [rescheduleDate, setRescheduleDate] = useState(new Date())
  const [rescheduleTime, setRescheduleTime] = useState(null)
  const [rescheduleSlots, setRescheduleSlots] = useState([])
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)

  // Manual appointment
  const [showManualForm, setShowManualForm] = useState(false)
  const [manualForm, setManualForm] = useState({ customerName: '', customerPhone: '', customerEmail: '', notes: '', dateTime: '' })
  const [manualLoading, setManualLoading] = useState(false)
  const [services, setServices] = useState([])
  const [staffList, setStaffList] = useState([])
  const [manualServiceId, setManualServiceId] = useState('')
  const [manualStaffId, setManualStaffId] = useState('')

  useEffect(() => {
    loadUserVendor()
  }, [])

  // Load available time slots when reschedule date changes
  useEffect(() => {
    if (!showReschedule) return
    const apt = appointments.find(a => a.appointmentId === showReschedule)
    if (!apt) return

    setRescheduleTime(null)
    setRescheduleSlotsLoading(true)
    const dateStr = rescheduleDate.toISOString().split('T')[0]

    fetch(`/api/availability?vendorId=${apt.vendorId}&serviceId=${apt.serviceId}&date=${dateStr}`)
      .then(res => res.json())
      .then(data => {
        setRescheduleSlots(data.availableSlots || [])
        setRescheduleSlotsLoading(false)
      })
      .catch(() => {
        setRescheduleSlots([])
        setRescheduleSlotsLoading(false)
      })
  }, [showReschedule, rescheduleDate])

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
      // Admin can see all vendors
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
      // Load services and staff for manual appointment form
      fetch(`/api/services?vendorId=${userVendorId}`).then(r => r.json()).then(d => setServices((d.services || []).filter(s => s.vendorId === userVendorId && s.isActive !== false)))
      fetch(`/api/staff-schedules?vendorId=${userVendorId}`).then(r => r.json()).then(d => setStaffList((d.schedules || []).filter(s => s.isActive !== false)))
    }
  }, [userVendorId])

  const handleConfirm = async (appointmentId, bundleId) => {
    if (bundleId) {
      if (!confirm('Confirm your portion of this bundle?')) return
      try {
        const response = await fetch('/api/bundles/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bundleId, vendorId: userVendorId, action: 'confirm' })
        })
        const data = await response.json()
        if (response.ok) {
          alert(data.bundleStatus === 'confirmed'
            ? 'Bundle fully confirmed! Customer has been notified.'
            : 'Your portion confirmed. Waiting on other vendor(s).')
          loadAppointments()
        } else {
          alert('Failed to confirm: ' + (data.error || ''))
        }
      } catch (error) {
        alert('Error confirming bundle')
      }
      return
    }

    if (!confirm('Confirm this appointment?')) return

    try {
      const response = await fetch('/api/appointments/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId })
      })

      if (response.ok) {
        alert('Appointment confirmed! Customer has been notified.')
        loadAppointments()
      } else {
        alert('Failed to confirm appointment')
      }
    } catch (error) {
      console.error('Error confirming appointment:', error)
      alert('Error confirming appointment')
    }
  }

  const handleCancel = async (appointmentId, bundleId) => {
    const msg = bundleId
      ? 'Cancel this bundle? This will cancel ALL services in the bundle for the customer.'
      : 'Are you sure you want to cancel this appointment?'
    if (!confirm(msg)) return

    if (bundleId) {
      try {
        const response = await fetch('/api/bundles/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bundleId, vendorId: userVendorId, action: 'cancel' })
        })
        if (response.ok) {
          alert('Bundle cancelled. Customer has been notified.')
          loadAppointments()
        } else {
          alert('Failed to cancel bundle')
        }
      } catch (error) {
        alert('Error cancelling bundle')
      }
      return
    }

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
    if (!rescheduleTime) {
      alert('Please select a time')
      return
    }

    const dateStr = rescheduleDate.toISOString().split('T')[0]
    const [hours, minutes] = rescheduleTime.split(':')
    const newDateTime = `${dateStr}T${hours}:${minutes}:00`

    try {
      const response = await fetch('/api/appointments/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, newDateTime })
      })

      if (response.ok) {
        alert('Appointment rescheduled successfully!')
        setShowReschedule(null)
        setRescheduleTime(null)
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
      case 'pending-confirmation': return '#FF9800'
      case 'cancelled': return '#F44336'
      default: return '#999'
    }
  }

  const getStatusLabel = (status) => {
    switch (status) {
      case 'confirmed': return 'Confirmed'
      case 'pending': return 'Pending'
      case 'pending-confirmation': return 'Awaiting Confirmation'
      case 'cancelled': return 'Cancelled'
      default: return status
    }
  }

  const handleAddManual = async () => {
    if (!manualForm.dateTime) { alert('Please select a date and time'); return }
    setManualLoading(true)
    try {
      const res = await fetch('/api/appointments/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: userVendorId,
          serviceId: manualServiceId || undefined,
          staffId: manualStaffId || undefined,
          dateTime: manualForm.dateTime,
          customerName: manualForm.customerName,
          customerPhone: manualForm.customerPhone,
          customerEmail: manualForm.customerEmail,
          notes: manualForm.notes,
        })
      })
      if (res.ok) {
        alert('Appointment added!')
        setShowManualForm(false)
        setManualForm({ customerName: '', customerPhone: '', customerEmail: '', notes: '', dateTime: '' })
        setManualServiceId('')
        setManualStaffId('')
        loadAppointments()
      } else {
        const data = await res.json()
        alert('Failed: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      alert('Error adding appointment')
    } finally { setManualLoading(false) }
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

      <button onClick={() => setShowManualForm(true)} className="cta" style={{ marginBottom: '2rem' }}>
        + Add Appointment
      </button>

      {userRole === 'admin' && vendors.length > 0 && (
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
                      {getStatusLabel(apt.status)}
                    </span>
                    {apt.bundleId && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-primary)', marginTop: '0.25rem' }}>
                        📦 Bundle
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {apt.status !== 'cancelled' && (
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {(apt.status === 'pending' || apt.status === 'pending-confirmation') && (
                          <button
                            onClick={() => handleConfirm(apt.appointmentId, apt.bundleId)}
                            style={{
                              padding: '0.5rem 1rem',
                              borderRadius: '4px',
                              border: 'none',
                              background: '#4CAF50',
                              color: 'white',
                              cursor: 'pointer',
                              fontSize: '0.85rem'
                            }}
                          >
                            Confirm
                          </button>
                        )}
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
                          onClick={() => handleCancel(apt.appointmentId, apt.bundleId)}
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
            maxWidth: '480px',
            width: '90%',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h3>Reschedule Appointment</h3>
            <p style={{ marginBottom: '1rem', color: 'var(--color-text-light)' }}>
              Select a new date and available time.
            </p>

            <div className="spa-datepicker" style={{ marginBottom: '1.5rem' }}>
              <DatePicker
                selected={rescheduleDate}
                onChange={(date) => setRescheduleDate(date)}
                minDate={new Date()}
                inline
              />
            </div>

            <h4 style={{ marginBottom: '0.75rem' }}>Available Times</h4>
            {rescheduleSlotsLoading && <p>Loading times...</p>}
            {!rescheduleSlotsLoading && rescheduleSlots.length === 0 && (
              <p style={{ color: 'var(--color-text-light)' }}>No available times for this date.</p>
            )}
            {!rescheduleSlotsLoading && rescheduleSlots.length > 0 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.5rem',
                marginBottom: '1.5rem'
              }}>
                {rescheduleSlots.map(slot => (
                  <div
                    key={slot.time}
                    onClick={() => setRescheduleTime(slot.time)}
                    style={{
                      padding: '0.75rem',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: rescheduleTime === slot.time ? 'var(--color-primary)' : 'var(--color-accent)',
                      color: rescheduleTime === slot.time ? 'white' : 'var(--color-text)',
                      textAlign: 'center',
                      fontWeight: '500',
                      transition: '0.2s ease'
                    }}
                  >
                    {slot.display}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={() => handleReschedule(showReschedule)}
                disabled={!rescheduleTime}
                className="cta"
                style={{ flex: 1, opacity: rescheduleTime ? 1 : 0.5 }}
              >
                Confirm
              </button>
              <button
                onClick={() => {
                  setShowReschedule(null)
                  setRescheduleTime(null)
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

      {/* Manual Appointment Modal */}
      {showManualForm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: 'white', padding: '2rem', borderRadius: '8px',
            maxWidth: '480px', width: '90%', maxHeight: '90vh', overflowY: 'auto'
          }}>
            <h3>Add Manual Appointment</h3>
            <p style={{ marginBottom: '1rem', color: 'var(--color-text-light)' }}>
              Block time on the calendar or record an external booking.
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Date & Time *</label>
              <input type="datetime-local" value={manualForm.dateTime}
                onChange={(e) => setManualForm({ ...manualForm, dateTime: e.target.value })}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Service</label>
              <select value={manualServiceId} onChange={(e) => setManualServiceId(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }}>
                <option value="">None (time block)</option>
                {services.map(s => <option key={s.serviceId} value={s.serviceId}>{s.name} ({s.duration} min - ${s.price})</option>)}
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Staff Member</label>
              <select value={manualStaffId} onChange={(e) => setManualStaffId(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }}>
                <option value="">None</option>
                {staffList.map(s => <option key={s.visibleId} value={s.visibleId}>{s.staffName}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Customer Name</label>
              <input type="text" value={manualForm.customerName}
                onChange={(e) => setManualForm({ ...manualForm, customerName: e.target.value })}
                placeholder="e.g. Vagaro booking, Walk-in"
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Phone</label>
              <input type="tel" value={manualForm.customerPhone}
                onChange={(e) => setManualForm({ ...manualForm, customerPhone: e.target.value })}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Notes</label>
              <textarea value={manualForm.notes}
                onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })}
                placeholder="e.g. Booked via Vagaro, walk-in client"
                rows="2"
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem', resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={handleAddManual} disabled={manualLoading} className="cta" style={{ flex: 1 }}>
                {manualLoading ? 'Adding...' : 'Add Appointment'}
              </button>
              <button onClick={() => setShowManualForm(false)}
                style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
