'use client'

import { useState, useEffect } from 'react'
import { fetchAuthSession } from 'aws-amplify/auth'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DAY_LABELS = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' }

const emptySchedule = () => DAYS.reduce((acc, d) => ({ ...acc, [d]: { start: null, end: null } }), {})

const inputStyle = { padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.95rem' }
const btnStyle = (bg) => ({ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: bg, color: 'white', cursor: 'pointer', fontSize: '0.85rem' })

export default function Staff() {
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [role, setRole] = useState('vendor')
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [vendors, setVendors] = useState([])
  const [selectedVendor, setSelectedVendor] = useState('')
  const [currentUserRole, setCurrentUserRole] = useState(null)
  const [currentUserVendorId, setCurrentUserVendorId] = useState(null)
  const [currentUserEmail, setCurrentUserEmail] = useState(null)
  const [editingUser, setEditingUser] = useState(null)

  // Staff schedules
  const [schedules, setSchedules] = useState([])
  const [loadingSchedules, setLoadingSchedules] = useState(true)
  const [editingSchedule, setEditingSchedule] = useState(null) // visibleId or 'new'
  const [scheduleForm, setScheduleForm] = useState({ staffName: '', staffEmail: '', vendorId: '', schedule: emptySchedule(), autoAssignDays: [], smsAlertsEnabled: false, smsAlertPhone: '', emailAlertsEnabled: false })
  const [savingSchedule, setSavingSchedule] = useState(false)

  useEffect(() => {
    initStaff()
  }, [])

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/staff')
      const data = await res.json()
      setUsers(data.users || [])
    } catch (error) { console.error('Error loading users:', error) }
  }

  const initStaff = async () => {
    try {
      const [session, vendorRes, staffRes] = await Promise.all([
        fetchAuthSession(),
        fetch('/api/vendors').then(r => r.json()),
        fetch('/api/staff').then(r => r.json())
      ])
      const vendorId = session.tokens?.idToken?.payload['custom:vendorId']
      const role = session.tokens?.idToken?.payload['custom:role'] || 'vendor'
      const email = session.tokens?.idToken?.payload['email']
      setCurrentUserRole(role)
      setCurrentUserVendorId(vendorId)
      setCurrentUserEmail(email)

      const list = vendorRes.vendors || []
      setVendors(list)
      setUsers(staffRes.users || [])
      setLoadingUsers(false)

      if (role === 'vendor' && vendorId) {
        setSelectedVendor(vendorId)
      } else if (!selectedVendor && list.length > 0) {
        setSelectedVendor(vendorId || list[0].vendorId)
      }
    } catch (error) {
      console.error('Error initializing staff:', error)
      setLoadingUsers(false)
    }
  }

  useEffect(() => {
    if (vendors.length > 0) loadSchedules()
  }, [vendors, currentUserVendorId])

  const loadSchedules = async () => {
    try {
      const url = currentUserRole === 'vendor' && currentUserVendorId
        ? `/api/staff-schedules?vendorId=${currentUserVendorId}`
        : '/api/staff-schedules'
      const res = await fetch(url)
      const data = await res.json()
      setSchedules(data.schedules || [])
    } catch (error) { console.error('Error loading schedules:', error) }
    finally { setLoadingSchedules(false) }
  }

  // --- User management handlers (unchanged) ---
  const handleInvite = async (e) => {
    e.preventDefault()
    if (!email) return
    const vendorId = currentUserRole === 'vendor' ? currentUserVendorId : selectedVendor
    setLoading(true)
    try {
      const res = await fetch('/api/staff', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, firstName, lastName, vendorId, role })
      })
      const data = await res.json()
      if (res.ok) { alert(data.message); setEmail(''); setFirstName(''); setLastName(''); loadUsers() }
      else alert('Error: ' + data.error)
    } catch (error) { alert('Failed to invite user') }
    finally { setLoading(false) }
  }

  const handleUpdate = async (username, newRole, newVendorId, newFirstName, newLastName) => {
    try {
      const res = await fetch('/api/staff', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, role: newRole, vendorId: newVendorId, firstName: newFirstName, lastName: newLastName })
      })
      if (res.ok) { alert('User updated'); setEditingUser(null); loadUsers() }
      else alert('Failed to update user')
    } catch (error) { alert('Error updating user') }
  }

  const handleDelete = async (username, email) => {
    if (!confirm(`Delete user ${email}?`)) return
    try {
      const res = await fetch(`/api/staff?username=${username}`, { method: 'DELETE' })
      if (res.ok) { alert('User deleted'); loadUsers() } else alert('Failed to delete user')
    } catch (error) { alert('Error deleting user') }
  }

  // --- Schedule management handlers ---
  const startNewSchedule = () => {
    const vendorId = currentUserRole === 'vendor' ? currentUserVendorId : (vendors[0]?.vendorId || '')
    setScheduleForm({ staffName: '', staffEmail: '', vendorId, schedule: emptySchedule(), autoAssignDays: [], smsAlertsEnabled: false, smsAlertPhone: '', emailAlertsEnabled: false })
    setEditingSchedule('new')
  }

  const startEditSchedule = (s) => {
    const schedule = typeof s.schedule === 'string' ? JSON.parse(s.schedule) : (s.schedule || emptySchedule())
    const rules = s.autoAssignRules ? (typeof s.autoAssignRules === 'string' ? JSON.parse(s.autoAssignRules) : s.autoAssignRules) : []
    const autoAssignDays = rules.length > 0 && rules[0].days ? rules[0].days : []
    setScheduleForm({ staffName: s.staffName || '', staffEmail: s.staffEmail || '', vendorId: s.vendorId, schedule, autoAssignDays, smsAlertsEnabled: s.smsAlertsEnabled || false, smsAlertPhone: s.smsAlertPhone || '', emailAlertsEnabled: s.emailAlertsEnabled || false })
    setEditingSchedule(s.visibleId)
  }

  const updateDay = (day, field, value) => {
    setScheduleForm(prev => ({
      ...prev,
      schedule: { ...prev.schedule, [day]: { ...prev.schedule[day], [field]: value || null } }
    }))
  }

  const toggleDayOff = (day) => {
    setScheduleForm(prev => {
      const current = prev.schedule[day]
      const isOff = !current?.start
      return {
        ...prev,
        schedule: { ...prev.schedule, [day]: isOff ? { start: '09:00', end: '17:00' } : { start: null, end: null } }
      }
    })
  }

  const toggleAutoAssign = (day) => {
    setScheduleForm(prev => {
      const days = prev.autoAssignDays.includes(day)
        ? prev.autoAssignDays.filter(d => d !== day)
        : [...prev.autoAssignDays, day]
      return { ...prev, autoAssignDays: days }
    })
  }

  const saveSchedule = async () => {
    if (!scheduleForm.staffName || !scheduleForm.vendorId) { alert('Name and vendor required'); return }
    setSavingSchedule(true)
    const autoAssignRules = scheduleForm.autoAssignDays.length > 0
      ? [{ days: scheduleForm.autoAssignDays, action: 'auto-assign', vendorId: scheduleForm.vendorId }]
      : null

    if (scheduleForm.smsAlertsEnabled && scheduleForm.smsAlertPhone.replace(/\D/g, '').length !== 10) {
      alert('Please enter a valid 10-digit phone number for SMS alerts'); setSavingSchedule(false); return
    }
    if (scheduleForm.emailAlertsEnabled && !scheduleForm.staffEmail) {
      alert('Email address is required to enable email alerts'); setSavingSchedule(false); return
    }

    try {
      const isNew = editingSchedule === 'new'
      const res = await fetch('/api/staff-schedules', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isNew ? {} : { visibleId: editingSchedule }),
          staffName: scheduleForm.staffName,
          staffEmail: scheduleForm.staffEmail,
          vendorId: scheduleForm.vendorId,
          schedule: scheduleForm.schedule,
          autoAssignRules,
          smsAlertsEnabled: scheduleForm.smsAlertsEnabled,
          smsAlertPhone: scheduleForm.smsAlertPhone.replace(/\D/g, ''),
          emailAlertsEnabled: scheduleForm.emailAlertsEnabled,
        })
      })
      if (res.ok) { setEditingSchedule(null); loadSchedules() }
      else alert('Failed to save schedule')
    } catch (error) { alert('Error saving schedule') }
    finally { setSavingSchedule(false) }
  }

  const deleteSchedule = async (visibleId, name) => {
    if (!confirm(`Delete schedule for ${name}?`)) return
    try {
      const res = await fetch(`/api/staff-schedules?visibleId=${visibleId}`, { method: 'DELETE' })
      if (res.ok) loadSchedules()
      else alert('Failed to delete')
    } catch (error) { alert('Error deleting schedule') }
  }

  const getVendorName = (vendorId) => vendors.find(v => v.vendorId === vendorId)?.name || vendorId

  const formatScheduleDisplay = (s) => {
    const schedule = typeof s.schedule === 'string' ? JSON.parse(s.schedule) : (s.schedule || {})
    return DAYS.filter(d => schedule[d]?.start).map(d => {
      const h = schedule[d]
      const rec = h.recurrence ? ` (${h.recurrence})` : ''
      return `${DAY_LABELS[d]} ${h.start}–${h.end}${rec}`
    }).join(', ') || 'No hours set'
  }

  // --- Render ---
  return (
    <div>
      <h1>Staff & Schedule Management</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        Manage dashboard users and staff working schedules.
      </p>

      {/* ===== INVITE USER ===== */}
      <div style={{ background: 'var(--color-accent)', padding: '2rem', borderRadius: '8px', marginBottom: '2rem', maxWidth: '500px' }}>
        <h3>Invite New User</h3>
        <form onSubmit={handleInvite}>
          {currentUserRole === 'admin' && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Role *</label>
                <select value={role} onChange={(e) => setRole(e.target.value)} required style={{ width: '100%', ...inputStyle }}>
                  <option value="vendor">Vendor (Vendor Access)</option>
                  <option value="owner">Owner (Vendor Access + Square)</option>
                  <option value="admin">Admin (All Vendors)</option>
                </select>
              </div>
              {(role === 'vendor' || role === 'owner') && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem' }}>Assign to Vendor *</label>
                  <select value={selectedVendor} onChange={(e) => setSelectedVendor(e.target.value)} required style={{ width: '100%', ...inputStyle }}>
                    {vendors.map(v => <option key={v.vendorId} value={v.vendorId}>{v.name}</option>)}
                  </select>
                </div>
              )}
            </>
          )}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>First Name</label>
            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" style={{ width: '100%', ...inputStyle }} />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Last Name</label>
            <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" style={{ width: '100%', ...inputStyle }} />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Email Address *</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" style={{ width: '100%', ...inputStyle }} />
          </div>
          <button type="submit" disabled={loading} className="cta" style={{ width: '100%' }}>
            {loading ? 'Sending Invitation...' : 'Invite User'}
          </button>
        </form>
      </div>

      {/* ===== CURRENT USERS TABLE ===== */}
      <div style={{ marginBottom: '3rem' }}>
        <h3>Current Users</h3>
        {loadingUsers && <p>Loading users...</p>}
        {!loadingUsers && users.length === 0 && <p style={{ color: 'var(--color-text-light)' }}>No users found.</p>}
        {!loadingUsers && users.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--color-accent)', borderRadius: '8px', overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: 'var(--color-primary)', color: 'white' }}>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Name</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Email</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Role</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Vendor</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.username} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '1rem' }}>
                      {editingUser === user.username ? (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input type="text" defaultValue={user.firstName || ''} placeholder="First" onChange={(e) => user.editFirstName = e.target.value} style={{ ...inputStyle, flex: 1 }} />
                          <input type="text" defaultValue={user.lastName || ''} placeholder="Last" onChange={(e) => user.editLastName = e.target.value} style={{ ...inputStyle, flex: 1 }} />
                        </div>
                      ) : (
                        user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '-'
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>{user.email}</td>
                    <td style={{ padding: '1rem' }}>
                      {editingUser === user.username && (currentUserRole !== 'vendor' || user.email === currentUserEmail) ? (
                        <select defaultValue={user.role} onChange={(e) => user.editRole = e.target.value} disabled={currentUserRole === 'vendor'} style={inputStyle}>
                          <option value="vendor">Vendor</option>
                          <option value="owner">Owner</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <span style={{ padding: '0.25rem 0.75rem', borderRadius: '12px', fontSize: '0.85rem', background: user.role === 'admin' ? '#2196F3' : user.role === 'owner' ? '#9C27B0' : '#4CAF50', color: 'white' }}>
                          {user.role}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {editingUser === user.username && (currentUserRole !== 'vendor' || user.email === currentUserEmail) ? (
                        <select defaultValue={user.vendorId || ''} onChange={(e) => user.editVendorId = e.target.value} disabled={currentUserRole === 'vendor'} style={inputStyle}>
                          <option value="">All</option>
                          {vendors.map(v => <option key={v.vendorId} value={v.vendorId}>{v.name}</option>)}
                        </select>
                      ) : (
                        user.vendorId ? getVendorName(user.vendorId) : 'All'
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ padding: '0.25rem 0.75rem', borderRadius: '12px', fontSize: '0.85rem', background: user.status === 'CONFIRMED' ? '#4CAF50' : '#FF9800', color: 'white' }}>
                        {user.status}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', display: 'flex', gap: '0.5rem' }}>
                      {editingUser === user.username ? (
                        <>
                          <button onClick={() => handleUpdate(user.username, user.editRole || user.role, user.editVendorId || user.vendorId, user.editFirstName !== undefined ? user.editFirstName : user.firstName, user.editLastName !== undefined ? user.editLastName : user.lastName)} style={btnStyle('#4CAF50')}>Save</button>
                          <button onClick={() => setEditingUser(null)} style={btnStyle('#999')}>Cancel</button>
                        </>
                      ) : (
                        <>
                          {(currentUserRole !== 'vendor' || user.email === currentUserEmail) && (
                            <button onClick={() => setEditingUser(user.username)} style={btnStyle('#2196F3')}>Edit</button>
                          )}
                          {currentUserRole === 'admin' && (
                            <button onClick={() => handleDelete(user.username, user.email)} style={btnStyle('#F44336')}>Delete</button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== STAFF SCHEDULES ===== */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2>Staff Schedules</h2>
          {editingSchedule === null && (
            <button onClick={startNewSchedule} className="cta" style={{ marginTop: 0 }}>+ Add Staff Schedule</button>
          )}
        </div>

        {/* Schedule editor */}
        {editingSchedule !== null && (
          <div style={{ background: 'var(--color-accent)', padding: '2rem', borderRadius: '12px', marginBottom: '2rem' }}>
            <h3>{editingSchedule === 'new' ? 'New Staff Schedule' : 'Edit Schedule'}</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem', maxWidth: '500px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Staff Name *</label>
                <input type="text" value={scheduleForm.staffName} onChange={(e) => setScheduleForm(p => ({ ...p, staffName: e.target.value }))} style={{ width: '100%', ...inputStyle }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Email</label>
                <input type="email" value={scheduleForm.staffEmail} onChange={(e) => setScheduleForm(p => ({ ...p, staffEmail: e.target.value }))} style={{ width: '100%', ...inputStyle }} />
              </div>
            </div>

            {currentUserRole === 'admin' && (
              <div style={{ marginBottom: '1.5rem', maxWidth: '250px' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Vendor *</label>
                <select value={scheduleForm.vendorId} onChange={(e) => setScheduleForm(p => ({ ...p, vendorId: e.target.value }))} style={{ width: '100%', ...inputStyle }}>
                  {vendors.map(v => <option key={v.vendorId} value={v.vendorId}>{v.name}</option>)}
                </select>
              </div>
            )}

            <h4 style={{ marginBottom: '0.75rem' }}>Notifications</h4>
            <div style={{ marginBottom: '1.5rem', maxWidth: '500px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.75rem' }}>
                <input type="checkbox" checked={scheduleForm.emailAlertsEnabled} onChange={(e) => setScheduleForm(p => ({ ...p, emailAlertsEnabled: e.target.checked }))} style={{ width: '18px', height: '18px' }} />
                <span style={{ fontWeight: 500 }}>Email alerts for new bookings</span>
              </label>
              {scheduleForm.emailAlertsEnabled && !scheduleForm.staffEmail && (
                <p style={{ fontSize: '0.85rem', color: '#c33', margin: '0 0 0.75rem 0' }}>⚠ Enter an email address above to receive email alerts.</p>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.5rem' }}>
                <input type="checkbox" checked={scheduleForm.smsAlertsEnabled} onChange={(e) => setScheduleForm(p => ({ ...p, smsAlertsEnabled: e.target.checked }))} style={{ width: '18px', height: '18px' }} />
                <span style={{ fontWeight: 500 }}>SMS alerts for new bookings</span>
              </label>
              {scheduleForm.smsAlertsEnabled && (
                <div style={{ marginLeft: '1.75rem' }}>
                  <input type="tel" value={scheduleForm.smsAlertPhone} onChange={(e) => setScheduleForm(p => ({ ...p, smsAlertPhone: e.target.value }))} placeholder="2403670395" style={{ width: '100%', ...inputStyle }} />
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.25rem' }}>10-digit phone number (no dashes or spaces)</p>
                </div>
              )}
            </div>

            <h4 style={{ marginBottom: '0.75rem' }}>Working Hours</h4>
            <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {DAYS.map(day => {
                const dayData = scheduleForm.schedule[day] || {}
                const isWorking = !!dayData.start
                return (
                  <div key={day} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: isWorking ? 'white' : '#f5f5f5', borderRadius: '8px' }}>
                    <span style={{ width: '40px', fontWeight: 600, fontSize: '0.9rem' }}>{DAY_LABELS[day]}</span>
                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <input type="checkbox" checked={isWorking} onChange={() => toggleDayOff(day)} />
                    </label>
                    {isWorking ? (
                      <>
                        <input type="time" value={dayData.start || ''} onChange={(e) => updateDay(day, 'start', e.target.value)} style={{ ...inputStyle, width: '130px' }} />
                        <span>to</span>
                        <input type="time" value={dayData.end || ''} onChange={(e) => updateDay(day, 'end', e.target.value)} style={{ ...inputStyle, width: '130px' }} />
                      </>
                    ) : (
                      <span style={{ color: '#999', fontSize: '0.9rem' }}>Off</span>
                    )}
                  </div>
                )
              })}
            </div>

            <h4 style={{ marginBottom: '0.5rem' }}>Auto-Assign Days</h4>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-light)', marginBottom: '0.75rem' }}>
              Bookings on selected days will automatically be assigned to this staff member.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
              {DAYS.map(day => {
                const isSelected = scheduleForm.autoAssignDays.includes(day)
                return (
                  <button key={day} type="button" onClick={() => toggleAutoAssign(day)} style={{
                    padding: '0.4rem 0.8rem', borderRadius: '20px', border: '2px solid',
                    borderColor: isSelected ? 'var(--color-primary-dark)' : 'var(--color-border)',
                    background: isSelected ? 'var(--color-primary-dark)' : 'white',
                    color: isSelected ? 'white' : 'var(--color-text)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600
                  }}>
                    {DAY_LABELS[day]}
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={saveSchedule} disabled={savingSchedule} className="cta" style={{ marginTop: 0 }}>
                {savingSchedule ? 'Saving...' : 'Save Schedule'}
              </button>
              <button onClick={() => setEditingSchedule(null)} style={{ ...btnStyle('#999'), padding: '0.75rem 1.5rem' }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Schedule list */}
        {loadingSchedules && <p>Loading schedules...</p>}
        {!loadingSchedules && schedules.length === 0 && editingSchedule === null && (
          <p style={{ color: 'var(--color-text-light)' }}>No staff schedules configured yet.</p>
        )}
        {!loadingSchedules && schedules.length > 0 && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {schedules.map(s => {
              const rules = s.autoAssignRules ? (typeof s.autoAssignRules === 'string' ? JSON.parse(s.autoAssignRules) : s.autoAssignRules) : []
              const autoAssignDays = rules.length > 0 && rules[0].days ? rules[0].days : []
              return (
                <div key={s.visibleId} style={{ background: 'var(--color-accent)', padding: '1.25rem', borderRadius: '10px', border: s.isActive === false ? '2px solid #ccc' : '2px solid var(--color-primary)', opacity: s.isActive === false ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{s.staffName}</div>
                      <div style={{ fontSize: '0.9rem', color: 'var(--color-text-light)' }}>{getVendorName(s.vendorId)}</div>
                      {s.staffEmail && <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>{s.staffEmail}</div>}
                      {(s.emailAlertsEnabled || s.smsAlertsEnabled) && (
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                          {s.emailAlertsEnabled && <span style={{ fontSize: '0.8rem', background: '#d4edda', color: '#155724', padding: '0.15rem 0.5rem', borderRadius: '10px' }}>📧 Email</span>}
                          {s.smsAlertsEnabled && <span style={{ fontSize: '0.8rem', background: '#d4edda', color: '#155724', padding: '0.15rem 0.5rem', borderRadius: '10px' }}>📱 SMS</span>}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => startEditSchedule(s)} style={btnStyle('#2196F3')}>Edit</button>
                      <button onClick={() => deleteSchedule(s.visibleId, s.staffName)} style={btnStyle('#F44336')}>Delete</button>
                    </div>
                  </div>
                  <div style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>{formatScheduleDisplay(s)}</div>
                  {autoAssignDays.length > 0 && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                      <span style={{ fontWeight: 600 }}>Auto-assign:</span>{' '}
                      {autoAssignDays.map(d => DAY_LABELS[d]).join(', ')}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
