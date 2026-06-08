'use client'

import { useState, useEffect, useRef } from 'react'
import { fetchAuthSession } from 'aws-amplify/auth'

const DEFAULT_WORKING_HOURS = {
  monday: { start: '09:00', end: '17:00', closed: false },
  tuesday: { start: '09:00', end: '17:00', closed: false },
  wednesday: { start: '09:00', end: '17:00', closed: false },
  thursday: { start: '09:00', end: '17:00', closed: false },
  friday: { start: '09:00', end: '17:00', closed: false },
  saturday: { start: '10:00', end: '15:00', closed: false },
  sunday: { start: '10:00', end: '15:00', closed: true }
}

const emptyProviderForm = () => ({
  name: '', description: '', email: '', phone: '',
  bufferMinutes: 15, isActive: true, isHouse: false,
  workingHours: { ...DEFAULT_WORKING_HOURS }
})

export default function Providers() {
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingProvider, setEditingProvider] = useState(null)
  const [currentUserRole, setCurrentUserRole] = useState(null)
  const formRef = useRef(null)
  const [newProvider, setNewProvider] = useState(emptyProviderForm())

  useEffect(() => {
    loadProviders()
  }, [])

  const loadProviders = async () => {
    try {
      const session = await fetchAuthSession()
      const role = session.tokens?.idToken?.payload['custom:role'] || 'vendor'
      // Map legacy roles to the two-role model
      const normalizedRole = role === 'admin' ? 'admin' : 'staff'
      setCurrentUserRole(normalizedRole)
      if (normalizedRole !== 'admin') {
        setLoading(false)
        return
      }
      const response = await fetch('/api/providers?includeInactive=true')
      const data = await response.json()
      setProviders(data.providers || [])
    } catch (error) {
      console.error('Error loading providers:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddProvider = async (e) => {
    e.preventDefault()
    
    const method = editingProvider ? 'PATCH' : 'POST'
    const providerData = {
      vendorId: editingProvider ? editingProvider.vendorId : `vendor-${Date.now()}`,
      name: newProvider.name,
      description: newProvider.description,
      email: newProvider.email,
      phone: newProvider.phone,
      bufferMinutes: newProvider.bufferMinutes,
      isActive: newProvider.isActive,
      isHouse: newProvider.isHouse,
      workingHours: newProvider.workingHours
    }

    if (!editingProvider) {
      providerData.workingHours = newProvider.workingHours
    }
    
    try {
      const response = await fetch('/api/providers', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(providerData)
      })

      if (response.ok) {
        alert(editingProvider ? 'Provider updated successfully!' : 'Provider added successfully!')
        setShowAddForm(false)
        setEditingProvider(null)
        setNewProvider(emptyProviderForm())
        loadProviders()
      } else {
        const data = await response.json()
        alert('Failed to save provider: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error saving provider:', error)
      alert('Error saving provider')
    }
  }

  const handleEdit = (provider) => {
    setEditingProvider(provider)
    let parsedHours = provider.workingHours
    if (typeof parsedHours === 'string') {
      try { parsedHours = JSON.parse(parsedHours) } catch { parsedHours = null }
    }
    setNewProvider({
      name: provider.name,
      description: provider.description || '',
      email: provider.email,
      phone: provider.phone || '',
      bufferMinutes: provider.bufferMinutes || 15,
      isActive: provider.isActive !== undefined ? provider.isActive : true,
      isHouse: provider.isHouse || false,
      workingHours: parsedHours || { ...DEFAULT_WORKING_HOURS }
    })
    setShowAddForm(true)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  const handleCancelEdit = () => {
    setEditingProvider(null)
    setShowAddForm(false)
    setNewProvider(emptyProviderForm())
  }

  const handleToggleActive = async (provider) => {
    try {
      const response = await fetch('/api/providers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: provider.vendorId,
          isActive: !provider.isActive
        })
      })

      if (response.ok) {
        loadProviders()
      } else {
        const data = await response.json()
        alert('Failed to update provider: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error updating provider:', error)
      alert('Error updating provider')
    }
  }

  const handleDelete = async (provider) => {
    if (!confirm(`Delete provider "${provider.name}"? This action cannot be undone.`)) return

    try {
      const response = await fetch(`/api/providers?providerId=${provider.vendorId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        alert('Provider deleted successfully')
        loadProviders()
      } else {
        const data = await response.json()
        alert('Failed to delete provider: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error deleting provider:', error)
      alert('Error deleting provider')
    }
  }

  if (currentUserRole !== 'admin') {
    return (
      <div>
        <h1>Providers</h1>
        <p style={{ color: 'var(--color-text-light)' }}>
          You do not have permission to access this page.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1>Providers</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        Manage provider accounts and information.
      </p>

      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="cta"
          style={{ marginBottom: '2rem' }}
        >
          Add Provider
        </button>
      )}

      {showAddForm && (
        <form ref={formRef} onSubmit={handleAddProvider} style={{
          background: 'var(--color-accent)',
          padding: '1.5rem',
          borderRadius: '8px',
          marginBottom: '2rem',
          maxWidth: '600px'
        }}>
          <h3>{editingProvider ? 'Edit Provider' : 'Add New Provider'}</h3>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Provider Name *</label>
            <input
              type="text"
              required
              value={newProvider.name}
              onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
              placeholder="Provider Name"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                fontSize: '1rem'
              }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Description</label>
            <textarea
              value={newProvider.description}
              onChange={(e) => {
                if (e.target.value.length <= 500) {
                  setNewProvider({ ...newProvider, description: e.target.value })
                }
              }}
              placeholder="Brief description of the provider"
              maxLength={500}
              rows="3"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                fontSize: '1rem',
                resize: 'vertical'
              }}
            />
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.25rem' }}>
              {newProvider.description.length}/500 characters
            </p>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Email *</label>
            <input
              type="email"
              required
              value={newProvider.email}
              onChange={(e) => setNewProvider({ ...newProvider, email: e.target.value })}
              placeholder="contact@provider.com"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                fontSize: '1rem'
              }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Phone</label>
            <input
              type="tel"
              value={newProvider.phone}
              onChange={(e) => setNewProvider({ ...newProvider, phone: e.target.value })}
              placeholder="(240) 367-0395"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                fontSize: '1rem'
              }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Buffer Time (minutes)</label>
            <input
              type="number"
              min="0"
              step="5"
              value={newProvider.bufferMinutes}
              onChange={(e) => setNewProvider({ ...newProvider, bufferMinutes: parseInt(e.target.value) })}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                fontSize: '1rem'
              }}
            />
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
              Time buffer between appointments (default: 15 minutes)
            </p>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '1rem', fontWeight: 'bold' }}>Working Hours</label>
            {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => (
              <div key={day} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                <div style={{ width: '100px', textTransform: 'capitalize' }}>{day}</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={newProvider.workingHours[day].closed}
                    onChange={(e) => setNewProvider({
                      ...newProvider,
                      workingHours: {
                        ...newProvider.workingHours,
                        [day]: { ...newProvider.workingHours[day], closed: e.target.checked }
                      }
                    })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.9rem' }}>Closed</span>
                </label>
                {!newProvider.workingHours[day].closed && (
                  <>
                    <input
                      type="time"
                      value={newProvider.workingHours[day].start}
                      onChange={(e) => setNewProvider({
                        ...newProvider,
                        workingHours: {
                          ...newProvider.workingHours,
                          [day]: { ...newProvider.workingHours[day], start: e.target.value }
                        }
                      })}
                      style={{
                        padding: '0.5rem',
                        borderRadius: '4px',
                        border: '1px solid var(--color-border)'
                      }}
                    />
                    <span>to</span>
                    <input
                      type="time"
                      value={newProvider.workingHours[day].end}
                      onChange={(e) => setNewProvider({
                        ...newProvider,
                        workingHours: {
                          ...newProvider.workingHours,
                          [day]: { ...newProvider.workingHours[day], end: e.target.value }
                        }
                      })}
                      style={{
                        padding: '0.5rem',
                        borderRadius: '4px',
                        border: '1px solid var(--color-border)'
                      }}
                    />
                  </>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={newProvider.isActive}
                onChange={(e) => setNewProvider({ ...newProvider, isActive: e.target.checked })}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
              <span>Active</span>
            </label>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={newProvider.isHouse}
                onChange={(e) => setNewProvider({ ...newProvider, isHouse: e.target.checked })}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
              <span>House Provider</span>
            </label>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem', marginLeft: '1.75rem' }}>
              Mark this provider as &ldquo;The House&rdquo; for house fee services
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="cta">{editingProvider ? 'Update Provider' : 'Add Provider'}</button>
            <button type="button" onClick={handleCancelEdit} style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              cursor: 'pointer',
              background: 'transparent'
            }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading && <p>Loading providers...</p>}

      {!loading && providers.length === 0 && (
        <p style={{ color: 'var(--color-text-light)' }}>No providers found.</p>
      )}

      {!loading && providers.length > 0 && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {providers.map(provider => (
            <div
              key={provider.vendorId}
              style={{
                background: 'var(--color-accent)',
                padding: '1.5rem',
                borderRadius: '8px'
              }}
            >
              <h3 style={{ marginBottom: '0.5rem' }}>{provider.name}</h3>
              {provider.description && (
                <p style={{ color: 'var(--color-text)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  {provider.description}
                </p>
              )}
              <p style={{ color: 'var(--color-text-light)', fontSize: '0.9rem' }}>
                {provider.email} {provider.phone && `• ${provider.phone}`}
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
                Buffer: {provider.bufferMinutes || 15} min • Status: {provider.isActive ? '✓ Active' : '✗ Inactive'}
                {provider.isHouse && ' • 🏠 House Provider'}
              </p>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => handleEdit(provider)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    background: 'var(--color-primary)',
                    color: 'white'
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleToggleActive(provider)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    background: provider.isActive ? '#4CAF50' : '#999',
                    color: 'white'
                  }}
                >
                  {provider.isActive ? 'Active' : 'Inactive'}
                </button>
                <button
                  onClick={() => handleDelete(provider)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    background: '#f44336',
                    color: 'white'
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
