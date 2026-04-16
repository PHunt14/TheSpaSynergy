'use client'

import { useState, useEffect } from 'react'
import { generateClient } from 'aws-amplify/data'
import { fetchAuthSession } from 'aws-amplify/auth'
import MySettings from './MySettings'
import VendorSettings from './VendorSettings'
import BuildingSettings from './BuildingSettings'

const client = generateClient()

const TABS = {
  MY: 'my',
  VENDOR: 'vendor',
  BUILDING: 'building',
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState(TABS.MY)
  const [loading, setLoading] = useState(true)
  const [vendors, setVendors] = useState([])
  const [selectedVendorId, setSelectedVendorId] = useState('')
  const [currentUser, setCurrentUser] = useState({ role: null, vendorId: null, email: null })
  const [message, setMessage] = useState('')

  useEffect(() => {
    initSettings()
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'square_connected') {
      setMessage('Square account connected successfully!')
      const connectedStaffId = params.get('staffId')
      if (connectedStaffId) setActiveTab(TABS.MY)
      setTimeout(() => setMessage(''), 3000)
      window.history.replaceState({}, '', '/dashboard/settings')
    }
    if (params.get('error')) {
      const errorType = params.get('error')
      const details = params.get('details')
      let errorMsg = 'Error connecting Square account: '
      switch (errorType) {
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
      const email = session.tokens?.idToken?.payload['email']
      setCurrentUser({ role, vendorId, email })

      const { data: vendorList } = await client.models.Vendor.list()
      setVendors(vendorList || [])

      if (role === 'admin') {
        setSelectedVendorId(vendorId || vendorList?.[0]?.vendorId || '')
      } else if (vendorId) {
        setSelectedVendorId(vendorId)
      }
    } catch (error) {
      console.error('Error initializing settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const showMessage = (msg, duration = 3000) => {
    setMessage(msg)
    setTimeout(() => setMessage(''), duration)
  }

  if (loading) return <div>Loading...</div>

  const isPrivileged = currentUser.role === 'owner' || currentUser.role === 'admin'

  const tabStyle = (tab) => ({
    padding: '0.75rem 1.5rem',
    border: 'none',
    borderBottom: activeTab === tab ? '3px solid var(--color-primary)' : '3px solid transparent',
    background: 'none',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: activeTab === tab ? '600' : '400',
    color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-text-light)',
  })

  return (
    <div>
      <h1>Settings</h1>

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

      <div style={{ borderBottom: '1px solid var(--color-border)', marginBottom: '2rem', maxWidth: '600px' }}>
        <button style={tabStyle(TABS.MY)} onClick={() => setActiveTab(TABS.MY)}>My Settings</button>
        {isPrivileged && (
          <>
            <button style={tabStyle(TABS.VENDOR)} onClick={() => setActiveTab(TABS.VENDOR)}>Vendor Settings</button>
            <button style={tabStyle(TABS.BUILDING)} onClick={() => setActiveTab(TABS.BUILDING)}>Building Settings</button>
          </>
        )}
      </div>

      {activeTab === TABS.MY && (
        <MySettings currentUser={currentUser} showMessage={showMessage} />
      )}
      {activeTab === TABS.VENDOR && isPrivileged && (
        <VendorSettings
          currentUser={currentUser}
          vendors={vendors}
          selectedVendorId={selectedVendorId}
          setSelectedVendorId={setSelectedVendorId}
          showMessage={showMessage}
        />
      )}
      {activeTab === TABS.BUILDING && isPrivileged && (
        <BuildingSettings
          currentUser={currentUser}
          showMessage={showMessage}
        />
      )}
    </div>
  )
}
