'use client'

import { useState, useEffect, useRef } from 'react'
import { fetchAuthSession } from 'aws-amplify/auth'

export default function Vendors() {
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingVendor, setEditingVendor] = useState(null)
  const [currentUserRole, setCurrentUserRole] = useState(null)
  const formRef = useRef(null)
  const [newVendor, setNewVendor] = useState({
    name: '',
    description: '',
    email: '',
    phone: '',
    bufferMinutes: 15,
    isActive: true,
    isHouse: false,
    workingHours: {
      monday: { start: '09:00', end: '17:00', closed: false },
      tuesday: { start: '09:00', end: '17:00', closed: false },
      wednesday: { start: '09:00', end: '17:00', closed: false },
      thursday: { start: '09:00', end: '17:00', closed: false },
      friday: { start: '09:00', end: '17:00', closed: false },
      saturday: { start: '10:00', end: '15:00', closed: false },
      sunday: { start: '10:00', end: '15:00', closed: true }
    }
  })

  useEffect(() => {
    initVendors()
  }, [])

  const initVendors = async () => {
    try {
      const session = await fetchAuthSession()
      const role = session.tokens?.idToken?.payload['custom:role'] || 'vendor'
      setCurrentUserRole(role)
      if (role === 'vendor') {
        setLoading(false)
        return
      }
      const response = await fetch('/api/vendors?includeInactive=true')
      const data = await response.json()
      setVendors(data.vendors || [])
    } catch (error) {
      console.error('Error loading vendors:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddVendor = async (e) => {
    e.preventDefault()
    
    const method = editingVendor ? 'PATCH' : 'POST'
    const vendorData = {
      vendorId: editingVendor ? editingVendor.vendorId : `vendor-${Date.now()}`,
      name: newVendor.name,
      description: newVendor.description,
      email: newVendor.email,
      phone: newVendor.phone,
      bufferMinutes: newVendor.bufferMinutes,
      isActive: newVendor.isActive,
      isHouse: newVendor.isHouse,
      workingHours: newVendor.workingHours
    }

    if (!editingVendor) {
      vendorData.workingHours = newVendor.workingHours
    }
    
    try {
      const response = await fetch('/api/vendors', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vendorData)
      })

      if (response.ok) {
        alert(editingVendor ? 'Vendor updated successfully!' : 'Vendor added successfully!')
        setShowAddForm(false)
        setEditingVendor(null)
        setNewVendor({ 
          name: '', 
          description: '', 
          email: '', 
          phone: '', 
          bufferMinutes: 15, 
          isActive: true, 
          isHouse: false,
          workingHours: {
            monday: { start: '09:00', end: '17:00', closed: false },
            tuesday: { start: '09:00', end: '17:00', closed: false },
            wednesday: { start: '09:00', end: '17:00', closed: false },
            thursday: { start: '09:00', end: '17:00', closed: false },
            friday: { start: '09:00', end: '17:00', closed: false },
            saturday: { start: '10:00', end: '15:00', closed: false },
            sunday: { start: '10:00', end: '15:00', closed: true }
          }
        })
        loadVendors()
      } else {
        const data = await response.json()
        alert('Failed to save vendor: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error saving vendor:', error)
      alert('Error saving vendor')
    }
  }

  const handleEdit = (vendor) => {
    setEditingVendor(vendor)
    setNewVendor({
      name: vendor.name,
      description: vendor.description || '',
      email: vendor.email,
      phone: vendor.phone || '',
      bufferMinutes: vendor.bufferMinutes || 15,
      isActive: vendor.isActive !== undefined ? vendor.isActive : true,
      isHouse: vendor.isHouse || false,
      workingHours: vendor.workingHours || {
        monday: { start: '09:00', end: '17:00', closed: false },
        tuesday: { start: '09:00', end: '17:00', closed: false },
        wednesday: { start: '09:00', end: '17:00', closed: false },
        thursday: { start: '09:00', end: '17:00', closed: false },
        friday: { start: '09:00', end: '17:00', closed: false },
        saturday: { start: '10:00', end: '15:00', closed: false },
        sunday: { start: '10:00', end: '15:00', closed: true }
      }
    })
    setShowAddForm(true)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  const handleCancelEdit = () => {
    setEditingVendor(null)
    setShowAddForm(false)
    setNewVendor({ 
      name: '', 
      description: '', 
      email: '', 
      phone: '', 
      bufferMinutes: 15, 
      isActive: true, 
      isHouse: false,
      workingHours: {
        monday: { start: '09:00', end: '17:00', closed: false },
        tuesday: { start: '09:00', end: '17:00', closed: false },
        wednesday: { start: '09:00', end: '17:00', closed: false },
        thursday: { start: '09:00', end: '17:00', closed: false },
        friday: { start: '09:00', end: '17:00', closed: false },
        saturday: { start: '10:00', end: '15:00', closed: false },
        sunday: { start: '10:00', end: '15:00', closed: true }
      }
    })
  }

  const handleToggleActive = async (vendor) => {
    try {
      const response = await fetch('/api/vendors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: vendor.vendorId,
          isActive: !vendor.isActive
        })
      })

      if (response.ok) {
        loadVendors()
      } else {
        alert('Failed to update vendor')
      }
    } catch (error) {
      console.error('Error updating vendor:', error)
      alert('Error updating vendor')
    }
  }

  const handleDelete = async (vendor) => {
    if (!confirm(`Delete vendor "${vendor.name}"? This action cannot be undone.`)) return

    try {
      const response = await fetch(`/api/vendors?vendorId=${vendor.vendorId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        alert('Vendor deleted successfully')
        loadVendors()
      } else {
        const data = await response.json()
        alert('Failed to delete vendor: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error deleting vendor:', error)
      alert('Error deleting vendor')
    }
  }

  if (currentUserRole === 'vendor') {
    return (
      <div>
        <h1>Vendors</h1>
        <p style={{ color: 'var(--color-text-light)' }}>
          You do not have permission to access this page.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1>Vendors</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        Manage vendor accounts and information.
      </p>

      {showAddForm && editingVendor && (
        <form ref={formRef} onSubmit={handleAddVendor} style={{
          background: 'var(--color-accent)',
          padding: '1.5rem',
          borderRadius: '8px',
          marginBottom: '2rem',
          maxWidth: '600px'
        }}>
          <h3>{editingVendor ? 'Edit Vendor' : 'Add New Vendor'}</h3>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Vendor Name *</label>
            <input
              type="text"
              required
              value={newVendor.name}
              onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })}
              placeholder="Spa Name"
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
              value={newVendor.description}
              onChange={(e) => setNewVendor({ ...newVendor, description: e.target.value })}
              placeholder="Brief description of the vendor"
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
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Email *</label>
            <input
              type="email"
              required
              value={newVendor.email}
              onChange={(e) => setNewVendor({ ...newVendor, email: e.target.value })}
              placeholder="contact@vendor.com"
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
              value={newVendor.phone}
              onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })}
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
              value={newVendor.bufferMinutes}
              onChange={(e) => setNewVendor({ ...newVendor, bufferMinutes: parseInt(e.target.value) })}
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
                    checked={newVendor.workingHours[day].closed}
                    onChange={(e) => setNewVendor({
                      ...newVendor,
                      workingHours: {
                        ...newVendor.workingHours,
                        [day]: { ...newVendor.workingHours[day], closed: e.target.checked }
                      }
                    })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.9rem' }}>Closed</span>
                </label>
                {!newVendor.workingHours[day].closed && (
                  <>
                    <input
                      type="time"
                      value={newVendor.workingHours[day].start}
                      onChange={(e) => setNewVendor({
                        ...newVendor,
                        workingHours: {
                          ...newVendor.workingHours,
                          [day]: { ...newVendor.workingHours[day], start: e.target.value }
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
                      value={newVendor.workingHours[day].end}
                      onChange={(e) => setNewVendor({
                        ...newVendor,
                        workingHours: {
                          ...newVendor.workingHours,
                          [day]: { ...newVendor.workingHours[day], end: e.target.value }
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
                checked={newVendor.isActive}
                onChange={(e) => setNewVendor({ ...newVendor, isActive: e.target.checked })}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
              <span>Active</span>
            </label>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={newVendor.isHouse}
                onChange={(e) => setNewVendor({ ...newVendor, isHouse: e.target.checked })}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
              <span>House Vendor</span>
            </label>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem', marginLeft: '1.75rem' }}>
              Mark this vendor as "The House" for house fee services
            </p>
          </div>

          <button type="submit" className="cta">{editingVendor ? 'Update Vendor' : 'Add Vendor'}</button>
        </form>
      )}

      {loading && <p>Loading vendors...</p>}

      {!loading && vendors.length === 0 && (
        <p style={{ color: 'var(--color-text-light)' }}>No vendors found.</p>
      )}

      {!loading && vendors.length > 0 && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {vendors.map(vendor => (
            <div
              key={vendor.vendorId}
              style={{
                background: 'var(--color-accent)',
                padding: '1.5rem',
                borderRadius: '8px'
              }}
            >
              <h3 style={{ marginBottom: '0.5rem' }}>{vendor.name}</h3>
              {vendor.description && (
                <p style={{ color: 'var(--color-text)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  {vendor.description}
                </p>
              )}
              <p style={{ color: 'var(--color-text-light)', fontSize: '0.9rem' }}>
                {vendor.email} {vendor.phone && `• ${vendor.phone}`}
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
                Buffer: {vendor.bufferMinutes || 15} min • Status: {vendor.isActive ? '✓ Active' : '✗ Inactive'}
                {vendor.isHouse && ' • 🏠 House Vendor'}
              </p>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => handleEdit(vendor)}
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
                  onClick={() => handleToggleActive(vendor)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    background: vendor.isActive ? '#4CAF50' : '#999',
                    color: 'white'
                  }}
                >
                  {vendor.isActive ? 'Active' : 'Inactive'}
                </button>
                <button
                  onClick={() => handleDelete(vendor)}
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
