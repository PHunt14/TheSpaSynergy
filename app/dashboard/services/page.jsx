'use client'

import { useState, useEffect, useRef } from 'react'
import { fetchAuthSession } from 'aws-amplify/auth'

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [breakpoint])
  return isMobile
}

export default function Services() {
  const [services, setServices] = useState([])
  const [vendors, setVendors] = useState([])
  const [staffMembers, setStaffMembers] = useState([])
  const [staffSchedules, setStaffSchedules] = useState([])
  const [selectedVendor, setSelectedVendor] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingService, setEditingService] = useState(null)
  const [managingAddonsFor, setManagingAddonsFor] = useState(null)
  const [currentUserRole, setCurrentUserRole] = useState(null)
  const [currentUserVendorId, setCurrentUserVendorId] = useState(null)
  const [expandedServiceId, setExpandedServiceId] = useState(null)
  const isMobile = useIsMobile()
  const formRef = useRef(null)
  const [newService, setNewService] = useState({
    name: '',
    category: '',
    description: '',
    duration: 30,
    price: 0,
    bufferMinutes: '',
    requiresConsultation: false,
    cardPaymentDisabled: false,
    resourceType: 'staff',
    staffRestriction: 'all',
    allowedStaff: [],
    parentServiceIds: [],
    maxQuantityPerBooking: 1,
    providersRequired: 1
  })

  useEffect(() => {
    initServices()
  }, [])

  const initServices = async () => {
    try {
      const [session, vendorRes, staffRes, scheduleRes] = await Promise.all([
        fetchAuthSession(),
        fetch('/api/vendors').then(r => r.json()),
        fetch('/api/staff').then(r => r.json()),
        fetch('/api/staff-schedules').then(r => r.json())
      ])
      const vendorId = session.tokens?.idToken?.payload['custom:vendorId']
      const role = session.tokens?.idToken?.payload['custom:role'] || 'vendor'
      setCurrentUserRole(role)
      setCurrentUserVendorId(vendorId)
      setVendors(vendorRes.vendors || [])
      setStaffMembers(staffRes.users || [])
      setStaffSchedules(scheduleRes.schedules || [])

      if ((role === 'vendor' || role === 'owner') && vendorId) {
        setSelectedVendor(vendorId)
      } else if (role === 'admin') {
        setSelectedVendor(vendorId || vendorRes.vendors?.[0]?.vendorId || '')
      }
    } catch (error) {
      console.error('Error initializing services:', error)
    }
  }

  useEffect(() => {
    if (!selectedVendor) return

    setLoading(true)
    fetch(`/api/services?vendorId=${selectedVendor}&includeInactive=true`)
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
    
    const serviceData = {
      serviceId,
      vendorId: selectedVendor,
      name: newService.name,
      category: newService.category,
      description: newService.description,
      duration: newService.duration,
      price: newService.price,
      bufferMinutes: newService.bufferMinutes !== '' ? parseInt(newService.bufferMinutes) : null,
      houseFeeEnabled: newService.houseFeeEnabled,
      houseFeeAmount: newService.houseFeeEnabled ? newService.houseFeeAmount : 0,
      requiresConsultation: newService.requiresConsultation,
      cardPaymentDisabled: newService.cardPaymentDisabled,
      resourceType: newService.resourceType,
      allowedStaff: newService.staffRestriction === 'all' ? null : newService.allowedStaff,
      parentServiceIds: newService.parentServiceIds.length > 0 ? newService.parentServiceIds : null,
      maxQuantityPerBooking: newService.maxQuantityPerBooking,
      providersRequired: newService.providersRequired,
      isActive: editingService ? editingService.isActive : true
    }
    
    try {
      const response = await fetch('/api/services', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serviceData)
      })

      if (response.ok) {
        alert(editingService ? 'Service updated successfully!' : 'Service added successfully!')
        setShowAddForm(false)
        setEditingService(null)
        setNewService({ name: '', category: '', description: '', duration: 30, price: 0, bufferMinutes: '', requiresConsultation: false, cardPaymentDisabled: false, resourceType: 'staff', staffRestriction: 'all', allowedStaff: [], parentServiceIds: [], maxQuantityPerBooking: 1, providersRequired: 1, houseFeeEnabled: false, houseFeeAmount: 0 })
        const data = await fetch(`/api/services?vendorId=${selectedVendor}&includeInactive=true`).then(r => r.json())
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
        const data = await fetch(`/api/services?vendorId=${selectedVendor}&includeInactive=true`).then(r => r.json())
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
      bufferMinutes: service.bufferMinutes != null ? service.bufferMinutes : '',
      houseFeeEnabled: service.houseFeeEnabled || false,
      houseFeeAmount: service.houseFeeAmount || 0,
      requiresConsultation: service.requiresConsultation || false,
      cardPaymentDisabled: service.cardPaymentDisabled || false,
      resourceType: service.resourceType || 'staff',
      staffRestriction: (service.allowedStaff && service.allowedStaff.length > 0) ? 'specific' : 'all',
      allowedStaff: service.allowedStaff || [],
      parentServiceIds: service.parentServiceIds || [],
      maxQuantityPerBooking: service.maxQuantityPerBooking || 1,
    providersRequired: service.providersRequired || 1
  })
  setShowAddForm(false)
}

  const handleCancelEdit = () => {
    setEditingService(null)
    setShowAddForm(false)
    setNewService({ name: '', category: '', description: '', duration: 30, price: 0, bufferMinutes: '', requiresConsultation: false, cardPaymentDisabled: false, resourceType: 'staff', staffRestriction: 'all', allowedStaff: [], parentServiceIds: [], maxQuantityPerBooking: 1, providersRequired: 1, houseFeeEnabled: false, houseFeeAmount: 0 })
  }

  const handleAttachAddon = async (addonServiceId, parentServiceId) => {
    const addon = services.find(s => s.serviceId === addonServiceId)
    const currentParents = addon?.parentServiceIds || []
    if (currentParents.includes(parentServiceId)) return

    const updatedParents = [...currentParents, parentServiceId]
    try {
      await fetch('/api/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId: addonServiceId, parentServiceIds: updatedParents })
      })
      const data = await fetch(`/api/services?vendorId=${selectedVendor}&includeInactive=true`).then(r => r.json())
      setServices(data.services || [])
    } catch (e) { console.error('Error attaching add-on:', e) }
  }

  const handleDetachAddon = async (addonServiceId, parentServiceId) => {
    const addon = services.find(s => s.serviceId === addonServiceId)
    const updatedParents = (addon?.parentServiceIds || []).filter(id => id !== parentServiceId)

    try {
      await fetch('/api/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId: addonServiceId, parentServiceIds: updatedParents.length > 0 ? updatedParents : null })
      })
      const data = await fetch(`/api/services?vendorId=${selectedVendor}&includeInactive=true`).then(r => r.json())
      setServices(data.services || [])
    } catch (e) { console.error('Error detaching add-on:', e) }
  }

  const handleCreateAddon = async (parentServiceId, name, price, duration) => {
    const serviceId = `svc-addon-${Date.now()}`
    try {
      await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId,
          vendorId: selectedVendor,
          name,
          price,
          duration,
          parentServiceIds: [parentServiceId],
          isActive: true,
          resourceType: 'staff',
        })
      })
      const data = await fetch(`/api/services?vendorId=${selectedVendor}&includeInactive=true`).then(r => r.json())
      setServices(data.services || [])
    } catch (e) { console.error('Error creating add-on:', e) }
  }

  const handleDelete = async (service) => {
    if (!confirm(`Delete "${service.name}"?`)) return

    try {
      const response = await fetch(`/api/services?serviceId=${service.serviceId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        const data = await fetch(`/api/services?vendorId=${selectedVendor}&includeInactive=true`).then(r => r.json())
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
          disabled={currentUserRole === 'vendor' || currentUserRole === 'owner'}
          style={{
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid var(--color-border)',
            fontSize: '1rem',
            minWidth: '250px',
            background: (currentUserRole === 'vendor' || currentUserRole === 'owner') ? '#f5f5f5' : 'white',
            cursor: (currentUserRole === 'vendor' || currentUserRole === 'owner') ? 'not-allowed' : 'pointer'
          }}
        >
          {vendors.map(vendor => (
            <option key={vendor.vendorId} value={vendor.vendorId}>
              {vendor.name}
            </option>
          ))}
        </select>
        {(currentUserRole === 'vendor' || currentUserRole === 'owner') && (
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
            Vendors can only manage services for their assigned vendor
          </p>
        )}
      </div>

      <button
        onClick={() => {
          if (showAddForm) {
            handleCancelEdit()
          } else {
            setEditingService(null)
            setShowAddForm(true)
          }
        }}
        className="cta"
        style={{ marginBottom: '2rem' }}
      >
        {showAddForm ? 'Cancel' : '+ Add New Service'}
      </button>

      {showAddForm && !editingService && (
        <form ref={formRef} onSubmit={handleAddService} style={{
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
              min="5"
              step="5"
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
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Buffer Time (minutes)</label>
            <input
              type="number"
              min="0"
              step="5"
              value={newService.bufferMinutes}
              onChange={(e) => setNewService({ ...newService, bufferMinutes: e.target.value === '' ? '' : parseInt(e.target.value) })}
              placeholder="Use vendor default"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                fontSize: '1rem'
              }}
            />
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
              Time buffer after this service before the next appointment. Leave blank to use the vendor default (15 min).
            </p>
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
                checked={newService.houseFeeEnabled}
                onChange={(e) => setNewService({ ...newService, houseFeeEnabled: e.target.checked })}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
              <span>House Fee Enabled</span>
            </label>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem', marginLeft: '1.75rem' }}>
              A portion of this service&apos;s price goes to the house (facility fee).
            </p>
          </div>

          {newService.houseFeeEnabled && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>House Fee Amount ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newService.houseFeeAmount}
                onChange={(e) => setNewService({ ...newService, houseFeeAmount: parseFloat(e.target.value) || 0 })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  fontSize: '1rem'
                }}
              />
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
                Fixed dollar amount deducted from the service price and paid to the house. Vendor receives ${(newService.price - (newService.houseFeeAmount || 0)).toFixed(2)}.
              </p>
            </div>
          )}

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
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={newService.cardPaymentDisabled}
                onChange={(e) => setNewService({ ...newService, cardPaymentDisabled: e.target.checked })}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
              <span>Disable Card Payment (customers must pay in-person)</span>
            </label>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Max Quantity Per Booking</label>
            <input
              type="number"
              min="1"
              max="10"
              value={newService.maxQuantityPerBooking}
              onChange={(e) => setNewService({ ...newService, maxQuantityPerBooking: parseInt(e.target.value) || 1 })}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                fontSize: '1rem'
              }}
            />
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
              Allow customers to book multiple units at once (e.g., 3 haircuts for a family). Set to 1 to disable.
            </p>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Providers Required</label>
            <input
              type="number"
              min="1"
              max="10"
              value={newService.providersRequired}
              onChange={(e) => setNewService({ ...newService, providersRequired: parseInt(e.target.value) || 1 })}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                fontSize: '1rem'
              }}
            />
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
              Number of staff needed simultaneously (e.g., 2 for a couples service). Each provider gets their own appointment on their calendar.
            </p>
          </div>

          <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f3e8ff', borderRadius: '8px' }}>
            <p style={{ fontSize: '0.85rem', color: '#6A1B9A', margin: 0 }}>
              💡 To make this an add-on of another service, use the <strong>🧩 Add-ons</strong> button on the parent service after creating it.
            </p>
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
              <option value="room">Spa Room</option>
            </select>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
              {newService.resourceType === 'staff' && 'Service is performed by a staff member. Availability is based on staff schedules.'}
              {newService.resourceType === 'sauna' && 'Uses the sauna facility. Only one booking at a time per vendor.'}
              {newService.resourceType === 'room' && 'Uses the shared spa room. Only one booking at a time across all vendors (e.g., head bath, facial).'}
            </p>
          </div>

          {newService.resourceType === 'staff' && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Staff Assignment</label>
                <select
                  value={newService.staffRestriction}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === 'specific' && newService.allowedStaff.length === 0) {
                      // Auto-select all active staff when switching to specific, so user can uncheck individuals
                      const allStaffIds = staffSchedules
                        .filter(s => s.vendorId === selectedVendor && s.isActive !== false)
                        .map(s => s.visibleId)
                      setNewService({ ...newService, staffRestriction: value, allowedStaff: allStaffIds })
                    } else {
                      setNewService({ 
                        ...newService, 
                        staffRestriction: value,
                        allowedStaff: value === 'all' ? [] : newService.allowedStaff
                      })
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    fontSize: '1rem'
                  }}
                >
                  <option value="all">All Staff Members</option>
                  <option value="specific">Specific Staff Members</option>
                </select>
                {newService.staffRestriction === 'all' && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
                    All staff can perform this service. Switch to &quot;Specific&quot; to choose individual staff members.
                  </p>
                )}
              </div>

              {newService.staffRestriction === 'specific' && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem' }}>Select Staff Members</label>
                  <div style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '0.75rem', maxHeight: '200px', overflowY: 'auto' }}>
                    {staffSchedules
                      .filter(s => s.vendorId === selectedVendor && s.isActive !== false)
                      .map(s => (
                        <label key={s.visibleId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.35rem 0' }}>
                          <input
                            type="checkbox"
                            checked={newService.allowedStaff.includes(s.visibleId)}
                            onChange={(e) => {
                              const updated = e.target.checked
                                ? [...newService.allowedStaff, s.visibleId]
                                : newService.allowedStaff.filter(id => id !== s.visibleId)
                              setNewService({ ...newService, allowedStaff: updated })
                            }}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                          />
                          <span>{s.staffName}</span>
                        </label>
                      ))}
                    {staffSchedules.filter(s => s.vendorId === selectedVendor && s.isActive !== false).length === 0 && (
                      <p style={{ color: 'var(--color-text-light)', fontSize: '0.9rem', margin: 0 }}>No staff schedules found for this vendor.</p>
                    )}
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
                    Only selected staff members will be available for this service.
                  </p>
                </div>
              )}
            </>
          )}

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button type="submit" className="cta">Save Service</button>
          </div>
        </form>
      )}

      {loading && <p>Loading services...</p>}

      {!loading && services.length === 0 && (
        <p style={{ color: 'var(--color-text-light)' }}>No services found.</p>
      )}

      {!loading && services.length > 0 && (() => {
        const parentServices = services.filter(s => !(s.parentServiceIds?.length > 0))
        const getAddons = (parentId) => services.filter(s => s.parentServiceIds?.includes(parentId))

        const editForm = (
          <form ref={formRef} onSubmit={handleAddService} style={{
            background: '#fff8f0',
            padding: '1.5rem',
            borderRadius: '8px',
            border: '2px solid var(--color-primary)',
          }}>
            <h3>{editingService ? `Editing: ${editingService.name}` : 'Add New Service'}</h3>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Service Name *</label>
              <input type="text" required value={newService.name} onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Category</label>
              <input type="text" value={newService.category} onChange={(e) => setNewService({ ...newService, category: e.target.value })}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Description</label>
              <textarea value={newService.description} onChange={(e) => setNewService({ ...newService, description: e.target.value })} rows="3"
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem', resize: 'vertical' }} />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Duration (minutes) *</label>
              <input type="number" required min="5" step="5" value={newService.duration} onChange={(e) => setNewService({ ...newService, duration: parseInt(e.target.value) })}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Buffer Time (minutes)</label>
              <input type="number" min="0" step="5" value={newService.bufferMinutes} onChange={(e) => setNewService({ ...newService, bufferMinutes: e.target.value === '' ? '' : parseInt(e.target.value) })}
                placeholder="Use vendor default"
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
                Time buffer after this service before the next appointment. Leave blank to use the vendor default (15 min).
              </p>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Price ($) *</label>
              <input type="number" required min="0" step="0.01" value={newService.price} onChange={(e) => setNewService({ ...newService, price: parseFloat(e.target.value) })}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={newService.houseFeeEnabled} onChange={(e) => setNewService({ ...newService, houseFeeEnabled: e.target.checked })}
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                <span>House Fee Enabled</span>
              </label>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem', marginLeft: '1.75rem' }}>
                A portion of this service&apos;s price goes to the house (facility fee).
              </p>
            </div>

            {newService.houseFeeEnabled && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>House Fee Amount ($)</label>
                <input type="number" min="0" step="0.01" value={newService.houseFeeAmount} onChange={(e) => setNewService({ ...newService, houseFeeAmount: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
                  Fixed dollar amount deducted from the service price and paid to the house. Vendor receives ${(newService.price - (newService.houseFeeAmount || 0)).toFixed(2)}.
                </p>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={newService.requiresConsultation} onChange={(e) => setNewService({ ...newService, requiresConsultation: e.target.checked })}
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                <span>Requires Consultation (customer must call to schedule)</span>
              </label>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={newService.cardPaymentDisabled} onChange={(e) => setNewService({ ...newService, cardPaymentDisabled: e.target.checked })}
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                <span>Disable Card Payment (customers must pay in-person)</span>
              </label>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Max Quantity Per Booking</label>
              <input type="number" min="1" max="10" value={newService.maxQuantityPerBooking} onChange={(e) => setNewService({ ...newService, maxQuantityPerBooking: parseInt(e.target.value) || 1 })}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
                Allow customers to book multiple units at once (e.g., 3 haircuts for a family). Set to 1 to disable.
              </p>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Providers Required</label>
              <input type="number" min="1" max="10" value={newService.providersRequired} onChange={(e) => setNewService({ ...newService, providersRequired: parseInt(e.target.value) || 1 })}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
                Number of staff needed simultaneously (e.g., 2 for a couples service). Each provider gets their own appointment on their calendar.
              </p>
            </div>

            {editingService?.parentServiceIds?.length > 0 && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f3e8ff', borderRadius: '8px' }}>
                <p style={{ fontSize: '0.85rem', color: '#6A1B9A', margin: 0 }}>
                  🧩 This is an add-on of: <strong>{editingService.parentServiceIds.map(id => services.find(s => s.serviceId === id)?.name || id).join(', ')}</strong>
                  <br /><span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>Manage add-on assignments from the parent service&apos;s 🧩 Add-ons button.</span>
                </p>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Resource Type</label>
              <select value={newService.resourceType} onChange={(e) => setNewService({ ...newService, resourceType: e.target.value })}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }}>
                <option value="staff">Staff</option>
                <option value="sauna">Sauna</option>
                <option value="room">Spa Room</option>
              </select>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
                {newService.resourceType === 'staff' && 'Availability based on staff schedules.'}
                {newService.resourceType === 'sauna' && 'One booking at a time per vendor.'}
                {newService.resourceType === 'room' && 'One booking at a time across all vendors.'}
              </p>
            </div>

            {newService.resourceType === 'staff' && (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem' }}>Staff Assignment</label>
                  <select value={newService.staffRestriction}
                    onChange={(e) => {
                      const value = e.target.value
                      if (value === 'specific' && newService.allowedStaff.length === 0) {
                        // Auto-select all active staff when switching to specific, so user can uncheck individuals
                        const allStaffIds = staffSchedules
                          .filter(s => s.vendorId === selectedVendor && s.isActive !== false)
                          .map(s => s.visibleId)
                        setNewService({ ...newService, staffRestriction: value, allowedStaff: allStaffIds })
                      } else {
                        setNewService({ ...newService, staffRestriction: value, allowedStaff: value === 'all' ? [] : newService.allowedStaff })
                      }
                    }}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }}>
                    <option value="all">All Staff Members</option>
                    <option value="specific">Specific Staff Members</option>
                  </select>
                  {newService.staffRestriction === 'all' && (
                    <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
                      All staff can perform this service. Switch to &quot;Specific&quot; to choose individual staff members.
                    </p>
                  )}
                </div>

                {newService.staffRestriction === 'specific' && (
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem' }}>Select Staff Members</label>
                    <div style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '0.75rem', maxHeight: '200px', overflowY: 'auto' }}>
                      {staffSchedules.filter(s => s.vendorId === selectedVendor && s.isActive !== false).map(s => (
                        <label key={s.visibleId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.35rem 0' }}>
                          <input type="checkbox" checked={newService.allowedStaff.includes(s.visibleId)}
                            onChange={(e) => { setNewService({ ...newService, allowedStaff: e.target.checked ? [...newService.allowedStaff, s.visibleId] : newService.allowedStaff.filter(id => id !== s.visibleId) }) }}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                          <span>{s.staffName}</span>
                        </label>
                      ))}
                      {staffSchedules.filter(s => s.vendorId === selectedVendor && s.isActive !== false).length === 0 && (
                        <p style={{ color: 'var(--color-text-light)', fontSize: '0.9rem', margin: 0 }}>No staff schedules found for this vendor.</p>
                      )}
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
                      Only selected staff members will be available for this service.
                    </p>
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="submit" className="cta">{editingService ? 'Update Service' : 'Save Service'}</button>
              <button type="button" onClick={handleCancelEdit} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: '1px solid var(--color-border)', cursor: 'pointer', background: 'white', fontSize: '1rem' }}>Cancel</button>
            </div>
          </form>
        )

        const ManageAddonsPanel = ({ parentService }) => {
          const [newAddonName, setNewAddonName] = useState('')
          const [newAddonPrice, setNewAddonPrice] = useState(0)
          const [newAddonDuration, setNewAddonDuration] = useState(15)
          const [creating, setCreating] = useState(false)

          const currentAddons = services.filter(s => s.parentServiceIds?.includes(parentService.serviceId))
          // Services that could be attached as add-ons: not already an add-on of this service, not a parent service itself that has add-ons, not the service itself
          const attachable = services.filter(s =>
            s.serviceId !== parentService.serviceId &&
            !s.parentServiceIds?.includes(parentService.serviceId) &&
            s.isActive !== false
          )

          return (
            <div style={{ background: '#f3e8ff', padding: '1.25rem 1.5rem', borderTop: '2px solid #9C27B0' }}>
              <h4 style={{ margin: '0 0 1rem', color: '#6A1B9A' }}>🧩 Manage Add-ons for: {parentService.name}</h4>

              {/* Current add-ons */}
              {currentAddons.length > 0 ? (
                <div style={{ marginBottom: '1rem' }}>
                  <p style={{ fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem' }}>Current Add-ons:</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {currentAddons.map(addon => (
                      <div key={addon.serviceId} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'white', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}>
                        <span>{addon.name} (${addon.price})</span>
                        <button onClick={() => handleDetachAddon(addon.serviceId, parentService.serviceId)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f44336', fontWeight: 'bold', fontSize: '1.1rem', lineHeight: 1, padding: '0 0.25rem' }}
                          title="Remove from this service">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginBottom: '1rem' }}>No add-ons attached yet.</p>
              )}

              {/* Attach existing service */}
              {attachable.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <p style={{ fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem' }}>Attach existing service as add-on:</p>
                  <select
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) { handleAttachAddon(e.target.value, parentService.serviceId); e.target.value = '' } }}
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', minWidth: '200px' }}>
                    <option value="">Select a service...</option>
                    {attachable.map(s => (
                      <option key={s.serviceId} value={s.serviceId}>{s.name} (${s.price}, {s.duration} min)</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Create new add-on */}
              <div style={{ borderTop: '1px solid #d1c4e9', paddingTop: '0.75rem' }}>
                <p style={{ fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem' }}>Create new add-on:</p>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-light)' }}>Name</label>
                    <input type="text" value={newAddonName} onChange={(e) => setNewAddonName(e.target.value)} placeholder="e.g. Mini Facial"
                      style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', width: '160px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-light)' }}>Price ($)</label>
                    <input type="number" min="0" step="0.01" value={newAddonPrice} onChange={(e) => setNewAddonPrice(parseFloat(e.target.value) || 0)}
                      style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', width: '80px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-light)' }}>Duration (min)</label>
                    <input type="number" min="5" step="5" value={newAddonDuration} onChange={(e) => setNewAddonDuration(parseInt(e.target.value) || 15)}
                      style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', width: '80px' }} />
                  </div>
                  <button
                    disabled={!newAddonName || creating}
                    onClick={async () => {
                      setCreating(true)
                      await handleCreateAddon(parentService.serviceId, newAddonName, newAddonPrice, newAddonDuration)
                      setNewAddonName(''); setNewAddonPrice(0); setNewAddonDuration(15)
                      setCreating(false)
                    }}
                    style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', cursor: newAddonName ? 'pointer' : 'not-allowed', background: '#9C27B0', color: 'white', fontSize: '0.9rem', opacity: !newAddonName || creating ? 0.5 : 1 }}>
                    {creating ? 'Creating...' : '+ Create'}
                  </button>
                </div>
              </div>
            </div>
          )
        }

        const ServiceRow = ({ service, isAddon }) => {
          const staffNames = service.allowedStaff && service.allowedStaff.length > 0
            ? service.allowedStaff.map(id => {
                const staff = staffSchedules.find(s => s.visibleId === id)
                return staff?.staffName?.split(' ')[0] || id.replace('staff-', '')
              })
            : null
          const addons = getAddons(service.serviceId)
          const isExpanded = expandedServiceId === service.serviceId

          return (
          <div key={service.serviceId}>
            <div
              onClick={() => { if (isMobile) setExpandedServiceId(isExpanded ? null : service.serviceId) }}
              onKeyDown={(e) => { if (isMobile && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setExpandedServiceId(isExpanded ? null : service.serviceId) } }}
              role={isMobile ? 'button' : undefined}
              tabIndex={isMobile ? 0 : undefined}
              aria-expanded={isMobile ? isExpanded : undefined}
              style={{
                background: isAddon ? '#f9f5f0' : 'var(--color-accent)',
                padding: isAddon ? '1rem 1.5rem 1rem 2.5rem' : '1.5rem',
                borderRadius: isAddon ? '0' : '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: isMobile ? 'flex-start' : 'center',
                flexDirection: isMobile ? 'column' : 'row',
                cursor: isMobile ? 'pointer' : 'default',
                ...(isAddon ? { borderTop: '1px dashed var(--color-border)' } : {})
              }}
            >
              <div style={{ width: '100%' }}>
                <h3 style={{ marginBottom: '0.5rem', fontSize: isAddon ? '1rem' : undefined }}>
                  {isAddon && <span style={{ color: 'var(--color-text-light)', marginRight: '0.5rem' }}>↳</span>}
                  {service.name}
                  {isAddon && <span style={{ fontSize: '0.8rem', color: 'var(--color-primary)', marginLeft: '0.5rem', fontWeight: 'normal' }}>Add-on</span>}
                  {isMobile && (
                    <span style={{ float: 'right', fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  )}
                </h3>
                {service.description && (
                  <p style={{ color: 'var(--color-text)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                    {service.description}
                  </p>
                )}
                <p style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>
                  {service.category && `${service.category} • `}{service.duration} min • ${service.price}
                  {service.houseFeeEnabled && ` • 🏠 $${service.houseFeeAmount} → You keep $${(service.price - (service.houseFeeAmount || 0)).toFixed(0)}`}
                  {service.maxQuantityPerBooking > 1 && ` • 🔢 Up to ${service.maxQuantityPerBooking}`}
                  {service.providersRequired > 1 && ` • 👥 ${service.providersRequired} providers`}
                  {staffNames && ` • 👤 ${staffNames.join(', ')}`}
                  {service.requiresConsultation && ' • ⚠️ Requires Consultation'}
                  {service.cardPaymentDisabled && ' • 💳 Card Payment Disabled'}
                  {!isAddon && addons.length > 0 && ` • 🧩 ${addons.length} add-on${addons.length > 1 ? 's' : ''}`}
                </p>
                {isMobile && !isExpanded && (
                  <span style={{ display: 'inline-block', marginTop: '0.4rem', fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: service.isActive ? '#e8f5e9' : '#eee', color: service.isActive ? '#2e7d32' : '#666' }}>
                    {service.isActive ? '● Active' : '○ Inactive'}
                  </span>
                )}
              </div>

              {/* Desktop: always show buttons */}
              {!isMobile && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                  {!isAddon && (
                    <button onClick={() => setManagingAddonsFor(managingAddonsFor?.serviceId === service.serviceId ? null : service)}
                      style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', background: managingAddonsFor?.serviceId === service.serviceId ? '#FF9800' : '#9C27B0', color: 'white' }}>
                      {managingAddonsFor?.serviceId === service.serviceId ? 'Close' : '🧩 Add-ons'}
                    </button>
                  )}
                  <button onClick={() => handleEdit(service)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'var(--color-primary)', color: 'white' }}>Edit</button>
                  <button onClick={() => handleToggleActive(service)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', background: service.isActive ? '#4CAF50' : '#999', color: 'white' }}>{service.isActive ? 'Active' : 'Inactive'}</button>
                  <button onClick={() => handleDelete(service)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', background: '#f44336', color: 'white' }}>Delete</button>
                </div>
              )}

              {/* Mobile: show actions when expanded */}
              {isMobile && isExpanded && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem', width: '100%' }} onClick={(e) => e.stopPropagation()} role="group" aria-label="Service actions" onKeyDown={(e) => e.stopPropagation()}>
                  {!isAddon && (
                    <button onClick={() => setManagingAddonsFor(managingAddonsFor?.serviceId === service.serviceId ? null : service)}
                      style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: 'none', cursor: 'pointer', background: managingAddonsFor?.serviceId === service.serviceId ? '#FF9800' : '#9C27B0', color: 'white', fontSize: '0.85rem', flex: '1 1 auto' }}>
                      {managingAddonsFor?.serviceId === service.serviceId ? 'Close' : '🧩 Add-ons'}
                    </button>
                  )}
                  <button onClick={() => handleEdit(service)} style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'var(--color-primary)', color: 'white', fontSize: '0.85rem', flex: '1 1 auto' }}>✏️ Edit</button>
                  <button onClick={() => handleToggleActive(service)} style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: 'none', cursor: 'pointer', background: service.isActive ? '#4CAF50' : '#999', color: 'white', fontSize: '0.85rem', flex: '1 1 auto' }}>{service.isActive ? '✓ Active' : '○ Inactive'}</button>
                  <button onClick={() => handleDelete(service)} style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: 'none', cursor: 'pointer', background: '#f44336', color: 'white', fontSize: '0.85rem', flex: '1 1 auto' }}>🗑 Delete</button>
                </div>
              )}
            </div>
            {editingService?.serviceId === service.serviceId && (
              <div style={{ marginTop: '0.5rem' }}>
                {editForm}
              </div>
            )}
            {!isAddon && managingAddonsFor?.serviceId === service.serviceId && (
              <ManageAddonsPanel parentService={service} />
            )}
          </div>
          )
        }

        return (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {parentServices.map(service => {
              const addons = getAddons(service.serviceId)
              return (
                <div key={service.serviceId} style={{ borderRadius: '8px', overflow: 'hidden', border: addons.length > 0 ? '1px solid var(--color-border)' : 'none' }}>
                  <ServiceRow service={service} isAddon={false} />
                  {addons.map(addon => (
                    <ServiceRow key={addon.serviceId} service={addon} isAddon={true} />
                  ))}
                </div>
              )
            })}
          </div>
        )
      })()}
    </div>
  )
}
