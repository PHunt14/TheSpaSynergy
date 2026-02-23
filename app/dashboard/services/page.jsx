'use client'

import { useState, useEffect } from 'react'

export default function Services() {
  const [services, setServices] = useState([])
  const [vendors, setVendors] = useState([])
  const [selectedVendor, setSelectedVendor] = useState('vendor-winsome')
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newService, setNewService] = useState({
    name: '',
    category: '',
    duration: 30,
    price: 0
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
    
    const serviceId = `svc-${Date.now()}`
    
    try {
      const response = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId,
          vendorId: selectedVendor,
          ...newService,
          isActive: true
        })
      })

      if (response.ok) {
        alert('Service added successfully!')
        setShowAddForm(false)
        setNewService({ name: '', category: '', duration: 30, price: 0 })
        const data = await fetch(`/api/services?vendorId=${selectedVendor}`).then(r => r.json())
        setServices(data.services || [])
      } else {
        alert('Failed to add service')
      }
    } catch (error) {
      console.error('Error adding service:', error)
      alert('Error adding service')
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
        onClick={() => setShowAddForm(!showAddForm)}
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
          <h3>Add New Service</h3>
          
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

          <button type="submit" className="cta">Save Service</button>
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
                <p style={{ color: 'var(--color-text-light)', fontSize: '0.9rem' }}>
                  {service.category && `${service.category} • `}{service.duration} min • ${service.price}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
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
