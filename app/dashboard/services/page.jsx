'use client'

import { useState, useEffect, useRef, Fragment } from 'react'
import { fetchAuthSession } from 'aws-amplify/auth'
import useIsMobile from '../../hooks/useIsMobile'

export default function Services() {
  const [services, setServices] = useState([])
  const [staffSchedules, setStaffSchedules] = useState([])
  const [existingCategories, setExistingCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingService, setEditingService] = useState(null)
  const [managingAddonsFor, setManagingAddonsFor] = useState(null)
  const [currentUserRole, setCurrentUserRole] = useState(null)
  const [currentUserStaffId, setCurrentUserStaffId] = useState(null)
  const [expandedServiceId, setExpandedServiceId] = useState(null)
  const isMobile = useIsMobile()
  const formRef = useRef(null)
  const [newService, setNewService] = useState({
    name: '',
    categories: [],
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
    providersRequired: 1,
    houseFeeEnabled: false,
    houseFeeAmount: 0
  })

  // Category input state for the dropdown
  const [categoryInput, setCategoryInput] = useState('')
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [categoryError, setCategoryError] = useState('')
  const categoryInputRef = useRef(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [sortBy, setSortBy] = useState('name')

  useEffect(() => {
    initServices()
  }, [])

  const initServices = async () => {
    try {
      const [session, scheduleRes] = await Promise.all([
        fetchAuthSession(),
        fetch('/api/staff-schedules?all=true').then(r => r.json())
      ])
      const role = session.tokens?.idToken?.payload['custom:role'] || 'staff'
      const staffId = session.tokens?.idToken?.payload['custom:staffId'] || ''

      // Map legacy roles to the two-role model
      const normalizedRole = role === 'admin' ? 'admin' : 'staff'
      setCurrentUserRole(normalizedRole)
      setCurrentUserStaffId(staffId)
      setStaffSchedules(scheduleRes.schedules || [])

      // Fetch all services (no vendor filtering)
      await loadServices()
      // Fetch existing categories
      await loadCategories()
    } catch (error) {
      console.error('Error initializing services:', error)
    }
  }

  const loadServices = async () => {
    setLoading(true)
    try {
      const data = await fetch('/api/services?includeInactive=true').then(r => r.json())
      setServices(data.services || [])
    } catch (err) {
      console.error('Error loading services:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadCategories = async () => {
    try {
      const res = await fetch('/api/categories')
      const data = await res.json()
      const cats = (data.categories || []).map(c => c.name)
      setExistingCategories(cats.sort((a, b) => a.localeCompare(b)))
    } catch (err) {
      console.error('Error loading categories:', err)
    }
  }

  const handleStaffToggle = (staffId, checked) => {
    const updated = checked
      ? [...newService.allowedStaff, staffId]
      : newService.allowedStaff.filter(id => id !== staffId)
    setNewService({ ...newService, allowedStaff: updated })
  }

  // Helper to check if user can perform an action
  const canCreate = true
  const canDelete = true

  const handleAddService = async (e) => {
    e.preventDefault()

    // Validate categories (at least 1 required)
    if (newService.categories.length === 0) {
      alert('Please select at least one category.')
      return
    }

    const serviceId = editingService ? editingService.serviceId : `svc-${Date.now()}`
    const method = editingService ? 'PATCH' : 'POST'

    // Staff can only edit price - the form already restricts fields, but double-check
    const serviceData = {
      serviceId,
      name: newService.name,
      categories: newService.categories,
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
        resetForm()
        await loadServices()
        await loadCategories()
      } else {
        alert('Failed to save service')
      }
    } catch (error) {
      console.error('Error saving service:', error)
      alert('Error saving service')
    }
  }

  // Staff can only update price
  const handleStaffPriceUpdate = async (e) => {
    e.preventDefault()
    if (!editingService) return

    try {
      const response = await fetch('/api/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: editingService.serviceId,
          price: newService.price
        })
      })

      if (response.ok) {
        alert('Price updated successfully!')
        setEditingService(null)
        resetForm()
        await loadServices()
      } else {
        alert('Failed to update price')
      }
    } catch (error) {
      console.error('Error updating price:', error)
      alert('Error updating price')
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
        await loadServices()
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
    const categories = service.categories && Array.isArray(service.categories)
      ? service.categories
      : (service.category ? [service.category] : [])
    setNewService({
      name: service.name,
      categories: categories,
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

  const resetForm = () => {
    setNewService({
      name: '',
      categories: [],
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
      providersRequired: 1,
      houseFeeEnabled: false,
      houseFeeAmount: 0
    })
    setCategoryInput('')
    setCategoryError('')
  }

  const handleCancelEdit = () => {
    setEditingService(null)
    setShowAddForm(false)
    resetForm()
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
      await loadServices()
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
      await loadServices()
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
          name,
          price,
          duration,
          categories: [],
          parentServiceIds: [parentServiceId],
          isActive: true,
          resourceType: 'staff',
        })
      })
      await loadServices()
    } catch (e) { console.error('Error creating add-on:', e) }
  }

  const handleDelete = async (service) => {
    if (!confirm(`Delete "${service.name}"?`)) return

    try {
      const response = await fetch(`/api/services?serviceId=${service.serviceId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await loadServices()
      } else {
        alert('Failed to delete service')
      }
    } catch (error) {
      console.error('Error deleting service:', error)
      alert('Error deleting service')
    }
  }

  // Category management helpers
  const addCategory = (categoryName) => {
    const trimmed = categoryName.trim()
    if (!trimmed) return

    // Validate max 5 categories
    if (newService.categories.length >= 5) {
      setCategoryError('Maximum 5 categories allowed per service')
      return
    }

    // Check duplicate (case-insensitive)
    if (newService.categories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      setCategoryError('Category already added to this service')
      return
    }

    // Validate length
    if (trimmed.length < 2 || trimmed.length > 50) {
      setCategoryError('Category name must be between 2 and 50 characters')
      return
    }

    setNewService({ ...newService, categories: [...newService.categories, trimmed] })
    setCategoryInput('')
    setCategoryError('')
    setShowCategoryDropdown(false)
  }

  const removeCategory = (categoryToRemove) => {
    setNewService({
      ...newService,
      categories: newService.categories.filter(c => c !== categoryToRemove)
    })
    setCategoryError('')
  }

  // Filtered categories for dropdown
  const filteredCategories = existingCategories.filter(c =>
    c.toLowerCase().includes(categoryInput.toLowerCase()) &&
    !newService.categories.some(sel => sel.toLowerCase() === c.toLowerCase())
  )

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (categoryInputRef.current && !categoryInputRef.current.contains(e.target)) {
        setShowCategoryDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Multi-category dropdown JSX (inline to avoid remount on re-render)
  const categorySelectorJsx = (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', marginBottom: '0.5rem' }}>
        Categories * <span style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>(1-5 categories)</span>
      </label>

      {/* Selected categories tags */}
      {newService.categories.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {newService.categories.map(cat => (
            <span key={cat} style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              background: '#e8f5e9',
              border: '1px solid #4CAF50',
              borderRadius: '16px',
              padding: '0.3rem 0.75rem',
              fontSize: '0.85rem'
            }}>
              {cat}
              <button
                type="button"
                onClick={() => removeCategory(cat)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#f44336',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  lineHeight: 1,
                  padding: '0 0.2rem'
                }}
                aria-label={`Remove category ${cat}`}
              >✕</button>
            </span>
          ))}
        </div>
      )}

      {/* Category input with dropdown */}
      <div ref={categoryInputRef} style={{ position: 'relative' }}>
        <input
          type="text"
          value={categoryInput}
          onChange={(e) => {
            setCategoryInput(e.target.value)
            setShowCategoryDropdown(true)
            setCategoryError('')
          }}
          onFocus={() => setShowCategoryDropdown(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              // Select first matching category from dropdown
              if (categoryInput.trim() && filteredCategories.length > 0) {
                addCategory(filteredCategories[0])
              }
            }
          }}
          placeholder={newService.categories.length >= 5 ? 'Maximum categories reached' : 'Type to search categories...'}
          disabled={newService.categories.length >= 5}
          style={{
            width: '100%',
            padding: '0.75rem',
            borderRadius: '8px',
            border: `1px solid ${categoryError ? '#f44336' : 'var(--color-border)'}`,
            fontSize: '1rem',
            background: newService.categories.length >= 5 ? '#f5f5f5' : 'white'
          }}
        />

        {/* Dropdown */}
        {showCategoryDropdown && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: '0 0 8px 8px',
            maxHeight: '200px',
            overflowY: 'auto',
            zIndex: 10,
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}>
            {filteredCategories.length > 0 ? filteredCategories.map(cat => (
              <div
                key={cat}
                role="option"
                tabIndex={0}
                onMouseDown={(e) => { e.preventDefault(); addCategory(cat) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addCategory(cat) } }}
                style={{
                  padding: '0.5rem 0.75rem',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f0f0f0',
                  fontSize: '0.9rem'
                }}
                onMouseEnter={(e) => e.target.style.background = '#f5f5f5'}
                onMouseLeave={(e) => e.target.style.background = 'white'}
              >
                {cat}
              </div>
            )) : (
              <div style={{ padding: '0.5rem 0.75rem', color: 'var(--color-text-light)', fontSize: '0.85rem' }}>
                No matching categories. Add new ones in Settings → Admin → Categories.
              </div>
            )}
          </div>
        )}
      </div>

      {categoryError && (
        <p style={{ fontSize: '0.85rem', color: '#f44336', marginTop: '0.25rem' }}>{categoryError}</p>
      )}
      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.25rem' }}>
        Select from existing categories. New categories can be added in Settings → Admin → Categories.
      </p>
    </div>
  )

  // AllowedStaff multi-select component (no vendor filtering)
  const AllowedStaffSelector = () => {
    const activeStaff = staffSchedules
      .filter(s => s.isActive !== false && !s.visibleId.startsWith('resource-'))
      .sort((a, b) => (a.staffName || '').localeCompare(b.staffName || ''))

    return (
      <>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Staff Assignment</label>
          <select
            value={newService.staffRestriction}
            onChange={(e) => {
              const value = e.target.value
              if (value === 'specific' && newService.allowedStaff.length === 0) {
                const allStaffIds = activeStaff.map(s => s.visibleId)
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
              All active staff can perform this service. New staff members added later will automatically be included.
            </p>
          )}
        </div>

        {newService.staffRestriction === 'specific' && (
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Select Staff Members</label>
            <div style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '0.75rem', maxHeight: '200px', overflowY: 'auto' }}>
              {activeStaff.map(s => (
                <label key={s.visibleId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.35rem 0' }}>
                  <input
                    type="checkbox"
                    checked={newService.allowedStaff.includes(s.visibleId)}
                    onChange={(e) => handleStaffToggle(s.visibleId, e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span>{s.staffName || s.visibleId}</span>
                </label>
              ))}
              {activeStaff.length === 0 && (
                <p style={{ color: 'var(--color-text-light)', fontSize: '0.9rem', margin: 0 }}>No active staff members found.</p>
              )}
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
              Only selected staff members will be available for this service.
            </p>
          </div>
        )}
      </>
    )
  }

  // Full service form (for admin) — rendered as a function call, not a component,
  // to avoid remounting the DOM tree (and losing input focus) on every state change.
  const renderServiceForm = (isEdit) => (
    <form ref={formRef} onSubmit={handleAddService} style={{
      background: isEdit ? '#fff8f0' : 'var(--color-accent)',
      padding: '1.5rem',
      borderRadius: '8px',
      marginBottom: isEdit ? 0 : '2rem',
      ...(isEdit ? { border: '2px solid var(--color-primary)' } : {})
    }}>
      <h3>{isEdit ? `Editing: ${editingService.name}` : 'Add New Service'}</h3>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Service Name *</label>
        <input
          type="text"
          required
          value={newService.name}
          onChange={(e) => setNewService({ ...newService, name: e.target.value })}
          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }}
        />
      </div>

      {categorySelectorJsx}

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Description</label>
        <textarea
          value={newService.description}
          onChange={(e) => setNewService({ ...newService, description: e.target.value })}
          rows="3"
          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem', resize: 'vertical' }}
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
          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }}
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
          placeholder="Default (15 min)"
          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }}
        />
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
          Time buffer after this service before the next appointment. Leave blank to use the default (15 min).
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
          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }}
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
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }}
          />
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
            Fixed dollar amount deducted from the service price and paid to the house. Provider receives ${(newService.price - (newService.houseFeeAmount || 0)).toFixed(2)}.
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
          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }}
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
          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }}
        />
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
          Number of staff needed simultaneously (e.g., 2 for a couples service). Each provider gets their own appointment on their calendar.
        </p>
      </div>

      {isEdit && editingService?.parentServiceIds?.length > 0 && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f3e8ff', borderRadius: '8px' }}>
          <p style={{ fontSize: '0.85rem', color: '#6A1B9A', margin: 0 }}>
            🧩 This is an add-on of: <strong>{editingService.parentServiceIds.map(id => services.find(s => s.serviceId === id)?.name || id).join(', ')}</strong>
            <br /><span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>Manage add-on assignments from the parent service&apos;s 🧩 Add-ons button.</span>
          </p>
        </div>
      )}

      {!isEdit && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f3e8ff', borderRadius: '8px' }}>
          <p style={{ fontSize: '0.85rem', color: '#6A1B9A', margin: 0 }}>
            💡 To make this an add-on of another service, use the <strong>🧩 Add-ons</strong> button on the parent service after creating it.
          </p>
        </div>
      )}

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Resource Type</label>
        <select
          value={newService.resourceType}
          onChange={(e) => setNewService({ ...newService, resourceType: e.target.value })}
          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }}
        >
          <option value="staff">Staff</option>
          <option value="room">Spa Room</option>
          <option value="sauna">Sauna</option>
        </select>
      </div>

      {(newService.resourceType === 'staff' || newService.resourceType === 'room') && <AllowedStaffSelector />}

      <div style={{ display: 'flex', gap: '1rem' }}>
        <button type="submit" className="cta">{isEdit ? 'Update Service' : 'Save Service'}</button>
        <button type="button" onClick={handleCancelEdit} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: '1px solid var(--color-border)', cursor: 'pointer', background: 'white', fontSize: '1rem' }}>Cancel</button>
      </div>
    </form>
  )

  // Staff-only price edit form
  const StaffPriceEditForm = () => (
    <form onSubmit={handleStaffPriceUpdate} style={{
      background: '#fff8f0',
      padding: '1.5rem',
      borderRadius: '8px',
      border: '2px solid var(--color-primary)',
    }}>
      <h3>Edit Price: {editingService.name}</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginBottom: '1rem' }}>
        As a staff member, you can only update the service price.
      </p>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Price ($) *</label>
        <input
          type="number"
          required
          min="0"
          step="0.01"
          value={newService.price}
          onChange={(e) => setNewService({ ...newService, price: parseFloat(e.target.value) })}
          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '1rem' }}>
        <button type="submit" className="cta">Update Price</button>
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
    const attachable = services.filter(s =>
      s.serviceId !== parentService.serviceId &&
      !s.parentServiceIds?.includes(parentService.serviceId) &&
      s.isActive !== false
    )

    return (
      <div style={{ background: '#f3e8ff', padding: '1.25rem 1.5rem', borderTop: '2px solid #9C27B0' }}>
        <h4 style={{ margin: '0 0 1rem', color: '#6A1B9A' }}>🧩 Manage Add-ons for: {parentService.name}</h4>

        {currentAddons.length > 0 ? (
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem' }}>Current Add-ons:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {currentAddons.map(addon => (
                <div key={addon.serviceId} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'white', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}>
                  <span>{addon.name} (${addon.price})</span>
                  <button onClick={() => handleDetachAddon(addon.serviceId, parentService.serviceId)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF9800', fontWeight: 'bold', fontSize: '1rem', lineHeight: 1, padding: '0 0.25rem' }}
                    title="Detach from this service (keeps the add-on)">✕</button>
                  <button onClick={() => { if (confirm(`Permanently delete "${addon.name}"? This removes it from all services.`)) handleDelete(addon) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f44336', fontSize: '0.85rem', lineHeight: 1, padding: '0 0.25rem' }}
                    title="Permanently delete this add-on">🗑</button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginBottom: '1rem' }}>No add-ons attached yet.</p>
        )}

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
    const addons = services.filter(s => s.parentServiceIds?.includes(service.serviceId))
    const categories = service.categories && Array.isArray(service.categories)
      ? service.categories
      : (service.category ? [service.category] : [])

    return (
      <div key={service.serviceId}>
        <div
          style={{
            background: isAddon ? '#f9f5f0' : 'var(--color-accent)',
            padding: isAddon ? '1rem 1.5rem 1rem 2.5rem' : '1.5rem',
            borderRadius: isAddon ? '0' : '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            ...(isAddon ? { borderTop: '1px dashed var(--color-border)' } : {})
          }}
        >
          <div>
            <h3 style={{ marginBottom: '0.5rem', fontSize: isAddon ? '1rem' : undefined }}>
              {isAddon && <span style={{ color: 'var(--color-text-light)', marginRight: '0.5rem' }}>↳</span>}
              {service.name}
              {isAddon && <span style={{ fontSize: '0.8rem', color: 'var(--color-primary)', marginLeft: '0.5rem', fontWeight: 'normal' }}>Add-on</span>}
            </h3>
            {service.description && (
              <p style={{ color: 'var(--color-text)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                {service.description}
              </p>
            )}
            <p style={{ color: 'var(--color-text-light)', fontSize: '0.9rem' }}>
              {categories.length > 0 && `${categories.join(', ')} • `}{service.duration} min • ${service.price}
              {service.houseFeeEnabled && ` • 🏠 $${service.houseFeeAmount} → Staff keeps $${(service.price - (service.houseFeeAmount || 0)).toFixed(0)}`}
              {service.maxQuantityPerBooking > 1 && ` • 🔢 Up to ${service.maxQuantityPerBooking}`}
              {service.providersRequired > 1 && ` • 👥 ${service.providersRequired} providers`}
              {staffNames && ` • 👤 ${staffNames.join(', ')}`}
              {!staffNames && ' • 👤 All Staff'}
              {service.requiresConsultation && ' • ⚠️ Requires Consultation'}
              {service.cardPaymentDisabled && ' • 💳 Card Payment Disabled'}
              {!isAddon && addons.length > 0 && ` • 🧩 ${addons.length} add-on${addons.length > 1 ? 's' : ''}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
            {/* Admin: full CRUD buttons */}
            {canCreate && !isAddon && (
              <button onClick={() => setManagingAddonsFor(managingAddonsFor?.serviceId === service.serviceId ? null : service)}
                style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', background: managingAddonsFor?.serviceId === service.serviceId ? '#FF9800' : '#9C27B0', color: 'white' }}>
                {managingAddonsFor?.serviceId === service.serviceId ? 'Close' : '🧩 Add-ons'}
              </button>
            )}
            <button onClick={() => handleEdit(service)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'var(--color-primary)', color: 'white' }}>Edit</button>
            {canCreate && (
              <button onClick={() => handleToggleActive(service)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', background: service.isActive ? '#4CAF50' : '#999', color: 'white' }}>{service.isActive ? 'Active' : 'Inactive'}</button>
            )}
            {canDelete && (
              <button onClick={() => handleDelete(service)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', background: '#f44336', color: 'white' }}>Delete</button>
            )}
          </div>
        </div>
        {editingService?.serviceId === service.serviceId && (
          <div style={{ marginTop: '0.5rem' }}>
            {renderServiceForm(true)}
          </div>
        )}
        {!isAddon && managingAddonsFor?.serviceId === service.serviceId && (
          <ManageAddonsPanel parentService={service} />
        )}
      </div>
    )
  }

  return (
    <div>
      <h1>Services</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        Manage your service offerings.
      </p>

      {/* Admin: Show Add New Service button */}
      {canCreate && (
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
      )}

      {/* Add form (admin only) */}
      {showAddForm && !editingService && canCreate && (
        renderServiceForm(false)
      )}

      {loading && <p>Loading services...</p>}

      {!loading && services.length === 0 && (
        <p style={{ color: 'var(--color-text-light)' }}>No services found.</p>
      )}

      {!loading && services.length > 0 && (() => {
        // Filter services
        let filtered = services
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase()
          filtered = filtered.filter(s =>
            s.name?.toLowerCase().includes(q) ||
            s.description?.toLowerCase().includes(q) ||
            s.serviceId?.toLowerCase().includes(q)
          )
        }
        if (filterCategory) {
          filtered = filtered.filter(s =>
            (s.categories && s.categories.includes(filterCategory)) ||
            (s.category && s.category === filterCategory)
          )
        }

        // Sort services — "Head Bath" services always first, then alphabetical
        filtered = [...filtered].sort((a, b) => {
          if (sortBy === 'name') {
            const aIsHeadBath = (a.name || '').toLowerCase().startsWith('head bath')
            const bIsHeadBath = (b.name || '').toLowerCase().startsWith('head bath')
            if (aIsHeadBath && !bIsHeadBath) return -1
            if (!aIsHeadBath && bIsHeadBath) return 1
            return (a.name || '').localeCompare(b.name || '')
          }
          if (sortBy === 'price') return (a.price || 0) - (b.price || 0)
          if (sortBy === 'duration') return (a.duration || 0) - (b.duration || 0)
          return 0
        })

        const parentServices = filtered.filter(s => !(s.parentServiceIds?.length > 0))
        const getAddons = (parentId) => services.filter(s => s.parentServiceIds?.includes(parentId))

        // Collect all categories for filter dropdown
        const allCategories = [...new Set(
          services.flatMap(s => s.categories || (s.category ? [s.category] : []))
        )].sort((a, b) => a.localeCompare(b))

        return (
          <>
            {/* Filter & Sort Controls */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search services..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: '1 1 200px', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
              />
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                style={{ padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
              >
                <option value="">All Categories</option>
                {allCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{ padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
              >
                <option value="name">Sort: Name</option>
                <option value="price">Sort: Price</option>
                <option value="duration">Sort: Duration</option>
              </select>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
                {parentServices.length} service{parentServices.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
              {parentServices.map(service => {
                const addons = getAddons(service.serviceId)
                return (
                  <div key={service.serviceId} style={{ borderRadius: '8px', overflow: 'hidden', border: addons.length > 0 ? '1px solid var(--color-border)' : 'none' }}>
                    {ServiceRow({ service, isAddon: false })}
                    {addons.map(addon => (
                      <Fragment key={addon.serviceId}>
                        {ServiceRow({ service: addon, isAddon: true })}
                      </Fragment>
                    ))}
                  </div>
                )
              })}
            </div>
          </>
        )
      })()}
    </div>
  )
}
