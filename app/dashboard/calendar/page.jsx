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
  formatWeekHeaderLabel,
} from '../../utils/calendar'
import MultiStaffView from './MultiStaffView'
import MultiStaffWeekView from './MultiStaffWeekView'

// ── Constants ─────────────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ── Utility Functions ─────────────────────────────────────────

function isToday(date) {
  return isSameDay(date, new Date())
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

// A service is treated as a "Head Bath" service if its name contains "head bath"
// or "headbath" (case-insensitive, spacing-insensitive). Catches variants like
// "Head Bath", "Couples Head Bath", and "Couple Headbath".
function isHeadBathService(name) {
  return (name || '').toLowerCase().replace(/\s+/g, '').includes('headbath')
}

// Sort comparator: Head Bath services first, then alphabetical by name.
function compareServicesHeadBathFirst(a, b) {
  const aHB = isHeadBathService(a.name)
  const bHB = isHeadBathService(b.name)
  if (aHB && !bHB) return -1
  if (!aHB && bHB) return 1
  return (a.name || '').localeCompare(b.name || '')
}

// Format a duration in minutes as "1h 30m", "45m", or "2h"
function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  const minsPart = mins > 0 ? ` ${mins}m` : ''
  return `${hours}h${minsPart}`
}

// Shared local datetime formatter (YYYY-MM-DDTHH:MM) for datetime-local inputs.
// Avoids UTC shift from toISOString().
function formatLocalDateTimeValue(dt) {
  if (!dt) return ''
  const d = dt instanceof Date ? dt : new Date(dt)
  if (Number.isNaN(d.getTime())) return ''
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

// ── Appointment Block Component ───────────────────────────────

function AppointmentBlock({ appointment, startHour, onClick, column = 0, totalColumns = 1 }) {
  const aptDate = parseAppointmentDate(appointment.rawDateTime)
  if (!aptDate) return null

  // For blocked time, duration is stored in customer JSON; otherwise use service duration
  const customer = appointment.customer || {}
  const duration = (customer.isBlockedTime && customer.duration) ? customer.duration : (appointment.service?.duration || 30)
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

function AppointmentDetail({ appointment, onClose, onConfirm, onCancel, onEdit, onRebook, vendorId, currentUserStaffId, userRole }) {
  const [editing, setEditing] = useState(false)
  const [services, setServices] = useState([])
  const [staffList, setStaffList] = useState([])
  const [vendors, setVendors] = useState([])
  const [saving, setSaving] = useState(false)
  const [overlapWarning, setOverlapWarning] = useState(null)
  const [pendingPayload, setPendingPayload] = useState(null)
  const [editForm, setEditForm] = useState({
    dateTime: '',
    serviceId: '',
    staffId: '',
    status: '',
    customerFirstName: '',
    customerLastName: '',
    customerPhone: '',
    customerEmail: '',
  })
  // Block-specific edit state
  const [blockEditForm, setBlockEditForm] = useState({
    dateTime: '',
    endTime: '',
    staffId: '',
    notes: '',
  })

  if (!appointment) return null
  const aptDate = parseAppointmentDate(appointment.rawDateTime)
  const isBlockedTime = appointment.customer?.isBlockedTime || appointment.status === 'blocked'

  // Format dateTime as local YYYY-MM-DDTHH:MM for datetime-local input
  const formatLocalDT = formatLocalDateTimeValue

  // Initialize edit form when entering edit mode
  const startEditing = () => {
    const dt = appointment.rawDateTime || ''
    const dtLocal = formatLocalDT(dt)

    if (isBlockedTime) {
      // Block-specific form
      const blockDuration = appointment.customer?.duration || 60
      const startDate = new Date(dt)
      const endDate = new Date(startDate.getTime() + blockDuration * 60000)
      setBlockEditForm({
        dateTime: dtLocal,
        endTime: formatLocalDT(endDate),
        staffId: appointment.staffId || '',
        notes: appointment.customer?.notes || '',
      })
    } else {
      setEditForm({
        dateTime: dtLocal,
        serviceId: appointment.serviceId || '',
        staffId: appointment.staffId || '',
        status: appointment.status || '',
        customerFirstName: appointment.customer?.name ? appointment.customer.name.split(' ')[0] : '',
        customerLastName: appointment.customer?.name ? appointment.customer.name.split(' ').slice(1).join(' ') : '',
        customerPhone: appointment.customer?.phone || '',
        customerEmail: appointment.customer?.email || '',
      })
    }
    setEditing(true)
    setOverlapWarning(null)
    setPendingPayload(null)
    loadEditData()
  }

  const loadEditData = () => {
    fetch('/api/services').then(r => r.json()).then(d => setServices((d.services || []).filter(s => s.isActive !== false)))
    fetch('/api/staff-schedules?all=true').then(r => r.json()).then(d => setStaffList((d.schedules || []).filter(s => s.isActive !== false)))
    fetch('/api/vendors').then(r => r.json()).then(d => setVendors(d.vendors || []))
  }

  const handleSave = async (forceConfirmOverlap = false) => {
    setSaving(true)
    setOverlapWarning(null)
    try {
      // Build update payload
      const updates = {}
      let hasChanges = false

      // Record who performed the edit for audit (Req 4.5)
      if (currentUserStaffId) {
        updates.createdBy = currentUserStaffId
      }

      // Check dateTime change
      if (editForm.dateTime) {
        const newDT = new Date(editForm.dateTime).toISOString()
        if (newDT !== appointment.rawDateTime) {
          updates.dateTime = newDT
          hasChanges = true
        }
      }

      // Check staff change
      if (editForm.staffId !== (appointment.staffId || '')) {
        if (editForm.staffId) {
          // If the service is also changing, skip the reassign endpoint (it validates
          // against the current service's allowedStaff which would be stale). Instead,
          // include staffId directly in the PATCH so they update atomically.
          const serviceAlsoChanging = editForm.serviceId !== (appointment.serviceId || '')
          if (serviceAlsoChanging) {
            updates.staffId = editForm.staffId
          } else {
            const res = await fetch('/api/appointments/reassign', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                appointmentId: appointment.appointmentId,
                newStaffId: editForm.staffId,
                requestingVendorId: vendorId,
                role: userRole
              })
            })
            if (!res.ok) {
              const data = await res.json()
              alert('Failed to reassign staff: ' + (data.error || 'Unknown error'))
              setSaving(false)
              return
            }
          }
        } else {
          // Clear staff assignment
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
      const editFullName = `${editForm.customerFirstName} ${editForm.customerLastName}`.trim()
      if (editFullName !== (currentCustomer.name || '') ||
          editForm.customerPhone !== (currentCustomer.phone || '') ||
          editForm.customerEmail !== (currentCustomer.email || '')) {
        updates.customer = JSON.stringify({
          ...currentCustomer,
          name: editFullName,
          phone: editForm.customerPhone,
          email: editForm.customerEmail,
        })
        hasChanges = true
      }

      // Apply all updates via PATCH (includes createdBy for audit)
      if (hasChanges || updates.createdBy) {
        const payload = { appointmentId: appointment.appointmentId, ...updates }
        if (forceConfirmOverlap) {
          payload.confirmOverlap = true
        }

        const res = await fetch('/api/appointments', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })

        if (res.status === 409) {
          // Overlap conflict detected — show warning and ask for confirmation
          const data = await res.json()
          setOverlapWarning(data.message || 'This overlaps with an existing appointment. Save anyway?')
          setPendingPayload(payload)
          setSaving(false)
          return
        }

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

  const handleConfirmOverlap = async () => {
    if (!pendingPayload) return
    setSaving(true)
    setOverlapWarning(null)
    try {
      const res = await fetch('/api/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pendingPayload, confirmOverlap: true })
      })
      if (!res.ok) {
        const data = await res.json()
        alert('Failed to save changes: ' + (data.error || 'Unknown error'))
        setSaving(false)
        return
      }
      onEdit()
      onClose()
    } catch (error) {
      alert('Error saving: ' + (error.message || 'Unknown error'))
    } finally {
      setSaving(false)
      setPendingPayload(null)
    }
  }

  // Save handler for blocked time edits
  const handleBlockSave = async () => {
    setSaving(true)
    try {
      const updates = { appointmentId: appointment.appointmentId }
      let hasChanges = false

      // Check dateTime change — send in same format as creation (local YYYY-MM-DDTHH:MM)
      if (blockEditForm.dateTime) {
        const currentStored = appointment.rawDateTime || ''
        // Normalize both to comparable format
        const newLocal = blockEditForm.dateTime
        const currentLocal = formatLocalDT(currentStored)
        if (newLocal !== currentLocal) {
          updates.dateTime = blockEditForm.dateTime
          hasChanges = true
        }
      }

      // Check staff change
      if (blockEditForm.staffId !== (appointment.staffId || '')) {
        updates.staffId = blockEditForm.staffId || null
        hasChanges = true
      }

      // Calculate new duration from start/end
      let newDuration = appointment.customer?.duration || 60
      if (blockEditForm.dateTime && blockEditForm.endTime) {
        const startMs = new Date(blockEditForm.dateTime).getTime()
        const endMs = new Date(blockEditForm.endTime).getTime()
        const diffMin = Math.round((endMs - startMs) / 60000)
        if (diffMin > 0) newDuration = diffMin
      }

      // Check if duration or notes changed
      const oldDuration = appointment.customer?.duration || 60
      const oldNotes = appointment.customer?.notes || ''
      if (newDuration !== oldDuration || blockEditForm.notes !== oldNotes) {
        updates.customer = JSON.stringify({
          name: 'Blocked Time',
          isBlockedTime: true,
          duration: newDuration,
          notes: blockEditForm.notes || '',
        })
        hasChanges = true
      }

      if (currentUserStaffId) {
        updates.createdBy = currentUserStaffId
      }

      if (hasChanges || updates.createdBy) {
        const res = await fetch('/api/appointments', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        })
        if (!res.ok) {
          const data = await res.json()
          alert('Failed to save: ' + (data.error || 'Unknown error'))
          setSaving(false)
          return
        }
      }

      if (hasChanges) onEdit()
      onClose()
    } catch (error) {
      alert('Error saving: ' + (error.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  // Delete (cancel) blocked time
  const handleDeleteBlock = async () => {
    if (!confirm('Remove this time block?')) return
    setSaving(true)
    try {
      const res = await fetch('/api/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: appointment.appointmentId, status: 'cancelled' })
      })
      if (res.ok) {
        onEdit()
        onClose()
      } else {
        alert('Failed to remove block')
      }
    } catch (error) {
      alert('Error: ' + (error.message || 'Unknown'))
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
        {/* ─── BLOCKED TIME ─── */}
        {isBlockedTime ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>{editing ? 'Edit Time Block' : '🚫 Time Block'}</h3>
              <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--color-text-light)' }}>×</button>
            </div>

            {!editing ? (
              <>
                {/* Block view mode */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: '#f5f5f5', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                  {appointment.staffName && <p style={{ margin: 0 }}><strong>Staff:</strong> {appointment.staffName}</p>}
                  {aptDate && <p style={{ margin: 0 }}><strong>Date:</strong> {aptDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>}
                  {aptDate && (
                    <p style={{ margin: 0 }}><strong>Time:</strong> {formatTime(aptDate)} – {formatTime(new Date(aptDate.getTime() + (appointment.customer?.duration || 60) * 60000))}</p>
                  )}
                  <p style={{ margin: 0 }}><strong>Duration:</strong> {formatDuration(appointment.customer?.duration || 60)}</p>
                  {appointment.customer?.notes && <p style={{ margin: 0 }}><strong>Notes:</strong> {appointment.customer.notes}</p>}
                </div>

                {/* Block action buttons */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={startEditing}
                    style={{ flex: 1, padding: '0.6rem 1rem', borderRadius: '6px', border: 'none', background: '#607D8B', color: 'white', cursor: 'pointer', fontWeight: '500', fontSize: '0.85rem' }}
                  >
                    Edit Block
                  </button>
                  <button
                    onClick={handleDeleteBlock}
                    disabled={saving}
                    style={{ flex: 1, padding: '0.6rem 1rem', borderRadius: '6px', border: 'none', background: '#F44336', color: 'white', cursor: 'pointer', fontWeight: '500', fontSize: '0.85rem', opacity: saving ? 0.6 : 1 }}
                  >
                    {saving ? 'Removing...' : 'Remove Block'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Block edit mode */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Start Time */}
                  <div>
                    <label htmlFor="block-edit-start" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Start Time</label>
                    <input
                      id="block-edit-start"
                      type="datetime-local"
                      value={blockEditForm.dateTime}
                      onChange={(e) => setBlockEditForm({ ...blockEditForm, dateTime: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }}
                    />
                  </div>

                  {/* End Time */}
                  <div>
                    <label htmlFor="block-edit-end" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>End Time</label>
                    <input
                      id="block-edit-end"
                      type="datetime-local"
                      value={blockEditForm.endTime}
                      onChange={(e) => setBlockEditForm({ ...blockEditForm, endTime: e.target.value })}
                      min={blockEditForm.dateTime || ''}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }}
                    />
                    {blockEditForm.dateTime && blockEditForm.endTime && (() => {
                      const diffMin = Math.round((new Date(blockEditForm.endTime).getTime() - new Date(blockEditForm.dateTime).getTime()) / 60000)
                      if (diffMin <= 0) return null
                      return (
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', marginTop: '0.25rem', marginBottom: 0 }}>
                          Duration: {formatDuration(diffMin)}
                        </p>
                      )
                    })()}
                  </div>

                  {/* Staff */}
                  <div>
                    <label htmlFor="block-edit-staff" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Staff Member</label>
                    <select
                      id="block-edit-staff"
                      value={blockEditForm.staffId}
                      onChange={(e) => setBlockEditForm({ ...blockEditForm, staffId: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
                    >
                      <option value="">None</option>
                      {staffList.map(s => <option key={s.visibleId} value={s.visibleId}>{s.staffName}</option>)}
                    </select>
                  </div>

                  {/* Notes */}
                  <div>
                    <label htmlFor="block-edit-notes" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Notes</label>
                    <input
                      id="block-edit-notes"
                      type="text"
                      value={blockEditForm.notes}
                      onChange={(e) => setBlockEditForm({ ...blockEditForm, notes: e.target.value })}
                      placeholder="Reason for blocking time..."
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                {/* Block Save / Cancel buttons */}
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button
                    onClick={handleBlockSave}
                    disabled={saving}
                    style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', background: '#607D8B', color: 'white', cursor: 'pointer', fontWeight: '500', opacity: saving ? 0.6 : 1 }}
                  >
                    {saving ? 'Saving...' : 'Save Block'}
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
          </>
        ) : (
          <>
            {/* ─── REGULAR APPOINTMENT ─── */}
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
                  {/* Overlap Warning */}
                  {overlapWarning && (
                    <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px', padding: '1rem', marginBottom: '0.5rem' }}>
                      <p style={{ margin: 0, fontWeight: '600', color: '#856404' }}>⚠️ Scheduling Conflict</p>
                      <p style={{ margin: '0.5rem 0', fontSize: '0.9rem', color: '#856404' }}>{overlapWarning}</p>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                        <button
                          onClick={handleConfirmOverlap}
                          style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: '#ffc107', color: '#856404', cursor: 'pointer', fontWeight: '500', fontSize: '0.85rem' }}
                        >
                          Save Anyway
                        </button>
                        <button
                          onClick={() => { setOverlapWarning(null); setPendingPayload(null) }}
                          style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer', fontSize: '0.85rem' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

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
                      {[...services].sort(compareServicesHeadBathFirst).map(s => <option key={s.serviceId} value={s.serviceId}>{s.name} ({s.duration} min — ${s.price})</option>)}
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label htmlFor="edit-customer-fname" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>First Name</label>
                      <input
                        id="edit-customer-fname"
                        type="text"
                        value={editForm.customerFirstName}
                        onChange={(e) => setEditForm({ ...editForm, customerFirstName: e.target.value })}
                        style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-customer-lname" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Last Name</label>
                      <input
                        id="edit-customer-lname"
                        type="text"
                        value={editForm.customerLastName}
                        onChange={(e) => setEditForm({ ...editForm, customerLastName: e.target.value })}
                        style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }}
                      />
                    </div>
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

function NewAppointmentModal({ dateTime, vendorId, defaultStaffId, defaultServiceId, defaultCustomer, onClose, onCreated, currentUserStaffId }) {
  const [mode, setMode] = useState('appointment') // 'appointment' or 'block'
  const [blockType, setBlockType] = useState('single') // 'single' or 'multiday'
  const defaultFirstName = defaultCustomer?.name ? defaultCustomer.name.split(' ')[0] : ''
  const defaultLastName = defaultCustomer?.name ? defaultCustomer.name.split(' ').slice(1).join(' ') : ''

  // Format dateTime as local YYYY-MM-DDTHH:MM for datetime-local input (avoid UTC shift from toISOString)
  const formatLocalDateTime = formatLocalDateTimeValue

  const [form, setForm] = useState({
    customerFirstName: defaultFirstName,
    customerLastName: defaultLastName,
    customerPhone: defaultCustomer?.phone || '',
    customerEmail: defaultCustomer?.email || '',
    notes: '',
    dateTime: formatLocalDateTime(dateTime),
  })
  const [blockEndDate, setBlockEndDate] = useState('')
  const [blockStartDate, setBlockStartDate] = useState(dateTime ? formatLocalDateTime(dateTime).slice(0, 10) : '')
  const [services, setServices] = useState([])
  const [staffList, setStaffList] = useState([])
  const [allStaff, setAllStaff] = useState([])
  const [serviceId, setServiceId] = useState(defaultServiceId || '')
  const [staffId, setStaffId] = useState(defaultStaffId || '')
  const [staffId2, setStaffId2] = useState('')
  const [duration, setDuration] = useState(60)
  const [blockEndTime, setBlockEndTime] = useState(() => {
    if (!dateTime) return ''
    const end = new Date(dateTime)
    end.setMinutes(end.getMinutes() + 60)
    return formatLocalDateTime(end)
  })
  const [durationMode, setDurationMode] = useState('endtime') // 'endtime' or 'duration'
  const [submitting, setSubmitting] = useState(false)
  const [overlapWarning, setOverlapWarning] = useState(null)
  const [pendingBody, setPendingBody] = useState(null)
  const [formError, setFormError] = useState(null)

  const selectedService = services.find(s => s.serviceId === serviceId)
  const isMultiProvider = selectedService?.providersRequired > 1

  // Unified access: fetch ALL services and ALL staff regardless of vendor (Req 4.1, 4.2, 4.3)
  useEffect(() => {
    fetch('/api/services').then(r => r.json()).then(d => setServices((d.services || []).filter(s => s.isActive !== false)))
    fetch('/api/staff-schedules?all=true').then(r => r.json()).then(d => {
      const staff = (d.schedules || []).filter(s => s.isActive !== false)
      setStaffList(staff)
      setAllStaff(staff)
    })
  }, [])

  // Fetch all staff across vendors when a multi-provider service is selected
  useEffect(() => {
    if (!isMultiProvider) { setAllStaff([]); return }
    fetch('/api/staff-schedules?all=true').then(r => r.json()).then(d => setAllStaff((d.schedules || []).filter(s => s.isActive !== false)))
  }, [isMultiProvider])

  const handleSubmit = async (forceConfirmOverlap = false) => {
    setFormError(null)
    if (mode === 'block' && blockType === 'multiday') {
      if (!blockStartDate) { setFormError('Please select a start date'); return }
      if (!blockEndDate) { setFormError('Please select an end date'); return }
    } else if (!form.dateTime) {
      setFormError('Please select a date and time'); return
    }
    if (isMultiProvider && (!staffId || !staffId2)) { setFormError('Please select both staff members for this service'); return }
    if (isMultiProvider && staffId === staffId2) { setFormError('Please select two different staff members'); return }
    // Ensure vendorId can be resolved (from prop or from selected staff)
    const effectiveVendorId = vendorId || (staffId && [...staffList, ...allStaff].find(s => s.visibleId === staffId)?.vendorId) || ''
    if (!effectiveVendorId) { setFormError('Please select a staff member so the vendor can be determined'); return }
    setSubmitting(true)
    setOverlapWarning(null)
    try {
      if (mode === 'block' && blockType === 'multiday') {
        // Create a blocked time entry for each day in the range (full day blocks)
        const startDate = new Date(blockStartDate + 'T00:00:00')
        const endDate = new Date(blockEndDate + 'T23:59:59')
        const days = []
        const current = new Date(startDate)
        current.setHours(0, 0, 0, 0)
        while (current <= endDate) {
          days.push(new Date(current))
          current.setDate(current.getDate() + 1)
        }

        let failed = false
        // Resolve vendorId from selected staff if the prop is missing
        const resolvedBlockVendorId = vendorId || (staffId && [...staffList, ...allStaff].find(s => s.visibleId === staffId)?.vendorId) || ''
        for (const day of days) {
          // Block the full working day (use 6am start, 960 min = 16 hours as a full-day block)
          const year = day.getFullYear()
          const month = String(day.getMonth() + 1).padStart(2, '0')
          const dd = String(day.getDate()).padStart(2, '0')
          const dayDateTimeStr = `${year}-${month}-${dd}T06:00`
          const body = {
            vendorId: resolvedBlockVendorId,
            staffId: staffId || undefined,
            dateTime: dayDateTimeStr,
            customerName: 'Blocked Time',
            notes: form.notes || `Blocked ${days.length} day(s)`,
            isBlockedTime: true,
            duration: 960,
            createdBy: currentUserStaffId || undefined,
          }
          const res = await fetch('/api/appointments/manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          })
          if (!res.ok) failed = true
        }
        if (failed) {
          setFormError('Some days failed to block. Please check the calendar.')
        }
        onCreated()
        onClose()
      } else {
        // Resolve vendorId from selected staff if the prop is missing (e.g. "everyone" view)
        const resolvedVendorId = vendorId || (staffId && [...staffList, ...allStaff].find(s => s.visibleId === staffId)?.vendorId) || ''
        const body = mode === 'block'
          ? { vendorId: resolvedVendorId, staffId: staffId || undefined, dateTime: form.dateTime, customerName: 'Blocked Time', notes: form.notes, isBlockedTime: true, duration, createdBy: currentUserStaffId || undefined }
          : { vendorId: resolvedVendorId, serviceId: serviceId || undefined, staffId: staffId || undefined, staffIds: isMultiProvider ? [staffId, staffId2] : undefined, dateTime: form.dateTime, customerName: `${form.customerFirstName} ${form.customerLastName}`.trim(), customerPhone: form.customerPhone, customerEmail: form.customerEmail, notes: form.notes, createdBy: currentUserStaffId || undefined }

        if (forceConfirmOverlap) {
          body.confirmOverlap = true
        }

        const res = await fetch('/api/appointments/manual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })

        if (res.status === 409) {
          // Overlap conflict detected — show warning and ask for confirmation
          const data = await res.json()
          setOverlapWarning(data.message || 'This overlaps with an existing appointment. Save anyway?')
          setPendingBody(body)
          setSubmitting(false)
          return
        }

        if (res.ok) {
          onCreated()
          onClose()
        } else {
          const data = await res.json()
          setFormError('Failed: ' + (data.error || 'Unknown error'))
        }
      }
    } catch (error) {
      setFormError('Error: ' + (error.message || 'Unknown error'))
    } finally { setSubmitting(false) }
  }

  const handleConfirmOverlap = async () => {
    if (!pendingBody) return
    setSubmitting(true)
    setOverlapWarning(null)
    setFormError(null)
    try {
      const res = await fetch('/api/appointments/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pendingBody, confirmOverlap: true })
      })
      if (res.ok) {
        onCreated()
        onClose()
      } else {
        const data = await res.json()
        setFormError('Failed: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      setFormError('Error: ' + (error.message || 'Unknown error'))
    } finally {
      setSubmitting(false)
      setPendingBody(null)
    }
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

        {/* Date/Time — show datetime-local for appointment & single block, date pickers for multi-day */}
        {mode === 'block' && blockType === 'multiday' ? (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="new-apt-startdate" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Start Date</label>
              <input id="new-apt-startdate" type="date" value={blockStartDate} onChange={(e) => setBlockStartDate(e.target.value)}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="new-apt-enddate" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>End Date</label>
              <input id="new-apt-enddate" type="date" value={blockEndDate} onChange={(e) => setBlockEndDate(e.target.value)}
                min={blockStartDate || ''}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }} />
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="new-apt-datetime" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>{mode === 'block' ? 'Start Date & Time' : 'Date & Time'}</label>
            <input id="new-apt-datetime" type="datetime-local" value={form.dateTime} onChange={(e) => setForm({ ...form, dateTime: e.target.value })}
              style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }} />
          </div>
        )}

        {/* Staff */}
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="new-apt-staff" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>{isMultiProvider ? 'Staff Member 1' : 'Staff Member'}</label>
          <select id="new-apt-staff" value={staffId} onChange={(e) => setStaffId(e.target.value)}
            style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}>
            <option value="">None</option>
            {staffList.map(s => <option key={s.visibleId} value={s.visibleId}>{s.staffName}</option>)}
          </select>
        </div>

        {/* Staff 2 (multi-provider) */}
        {isMultiProvider && (
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="new-apt-staff2" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Staff Member 2</label>
            <select id="new-apt-staff2" value={staffId2} onChange={(e) => setStaffId2(e.target.value)}
              style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}>
              <option value="">Select second staff</option>
              {staffList.filter(s => s.visibleId !== staffId).map(s => <option key={s.visibleId} value={s.visibleId}>{s.staffName}</option>)}
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
                {[...services].sort(compareServicesHeadBathFirst).map(s => <option key={s.serviceId} value={s.serviceId}>{s.name} ({s.duration} min — ${s.price})</option>)}
              </select>
            </div>
            {/* Customer */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <label htmlFor="new-apt-fname" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>First Name</label>
                <input id="new-apt-fname" type="text" value={form.customerFirstName} onChange={(e) => setForm({ ...form, customerFirstName: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label htmlFor="new-apt-lname" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Last Name</label>
                <input id="new-apt-lname" type="text" value={form.customerLastName} onChange={(e) => setForm({ ...form, customerLastName: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }} />
              </div>
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
          <>
            {/* Block type toggle */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button type="button" onClick={() => setBlockType('single')} style={{ flex: 1, padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--color-border)', background: blockType === 'single' ? '#607D8B' : 'white', color: blockType === 'single' ? 'white' : 'var(--color-text)', cursor: 'pointer', fontSize: '0.85rem' }}>
                Single Block
              </button>
              <button type="button" onClick={() => setBlockType('multiday')} style={{ flex: 1, padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--color-border)', background: blockType === 'multiday' ? '#607D8B' : 'white', color: blockType === 'multiday' ? 'white' : 'var(--color-text)', cursor: 'pointer', fontSize: '0.85rem' }}>
                Multi-Day Block
              </button>
            </div>

            {blockType === 'single' ? (
              /* Single block — end time or duration */
              <div style={{ marginBottom: '1rem' }}>
                {/* Toggle between end time and duration entry */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <button type="button" onClick={() => setDurationMode('endtime')} style={{ flex: 1, padding: '0.35rem', borderRadius: '5px', border: '1px solid var(--color-border)', background: durationMode === 'endtime' ? '#607D8B' : 'white', color: durationMode === 'endtime' ? 'white' : 'var(--color-text)', cursor: 'pointer', fontSize: '0.8rem' }}>
                    End Time
                  </button>
                  <button type="button" onClick={() => setDurationMode('duration')} style={{ flex: 1, padding: '0.35rem', borderRadius: '5px', border: '1px solid var(--color-border)', background: durationMode === 'duration' ? '#607D8B' : 'white', color: durationMode === 'duration' ? 'white' : 'var(--color-text)', cursor: 'pointer', fontSize: '0.8rem' }}>
                    Duration
                  </button>
                </div>

                {durationMode === 'endtime' ? (
                  <div>
                    <label htmlFor="new-apt-endtime" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>End Time</label>
                    <input id="new-apt-endtime" type="datetime-local" value={blockEndTime} onChange={(e) => {
                      setBlockEndTime(e.target.value)
                      // Calculate duration from start to end
                      if (form.dateTime && e.target.value) {
                        const startMs = new Date(form.dateTime).getTime()
                        const endMs = new Date(e.target.value).getTime()
                        const diffMin = Math.round((endMs - startMs) / 60000)
                        if (diffMin > 0) setDuration(diffMin)
                      }
                    }}
                    min={form.dateTime || ''}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                    {duration > 0 && form.dateTime && blockEndTime && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', marginTop: '0.25rem' }}>
                        {formatDuration(duration)}
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label htmlFor="new-apt-duration" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Duration</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <div style={{ flex: 1 }}>
                        <input id="new-apt-duration-hours" type="number" min="0" max="23" value={Math.floor(duration / 60)} onChange={(e) => {
                          const hours = Math.max(0, Number(e.target.value))
                          const mins = duration % 60
                          setDuration(hours * 60 + mins)
                        }}
                        style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>hours</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <input id="new-apt-duration-mins" type="number" min="0" max="59" step="15" value={duration % 60} onChange={(e) => {
                          const hours = Math.floor(duration / 60)
                          const mins = Math.max(0, Math.min(59, Number(e.target.value)))
                          setDuration(hours * 60 + mins)
                        }}
                        style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>minutes</span>
                      </div>
                    </div>
                    {duration > 0 && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', marginTop: '0.25rem' }}>
                        Total: {formatDuration(duration)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Multi-day block — dates are shown at the top, just show a note here */
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginBottom: '1rem' }}>
                Blocks the full day (6 AM – 10 PM) for each day in the selected range.
              </p>
            )}
          </>
        )}

        {/* Notes */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label htmlFor="new-apt-notes" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.9rem' }}>Notes</label>
          <input id="new-apt-notes" type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
            style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', boxSizing: 'border-box' }} />
        </div>

        {/* Error Message */}
        {formError && (
          <div style={{ background: '#f8d7da', border: '1px solid #f5c6cb', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', color: '#721c24', fontSize: '0.9rem' }}>
            {formError}
          </div>
        )}

        {/* Overlap Warning (Req 4.6) */}
        {overlapWarning && (
          <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
            <p style={{ margin: 0, fontWeight: '600', color: '#856404' }}>⚠️ Scheduling Conflict</p>
            <p style={{ margin: '0.5rem 0', fontSize: '0.9rem', color: '#856404' }}>{overlapWarning}</p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button
                onClick={handleConfirmOverlap}
                disabled={submitting}
                style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: '#ffc107', color: '#856404', cursor: 'pointer', fontWeight: '500', fontSize: '0.85rem' }}
              >
                Save Anyway
              </button>
              <button
                onClick={() => { setOverlapWarning(null); setPendingBody(null) }}
                style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Submit */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={() => handleSubmit(false)} disabled={submitting} className="cta" style={{ flex: 1, opacity: submitting ? 0.6 : 1 }}>
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
  const [initError, setInitError] = useState(null)
  const [userVendorId, setUserVendorId] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [userStaffId, setUserStaffId] = useState(null)
  const [vendors, setVendors] = useState([])
  const [allStaff, setAllStaff] = useState([])
  const [selectedStaffId, setSelectedStaffId] = useState('everyone')
  const [view, setViewState] = useState(() => {
    try {
      const stored = sessionStorage.getItem('calendarView')
      if (stored && ['day', 'week', 'month'].includes(stored)) {
        return stored
      }
    } catch {
      // sessionStorage unavailable (private browsing) — fall back to default
    }
    return 'week'
  })

  // Wrap setView to persist to sessionStorage
  const setView = (newView) => {
    setViewState(newView)
    try {
      sessionStorage.setItem('calendarView', newView)
    } catch {
      // sessionStorage unavailable (private browsing) — ignore
    }
  }

  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedAppointment, setSelectedAppointment] = useState(null)
  const [startHour, setStartHour] = useState(DEFAULT_START_HOUR)
  const [endHour, setEndHour] = useState(DEFAULT_END_HOUR)
  const [newAppointmentDateTime, setNewAppointmentDateTime] = useState(null)

  // Multi-staff view state
  const [multiStaffAppointments, setMultiStaffAppointments] = useState([])
  const [multiStaffLoading, setMultiStaffLoading] = useState(false)
  const [multiStaffError, setMultiStaffError] = useState(null)
  const [defaultStaffId, setDefaultStaffId] = useState(null)

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
        if (selectedStaffId === 'everyone') loadMultiStaffAppointments()
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
        if (selectedStaffId === 'everyone') loadMultiStaffAppointments()
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
    if (selectedStaffId === 'everyone') loadMultiStaffAppointments()
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

  // Handle day click from MultiStaffWeekView — switch to day view for the clicked date
  const handleDayClick = (date) => {
    setCurrentDate(date)
    setView('day')
  }

  useEffect(() => {
    loadUserVendor()
  }, [])

  const loadUserVendor = async (retryCount = 0) => {
    try {
      // Fetch auth session and staff/vendor data in parallel
      const [session, staffData, vendorData] = await Promise.all([
        fetchAuthSession(),
        fetch('/api/staff-schedules?all=true').then(r => r.json()),
        fetch('/api/vendors').then(r => r.json())
      ])
      const vendorId = session.tokens?.idToken?.payload['custom:vendorId']
      const role = session.tokens?.idToken?.payload['custom:role'] || 'vendor'
      const staffId = session.tokens?.idToken?.payload['custom:staffId'] || session.tokens?.idToken?.payload['sub']
      setUserVendorId(vendorId)
      setUserRole(role)
      setUserStaffId(staffId)
      setInitError(null)

      const staff = (staffData.schedules || []).filter(s => s.isActive !== false)
      setAllStaff(staff)
      setVendors(vendorData.vendors || [])
      setLoading(false)

      // Default to the current user's staff record, or first staff member
      if (!selectedStaffId) {
        const myStaff = vendorId ? staff.find(s => s.vendorId === vendorId) : null
        setSelectedStaffId(myStaff?.visibleId || staff[0]?.visibleId || null)
        // Set userStaffId if we can match a staff record to the current user
        if (myStaff && !userStaffId) {
          setUserStaffId(myStaff.visibleId)
        }
      }
    } catch (error) {
      console.error('Error loading calendar data:', error)
      if (retryCount < 2) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)))
        return loadUserVendor(retryCount + 1)
      }
      setInitError('Failed to load calendar. Please try refreshing the page.')
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedStaffId && selectedStaffId !== 'everyone') {
      loadAppointments()
    }
  }, [selectedStaffId, currentDate, view])

  const loadAppointments = (retryCount = 0) => {
    if (!selectedStaffId || selectedStaffId === 'everyone') return
    setLoading(true)

    const { start, end } = getDateRangeForView(view, currentDate)
    const params = new URLSearchParams({
      staffId: selectedStaffId,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    })

    fetch(`/api/dashboard?${params}`)
      .then(res => {
        if (!res.ok) {
          console.error(`Dashboard staff fetch returned ${res.status} for staffId=${selectedStaffId}`)
          throw new Error(`Server returned ${res.status}`)
        }
        return res.json()
      })
      .then(data => {
        setAppointments(data.appointments || [])
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading appointments:', err)
        if (retryCount < 2) {
          setTimeout(() => loadAppointments(retryCount + 1), 1000 * (retryCount + 1))
        } else {
          setAppointments([])
          setLoading(false)
        }
      })
  }

  // Multi-staff data fetching — fetch appointments for all staff members directly
  // Uses the same staffId-based API path that works for individual staff views
  const loadMultiStaffAppointments = () => {
    if (allStaff.length === 0) return
    fetchAllStaffAppointments()
  }

  const fetchAllStaffAppointments = () => {
    setMultiStaffLoading(true)
    setMultiStaffError(null)

    const effectiveView = (view === 'week') ? 'week' : 'everyone'
    const { start, end } = getDateRangeForView(effectiveView, currentDate)

    // Query each staff member's appointments — same path that works for individual views
    Promise.all(
      allStaff.map(staff => {
        const params = new URLSearchParams({
          staffId: staff.visibleId,
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        })
        return fetch(`/api/dashboard?${params}`)
          .then(res => res.ok ? res.json() : { appointments: [] })
          .then(data => data.appointments || [])
          .catch(() => [])
      })
    )
      .then(results => {
        // Deduplicate by appointmentId
        const seen = new Set()
        const allAppointments = []
        for (const apt of results.flat()) {
          if (!seen.has(apt.appointmentId)) {
            seen.add(apt.appointmentId)
            allAppointments.push(apt)
          }
        }
        setMultiStaffAppointments(allAppointments)
        setMultiStaffLoading(false)
        setMultiStaffError(null)
      })
      .catch(() => {
        setMultiStaffLoading(false)
        setMultiStaffError('Failed to load appointments. Please try again.')
      })
  }

  // Fetch multi-staff appointments when 'everyone' is selected or when date/view changes
  useEffect(() => {
    if (selectedStaffId !== 'everyone') return
    if (allStaff.length === 0) return
    fetchAllStaffAppointments()
  }, [selectedStaffId, view, currentDate, allStaff.length, userVendorId]) // eslint-disable-line react-hooks/exhaustive-deps

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
      if (selectedStaffId === 'everyone') {
        return formatWeekHeaderLabel(dates)
      }
      const start = dates[0]
      const end = dates[6]
      if (start.getMonth() === end.getMonth()) {
        return `${start.toLocaleDateString('en-US', { month: 'long' })} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`
      }
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    }
    return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }, [view, currentDate, selectedStaffId])

  // Time slots for the grid
  const timeSlots = useMemo(() => generateTimeSlots(startHour, endHour), [startHour, endHour])

  if (initError) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#dc3545', marginBottom: '1rem' }}>{initError}</p>
        <button
          onClick={() => { setInitError(null); setLoading(true); loadUserVendor() }}
          style={{ padding: '0.5rem 1.5rem', borderRadius: '8px', border: 'none', background: 'var(--color-primary)', color: 'white', cursor: 'pointer' }}
        >
          Retry
        </button>
      </div>
    )
  }

  if (!userRole || allStaff.length === 0) return <div style={{ padding: '2rem' }}>Loading...</div>

  // Group staff by vendor for the selector
  const resourceStaff = allStaff.filter(s => s.visibleId.startsWith('resource-'))
  const staffByVendor = vendors.reduce((acc, v) => {
    acc[v.vendorId] = allStaff.filter(s => s.vendorId === v.vendorId && !s.visibleId.startsWith('resource-'))
    return acc
  }, {})
  // Staff not belonging to any known vendor
  const knownVendorIds = new Set(vendors.map(v => v.vendorId))
  const ungroupedStaff = allStaff.filter(s => !knownVendorIds.has(s.vendorId) && !s.visibleId.startsWith('resource-'))
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
            value={selectedStaffId || 'everyone'}
            onChange={(e) => setSelectedStaffId(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
          >
            <option value="everyone">Everyone</option>
            {vendors.length > 0 ? (
              <>
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
                {ungroupedStaff.length > 0 && (
                  <optgroup label="Other">
                    {ungroupedStaff.map(s => (
                      <option key={s.visibleId} value={s.visibleId}>{s.staffName}</option>
                    ))}
                  </optgroup>
                )}
                {resourceStaff.length > 0 && (
                  <optgroup label="Resources">
                    {resourceStaff.map(s => (
                      <option key={s.visibleId} value={s.visibleId}>{s.staffName || s.visibleId}</option>
                    ))}
                  </optgroup>
                )}
              </>
            ) : (
              allStaff.map(s => (
                <option key={s.visibleId} value={s.visibleId}>{s.staffName || s.visibleId}</option>
              ))
            )}
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
        {/* Hour range adjuster (day/week/everyone only) */}
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

      {loading && selectedStaffId !== 'everyone' && <p style={{ textAlign: 'center', color: 'var(--color-text-light)' }}>Loading appointments...</p>}

      {/* Multi-staff view loading and error states */}
      {selectedStaffId === 'everyone' && multiStaffLoading && (
        <p style={{ textAlign: 'center', color: 'var(--color-text-light)' }}>Loading appointments...</p>
      )}
      {selectedStaffId === 'everyone' && multiStaffError && !multiStaffLoading && (
        <div style={{ textAlign: 'center', padding: '1.5rem' }}>
          <p style={{ color: '#dc3545', marginBottom: '0.75rem' }}>{multiStaffError}</p>
          <button
            onClick={() => loadMultiStaffAppointments()}
            style={{ padding: '0.5rem 1.5rem', borderRadius: '8px', border: 'none', background: 'var(--color-primary)', color: 'white', cursor: 'pointer', fontWeight: '500' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Multi-Staff (Everyone) View */}
      {selectedStaffId === 'everyone' && view === 'day' && !multiStaffLoading && !multiStaffError && (
        <MultiStaffView
          date={currentDate}
          allStaff={allStaff}
          appointments={multiStaffAppointments}
          startHour={startHour}
          endHour={endHour}
          onAppointmentClick={setSelectedAppointment}
          onSlotClick={(dateTime, staffId) => {
            setNewAppointmentDateTime(dateTime)
            setDefaultStaffId(staffId)
          }}
          vendors={vendors}
          TimeBlockColumn={TimeBlockColumn}
        />
      )}

      {/* Multi-Staff (Everyone) Week View */}
      {selectedStaffId === 'everyone' && view === 'week' && !multiStaffLoading && !multiStaffError && (
        <MultiStaffWeekView
          selectedDate={currentDate}
          allStaff={allStaff}
          appointments={multiStaffAppointments}
          startHour={startHour}
          endHour={endHour}
          onAppointmentClick={setSelectedAppointment}
          onSlotClick={(dateTime) => {
            setNewAppointmentDateTime(dateTime)
          }}
          onDayClick={handleDayClick}
          vendors={vendors}
        />
      )}

      {/* Multi-Staff (Everyone) Month — unavailable */}
      {selectedStaffId === 'everyone' && view === 'month' && !multiStaffLoading && !multiStaffError && (
        <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--color-text-light)' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
            Monthly view is not available for all-staff display.
          </p>
          <p style={{ fontSize: '0.9rem' }}>
            Please select an individual staff member or switch to Day or Week view.
          </p>
        </div>
      )}

      {/* Day View — Time Block */}
      {!loading && view === 'day' && selectedStaffId !== 'everyone' && (
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
      {!loading && view === 'week' && selectedStaffId !== 'everyone' && (
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
      {!loading && view === 'month' && selectedStaffId !== 'everyone' && (
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
          currentUserStaffId={userStaffId}
          userRole={userRole}
        />
      )}

      {/* New Appointment / Block Time / Rebook Modal */}
      {(newAppointmentDateTime || rebookData) && (
        <NewAppointmentModal
          dateTime={rebookData?.dateTime || newAppointmentDateTime}
          vendorId={rebookData?.vendorId || selectedStaffVendorId}
          defaultStaffId={rebookData?.staffId || defaultStaffId || selectedStaffId}
          defaultServiceId={rebookData?.serviceId || ''}
          defaultCustomer={rebookData ? { name: rebookData.customerName, phone: rebookData.customerPhone, email: rebookData.customerEmail } : null}
          onClose={() => { setNewAppointmentDateTime(null); setRebookData(null); setDefaultStaffId(null) }}
          onCreated={() => { loadAppointments(); if (selectedStaffId === 'everyone') loadMultiStaffAppointments() }}
          currentUserStaffId={userStaffId}
        />
      )}
    </div>
  )
}
