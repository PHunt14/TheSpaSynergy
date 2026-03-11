'use client'

import { useState, useEffect } from 'react'
import { generateClient } from 'aws-amplify/data'
import { fetchAuthSession } from 'aws-amplify/auth'

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
  const [message, setMessage] = useState('')
  const [currentUserRole, setCurrentUserRole] = useState(null)
  const [currentUserVendorId, setCurrentUserVendorId] = useState(null)

  useEffect(() => {
    loadCurrentUser()
    loadVendors()
    
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'square_connected') {
      setMessage('Square account connected successfully!')
      setTimeout(() => {
        setMessage('')
        loadVendorSettings(selectedVendorId)
      }, 5000)
      window.history.replaceState({}, '', '/dashboard/settings')
    }
    if (params.get('error')) {
      const errorType = params.get('error')
      const details = params.get('details')
      let errorMsg = 'Error connecting Square account: '
      
      switch(errorType) {
        case 'missing_credentials':
          errorMsg += 'Square credentials not configured. Contact administrator.'
          break
        case 'no_locations':
          errorMsg += 'No locations found in your Square account. Please create a location in Square dashboard first.'
          break
        case 'oauth_failed':
          errorMsg += details || 'OAuth authorization failed. Please try again.'
          break
        default:
          errorMsg += errorType
      }
      
      setMessage(errorMsg)
      setTimeout(() => setMessage(''), 10000)
      window.history.replaceState({}, '', '/dashboard/settings')
    }
  }, [])

  useEffect(() => {
    if (selectedVendorId) {
      loadVendorSettings(selectedVendorId)
    }
  }, [selectedVendorId])

  const loadCurrentUser = async () => {
    try {
      const session = await fetchAuthSession()
      const vendorId = session.tokens?.idToken?.payload['custom:vendorId']
      const role = session.tokens?.idToken?.payload['custom:role'] || 'staff'
      setCurrentUserRole(role)
      setCurrentUserVendorId(vendorId)
      if (role === 'staff' && vendorId) {
        setSelectedVendorId(vendorId)
      }
    } catch (error) {
      console.error('Error loading current user:', error)
    }
  }

  const loadVendors = async () => {
    try {
      const { data: vendorList } = await client.models.Vendor.list()
      setVendors(vendorList || [])
      if (vendorList && vendorList.length > 0) {
        setSelectedVendorId(vendorList[0].vendorId)
      }
      setLoading(false)
    } catch (error) {
      console.error('Error loading vendors:', error)
      setLoading(false)
    }
  }

  const loadVendorSettings = async (vendorId) => {
    try {
      const { data: vendorData } = await client.models.Vendor.get({ vendorId })
      
      if (vendorData) {
        setSmsAlertPhone(vendorData.smsAlertPhone || '')
        setSmsAlertsEnabled(vendorData.smsAlertsEnabled || false)
        setSquareConnected(!!vendorData.squareAccessToken)
        setSquareConnectedAt(vendorData.squareConnectedAt)
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }

  const handleConnectSquare = async () => {
    setConnectingSquare(true)
    setMessage('')
    
    try {
      const response = await fetch('/api/square/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId: selectedVendorId })
      })

      const data = await response.json()
      
      if (data.authUrl) {
        // Open Square OAuth in new tab
        window.open(data.authUrl, '_blank')
        setMessage('Square authorization opened in new tab. Please complete the connection and refresh this page.')
      } else {
        setMessage('Error: ' + (data.error || 'Failed to generate authorization URL'))
      }
    } catch (error) {
      console.error('Error connecting Square:', error)
      setMessage('Error connecting to Square: ' + error.message)
    } finally {
      setConnectingSquare(false)
    }
  }

  const handleDisconnectSquare = async () => {
    if (!confirm('Are you sure you want to disconnect your Square account? This will prevent split payments for bundles.')) {
      return
    }

    try {
      const response = await fetch('/api/square/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId: selectedVendorId })
      })

      if (response.ok) {
        setSquareConnected(false)
        setSquareConnectedAt(null)
        setMessage('Square account disconnected successfully')
        setTimeout(() => setMessage(''), 3000)
      } else {
        setMessage('Error disconnecting Square account')
      }
    } catch (error) {
      console.error('Error disconnecting Square:', error)
      setMessage('Error disconnecting Square account')
    }
  }

  const handleSave = async () => {
    if (!selectedVendorId) {
      setMessage('Please select a vendor')
      return
    }
    
    setSaving(true)
    setMessage('')

    try {
      const formattedPhone = smsAlertPhone.replace(/\D/g, '')
      
      if (smsAlertsEnabled && formattedPhone.length !== 10) {
        setMessage('Please enter a valid 10-digit phone number')
        setSaving(false)
        return
      }

      const response = await fetch('/api/vendors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: selectedVendorId,
          smsAlertPhone: formattedPhone,
          smsAlertsEnabled
        })
      })

      const data = await response.json()

      if (!response.ok) {
        setMessage('Error saving settings: ' + (data.error || 'Unknown error'))
        setSaving(false)
        return
      }

      setMessage('Settings saved successfully!')
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      console.error('Error saving settings:', error)
      setMessage('Error saving settings: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div>Loading...</div>

  return (
    <div>
      <h1>Settings</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        Manage payment integration and notification preferences for vendors.
      </p>

      <div style={{
        background: 'var(--color-accent)',
        borderRadius: '12px',
        padding: '2rem',
        maxWidth: '600px',
        marginBottom: '2rem'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Square Payment Integration</h2>
        
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Select Vendor
          </label>
          <select
            value={selectedVendorId}
            onChange={(e) => setSelectedVendorId(e.target.value)}
            disabled={currentUserRole === 'staff'}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              fontSize: '1rem',
              background: currentUserRole === 'staff' ? '#f5f5f5' : 'white',
              cursor: currentUserRole === 'staff' ? 'not-allowed' : 'pointer'
            }}
          >
            {vendors.map(vendor => (
              <option key={vendor.vendorId} value={vendor.vendorId}>
                {vendor.name}
              </option>
            ))}
          </select>
        </div>

        {squareConnected ? (
          <div>
            <div style={{
              padding: '1rem',
              background: '#d4edda',
              border: '1px solid #c3e6cb',
              borderRadius: '8px',
              marginBottom: '1rem'
            }}>
              <div style={{ fontWeight: '500', color: '#155724', marginBottom: '0.5rem' }}>
                ✓ Square Account Connected
              </div>
              {squareConnectedAt && (
                <div style={{ fontSize: '0.85rem', color: '#155724' }}>
                  Connected on {new Date(squareConnectedAt).toLocaleDateString()}
                </div>
              )}
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-light)', marginBottom: '1rem' }}>
              Your Square account is connected and ready to receive split payments from bundles.
            </p>
            <button
              onClick={handleDisconnectSquare}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '500'
              }}
            >
              Disconnect Square
            </button>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-light)', marginBottom: '1rem' }}>
              Connect your Square account to receive payments directly when customers book bundles that include your services.
            </p>
            <ul style={{ fontSize: '0.9rem', color: 'var(--color-text-light)', marginBottom: '1.5rem', paddingLeft: '1.5rem' }}>
              <li>Receive payments automatically split from bundle bookings</li>
              <li>Funds deposited directly to your Square account</li>
              <li>No manual payment distribution needed</li>
              <li>Secure OAuth authentication</li>
            </ul>
            <button
              onClick={handleConnectSquare}
              disabled={connectingSquare}
              className="cta"
            >
              {connectingSquare ? 'Opening Square...' : 'Connect Square Account'}
            </button>
          </div>
        )}
      </div>

      <div style={{
        background: 'var(--color-accent)',
        borderRadius: '12px',
        padding: '2rem',
        maxWidth: '600px'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>SMS Notifications</h2>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={smsAlertsEnabled}
              onChange={(e) => setSmsAlertsEnabled(e.target.checked)}
              style={{ width: '20px', height: '20px', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '1.1rem', fontWeight: '500' }}>
              Enable SMS alerts for new bookings
            </span>
          </label>
        </div>

        {smsAlertsEnabled && (
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Phone Number for Alerts
            </label>
            <input
              type="tel"
              value={smsAlertPhone}
              onChange={(e) => setSmsAlertPhone(e.target.value)}
              placeholder="2403670395"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                fontSize: '1rem'
              }}
            />
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
              Enter 10-digit phone number (no dashes or spaces)
            </p>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="cta"
          style={{ marginTop: '1rem' }}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>

        {message && (
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            borderRadius: '8px',
            background: message.includes('Error') ? '#fee' : '#d4edda',
            color: message.includes('Error') ? '#c33' : '#155724',
            border: message.includes('Error') ? '1px solid #f5c6cb' : '1px solid #c3e6cb',
            fontWeight: '500'
          }}>
            {message}
          </div>
        )}
      </div>
    </div>
  )
}
