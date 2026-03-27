'use client'

import { useState, useEffect } from 'react'
import { generateClient } from 'aws-amplify/data'
import { fetchAuthSession } from 'aws-amplify/auth'
import Tooltip from '../../components/Tooltip'

const client = generateClient()

export default function Settings() {
  const [vendors, setVendors] = useState([])
  const [selectedVendorId, setSelectedVendorId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [smsAlertPhone, setSmsAlertPhone] = useState('')
  const [smsAlertsEnabled, setSmsAlertsEnabled] = useState(false)
  const [squareConnected, setSquareConnected] = useState(false)
  const [squareConnectedAt, setSquareConnectedAt] = useState(null)
  const [connectingSquare, setConnectingSquare] = useState(false)
  const [squareOAuthStatus, setSquareOAuthStatus] = useState('disconnected')
  const [message, setMessage] = useState('')
  const [currentUserRole, setCurrentUserRole] = useState(null)
  const [currentUserVendorId, setCurrentUserVendorId] = useState(null)

  // Contact info
  const [vendorName, setVendorName] = useState('')
  const [vendorEmail, setVendorEmail] = useState('')
  const [vendorPhone, setVendorPhone] = useState('')
  const [vendorDescription, setVendorDescription] = useState('')

  // Social media
  const [socialFacebook, setSocialFacebook] = useState('')
  const [socialInstagram, setSocialInstagram] = useState('')
  const [socialTiktok, setSocialTiktok] = useState('')
  const [socialWebsite, setSocialWebsite] = useState('')

  useEffect(() => {
    initSettings()

    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'square_connected') {
      setMessage('Square account connected successfully!')
      setTimeout(() => { setMessage(''); loadVendorSettings(selectedVendorId) }, 5000)
      window.history.replaceState({}, '', '/dashboard/settings')
    }
    if (params.get('error')) {
      const errorType = params.get('error')
      const details = params.get('details')
      let errorMsg = 'Error connecting Square account: '
      switch(errorType) {
        case 'missing_credentials': errorMsg += 'Square credentials not configured. Contact administrator.'; break
        case 'no_locations': errorMsg += 'No locations found in your Square account.'; break
        case 'oauth_failed': errorMsg += details || 'OAuth authorization failed.'; break
        default: errorMsg += errorType
      }
      setMessage(errorMsg)
      setTimeout(() => setMessage(''), 10000)
      window.history.replaceState({}, '', '/dashboard/settings')
    }
  }, [])

  const initSettings = async () => {
    try {
      const session = await fetchAuthSession()
      const vendorId = session.tokens?.idToken?.payload['custom:vendorId']
      const role = session.tokens?.idToken?.payload['custom:role'] || 'vendor'
      setCurrentUserRole(role)
      setCurrentUserVendorId(vendorId)

      const { data: vendorList } = await client.models.Vendor.list()
      setVendors(vendorList || [])

      if (role === 'admin') {
        setSelectedVendorId(vendorId || vendorList?.[0]?.vendorId || '')
      } else if (vendorId) {
        setSelectedVendorId(vendorId)
      }
      setLoading(false)
    } catch (error) {
      console.error('Error initializing settings:', error)
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedVendorId) loadVendorSettings(selectedVendorId)
  }, [selectedVendorId])

  const loadVendorSettings = async (vendorId) => {
    try {
      const { data: v } = await client.models.Vendor.get({ vendorId })
      if (v) {
        setSmsAlertPhone(v.smsAlertPhone || '')
        setSmsAlertsEnabled(v.smsAlertsEnabled || false)
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
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    }
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
        setMessage('Error disconnecting Square: ' + (data.error || 'Unknown error'))
      } else {
        setSquareConnected(false)
        setSquareConnectedAt(null)
        setSquareOAuthStatus('disconnected')
        setMessage('Square account disconnected successfully')
        setTimeout(() => setMessage(''), 3000)
      }
    } catch (error) {
      setMessage('Error disconnecting Square account')
    } finally {
      setConnectingSquare(false)
    }
  }

  const handleSaveContact = async () => {
    setSaving(true); setMessage('')
    try {
      const response = await fetch('/api/vendors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: selectedVendorId,
          name: vendorName,
          email: vendorEmail,
          phone: vendorPhone,
          description: vendorDescription,
        })
      })
      if (!response.ok) { setMessage('Error saving contact info'); setSaving(false); return }
      setMessage('Contact info saved!')
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      setMessage('Error saving contact info: ' + error.message)
    } finally { setSaving(false) }
  }

  const handleSaveSocial = async () => {
    setSaving(true); setMessage('')
    try {
      const response = await fetch('/api/vendors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: selectedVendorId,
          socialFacebook, socialInstagram, socialTiktok, socialWebsite,
        })
      })
      if (!response.ok) { setMessage('Error saving social links'); setSaving(false); return }
      setMessage('Social links saved!')
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      setMessage('Error saving social links: ' + error.message)
    } finally { setSaving(false) }
  }

  const handleSaveSms = async () => {
    setSaving(true); setMessage('')
    try {
      const formattedPhone = smsAlertPhone.replace(/\D/g, '')
      if (smsAlertsEnabled && formattedPhone.length !== 10) {
        setMessage('Please enter a valid 10-digit phone number'); setSaving(false); return
      }
      const response = await fetch('/api/vendors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId: selectedVendorId, smsAlertPhone: formattedPhone, smsAlertsEnabled })
      })
      if (!response.ok) { setMessage('Error saving SMS settings'); setSaving(false); return }
      setMessage('SMS settings saved!')
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      setMessage('Error saving settings: ' + error.message)
    } finally { setSaving(false) }
  }

  if (loading) return <div>Loading...</div>

  const sectionStyle = {
    background: 'var(--color-accent)', borderRadius: '12px', padding: '2rem', maxWidth: '600px', marginBottom: '2rem'
  }
  const inputStyle = {
    width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem'
  }
  const labelStyle = { display: 'block', marginBottom: '0.5rem', fontWeight: '500' }

  return (
    <div>
      <h1>Settings</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        Manage vendor information, payment integration, and notification preferences.
      </p>

      {message && (
        <div style={{
          marginBottom: '1rem', padding: '1rem', borderRadius: '8px', maxWidth: '600px',
          background: message.includes('Error') ? '#fee' : '#d4edda',
          color: message.includes('Error') ? '#c33' : '#155724',
          border: message.includes('Error') ? '1px solid #f5c6cb' : '1px solid #c3e6cb',
          fontWeight: '500'
        }}>
          {message}
        </div>
      )}

      {/* Vendor Selector (admin only) */}
      {(currentUserRole === 'admin') && (
        <div style={{ marginBottom: '2rem', maxWidth: '600px' }}>
          <label style={labelStyle}>Select Vendor</label>
          <select value={selectedVendorId} onChange={(e) => setSelectedVendorId(e.target.value)}
            style={inputStyle}>
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
        <button onClick={handleSaveSocial} disabled={saving} className="cta">
          {saving ? 'Saving...' : 'Save Social Links'}
        </button>
      </div>

      {/* Square Payment Integration */}
      {(currentUserRole === 'owner' || currentUserRole === 'admin') && (
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
      )}

      {/* SMS Notifications */}
      <div style={sectionStyle}>
        <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>SMS Notifications<Tooltip text="When enabled, you'll receive a text message each time a customer books an appointment with you." /></h2>
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={smsAlertsEnabled} onChange={(e) => setSmsAlertsEnabled(e.target.checked)}
              style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
            <span style={{ fontSize: '1.1rem', fontWeight: '500' }}>Enable SMS alerts for new bookings<Tooltip text="You'll get a text for each new booking, confirmation, and cancellation." /></span>
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
    </div>
  )
}
