'use client'

import { useState, useEffect } from 'react'
import { fetchAuthSession } from 'aws-amplify/auth'

export default function BundlesManagement() {
  const [bundles, setBundles] = useState([])
  const [services, setServices] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingBundle, setEditingBundle] = useState(null)
  const [currentUserRole, setCurrentUserRole] = useState(null)
  const [bundleSettings, setBundleSettings] = useState(null)
  const [newBundle, setNewBundle] = useState({
    name: '',
    description: '',
    selectedServices: [],
    discountPercent: 0
  })

  useEffect(() => {
    loadCurrentUser()
    loadData()
  }, [])

  const loadCurrentUser = async () => {
    try {
      const session = await fetchAuthSession()
      const role = session.tokens?.idToken?.payload['custom:role'] || 'staff'
      setCurrentUserRole(role)
      if (role === 'staff') {
        alert('Access denied. Admin only.')
        window.location.href = '/dashboard'
      }
    } catch (error) {
      console.error('Error loading user:', error)
    }
  }

  const loadData = async () => {
    try {
      const [bundlesRes, servicesRes, vendorsRes, settingsRes] = await Promise.all([
        fetch('/api/bundles'),
        fetch('/api/services'),
        fetch('/api/vendors'),
        fetch('/api/bundle-settings')
      ])
      
      const bundlesData = await bundlesRes.json()
      const servicesData = await servicesRes.json()
      const vendorsData = await vendorsRes.json()
      const settingsData = await settingsRes.json()
      
      setBundles(bundlesData.bundles || [])
      setServices(servicesData.services || [])
      setVendors(vendorsData.vendors || [])
      setBundleSettings(settingsData.settings || {
        discount1Service: 0,
        discount2Services: 0,
        discount3Services: 0,
        discount4PlusServices: 0
      })
      setLoading(false)
    } catch (error) {
      console.error('Error loading data:', error)
      setLoading(false)
    }
  }

  const handleSaveBundle = async (e) => {
    e.preventDefault()
    
    if (newBundle.selectedServices.length === 0) {
      alert('Please select at least one service')
      return
    }

    const bundleId = editingBundle ? editingBundle.bundleId : `bundle-${Date.now()}`
    const method = editingBundle ? 'PATCH' : 'POST'
    
    const totalPrice = newBundle.selectedServices.reduce((sum, svcId) => {
      const service = services.find(s => s.serviceId === svcId)
      return sum + (service?.price || 0)
    }, 0)
    
    const discountedPrice = totalPrice * (1 - newBundle.discountPercent / 100)
    
    const bundleData = {
      bundleId,
      name: newBundle.name,
      description: newBundle.description,
      serviceIds: newBundle.selectedServices,
      price: discountedPrice,
      discountPercent: newBundle.discountPercent,
      isActive: editingBundle ? editingBundle.isActive : true
    }
    
    console.log('Saving bundle:', bundleData)
    
    try {
      const response = await fetch('/api/bundles', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bundleData)
      })

      const result = await response.json()
      console.log('Save result:', result)

      if (response.ok) {
        alert(editingBundle ? 'Bundle updated!' : 'Bundle created!')
        setShowAddForm(false)
        setEditingBundle(null)
        setNewBundle({ name: '', description: '', selectedServices: [], discountPercent: 0 })
        await loadData()
      } else {
        console.error('Save failed:', result)
        alert('Failed to save bundle: ' + (result.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error saving bundle:', error)
      alert('Error saving bundle')
    }
  }

  const handleToggleActive = async (bundle) => {
    try {
      const response = await fetch('/api/bundles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bundleId: bundle.bundleId,
          isActive: !bundle.isActive
        })
      })

      if (response.ok) {
        loadData()
      }
    } catch (error) {
      console.error('Error updating bundle:', error)
    }
  }

  const handleEdit = (bundle) => {
    setEditingBundle(bundle)
    setNewBundle({
      name: bundle.name,
      description: bundle.description || '',
      selectedServices: bundle.serviceIds || [],
      discountPercent: bundle.discountPercent || 0
    })
    setShowAddForm(true)
  }

  const handleDelete = async (bundle) => {
    if (!confirm(`Delete "${bundle.name}"?`)) return

    try {
      const response = await fetch(`/api/bundles?bundleId=${bundle.bundleId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        loadData()
      }
    } catch (error) {
      console.error('Error deleting bundle:', error)
    }
  }

  const handleSaveSettings = async (e) => {
    e.preventDefault()
    
    if (!bundleSettings) {
      alert('Settings not loaded')
      return
    }
    
    try {
      const response = await fetch('/api/bundle-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bundleSettings)
      })

      const result = await response.json()
      
      if (response.ok) {
        alert('Discount settings saved!')
        await loadData()
      } else {
        console.error('Save failed:', result)
        alert('Failed to save: ' + (result.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      alert('Error saving settings')
    }
  }

  const getServiceName = (serviceId) => {
    const service = services.find(s => s.serviceId === serviceId)
    return service ? service.name : serviceId
  }

  const calculateTotal = () => {
    return newBundle.selectedServices.reduce((sum, svcId) => {
      const service = services.find(s => s.serviceId === svcId)
      return sum + (service?.price || 0)
    }, 0)
  }

  if (loading) return <div>Loading...</div>
  if (currentUserRole === 'staff') return null

  return (
    <div>
      <h1>Bundle Management</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        Create and manage service bundles (Admin only)
      </p>

      <div style={{ background: 'var(--color-accent)', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>Build Your Own Bundle - Discount Tiers</h2>
        <form onSubmit={handleSaveSettings}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>1 Service (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={bundleSettings?.discount1Service || 0}
                onChange={(e) => setBundleSettings({ ...bundleSettings, discount1Service: parseFloat(e.target.value) || 0 })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>2 Services (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={bundleSettings?.discount2Services || 0}
                onChange={(e) => setBundleSettings({ ...bundleSettings, discount2Services: parseFloat(e.target.value) || 0 })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>3 Services (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={bundleSettings?.discount3Services || 0}
                onChange={(e) => setBundleSettings({ ...bundleSettings, discount3Services: parseFloat(e.target.value) || 0 })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>4+ Services (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={bundleSettings?.discount4PlusServices || 0}
                onChange={(e) => setBundleSettings({ ...bundleSettings, discount4PlusServices: parseFloat(e.target.value) || 0 })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}
              />
            </div>
          </div>
          <button type="submit" className="cta">Save Discount Settings</button>
        </form>
      </div>

      <button
        onClick={() => {
          setShowAddForm(!showAddForm)
          if (showAddForm) {
            setEditingBundle(null)
            setNewBundle({ name: '', description: '', selectedServices: [], discountPercent: 0 })
          }
        }}
        className="cta"
        style={{ marginBottom: '2rem' }}
      >
        {showAddForm ? 'Cancel' : '+ Create Pre-built Bundle'}
      </button>

      {showAddForm && (
        <form onSubmit={handleSaveBundle} style={{
          background: 'var(--color-accent)',
          padding: '1.5rem',
          borderRadius: '8px',
          marginBottom: '2rem'
        }}>
          <h3>{editingBundle ? 'Edit Bundle' : 'Create New Bundle'}</h3>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Bundle Name *</label>
            <input
              type="text"
              required
              value={newBundle.name}
              onChange={(e) => setNewBundle({ ...newBundle, name: e.target.value })}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Description</label>
            <textarea
              value={newBundle.description}
              onChange={(e) => setNewBundle({ ...newBundle, description: e.target.value })}
              rows="3"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', resize: 'vertical' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Discount Percent (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={newBundle.discountPercent}
              onChange={(e) => setNewBundle({ ...newBundle, discountPercent: parseFloat(e.target.value) })}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Select Services *</label>
            <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '1rem' }}>
              {vendors.map(vendor => {
                const vendorServices = services.filter(s => s.vendorId === vendor.vendorId)
                if (vendorServices.length === 0) return null
                
                return (
                  <div key={vendor.vendorId} style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ marginBottom: '0.75rem', color: 'var(--color-primary)' }}>{vendor.name}</h4>
                    {vendorServices.map(service => (
                      <label key={service.serviceId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={newBundle.selectedServices.includes(service.serviceId)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewBundle({ ...newBundle, selectedServices: [...newBundle.selectedServices, service.serviceId] })
                            } else {
                              setNewBundle({ ...newBundle, selectedServices: newBundle.selectedServices.filter(id => id !== service.serviceId) })
                            }
                          }}
                          style={{ width: '18px', height: '18px' }}
                        />
                        <span>{service.name} - ${service.price} ({service.duration} min)</span>
                      </label>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>

          {newBundle.selectedServices.length > 0 && (
            <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
              <p><strong>Total Price:</strong> ${calculateTotal().toFixed(2)}</p>
              <p><strong>Discount:</strong> {newBundle.discountPercent}%</p>
              <p><strong>Final Price:</strong> ${(calculateTotal() * (1 - newBundle.discountPercent / 100)).toFixed(2)}</p>
            </div>
          )}

          <button type="submit" className="cta">{editingBundle ? 'Update Bundle' : 'Create Bundle'}</button>
        </form>
      )}

      <div style={{ display: 'grid', gap: '1rem' }}>
        {bundles.map(bundle => (
          <div
            key={bundle.bundleId}
            style={{
              background: 'var(--color-accent)',
              padding: '1.5rem',
              borderRadius: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'start'
            }}
          >
            <div>
              <h3 style={{ marginBottom: '0.5rem' }}>{bundle.name}</h3>
              {bundle.description && (
                <p style={{ color: 'var(--color-text)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  {bundle.description}
                </p>
              )}
              <p style={{ color: 'var(--color-text-light)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                {bundle.discountPercent}% discount • ${bundle.price?.toFixed(2)}
              </p>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
                <strong>Services:</strong>
                <ul style={{ marginTop: '0.25rem', paddingLeft: '1.5rem' }}>
                  {bundle.serviceIds?.map(svcId => (
                    <li key={svcId}>{getServiceName(svcId)}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
              <button
                onClick={() => handleEdit(bundle)}
                style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'var(--color-primary)', color: 'white' }}
              >
                Edit
              </button>
              <button
                onClick={() => handleToggleActive(bundle)}
                style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', background: bundle.isActive ? '#4CAF50' : '#999', color: 'white' }}
              >
                {bundle.isActive ? 'Active' : 'Inactive'}
              </button>
              <button
                onClick={() => handleDelete(bundle)}
                style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', background: '#f44336', color: 'white' }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {bundles.length === 0 && (
        <p style={{ color: 'var(--color-text-light)', textAlign: 'center', marginTop: '2rem' }}>
          No bundles created yet.
        </p>
      )}
    </div>
  )
}
