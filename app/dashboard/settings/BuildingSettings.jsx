'use client'

import { useState, useEffect } from 'react'
import { generateClient } from 'aws-amplify/data'
import Tooltip from '../../components/Tooltip'

const client = generateClient()

const sectionStyle = {
  background: 'var(--color-accent)', borderRadius: '12px', padding: '2rem', maxWidth: '600px', marginBottom: '2rem'
}
const inputStyle = {
  width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem'
}
const labelStyle = { display: 'block', marginBottom: '0.5rem', fontWeight: '500' }

export default function BuildingSettings({ currentUser, showMessage }) {
  const [globalBlackoutDate, setGlobalBlackoutDate] = useState('')
  const [blackoutLoading, setBlackoutLoading] = useState(false)
  const [kioskPin, setKioskPin] = useState('')
  const [kioskPinSaving, setKioskPinSaving] = useState(false)
  const [kioskPinSet, setKioskPinSet] = useState(false)

  useEffect(() => {
    loadGlobalBlackout()
    loadKioskPin()
  }, [])

  const loadGlobalBlackout = async () => {
    try {
      const res = await fetch(`/api/booking-blackout?vendorId=${currentUser.vendorId}`)
      const data = await res.json()
      setGlobalBlackoutDate(data.globalDisabledUntil ? data.globalDisabledUntil.split('T')[0] : '')
    } catch (error) {
      console.error('Error loading global blackout:', error)
    }
  }

  const loadKioskPin = async () => {
    try {
      const { data: setting } = await client.models.SiteSettings.get({ settingKey: 'kioskPin' })
      setKioskPinSet(!!setting?.settingValue)
    } catch (error) {
      console.error('Error loading kiosk PIN:', error)
    }
  }

  const handleSaveGlobalBlackout = async () => {
    setBlackoutLoading(true)
    try {
      const res = await fetch('/api/booking-blackout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'global',
          disabledUntil: globalBlackoutDate ? new Date(globalBlackoutDate + 'T23:59:59').toISOString() : null,
        })
      })
      if (!res.ok) { showMessage('Error saving global blackout'); return }
      showMessage(globalBlackoutDate ? 'All booking disabled until ' + globalBlackoutDate : 'Global booking re-enabled!')
    } catch (error) {
      showMessage('Error saving global blackout: ' + error.message)
    } finally { setBlackoutLoading(false) }
  }

  const handleSaveKioskPin = async () => {
    if (kioskPin.length < 4) return
    setKioskPinSaving(true)
    try {
      const { data: existing } = await client.models.SiteSettings.get({ settingKey: 'kioskPin' })
      if (existing) {
        await client.models.SiteSettings.update({ settingKey: 'kioskPin', settingValue: kioskPin })
      } else {
        await client.models.SiteSettings.create({ settingKey: 'kioskPin', settingValue: kioskPin })
      }
      setKioskPinSet(true)
      setKioskPin('')
      showMessage('Kiosk PIN saved! Any active kiosk sessions will need to re-enter the new PIN.', 5000)
    } catch (error) {
      showMessage('Error saving kiosk PIN: ' + error.message)
    } finally { setKioskPinSaving(false) }
  }

  return (
    <div>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        Site-wide settings that affect all vendors and the building.
      </p>

      {/* Global Booking Blackout */}
      {currentUser.role === 'admin' && (
        <div style={{ ...sectionStyle, border: '2px solid #dc3545' }}>
          <h2 style={{ marginTop: 0, marginBottom: '1.5rem', color: '#dc3545' }}>Global Booking Blackout<Tooltip text="Disable online booking for ALL vendors site-wide. Use this during Vagaro calendar sync or maintenance windows." /></h2>
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Disable all booking until</label>
            <input type="date" value={globalBlackoutDate} onChange={(e) => setGlobalBlackoutDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]} style={inputStyle} />
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
              {globalBlackoutDate ? `ALL booking disabled until end of ${globalBlackoutDate}` : 'No global blackout — booking is active for all vendors'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button onClick={handleSaveGlobalBlackout} disabled={blackoutLoading} className="cta">
              {blackoutLoading ? 'Saving...' : 'Save Global Blackout'}
            </button>
            {globalBlackoutDate && (
              <button onClick={() => { setGlobalBlackoutDate(''); handleSaveGlobalBlackout() }}
                disabled={blackoutLoading}
                style={{ padding: '0.75rem 1.5rem', background: '#dc3545', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem', fontWeight: '500' }}>
                Re-enable All Booking
              </button>
            )}
          </div>
        </div>
      )}

      {/* Kiosk PIN */}
      {currentUser.role === 'admin' && (
        <div style={sectionStyle}>
          <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Kiosk PIN<Tooltip text="Set a numeric PIN for the checkout kiosk tablet. Staff enter this PIN to access the kiosk — no Cognito account needed." /></h2>
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>PIN Code</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={kioskPin}
              onChange={(e) => setKioskPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter 4-8 digit PIN"
              maxLength={8}
              style={inputStyle}
            />
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
              {kioskPinSet ? 'A kiosk PIN is currently set.' : 'No kiosk PIN set — kiosk is inaccessible.'}
              {' '}Changing the PIN will sign out any active kiosk sessions.
            </p>
          </div>
          <button onClick={handleSaveKioskPin} disabled={kioskPinSaving || kioskPin.length < 4} className="cta"
            style={{ opacity: (kioskPinSaving || kioskPin.length < 4) ? 0.6 : 1 }}>
            {kioskPinSaving ? 'Saving...' : 'Save Kiosk PIN'}
          </button>
        </div>
      )}
    </div>
  )
}
