'use client'

import { useState, useEffect } from 'react'

export default function Services() {
  const [services, setServices] = useState([])
  const [vendors, setVendors] = useState([])
  const [selectedVendor, setSelectedVendor] = useState('vendor-winsome')
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingService, setEditingService] = useState(null)
  const [newService, setNewService] = useState({
    name: '',
    category: '',
    description: '',
    duration: 30,
    price: 0,
    requiresConsultation: false,
    resourceType: 'staff'
  })

  useEffect(() => {
    fetch('/api/vendors')
      .then(res => res.json())
      .then(data => {
        setVendors(data.vendors || [])
      })
  }, [])

  useEffect(() => {
    if (!selectedVendor) return

    setLoading(true)
    fetch(`/api/services?vendorId=${selectedVendor}`)
      .then(res => res.json())
      .then(data => {
        setServices(data.services || [])
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading services:', err)
        setLoading(false)
      })
  }, [selectedVendor])

  const handleAddService = async (e) => {
    e.preventDefault()
    
    const serviceId = editingService ? editingService.serviceId : `svc-${Date.now()}`
    const method = editingService ? 'PATCH' : 'POST'
    
    try {
      const response = await fetch('/api/services', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId,
          vendorId: selectedVendor,
          ...newService,
          isActive: editingService ? editingService.isActive : true
        })
      })

      if (response.ok) {
        alert(editingService ? 'Service updated successfully!' : 'Service added successfully!')
        setShowAddForm(false)
        setEditingService(null)
        setNewService({ name: '', category: '', description: '', duration: 30, price: 0, requiresConsultation: false, resourceType: 'staff' })
        const data = await fetch(`/api/services?vendorId=${selectedVendor}`).then(r => r.json())
        setServices(data.services || [])
      } else {
        alert('Failed to save service')
      }
    } catch (error) {
      console.error('Error saving service:', error)
      alert('Error saving service')
    }
  }

  const handleToggleActive = async (service) => {
    try {
      const response = await fetch('/api/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: service.serviceId,
          isActive: !service.isActive
        })
      })

      if (response.ok) {
        const data = await fetch(`/api/services?vendorId=${selectedVendor}`).then(r => r.json())
        setServices(data.services || [])
      } else {
        alert('Failed to update service')
      }
    } catch (error) {
      console.error('Error updating service:', error)
      alert('Error updating service')
    }
  }

  const handleEdit = (service) => {
    setEditingService(service)
    setNewService({
      name: service.name,
      category: service.category || '',
      description: service.description || '',
      duration: service.duration,
      price: service.price,
      requiresConsultation: service.requiresConsultation || false,
      resourceType: service.resourceType || 'staff'
    })
    setShowAddForm(true)
  }

  const handleCancelEdit = () => {
    setEditingService(null)
    setShowAddForm(false)
    setNewService({ name: '', category: '', description: '', duration: 30, price: 0, requiresConsultation: false, resourceType: 'staff' })
  }

  const handleDelete = async (service) => {
    if (!confirm(`Delete "${service.name}"?`)) return

    try {
      const response = await fetch(`/api/services?serviceId=${service.serviceId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        const data = await fetch(`/api/services?vendorId=${selectedVendor}`).then(r => r.json())
        setServices(data.services || [])
      } else {
        alert('Failed to delete service')
      }
    } catch (error) {
      console.error('Error deleting service:', error)
      alert('Error deleting service')
    }
  }

  return (
    <div>
      <h1>Services</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        Manage your service offerings.
      </p>

      <div style={{ marginBottom: '2rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
          Select Vendor:
        </label>
        <select
          value={selectedVendor}
          onChange={(e) => setSelectedVendor(e.target.value)}
          style={{
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid var(--color-border)',
            fontSize: '1rem',
            minWidth: '250px'
          }}
        >
          {vendors.map(vendor => (
            <option key={vendor.vendorId} value={vendor.vendorId}>
              {vendor.name}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={() => {
          if (showAddForm && editingService) {
            handleCancelEdit()
          } else {
            setShowAddForm(!showAddForm)
            if (showAddForm) setEditingService(null)
          }
        }}
        className="cta"
        style={{ marginBottom: '2rem' }}
      >
        {showAddForm ? 'Cancel' : '+ Add New Service'}
      </button>

      {showAddForm && (
        <form onSubmit={handleAddService} style={{
          background: 'var(--color-accent)',
          padding: '1.5rem',
          borderRadius: '8px',
          marginBottom: '2rem'
        }}>
          <h3>{editingService ? 'Edit Service' : 'Add New Service'}</h3>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Service Name *</label>
            <input
              type="text"
              required
              value={newService.name}
              onChange={(e) => setNewService({ ...newService, name: e.target.value })}
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
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Category</label>
            <input
              type="text"
              value={newService.category}
              onChange={(e) => setNewService({ ...newService, category: e.target.value })}
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
              value={newService.description}
              onChange={(e) => setNewService({ ...newService, description: e.target.value })}
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
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Duration (minutes) *</label>
            <input
              type="number"
              required
              min="15"
              step="15"
              value={newService.duration}
              onChange={(e) => setNewService({ ...newService, duration: parseInt(e.target.value) })}
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
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Price ($) *</label>
            <input
              type="number"
              required
              min="0"
              step="0.01"
              value={newService.price}
              onChange={(e) => setNewService({ ...newService, price: parseFloat(e.target.value) })}
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
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={newService.requiresConsultation}
                onChange={(e) => setNewService({ ...newService, requiresConsultation: e.target.checked })}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
              <span>Requires Consultation (customer must call to schedule)</span>
            </label>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Resource Type</label>
            <select
              value={newService.resourceType}
              onChange={(e) => setNewService({ ...newService, resourceType: e.target.value })}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                fontSize: '1rem'
              }}
            >
              <option value="staff">Staff</option>
              <option value="sauna">Sauna</option>
            </select>
          </div>

          <button type="submit" className="cta">{editingService ? 'Update Service' : 'Save Service'}</button>
        </form>
      )}

      {loading && <p>Loading services...</p>}

      {!loading && services.length === 0 && (
        <p style={{ color: 'var(--color-text-light)' }}>No services found.</p>
      )}

      {!loading && services.length > 0 && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {services.map(service => (
            <div
              key={service.serviceId}
              style={{
                background: 'var(--color-accent)',
                padding: '1.5rem',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <h3 style={{ marginBottom: '0.5rem' }}>{service.name}</h3>
                {service.description && (
                  <p style={{ color: 'var(--color-text)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                    {service.description}
                  </p>
                )}
                <p style={{ color: 'var(--color-text-light)', fontSize: '0.9rem' }}>
                  {service.category && `${service.category} • `}{service.duration} min • ${service.price}
                  {service.requiresConsultation && ' • ⚠️ Requires Consultation'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <button
                  onClick={() => handleEdit(service)}
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
                  onClick={() => handleToggleActive(service)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    background: service.isActive ? '#4CAF50' : '#999',
                    color: 'white'
                  }}
                >
                  {service.isActive ? 'Active' : 'Inactive'}
                </button>
                <button
                  onClick={() => handleDelete(service)}
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
