'use client'

import { useState, useEffect } from 'react'
import Tooltip from '../../components/Tooltip'

const sectionStyle = {
  background: 'var(--color-accent)', borderRadius: '12px', padding: '2rem', maxWidth: '600px', marginBottom: '2rem'
}
const inputStyle = {
  width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem'
}
const labelStyle = { display: 'block', marginBottom: '0.5rem', fontWeight: '500' }

export default function MySettings({ currentUser, showMessage }) {
  const [myStaffSchedule, setMyStaffSchedule] = useState(null)
  const [staffSquareConnected, setStaffSquareConnected] = useState(false)
  const [staffSquareConnectedAt, setStaffSquareConnectedAt] = useState(null)
  const [staffSquareStatus, setStaffSquareStatus] = useState('disconnected')
  const [connectingStaffSquare, setConnectingStaffSquare] = useState(false)
  const [smsAlertsEnabled, setSmsAlertsEnabled] = useState(false)
  const [smsAlertPhone, setSmsAlertPhone] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (currentUser.email && currentUser.vendorId) {
      loadMyStaffSchedule()
    }
  }, [currentUser.email, currentUser.vendorId])

  const loadMyStaffSchedule = async () => {
    try {
      const res = await fetch(`/api/staff-schedules?vendorId=${currentUser.vendorId}`)
      const data = await res.json()
      const mine = (data.schedules || []).find(s => s.staffEmail === currentUser.email)
      if (mine) {
        setMyStaffSchedule(mine)
        setStaffSquareConnected(!!mine.squareAccessToken)
        setStaffSquareConnectedAt(mine.squareConnectedAt)
        setStaffSquareStatus(mine.squareOAuthStatus || 'disconnected')
        setSmsAlertsEnabled(mine.smsAlertsEnabled || false)
        setSmsAlertPhone(mine.smsAlertPhone || '')
      }
    } catch (error) {
      console.error('Error loading staff schedule:', error)
    }
  }

  const handleConnectStaffSquare = () => {
    if (!myStaffSchedule) return
    window.location.href = `/api/square/connect?vendorId=${myStaffSchedule.vendorId}&staffId=${myStaffSchedule.visibleId}`
  }

  const handleDisconnectStaffSquare = async () => {
    if (!myStaffSchedule) return
    if (!confirm('Disconnect your Square account? Customers will need to pay in-person for your services.')) return
    setConnectingStaffSquare(true)
    try {
      const res = await fetch('/api/square/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: myStaffSchedule.visibleId })
      })
      if (!res.ok) {
        const data = await res.json()
        showMessage('Error disconnecting Square: ' + (data.error || 'Unknown error'))
      } else {
        setStaffSquareConnected(false)
        setStaffSquareConnectedAt(null)
        setStaffSquareStatus('disconnected')
        showMessage('Your Square account has been disconnected')
      }
    } catch {
      showMessage('Error disconnecting Square account')
    } finally {
      setConnectingStaffSquare(false)
    }
  }

  const handleSaveSms = async () => {
    if (!myStaffSchedule) return
    setSaving(true)
    try {
      const formattedPhone = smsAlertPhone.replace(/\D/g, '')
      if (smsAlertsEnabled && formattedPhone.length !== 10) {
        showMessage('Please enter a valid 10-digit phone number')
        setSaving(false)
        return
      }
      const res = await fetch('/api/staff-schedules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibleId: myStaffSchedule.visibleId,
          smsAlertsEnabled,
          smsAlertPhone: formattedPhone,
        })
      })
      if (!res.ok) { showMessage('Error saving SMS settings'); return }
      showMessage('SMS settings saved!')
    } catch (error) {
      showMessage('Error saving SMS settings: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        Your personal notification and payment preferences.
      </p>

      {/* SMS Notifications */}
      {myStaffSchedule && (
        <div style={sectionStyle}>
          <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>SMS Notifications<Tooltip text="When enabled, you'll receive a text message when a customer books an appointment assigned to you." /></h2>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={smsAlertsEnabled} onChange={(e) => setSmsAlertsEnabled(e.target.checked)}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
              <span style={{ fontSize: '1.1rem', fontWeight: '500' }}>Enable SMS alerts for my bookings<Tooltip text="You'll get a text for each new booking, confirmation, and cancellation assigned to you." /></span>
            </label>
          </div>
          {smsAlertsEnabled && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={labelStyle}>Phone Number for Alerts</label>
              <input type="tel" value={smsAlertPhone} onChange={(e) => setSmsAlertPhone(e.target.value)}
                placeholder="2403670395" style={inputStyle} />
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
                Enter 10-digit phone number (no dashes or spaces)
              </p>
            </div>
          )}
          <button onClick={handleSaveSms} disabled={saving} className="cta">
            {saving ? 'Saving...' : 'Save SMS Settings'}
          </button>
        </div>
      )}

      {/* Staff Square Payment Integration */}
      {myStaffSchedule && (
        <div style={sectionStyle}>
          <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Your Payment Account<Tooltip text="Connect your own Square account to receive payments directly for services you perform. If not connected, customers will pay in-person." /></h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-light)', marginBottom: '1rem' }}>
            Staff member: <strong>{myStaffSchedule.staffName}</strong>
          </p>

          {staffSquareConnected ? (
            <div>
              <div style={{ padding: '1rem', background: staffSquareStatus === 'error' ? '#f8d7da' : '#d4edda', border: `1px solid ${staffSquareStatus === 'error' ? '#f5c6cb' : '#c3e6cb'}`, borderRadius: '8px', marginBottom: '1rem' }}>
                {staffSquareStatus === 'error' ? (
                  <div>
                    <div style={{ fontWeight: '500', color: '#721c24', marginBottom: '0.5rem' }}>⚠ Square Connection Error</div>
                    <p style={{ fontSize: '0.85rem', color: '#721c24', margin: 0 }}>Your Square connection needs to be refreshed. Please reconnect.</p>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontWeight: '500', color: '#155724', marginBottom: '0.5rem' }}>✓ Your Square Account Connected</div>
                    {staffSquareConnectedAt && (
                      <div style={{ fontSize: '0.85rem', color: '#155724' }}>
                        Connected on {new Date(staffSquareConnectedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                {staffSquareStatus === 'error' && (
                  <button onClick={handleConnectStaffSquare} className="cta">Reconnect Square</button>
                )}
                <button onClick={handleDisconnectStaffSquare} disabled={connectingStaffSquare} style={{
                  padding: '0.75rem 1.5rem', background: '#dc3545', color: 'white', border: 'none',
                  borderRadius: '8px', cursor: 'pointer', fontSize: '1rem', fontWeight: '500'
                }}>
                  {connectingStaffSquare ? 'Disconnecting...' : 'Disconnect Square'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '0.9rem', color: 'var(--color-text-light)', marginBottom: '1rem' }}>
                Connect your Square account so customers can pay you directly online. Without this, customers will pay in-person.
              </p>
              <button onClick={handleConnectStaffSquare} className="cta">Connect with Square</button>
            </div>
          )}
        </div>
      )}

      {!myStaffSchedule && (
        <div style={sectionStyle}>
          <p style={{ color: 'var(--color-text-light)', margin: 0 }}>
            No staff profile found for your account. Ask an admin to add you as a staff member to configure your personal settings.
          </p>
        </div>
      )}
    </div>
  )
}
