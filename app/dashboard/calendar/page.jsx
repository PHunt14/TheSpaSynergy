'use client'

import { useState, useEffect, useMemo } from 'react'
import { fetchAuthSession } from 'aws-amplify/auth'
import {
  DEFAULT_START_HOUR,
  DEFAULT_END_HOUR,
  getWeekDates,
  getMonthDates,
  isSameDay,
  parseAppointmentDate,
  generateTimeSlots,
  getBlockPosition,
  getDateRangeForView,
  computeOverlapLayout,
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

function AppointmentBlock({ appointment, startHour, onClick, column = 0, totalColumns = 1 }) {
  const aptDate = parseAppointmentDate(appointment.rawDateTime)
  if (!aptDate) return null

  const duration = appointment.service?.duration || 30
  const { top, height } = getBlockPosition(aptDate, duration, startHour)

  const statusColor = appointment.status === 'cancelled' ? '#dc3545'
    : appointment.paymentStatus === 'paid' ? '#4CAF50'
    : appointment.status === 'confirmed' ? '#2196F3'
    : '#FF9800'

  // Calculate horizontal position for overlapping appointments
  const widthPercent = 100 / totalColumns
  const leftPercent = column * widthPercent

  return (
    <div
      onClick={() => onClick(appointment)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(appointment) } }}
      role="button"
      tabIndex={0}
      title={`${appointment.customer?.name || 'Walk-in'} — ${appointment.service?.name || 'Service'} (${duration} min)`}
      style={{
        position: 'absolute',
        top: `${top}px`,
        left: `calc(${leftPercent}% + 2px)`,
        width: `calc(${widthPercent}% - 4px)`,
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
        boxSizing: 'border-box',
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

function AppointmentDetail({ appointment, onClose, onConfirm, onCancel, onEdit, onRebook, vendorId }) {
  const [editing, setEditing] = useState(false)
  const [services, setServices] = useState([])
  const [staffList, setStaffList] = useState([])
  const [vendors, setVendors] = useState([])
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState({
    dateTime: '',
    serviceId: '',
    staffId: '',
    vendorId: '',
    status: '',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
  })

  if (!appointment) return null
  const aptDate = parseAppointmentDate(appointment.rawDateTime)

  // Initialize edit form when entering edit mode
  const startEditing = () => {
    const dt = appointment.rawDateTime || ''
    // Convert to datetime-local format
    let dtLocal = ''
    if (dt) {
      const d = new Date(dt)
      if (!isNaN(d.getTime())) {
        dtLocal = d.toISOString().slice(0, 16)
      }
    }
    setEditForm({
      dateTime: dtLocal,
      serviceId: appointment.serviceId || '',
      staffId: appointment.staffId || '',
      vendorId: appointment.vendorId || vendorId || '',
      status: appointment.status || '',
      customerName: appointment.customer?.name || '',
      customerPhone: appointment.customer?.phone || '',
      customerEmail: appointment.customer?.email || '',
    })
    setEditing(true)
    // Load services and staff
    loadEditData(appointment.vendorId || vendorId)
  }

  const loadEditData = (vid) => {
    if (!vid) return
    fetch(`/api/services?vendorId=${vid}`).then(r => r.json()).then(d => setServices((d.services || []).filter(s => s.isActive !== false)))
    fetch(`/api/staff-schedules?vendorId=${vid}`).then(r => r.json()).then(d => setStaffList((d.schedules || []).filter(s => s.isActive !== false)))
    fetch('/api/vendors').then(r => r.json()).then(d => setVendors(d.vendors || []))
  }

  const handleVendorChange = (newVendorId) => {
    setEditForm(prev => ({ ...prev, vendorId: newVendorId, serviceId: '', staffId: '' }))
    // Reload services and staff for new vendor
    fetch(`/api/services?vendorId=${newVendorId}`).then(r => r.json()).then(d => setServices((d.services || []).filter(s => s.isActive !== false)))
    fetch(`/api/staff-schedules?vendorId=${newVendorId}`).then(r => r.json()).then(d => setStaffList((d.schedules || []).filter(s => s.isActive !== false)))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Build update payload
      const updates = {}
      let hasChanges = false

      // Check dateTime change
      if (editForm.dateTime) {
        const newDT = new Date(editForm.dateTime).toISOString()
        if (newDT !== appointment.rawDateTime) {
          // Use reschedule endpoint for time changes
          const res = await fetch('/api/appointments/reschedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appointmentId: appointment.appointmentId, newDateTime: newDT })
          })
          if (!res.ok) {
            const data = await res.json()
            alert('Failed to update time: ' + (data.error || 'Unknown error'))
            setSaving(false)
            return
          }
          hasChanges = true
        }
      }

      // Check staff change
      if (editForm.staffId !== (appointment.staffId || '')) {
        if (editForm.staffId) {
          const res = await fetch('/api/appointments/reassign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              appointmentId: appointment.appointmentId,
              newStaffId: editForm.staffId,
              requestingVendorId: vendorId
            })
          })
          if (!res.ok) {
            const data = await res.json()
            alert('Failed to reassign staff: ' + (data.error || 'Unknown error'))
            setSaving(false)
            return
          }
        } else {
          // Clear staff assignment via PATCH
          updates.staffId = null
        }
        hasChanges = true
      }

      // Check status change
      if (editForm.status !== appointment.status) {
        updates.status = editForm.status
        hasChanges = true
      }

      // Check service change
      if (editForm.serviceId !== (appointment.serviceId || '')) {
        updates.serviceId = editForm.serviceId
        hasChanges = true
      }

      // Check customer info changes
      const currentCustomer = appointment.customer || {}
      if (editForm.customerName !== (currentCustomer.name || '') ||
          editForm.customerPhone !== (currentCustomer.phone || '') ||
          editForm.customerEmail !== (currentCustomer.email || '')) {
        updates.customer = JSON.stringify({
          ...currentCustomer,
          name: editForm.customerName,
          phone: editForm.customerPhone,
          email: editForm.customerEmail,
        })
        hasChanges = true
      }

      // Apply remaining updates via PATCH
      if (Object.keys(updates).length > 0) {
        const res = await fetch('/api/appointments', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointmentId: appointment.appointmentId, ...updates })
        })
        if (!res.ok) {
          const data = await res.json()
          alert('Failed to save changes: ' + (data.error || 'Unknown error'))
          setSaving(false)
          return
        }
      }

      if (hasChanges) {
        onEdit()
      }
      onClose()
    } catch (error) {
      alert('Error saving: ' + (error.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="document"
        style={{
          background: 'white', borderRadius: '12px', padding: '2rem',
          maxWidth: '440px', width: '90%', maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>{editing ? 'Edit Appointment' : 'Appointment Details'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--color-text-light)' }}>×</button>
        </div>

        {!editing ? (
          <>
            {/* View mode */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p style={{ margin: 0 }}><strong>Customer:</strong> {appointment.customer?.name || 'Walk-in'}</p>
              <p style={{ margin: 0 }}><strong>Service:</strong> {appointment.service?.name} ({appointment.service?.duration} min)</p>
              <p style={{ margin: 0 }}><strong>Price:</strong> ${appointment.service?.price?.toFixed(2)}</p>
              {appointment.staffName && <p style={{ margin: 0 }}><strong>With:</strong> {appointment.staffName}</p>}
              {aptDate && <p style={{ margin: 0 }}><strong>Time:</strong> {formatTime(aptDate)}</p>}
              {aptDate && <p style={{ margin: 0 }}><strong>Date:</strong> {aptDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>}
              {(appointment.groupId || appointment.bundleId) && (
                <p style={{ margin: 0 }}><strong>{appointment.bundleId ? '📦 Bundle' : '🔗 Group'}:</strong> This is part of a multi-appointment booking</p>
              )}
              <p style={{ margin: 0 }}><strong>Status:</strong> <span style={{
                padding: '0.15rem 0.5rem', borderRadius: '8px', fontSize: '0.85rem',
                background: appointment.status === 'confirmed' ? '#d4edda' : appointment.status === 'cancelled' ? '#f8d7da' : '#fff3cd',
                color: appointment.status === 'confirmed' ? '#155724' : appointment.status === 'cancelled' ? '#721c24' : '#856404',
              }}>{appointment.status}</span></p>
              <p style={{ margin: 0 }}><strong>Payment:</strong> <span style={{
                padding: '0.15rem 0.5rem', borderRadius: '8px', fontSize: '0.85rem',
                background: appointment.paymentStatus === 'paid' ? '#d4edda' : '#fff3cd',
                color: appointment.paymentStatus === 'paid' ? '#155724' : '#856404',
              }}>{appointment.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}</span></p>
              {appointment.customer?.phone && <p style={{ margin: 0 }}><strong>Phone:</strong> {appointment.customer.phone}</p>}
              {appointment.customer?.notes && <p style={{ margin: 0 }}><strong>Notes:</strong> {appointment.customer.notes}</p>}
            </div>

            {/* Action buttons */}
            {appointment.status !== 'cancelled' && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                {(appointment.status === 'pending' || appointment.status === 'pending-confirmation') && (
                  <button
                    onClick={() => { onConfirm(appointment); onClose() }}
                    style={{ flex: 1, padding: '0.6rem 1rem', borderRadius: '6px', border: 'none', background: '#4CAF50', color: 'white', cursor: 'pointer', fontWeight: '500', fontSize: '0.85rem' }}
                  >
                    Confirm
                  </button>
                )}
                <button
                  onClick={startEditing}
                  style={{ flex: 1, padding: '0.6rem 1rem', borderRadius: '6px', border: 'none', background: '#2196F3', color: 'white', cursor: 'pointer', fontWeight: '500', fontSize: '0.85rem' }}
                >
                  Edit
                </button>
                <button
                  onClick={() => { onRebook(appointment); onClose() }}
                  style={{ flex: 1, padding: '0.6rem 1rem', borderRadius: '6px', border: 'none', background: '#9C27B0', color: 'white', cursor: 'pointer', fontWeight: '500', fontSize: '0.85rem' }}
                >
                  Rebook
                </button>
                <button
                  onClick={() => { onCancel(appointment); onClose() }}
                  style={{ flex: 1, padding: '0.6rem 1rem', borderRadius: '6px', border: 'none', background: '#F44336', color: 'white', cursor: 'pointer', fontWeight: '500', fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Edit mode */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Date & Time */}
              <div>
                <label htmlFor="edit-datetime" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Date & Time</label>
                <input
                  id="edit-datetime"
                  type="datetime-local"
                  value={editForm.dateTime}
                  onChange={(e) => setEditForm({ ...editForm, dateTime: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }}
                />
              </div>

              {/* Vendor */}
              {vendors.length > 1 && (
                <div>
                  <label htmlFor="edit-vendor" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Vendor</label>
                  <select
                    id="edit-vendor"
                    value={editForm.vendorId}
                    onChange={(e) => handleVendorChange(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
                  >
                    {vendors.map(v => <option key={v.vendorId} value={v.vendorId}>{v.name}</option>)}
                  </select>
                </div>
              )}

              {/* Service */}
              <div>
                <label htmlFor="edit-service" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Service</label>
                <select
                  id="edit-service"
                  value={editForm.serviceId}
                  onChange={(e) => setEditForm({ ...editForm, serviceId: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
                >
                  <option value="">Select a service</option>
                  {services.map(s => <option key={s.serviceId} value={s.serviceId}>{s.name} ({s.duration} min — ${s.price})</option>)}
                </select>
              </div>

              {/* Staff */}
              <div>
                <label htmlFor="edit-staff" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Staff Member</label>
                <select
                  id="edit-staff"
                  value={editForm.staffId}
                  onChange={(e) => setEditForm({ ...editForm, staffId: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
                >
                  <option value="">None / Auto-assign</option>
                  {staffList.map(s => <option key={s.visibleId} value={s.visibleId}>{s.staffName}</option>)}
                </select>
              </div>

              {/* Status */}
              <div>
                <label htmlFor="edit-status" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Status</label>
                <select
                  id="edit-status"
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
                >
                  <option value="pending-confirmation">Pending Confirmation</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              {/* Customer Name */}
              <div>
                <label htmlFor="edit-customer-name" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Customer Name</label>
                <input
                  id="edit-customer-name"
                  type="text"
                  value={editForm.customerName}
                  onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }}
                />
              </div>

              {/* Customer Phone */}
              <div>
                <label htmlFor="edit-customer-phone" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Phone</label>
                <input
                  id="edit-customer-phone"
                  type="tel"
                  value={editForm.customerPhone}
                  onChange={(e) => setEditForm({ ...editForm, customerPhone: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }}
                />
              </div>

              {/* Customer Email */}
              <div>
                <label htmlFor="edit-customer-email" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Email</label>
                <input
                  id="edit-customer-email"
                  type="email"
                  value={editForm.customerEmail}
                  onChange={(e) => setEditForm({ ...editForm, customerEmail: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Save / Cancel buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                onClick={handleSave}
                disabled={saving}
                className="cta"
                style={{ flex: 1, opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => setEditing(false)}
                style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer' }}
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Time Block Day Column ─────────────────────────────────────

function TimeBlockColumn({ date, appointments, startHour, endHour, onAppointmentClick, onSlotClick, workingStart, workingEnd }) {
  const slots = generateTimeSlots(startHour, endHour)
  const dayAppointments = appointments.filter(apt => {
    const d = parseAppointmentDate(apt.rawDateTime)
    return d && isSameDay(d, date) && apt.status !== 'cancelled'
  })

  // Compute overlap layout for side-by-side rendering
  const layout = computeOverlapLayout(dayAppointments, startHour)

  const handleSlotClick = (e, slot) => {
    // Only fire if clicking the background, not an appointment block
    if (e.target !== e.currentTarget) return
    const dateTime = new Date(date)
    dateTime.setHours(slot.hour, slot.minute, 0, 0)
    onSlotClick(dateTime)
  }

  const isInWorkingHours = (slot) => {
    if (workingStart == null || workingEnd == null) return false
    const slotMin = slot.hour * 60 + slot.minute
    return slotMin >= workingStart && slotMin < workingEnd
  }

  return (
    <div style={{ position: 'relative', minHeight: `${slots.length * 40}px`, marginLeft: '1px' }}>
      {/* Working hours background overlay */}
      {workingStart != null && workingEnd != null && (
        <div style={{
          position: 'absolute',
          top: `${((workingStart - startHour * 60) / 30) * 40}px`,
          left: 0,
          right: 0,
          height: `${((workingEnd - workingStart) / 30) * 40}px`,
          background: 'rgba(76, 175, 80, 0.06)',
          borderTop: '2px solid rgba(76, 175, 80, 0.4)',
          borderBottom: '2px solid rgba(76, 175, 80, 0.4)',
          pointerEvents: 'none',
          zIndex: 1,
        }} />
      )}
      {/* Grid lines (clickable) */}
      {slots.map((slot, i) => (
        <div
          key={i}
          onClick={(e) => handleSlotClick(e, slot)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const dateTime = new Date(date); dateTime.setHours(slot.hour, slot.minute, 0, 0); onSlotClick(dateTime) } }}
          role="button"
          tabIndex={0}
          aria-label={`Add appointment at ${slot.hour === 0 ? 12 : slot.hour > 12 ? slot.hour - 12 : slot.hour}:${String(slot.minute).padStart(2, '0')} ${slot.hour < 12 ? 'AM' : 'PM'}`}
          style={{
            position: 'absolute',
            top: `${i * 40}px`,
            left: 0,
            right: 0,
            height: '40px',
            borderBottom: slot.minute === 0 ? '1px solid var(--color-border)' : '1px dashed rgba(0,0,0,0.06)',
            background: 'transparent',
            cursor: 'cell',
          }}
        />
      ))}
      {/* Appointment blocks with overlap handling */}
      {layout.map(({ appointment, column, totalColumns }) => (
        <AppointmentBlock
          key={appointment.appointmentId}
          appointment={appointment}
          startHour={startHour}
          onClick={onAppointmentClick}
          column={column}
          totalColumns={totalColumns}
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
                overflow: 'auto',
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
                {dayApts.map(apt => {
                  const color = apt.paymentStatus === 'paid' ? '#4CAF50'
                    : apt.status === 'confirmed' ? '#2196F3'
                    : '#FF9800'
                  const aptDate = parseAppointmentDate(apt.rawDateTime)
                  const timeStr = aptDate ? aptDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : ''
                  return (
                  <div
                    key={apt.appointmentId}
                    onClick={() => onAppointmentClick(apt)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAppointmentClick(apt) } }}
                    role="button"
                    tabIndex={0}
                    style={{
                      fontSize: '0.7rem',
                      padding: '2px 4px',
                      borderRadius: '3px',
                      background: color + '22',
                      borderLeft: `2px solid ${color}`,
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '4px',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apt.customer?.name || 'Walk-in'}</span>
                    <span style={{ flexShrink: 0, color: 'var(--color-text-light)' }}>{timeStr}</span>
                  </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── New Appointment / Block Time Modal ────────────────────────

function NewAppointmentModal({ dateTime, vendorId, defaultStaffId, defaultServiceId, defaultCustomer, onClose, onCreated }) {
  const [mode, setMode] = useState('appointment') // 'appointment' or 'block'
  const [form, setForm] = useState({
    customerName: defaultCustomer?.name || '',
    customerPhone: defaultCustomer?.phone || '',
    customerEmail: defaultCustomer?.email || '',
    notes: '',
    dateTime: dateTime ? dateTime.toISOString().slice(0, 16) : '',
  })
  const [services, setServices] = useState([])
  const [staffList, setStaffList] = useState([])
  const [allStaff, setAllStaff] = useState([])
  const [serviceId, setServiceId] = useState(defaultServiceId || '')
  const [staffId, setStaffId] = useState(defaultStaffId || '')
  const [staffId2, setStaffId2] = useState('')
  const [duration, setDuration] = useState(60)
  const [submitting, setSubmitting] = useState(false)

  const selectedService = services.find(s => s.serviceId === serviceId)
  const isMultiProvider = selectedService?.providersRequired > 1

  useEffect(() => {
    if (!vendorId) return
    fetch(`/api/services?vendorId=${vendorId}`).then(r => r.json()).then(d => setServices((d.services || []).filter(s => s.vendorId === vendorId && s.isActive !== false)))
    fetch(`/api/staff-schedules?vendorId=${vendorId}`).then(r => r.json()).then(d => setStaffList((d.schedules || []).filter(s => s.isActive !== false)))
  }, [vendorId])

  // Fetch all staff across vendors when a multi-provider service is selected
  useEffect(() => {
    if (!isMultiProvider) { setAllStaff([]); return }
    fetch('/api/staff-schedules?all=true').then(r => r.json()).then(d => setAllStaff((d.schedules || []).filter(s => s.isActive !== false)))
  }, [isMultiProvider])

  const handleSubmit = async () => {
    if (!form.dateTime) { alert('Please select a date and time'); return }
    if (isMultiProvider && (!staffId || !staffId2)) { alert('Please select both staff members for this service'); return }
    if (isMultiProvider && staffId === staffId2) { alert('Please select two different staff members'); return }
    setSubmitting(true)
    try {
      const body = mode === 'block'
        ? { vendorId, staffId: staffId || undefined, dateTime: form.dateTime, customerName: 'Blocked Time', notes: form.notes, isBlockedTime: true, duration }
        : { vendorId, serviceId: serviceId || undefined, staffId: staffId || undefined, staffIds: isMultiProvider ? [staffId, staffId2] : undefined, dateTime: form.dateTime, customerName: form.customerName, customerPhone: form.customerPhone, customerEmail: form.customerEmail, notes: form.notes }

      const res = await fetch('/api/appointments/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (res.ok) {
        onCreated()
        onClose()
      } else {
        const data = await res.json()
        alert('Failed: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      alert('Error: ' + (error.message || 'Unknown error'))
    } finally { setSubmitting(false) }
  }

  return (
    <div
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="document"
        style={{ background: 'white', borderRadius: '12px', padding: '2rem', maxWidth: '440px', width: '90%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>{mode === 'block' ? 'Block Time' : 'New Appointment'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--color-text-light)' }}>×</button>
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <button onClick={() => setMode('appointment')} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none', background: mode === 'appointment' ? 'var(--color-primary)' : 'var(--color-accent)', color: mode === 'appointment' ? 'white' : 'var(--color-text)', cursor: 'pointer', fontWeight: '500' }}>
            Appointment
          </button>
          <button onClick={() => setMode('block')} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none', background: mode === 'block' ? '#607D8B' : 'var(--color-accent)', color: mode === 'block' ? 'white' : 'var(--color-text)', cursor: 'pointer', fontWeight: '500' }}>
            🚫 Block Time
          </button>
        </div>

        {/* Date/Time */}
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="new-apt-datetime" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Date & Time</label>
          <input id="new-apt-datetime" type="datetime-local" value={form.dateTime} onChange={(e) => setForm({ ...form, dateTime: e.target.value })}
            style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }} />
        </div>

        {/* Staff */}
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="new-apt-staff" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>{isMultiProvider ? 'Staff Member 1' : 'Staff Member'}</label>
          <select id="new-apt-staff" value={staffId} onChange={(e) => setStaffId(e.target.value)}
            style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}>
            <option value="">None</option>
            {(isMultiProvider ? allStaff : staffList).map(s => <option key={s.visibleId} value={s.visibleId}>{s.staffName}{s.vendorId !== vendorId ? ` (${s.vendorId.replace('vendor-', '')})` : ''}</option>)}
          </select>
        </div>

        {/* Staff 2 (multi-provider) */}
        {isMultiProvider && (
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="new-apt-staff2" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Staff Member 2</label>
            <select id="new-apt-staff2" value={staffId2} onChange={(e) => setStaffId2(e.target.value)}
              style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}>
              <option value="">Select second staff</option>
              {(allStaff.length > 0 ? allStaff : staffList).filter(s => s.visibleId !== staffId).map(s => <option key={s.visibleId} value={s.visibleId}>{s.staffName}{s.vendorId !== vendorId ? ` (${s.vendorId.replace('vendor-', '')})` : ''}</option>)}
            </select>
          </div>
        )}

        {mode === 'appointment' ? (
          <>
            {/* Service */}
            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="new-apt-service" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Service</label>
              <select id="new-apt-service" value={serviceId} onChange={(e) => setServiceId(e.target.value)}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}>
                <option value="">Select a service</option>
                {services.map(s => <option key={s.serviceId} value={s.serviceId}>{s.name} ({s.duration} min — ${s.price})</option>)}
              </select>
            </div>
            {/* Customer */}
            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="new-apt-name" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Customer Name</label>
              <input id="new-apt-name" type="text" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="new-apt-phone" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Phone</label>
              <input id="new-apt-phone" type="tel" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="new-apt-email" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Email</label>
              <input id="new-apt-email" type="email" value={form.customerEmail} onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }} />
            </div>
          </>
        ) : (
          /* Block time — duration */
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="new-apt-duration" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Duration (minutes)</label>
            <input id="new-apt-duration" type="number" min="15" step="15" value={duration} onChange={(e) => setDuration(Number(e.target.value))}
              style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }} />
          </div>
        )}

        {/* Notes */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label htmlFor="new-apt-notes" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Notes</label>
          <input id="new-apt-notes" type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
            style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }} />
        </div>

        {/* Submit */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={handleSubmit} disabled={submitting} className="cta" style={{ flex: 1, opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Saving...' : mode === 'block' ? 'Block Time' : 'Add Appointment'}
          </button>
          <button onClick={onClose} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
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
  const [allStaff, setAllStaff] = useState([])
  const [selectedStaffId, setSelectedStaffId] = useState(null)
  const [view, setView] = useState('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedAppointment, setSelectedAppointment] = useState(null)
  const [startHour, setStartHour] = useState(DEFAULT_START_HOUR)
  const [endHour, setEndHour] = useState(DEFAULT_END_HOUR)
  const [newAppointmentDateTime, setNewAppointmentDateTime] = useState(null)

  // Action handlers
  const handleConfirm = async (appointment) => {
    if (!confirm('Confirm this appointment?')) return
    try {
      const res = await fetch('/api/appointments/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: appointment.appointmentId })
      })
      if (res.ok) {
        loadAppointments()
      } else {
        alert('Failed to confirm appointment')
      }
    } catch {
      alert('Error confirming appointment')
    }
  }

  const handleCancel = async (appointment) => {
    if (!confirm('Are you sure you want to cancel this appointment?')) return
    try {
      const res = await fetch('/api/appointments/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: appointment.appointmentId })
      })
      if (res.ok) {
        loadAppointments()
      } else {
        alert('Failed to cancel appointment')
      }
    } catch {
      alert('Error cancelling appointment')
    }
  }

  const handleReschedule = () => {
    // Edit is now handled inline in the modal
    loadAppointments()
  }

  const [rebookData, setRebookData] = useState(null)

  const handleRebook = (appointment) => {
    // Set date 6 weeks from now, same time of day
    const sixWeeksOut = new Date()
    sixWeeksOut.setDate(sixWeeksOut.getDate() + 42)
    const aptDate = parseAppointmentDate(appointment.rawDateTime)
    if (aptDate) {
      sixWeeksOut.setHours(aptDate.getHours(), aptDate.getMinutes(), 0, 0)
    }
    setRebookData({
      dateTime: sixWeeksOut,
      customerName: appointment.customer?.name || '',
      customerPhone: appointment.customer?.phone || '',
      customerEmail: appointment.customer?.email || '',
      serviceId: appointment.serviceId || '',
      staffId: appointment.staffId || '',
      vendorId: appointment.vendorId || selectedStaffVendorId,
    })
  }

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

  // Load all staff and vendors for the staff selector
  useEffect(() => {
    if (!userRole) return
    Promise.all([
      fetch('/api/staff-schedules').then(r => r.json()),
      fetch('/api/vendors').then(r => r.json())
    ]).then(([staffData, vendorData]) => {
      const staff = (staffData.schedules || []).filter(s => s.isActive !== false)
      setAllStaff(staff)
      setVendors(vendorData.vendors || [])
      // Default to the current user's staff record, or first staff member
      if (!selectedStaffId) {
        const myStaff = userVendorId ? staff.find(s => s.vendorId === userVendorId) : null
        setSelectedStaffId(myStaff?.visibleId || staff[0]?.visibleId || null)
      }
    })
  }, [userRole])

  useEffect(() => {
    if (selectedStaffId) {
      loadAppointments()
    }
  }, [selectedStaffId, currentDate, view])

  const loadAppointments = () => {
    if (!selectedStaffId) return
    setLoading(true)

    const { start, end } = getDateRangeForView(view, currentDate)
    const params = new URLSearchParams({
      staffId: selectedStaffId,
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

  if (!userRole || allStaff.length === 0) return <div style={{ padding: '2rem' }}>Loading...</div>

  // Group staff by vendor for the selector
  const staffByVendor = vendors.reduce((acc, v) => {
    acc[v.vendorId] = allStaff.filter(s => s.vendorId === v.vendorId)
    return acc
  }, {})
  const selectedStaffRecord = allStaff.find(s => s.visibleId === selectedStaffId)
  const selectedStaffVendorId = selectedStaffRecord?.vendorId || userVendorId || vendors[0]?.vendorId

  // Compute working hours for a given date
  const DAY_NAMES_MAP = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const getWorkingHoursForDate = (date) => {
    if (!selectedStaffRecord?.schedule) return { start: null, end: null }
    const schedule = typeof selectedStaffRecord.schedule === 'string' ? JSON.parse(selectedStaffRecord.schedule) : selectedStaffRecord.schedule
    const dayName = DAY_NAMES_MAP[date.getDay()]
    const daySchedule = schedule[dayName]
    if (!daySchedule || !daySchedule.start) return { start: null, end: null }
    const [sh, sm] = daySchedule.start.split(':').map(Number)
    const [eh, em] = daySchedule.end.split(':').map(Number)
    return { start: sh * 60 + sm, end: eh * 60 + em }
  }

  return (
    <div>
      {/* Top bar: title + vendor selector + view toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <h1 style={{ margin: 0 }}>Calendar</h1>
          <button onClick={() => setNewAppointmentDateTime(new Date())} className="cta" style={{ margin: 0, padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
            + New
          </button>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedStaffId || ''}
            onChange={(e) => setSelectedStaffId(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
          >
            {vendors.map(vendor => {
              const vendorStaff = staffByVendor[vendor.vendorId] || []
              if (vendorStaff.length === 0) return null
              return (
                <optgroup key={vendor.vendorId} label={vendor.name}>
                  {vendorStaff.map(s => (
                    <option key={s.visibleId} value={s.visibleId}>{s.staffName}</option>
                  ))}
                </optgroup>
              )
            })}
          </select>
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
            {(() => { const wh = getWorkingHoursForDate(currentDate); return (
            <TimeBlockColumn
              date={currentDate}
              appointments={appointments}
              startHour={startHour}
              endHour={endHour}
              onAppointmentClick={setSelectedAppointment}
              onSlotClick={setNewAppointmentDateTime}
              workingStart={wh.start}
              workingEnd={wh.end}
            />
            ) })()}
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
          {getWeekDates(currentDate).map((date, idx) => {
            const wh = getWorkingHoursForDate(date)
            return (
            <div key={idx} style={{ flex: 1, minWidth: '100px', borderLeft: '3px solid #ccc' }}>
              {/* Day header */}
              <div style={{
                height: '36px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderBottom: '2px solid var(--color-border)',
                background: isToday(date) ? 'var(--color-primary)' : wh.start != null ? '#f0f9f0' : 'var(--color-accent)',
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
                onSlotClick={setNewAppointmentDateTime}
                workingStart={wh.start}
                workingEnd={wh.end}
              />
            </div>
            )
          })}
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
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          onEdit={handleReschedule}
          onRebook={handleRebook}
          vendorId={selectedStaffVendorId}
        />
      )}

      {/* New Appointment / Block Time / Rebook Modal */}
      {(newAppointmentDateTime || rebookData) && (
        <NewAppointmentModal
          dateTime={rebookData?.dateTime || newAppointmentDateTime}
          vendorId={rebookData?.vendorId || selectedStaffVendorId}
          defaultStaffId={rebookData?.staffId || selectedStaffId}
          defaultServiceId={rebookData?.serviceId || ''}
          defaultCustomer={rebookData ? { name: rebookData.customerName, phone: rebookData.customerPhone, email: rebookData.customerEmail } : null}
          onClose={() => { setNewAppointmentDateTime(null); setRebookData(null) }}
          onCreated={loadAppointments}
        />
      )}
    </div>
  )
}
