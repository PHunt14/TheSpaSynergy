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

export default function VendorSettings({ currentUser, vendors, selectedVendorId, setSelectedVendorId, showMessage }) {
  const [saving, setSaving] = useState(false)
  const [squareConnected, setSquareConnected] = useState(false)
  const [squareConnectedAt, setSquareConnectedAt] = useState(null)
  const [squareOAuthStatus, setSquareOAuthStatus] = useState('disconnected')
  const [connectingSquare, setConnectingSquare] = useState(false)

  const [vendorName, setVendorName] = useState('')
  const [vendorEmail, setVendorEmail] = useState('')
  const [vendorPhone, setVendorPhone] = useState('')
  const [vendorDescription, setVendorDescription] = useState('')

  const [socialFacebook, setSocialFacebook] = useState('')
  const [socialInstagram, setSocialInstagram] = useState('')
  const [socialTiktok, setSocialTiktok] = useState('')
  const [socialWebsite, setSocialWebsite] = useState('')
  const [googlePlaceId, setGooglePlaceId] = useState('')

  const [vendorBlackoutDate, setVendorBlackoutDate] = useState('')
  const [blackoutLoading, setBlackoutLoading] = useState(false)

  useEffect(() => {
    if (selectedVendorId) {
      loadVendorSettings(selectedVendorId)
      loadBlackoutSettings(selectedVendorId)
    }
  }, [selectedVendorId])

  const loadVendorSettings = async (vendorId) => {
    try {
      const { data: v } = await client.models.Vendor.get({ vendorId })
      if (v) {
        setSquareConnected(!!v.squareAccessToken)
        setSquareConnectedAt(v.squareConnectedAt)
        setSquareOAuthStatus(v.squareOAuthStatus || (v.squareAccessToken ? 'connected' : 'disconnected'))
        setVendorName(v.name || '')
        setVendorEmail(v.email || '')
        setVendorPhone(v.phone || '')
        setVendorDescription(v.description || '')
        setSocialFacebook(v.socialFacebook || '')
        setSocialInstagram(v.socialInstagram || '')
        setSocialTiktok(v.socialTiktok || '')
        setSocialWebsite(v.socialWebsite || '')
        setGooglePlaceId(v.googlePlaceId || '')
      }
    } catch (error) {
      console.error('Error loading vendor settings:', error)
    }
  }

  const loadBlackoutSettings = async (vendorId) => {
    try {
      const res = await fetch(`/api/booking-blackout?vendorId=${vendorId}`)
      const data = await res.json()
      setVendorBlackoutDate(data.vendorDisabledUntil ? data.vendorDisabledUntil.split('T')[0] : '')
    } catch (error) {
      console.error('Error loading blackout settings:', error)
    }
  }

  const handleSaveContact = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/vendors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId: selectedVendorId, name: vendorName, email: vendorEmail, phone: vendorPhone, description: vendorDescription })
      })
      if (!response.ok) { showMessage('Error saving contact info'); return }
      showMessage('Contact info saved!')
    } catch (error) {
      showMessage('Error saving contact info: ' + error.message)
    } finally { setSaving(false) }
  }

  const handleSaveSocial = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/vendors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId: selectedVendorId, socialFacebook, socialInstagram, socialTiktok, socialWebsite, googlePlaceId })
      })
      if (!response.ok) { showMessage('Error saving social links'); return }
      showMessage('Social links saved!')
    } catch (error) {
      showMessage('Error saving social links: ' + error.message)
    } finally { setSaving(false) }
  }

  const handleConnectSquare = () => {
    window.location.href = `/api/square/connect?vendorId=${selectedVendorId}`
  }

  const handleDisconnectSquare = async () => {
    if (!confirm('Disconnect your Square account? Customers will not be able to pay online until you reconnect.')) return
    setConnectingSquare(true)
    try {
      const res = await fetch('/api/square/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId: selectedVendorId })
      })
      if (!res.ok) {
        const data = await res.json()
        showMessage('Error disconnecting Square: ' + (data.error || 'Unknown error'))
      } else {
        setSquareConnected(false)
        setSquareConnectedAt(null)
        setSquareOAuthStatus('disconnected')
        showMessage('Square account disconnected successfully')
      }
    } catch {
      showMessage('Error disconnecting Square account')
    } finally {
      setConnectingSquare(false)
    }
  }

  const handleSaveVendorBlackout = async () => {
    setBlackoutLoading(true)
    try {
      const res = await fetch('/api/booking-blackout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: selectedVendorId,
          scope: 'vendor',
          disabledUntil: vendorBlackoutDate ? new Date(vendorBlackoutDate + 'T23:59:59').toISOString() : null,
        })
      })
      if (!res.ok) { showMessage('Error saving blackout'); return }
      showMessage(vendorBlackoutDate ? 'Vendor booking disabled until ' + vendorBlackoutDate : 'Vendor booking re-enabled!')
    } catch (error) {
      showMessage('Error saving blackout: ' + error.message)
    } finally { setBlackoutLoading(false) }
  }

  return (
    <div>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        Manage vendor profile, payments, and booking settings.
      </p>

      {/* Vendor Selector (admin only) */}
      {currentUser.role === 'admin' && (
        <div style={{ marginBottom: '2rem', maxWidth: '600px' }}>
          <label style={labelStyle}>Select Vendor</label>
          <select value={selectedVendorId} onChange={(e) => setSelectedVendorId(e.target.value)} style={inputStyle}>
            {vendors.map(v => <option key={v.vendorId} value={v.vendorId}>{v.name}</option>)}
          </select>
        </div>
      )}

      {/* Contact Information */}
      <div style={sectionStyle}>
        <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Contact Information<Tooltip text="This info appears on your public vendor page and the contact page." /></h2>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Business Name</label>
          <input type="text" value={vendorName} onChange={(e) => setVendorName(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Email</label>
          <input type="email" value={vendorEmail} onChange={(e) => setVendorEmail(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Phone</label>
          <input type="tel" value={vendorPhone} onChange={(e) => setVendorPhone(e.target.value)} placeholder="(240) 367-0395" style={inputStyle} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Description<Tooltip text="A short summary shown on your public profile. Describe what makes your services unique." /></label>
          <textarea value={vendorDescription} onChange={(e) => setVendorDescription(e.target.value)} rows="3"
            style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
        <button onClick={handleSaveContact} disabled={saving} className="cta">
          {saving ? 'Saving...' : 'Save Contact Info'}
        </button>
      </div>

      {/* Social Media Links */}
      <div style={sectionStyle}>
        <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Social Media<Tooltip text="These links appear on your public vendor page so customers can find you online." /></h2>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Facebook URL</label>
          <input type="url" value={socialFacebook} onChange={(e) => setSocialFacebook(e.target.value)} placeholder="https://facebook.com/yourbusiness" style={inputStyle} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Instagram URL</label>
          <input type="url" value={socialInstagram} onChange={(e) => setSocialInstagram(e.target.value)} placeholder="https://instagram.com/yourbusiness" style={inputStyle} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>TikTok URL</label>
          <input type="url" value={socialTiktok} onChange={(e) => setSocialTiktok(e.target.value)} placeholder="https://tiktok.com/@yourbusiness" style={inputStyle} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Website URL</label>
          <input type="url" value={socialWebsite} onChange={(e) => setSocialWebsite(e.target.value)} placeholder="https://yourbusiness.com" style={inputStyle} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Google Place ID<Tooltip text="Your Google Place ID enables a 'Review us on Google' link on your public page. Find it at: https://developers.google.com/maps/documentation/places/web-service/place-id-finder" /></label>
          <input type="text" value={googlePlaceId} onChange={(e) => setGooglePlaceId(e.target.value)} placeholder="ChIJ..." style={inputStyle} />
        </div>
        <button onClick={handleSaveSocial} disabled={saving} className="cta">
          {saving ? 'Saving...' : 'Save Social Links'}
        </button>
      </div>

      {/* Square Payment Integration */}
      <div style={sectionStyle}>
        <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Square Payment Integration<Tooltip text="Connect your Square account so customers can pay online at checkout. Payments are deposited directly to your Square account." /></h2>
        {squareConnected ? (
          <div>
            <div style={{ padding: '1rem', background: squareOAuthStatus === 'error' ? '#f8d7da' : '#d4edda', border: `1px solid ${squareOAuthStatus === 'error' ? '#f5c6cb' : '#c3e6cb'}`, borderRadius: '8px', marginBottom: '1rem' }}>
              {squareOAuthStatus === 'error' ? (
                <div>
                  <div style={{ fontWeight: '500', color: '#721c24', marginBottom: '0.5rem' }}>⚠ Square Connection Error</div>
                  <p style={{ fontSize: '0.85rem', color: '#721c24', margin: 0 }}>Your Square connection needs to be refreshed. Please reconnect.</p>
                </div>
              ) : (
                <div>
                  <div style={{ fontWeight: '500', color: '#155724', marginBottom: '0.5rem' }}>✓ Square Account Connected</div>
                  {squareConnectedAt && (
                    <div style={{ fontSize: '0.85rem', color: '#155724' }}>
                      Connected on {new Date(squareConnectedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              {squareOAuthStatus === 'error' && (
                <button onClick={handleConnectSquare} className="cta">Reconnect Square</button>
              )}
              <button onClick={handleDisconnectSquare} disabled={connectingSquare} style={{
                padding: '0.75rem 1.5rem', background: '#dc3545', color: 'white', border: 'none',
                borderRadius: '8px', cursor: 'pointer', fontSize: '1rem', fontWeight: '500'
              }}>
                {connectingSquare ? 'Disconnecting...' : 'Disconnect Square'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-light)', marginBottom: '1rem' }}>
              Connect your Square account to receive payments directly. You'll be redirected to Square to authorize access.
            </p>
            <button onClick={handleConnectSquare} className="cta">Connect with Square</button>
          </div>
        )}
      </div>

      {/* Booking Blackout */}
      <div style={sectionStyle}>
        <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Booking Blackout<Tooltip text="Temporarily disable online booking for this vendor. Useful when syncing with external calendars like Vagaro. Customers will see a message to call instead." /></h2>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Disable booking until</label>
          <input type="date" value={vendorBlackoutDate} onChange={(e) => setVendorBlackoutDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]} style={inputStyle} />
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
            {vendorBlackoutDate ? `Booking disabled until end of ${vendorBlackoutDate}` : 'No blackout set — booking is active'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={handleSaveVendorBlackout} disabled={blackoutLoading} className="cta">
            {blackoutLoading ? 'Saving...' : 'Save'}
          </button>
          {vendorBlackoutDate && (
            <button onClick={() => { setVendorBlackoutDate(''); handleSaveVendorBlackout() }}
              disabled={blackoutLoading}
              style={{ padding: '0.75rem 1.5rem', background: '#dc3545', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem', fontWeight: '500' }}>
              Re-enable Booking
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
