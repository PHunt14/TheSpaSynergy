'use client'

import { useState, useEffect } from 'react'
import { generateClient } from 'aws-amplify/data'
import { getCurrentUser } from 'aws-amplify/auth'

const client = generateClient()

export default function Settings() {
  const [vendors, setVendors] = useState([])
  const [selectedVendorId, setSelectedVendorId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [smsAlertPhone, setSmsAlertPhone] = useState('')
  const [smsAlertsEnabled, setSmsAlertsEnabled] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadVendors()
  }, [])

  useEffect(() => {
    if (selectedVendorId) {
      loadVendorSettings(selectedVendorId)
    }
  }, [selectedVendorId])

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
      }
    } catch (error) {
      console.error('Error loading settings:', error)
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

      await client.models.Vendor.update({
        vendorId: selectedVendorId,
        smsAlertPhone: formattedPhone,
        smsAlertsEnabled
      })

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
        Manage notification preferences for vendors.
      </p>

      <div style={{
        background: 'var(--color-accent)',
        borderRadius: '12px',
        padding: '2rem',
        maxWidth: '600px'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>SMS Notifications</h2>
        
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Select Vendor
          </label>
          <select
            value={selectedVendorId}
            onChange={(e) => setSelectedVendorId(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              fontSize: '1rem',
              background: 'white'
            }}
          >
            {vendors.map(vendor => (
              <option key={vendor.vendorId} value={vendor.vendorId}>
                {vendor.name}
              </option>
            ))}
          </select>
        </div>

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