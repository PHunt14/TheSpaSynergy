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

function SquareStatusBanner({ status, connectedAt, expired }) {
  if (status === 'error') {
    return (
      <div style={{ padding: '1rem', background: '#f8d7da', border: '1px solid #f5c6cb', borderRadius: '8px', marginBottom: '1rem' }}>
        <div style={{ fontWeight: '500', color: '#721c24', marginBottom: '0.5rem' }}>⚠ Square Connection Error</div>
        <p style={{ fontSize: '0.85rem', color: '#721c24', margin: 0 }}>Your Square connection needs to be refreshed. Please reconnect.</p>
      </div>
    )
  }
  // Token expired: card payments still auto-recover at charge time, but reconnecting
  // is recommended so there's no risk of a failed charge. Show an amber warning
  // instead of the misleading green "Connected".
  if (expired) {
    return (
      <div style={{ padding: '1rem', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px', marginBottom: '1rem' }}>
        <div style={{ fontWeight: '500', color: '#856404', marginBottom: '0.5rem' }}>⚠ Reconnect recommended</div>
        <p style={{ fontSize: '0.85rem', color: '#856404', margin: 0 }}>
          Your Square access token has expired. Card payments may still go through, but please
          reconnect to keep them reliable.
        </p>
        {connectedAt && (
          <div style={{ fontSize: '0.8rem', color: '#856404', marginTop: '0.5rem' }}>
            Last connected {new Date(connectedAt).toLocaleDateString()}
          </div>
        )}
      </div>
    )
  }
  return (
    <div style={{ padding: '1rem', background: '#d4edda', border: '1px solid #c3e6cb', borderRadius: '8px', marginBottom: '1rem' }}>
      <div style={{ fontWeight: '500', color: '#155724', marginBottom: '0.5rem' }}>✓ Your Square Account Connected</div>
      {connectedAt && (
        <div style={{ fontSize: '0.85rem', color: '#155724' }}>
          Connected on {new Date(connectedAt).toLocaleDateString()}
        </div>
      )}
    </div>
  )
}

function BookingAvailabilityStatus({ bookingDisabledUntil }) {
  if (bookingDisabledUntil && new Date(bookingDisabledUntil) > new Date()) {
    return (
      <div style={{ padding: '1rem', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px', marginBottom: '1.5rem' }}>
        <div style={{ fontWeight: '500', color: '#856404', marginBottom: '0.5rem' }}>⏸ Online booking is paused</div>
        <p style={{ fontSize: '0.9rem', color: '#856404', margin: 0 }}>
          New clients cannot book your services online until <strong>{new Date(bookingDisabledUntil).toLocaleDateString()}</strong>.
        </p>
      </div>
    )
  }
  return (
    <div style={{ padding: '1rem', background: '#d4edda', border: '1px solid #c3e6cb', borderRadius: '8px', marginBottom: '1.5rem' }}>
      <div style={{ fontWeight: '500', color: '#155724' }}>✓ Online booking is active</div>
    </div>
  )
}

export default function MySettings({ currentUser, showMessage }) {
  const [myStaffSchedule, setMyStaffSchedule] = useState(null)
  const [staffSquareConnected, setStaffSquareConnected] = useState(false)
  const [staffSquareConnectedAt, setStaffSquareConnectedAt] = useState(null)
  const [staffSquareStatus, setStaffSquareStatus] = useState('disconnected')
  const [staffSquareExpiresAt, setStaffSquareExpiresAt] = useState(null)
  const [connectingStaffSquare, setConnectingStaffSquare] = useState(false)
  const [smsAlertsEnabled, setSmsAlertsEnabled] = useState(false)
  const [smsAlertPhone, setSmsAlertPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [bookingDisabledUntil, setBookingDisabledUntil] = useState('')
  const [savingBlackout, setSavingBlackout] = useState(false)

  useEffect(() => {
    if (currentUser.email && currentUser.vendorId) {
      loadMyStaffSchedule()
    }
  }, [currentUser.email, currentUser.vendorId])

  const loadMyStaffSchedule = async () => {
    try {
      const res = await fetch(`/api/staff-schedules?vendorId=${currentUser.vendorId}`)
      const data = await res.json()
      const mine = (data.schedules || []).find(s => s.staffEmail?.toLowerCase() === currentUser.email?.toLowerCase())
      if (mine) {
        setMyStaffSchedule(mine)
        setStaffSquareConnected(!!mine.squareAccessToken)
        setStaffSquareConnectedAt(mine.squareConnectedAt)
        setStaffSquareStatus(mine.squareOAuthStatus || 'disconnected')
        setStaffSquareExpiresAt(mine.squareTokenExpiresAt || null)
        setSmsAlertsEnabled(mine.smsAlertsEnabled || false)
        setSmsAlertPhone(mine.smsAlertPhone || '')
        setBookingDisabledUntil(mine.bookingDisabledUntil || '')
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
        setStaffSquareExpiresAt(null)
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

  const handleSyncCatalog = async () => {
    if (!myStaffSchedule) return
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/square/catalog-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: myStaffSchedule.visibleId })
      })
      const data = await res.json()
      if (!res.ok) {
        showMessage('Error syncing: ' + (data.error || 'Unknown error'))
        return
      }
      setSyncResult(data)
      showMessage(`Synced ${data.synced} services to Square (${data.created} new, ${data.updated} updated)`)
    } catch (error) {
      showMessage('Error syncing: ' + (error.message || 'Unknown error'))
    } finally {
      setSyncing(false)
    }
  }

  const handleSaveBlackout = async () => {
    if (!myStaffSchedule) return
    setSavingBlackout(true)
    try {
      const res = await fetch('/api/staff-schedules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibleId: myStaffSchedule.visibleId,
          bookingDisabledUntil: bookingDisabledUntil || null,
        })
      })
      if (!res.ok) { showMessage('Error saving booking availability'); return }
      showMessage(bookingDisabledUntil ? 'Online booking paused until ' + new Date(bookingDisabledUntil).toLocaleDateString() : 'Online booking re-enabled!')
    } catch (error) {
      showMessage('Error: ' + error.message)
    } finally {
      setSavingBlackout(false)
    }
  }

  const handleClearBlackout = async () => {
    setBookingDisabledUntil('')
    if (!myStaffSchedule) return
    setSavingBlackout(true)
    try {
      await fetch('/api/staff-schedules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibleId: myStaffSchedule.visibleId,
          bookingDisabledUntil: null,
        })
      })
      showMessage('Online booking re-enabled!')
    } catch (error) {
      showMessage('Error: ' + error.message)
    } finally {
      setSavingBlackout(false)
    }
  }

  // The stored access token is expired when its expiry is in the past (or missing).
  // Card payments can still auto-recover at charge time via refresh, but we surface
  // an amber "reconnect recommended" banner so this staff member knows to reconnect.
  const squareTokenIsExpired = staffSquareConnected && staffSquareStatus !== 'error' && (
    !staffSquareExpiresAt || new Date(staffSquareExpiresAt).getTime() < Date.now()
  )

  return (
    <div>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        Your personal notification and payment preferences.
      </p>

      {/* Booking Availability */}
      {myStaffSchedule && (
        <div style={sectionStyle}>
          <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Booking Availability<Tooltip text="Pause online booking for your services. Clients won't be able to book you online until the date you set. Existing appointments are not affected." /></h2>

          <BookingAvailabilityStatus bookingDisabledUntil={bookingDisabledUntil} />

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>Pause booking until</label>
            <input
              type="date"
              value={bookingDisabledUntil ? bookingDisabledUntil.split('T')[0] : ''}
              onChange={(e) => setBookingDisabledUntil(e.target.value ? e.target.value + 'T23:59:59' : '')}
              min={new Date().toISOString().split('T')[0]}
              style={inputStyle}
            />
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
              Select a date to pause online booking until. Existing appointments won&apos;t be affected.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button onClick={handleSaveBlackout} disabled={savingBlackout || !bookingDisabledUntil} className="cta" style={{ opacity: savingBlackout || !bookingDisabledUntil ? 0.6 : 1 }}>
              {savingBlackout ? 'Saving...' : 'Pause Booking'}
            </button>
            {bookingDisabledUntil && (
              <button onClick={handleClearBlackout} disabled={savingBlackout} style={{
                padding: '0.75rem 1.5rem', background: 'white', border: '1px solid var(--color-border)',
                borderRadius: '8px', cursor: 'pointer', fontSize: '1rem', fontWeight: '500'
              }}>
                Re-enable Booking
              </button>
            )}
          </div>
        </div>
      )}

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
              <SquareStatusBanner status={staffSquareStatus} connectedAt={staffSquareConnectedAt} expired={squareTokenIsExpired} />
              <div style={{ display: 'flex', gap: '1rem' }}>
                {(staffSquareStatus === 'error' || squareTokenIsExpired) && (
                  <button onClick={handleConnectStaffSquare} className="cta">Reconnect Square</button>
                )}
                <button onClick={handleDisconnectStaffSquare} disabled={connectingStaffSquare} style={{
                  padding: '0.75rem 1.5rem', background: '#dc3545', color: 'white', border: 'none',
                  borderRadius: '8px', cursor: 'pointer', fontSize: '1rem', fontWeight: '500'
                }}>
                  {connectingStaffSquare ? 'Disconnecting...' : 'Disconnect Square'}
                </button>
              </div>

              {/* Sync Services to Square */}
              <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border)' }}>
                <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem' }}>Sync Services to Square<Tooltip text="Pushes your assigned services into your Square catalog so charges show with service names and you can use them on your Square POS app." /></h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginBottom: '1rem' }}>
                  Creates or updates your services in Square so payments show service names in your Square Dashboard and POS app.
                </p>
                <button onClick={handleSyncCatalog} disabled={syncing} className="cta" style={{ fontSize: '0.95rem' }}>
                  {syncing ? 'Syncing...' : 'Sync Services to Square'}
                </button>
                {syncResult && (
                  <p style={{ fontSize: '0.85rem', color: '#155724', marginTop: '0.75rem' }}>
                    ✓ {syncResult.synced} services synced ({syncResult.created} new, {syncResult.updated} updated)
                  </p>
                )}
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
