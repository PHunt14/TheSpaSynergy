'use client'

import { useState, useRef, useEffect } from 'react'

/**
 * Services Section — manages standalone services (not add-ons).
 * Add-ons (services with parentServiceIds) are managed in the Add-Ons section.
 */
export default function ServicesSection({ services, staffSchedules, existingCategories, currentUserRole, onReload, onLoadCategories }) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingService, setEditingService] = useState(null)
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
    houseFeeAmount: 0,
  })

  const [categoryInput, setCategoryInput] = useState('')
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [categoryError, setCategoryError] = useState('')
  const categoryInputRef = useRef(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [sortBy, setSortBy] = useState('name')

  // Only show parent services (not add-ons)
  const parentServices = services.filter(s => !(s.parentServiceIds?.length > 0))

  const canCreate = currentUserRole === 'admin'
  const canDelete = currentUserRole === 'admin'

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (categoryInputRef.current && !categoryInputRef.current.contains(e.target)) {
        setShowCategoryDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleStaffToggle = (staffId, checked) => {
    const updated = checked
      ? [...newService.allowedStaff, staffId]
      : newService.allowedStaff.filter(id => id !== staffId)
    setNewService({ ...newService, allowedStaff: updated })
  }

  const handleAddService = async (e) => {
    e.preventDefault()
    if (newService.categories.length === 0) {
      alert('Please select at least one category.')
      return
    }

    const serviceId = editingService ? editingService.serviceId : `svc-${Date.now()}`
    const method = editingService ? 'PATCH' : 'POST'

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
      isActive: editingService ? editingService.isActive : true,
    }

    try {
      const response = await fetch('/api/services', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serviceData),
      })

      if (response.ok) {
        alert(editingService ? 'Service updated successfully!' : 'Service added successfully!')
        setShowAddForm(false)
        setEditingService(null)
        resetForm()
        await onReload()
        await onLoadCategories()
      } else {
        alert('Failed to save service')
      }
    } catch (error) {
      console.error('Error saving service:', error)
      alert('Error saving service')
    }
  }

  const handleStaffPriceUpdate = async (e) => {
    e.preventDefault()
    if (!editingService) return

    try {
      const response = await fetch('/api/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId: editingService.serviceId, price: newService.price }),
      })

      if (response.ok) {
        alert('Price updated successfully!')
        setEditingService(null)
        resetForm()
        await onReload()
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
        body: JSON.stringify({ serviceId: service.serviceId, isActive: !service.isActive }),
      })
      if (response.ok) await onReload()
      else alert('Failed to update service')
    } catch (error) {
      console.error('Error updating service:', error)
    }
  }

  const handleEdit = (service) => {
    setEditingService(service)
    const categories = service.categories && Array.isArray(service.categories)
      ? service.categories
      : (service.category ? [service.category] : [])
    setNewService({
      name: service.name,
      categories,
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
      providersRequired: service.providersRequired || 1,
    })
    setShowAddForm(false)
  }

  const resetForm = () => {
    setNewService({
      name: '', categories: [], description: '', duration: 30, price: 0,
      bufferMinutes: '', requiresConsultation: false, cardPaymentDisabled: false,
      resourceType: 'staff', staffRestriction: 'all', allowedStaff: [],
      parentServiceIds: [], maxQuantityPerBooking: 1, providersRequired: 1,
      houseFeeEnabled: false, houseFeeAmount: 0,
    })
    setCategoryInput('')
    setCategoryError('')
  }

  const handleCancelEdit = () => {
    setEditingService(null)
    setShowAddForm(false)
    resetForm()
  }

  const handleDelete = async (service) => {
    if (!confirm(`Delete "${service.name}"?`)) return
    try {
      const response = await fetch(`/api/services?serviceId=${service.serviceId}`, { method: 'DELETE' })
      if (response.ok) await onReload()
      else alert('Failed to delete service')
    } catch (error) {
      console.error('Error deleting service:', error)
    }
  }

  // Category helpers
  const addCategory = (categoryName) => {
    const trimmed = categoryName.trim()
    if (!trimmed) return
    if (newService.categories.length >= 5) { setCategoryError('Maximum 5 categories allowed per service'); return }
    if (newService.categories.some(c => c.toLowerCase() === trimmed.toLowerCase())) { setCategoryError('Category already added'); return }
    if (trimmed.length < 2 || trimmed.length > 50) { setCategoryError('Category name must be between 2 and 50 characters'); return }
    setNewService({ ...newService, categories: [...newService.categories, trimmed] })
    setCategoryInput('')
    setCategoryError('')
    setShowCategoryDropdown(false)
  }

  const removeCategory = (cat) => {
    setNewService({ ...newService, categories: newService.categories.filter(c => c !== cat) })
    setCategoryError('')
  }

  const filteredCategories = existingCategories.filter(c =>
    c.toLowerCase().includes(categoryInput.toLowerCase()) &&
    !newService.categories.some(sel => sel.toLowerCase() === c.toLowerCase())
  )

  // Staff selector
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
                setNewService({ ...newService, staffRestriction: value, allowedStaff: activeStaff.map(s => s.visibleId) })
              } else {
                setNewService({ ...newService, staffRestriction: value, allowedStaff: value === 'all' ? [] : newService.allowedStaff })
              }
            }}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }}
          >
            <option value="all">All Staff Members</option>
            <option value="specific">Specific Staff Members</option>
          </select>
        </div>
        {newService.staffRestriction === 'specific' && (
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Select Staff Members</label>
            <div style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '0.75rem', maxHeight: '200px', overflowY: 'auto' }}>
              {activeStaff.map(s => (
                <label key={s.visibleId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.35rem 0' }}>
                  <input type="checkbox" checked={newService.allowedStaff.includes(s.visibleId)} onChange={(e) => handleStaffToggle(s.visibleId, e.target.checked)} style={{ width: '18px', height: '18px' }} />
                  <span>{s.staffName || s.visibleId}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </>
    )
  }

  const renderServiceForm = (isEdit) => (
    <form ref={formRef} onSubmit={currentUserRole === 'admin' ? handleAddService : handleStaffPriceUpdate} style={{
      background: isEdit ? '#fff8f0' : 'var(--color-accent)',
      padding: '1.5rem', borderRadius: '8px', marginBottom: isEdit ? 0 : '1.5rem',
      ...(isEdit ? { border: '2px solid var(--color-primary)' } : {})
    }}>
      <h3>{isEdit ? `Editing: ${editingService.name}` : 'Add New Service'}</h3>

      {currentUserRole !== 'admin' ? (
        <>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginBottom: '1rem' }}>As staff, you can only update the price.</p>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Price ($) *</label>
            <input type="number" required min="0" step="0.01" value={newService.price} onChange={(e) => setNewService({ ...newService, price: parseFloat(e.target.value) })}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
          </div>
        </>
      ) : (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Service Name *</label>
            <input type="text" required value={newService.name} onChange={(e) => setNewService({ ...newService, name: e.target.value })}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
          </div>

          {/* Category selector */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Categories * <span style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>(1-5)</span></label>
            {newService.categories.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                {newService.categories.map(cat => (
                  <span key={cat} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#e8f5e9', border: '1px solid #4CAF50', borderRadius: '16px', padding: '0.3rem 0.75rem', fontSize: '0.85rem' }}>
                    {cat}
                    <button type="button" onClick={() => removeCategory(cat)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f44336', fontWeight: 'bold', fontSize: '1rem', lineHeight: 1, padding: '0 0.2rem' }} aria-label={`Remove category ${cat}`}>✕</button>
                  </span>
                ))}
              </div>
            )}
            <div ref={categoryInputRef} style={{ position: 'relative' }}>
              <input type="text" value={categoryInput}
                onChange={(e) => { setCategoryInput(e.target.value); setShowCategoryDropdown(true); setCategoryError('') }}
                onFocus={() => setShowCategoryDropdown(true)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (categoryInput.trim() && filteredCategories.length > 0) addCategory(filteredCategories[0]) } }}
                placeholder={newService.categories.length >= 5 ? 'Maximum reached' : 'Type to search categories...'}
                disabled={newService.categories.length >= 5}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: `1px solid ${categoryError ? '#f44336' : 'var(--color-border)'}`, fontSize: '1rem' }}
              />
              {showCategoryDropdown && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid var(--color-border)', borderRadius: '0 0 8px 8px', maxHeight: '200px', overflowY: 'auto', zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                  {filteredCategories.length > 0 ? filteredCategories.map(cat => (
                    <div key={cat} role="option" tabIndex={0} onMouseDown={(e) => { e.preventDefault(); addCategory(cat) }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addCategory(cat) } }}
                      style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '0.9rem' }}
                      onMouseEnter={(e) => e.target.style.background = '#f5f5f5'} onMouseLeave={(e) => e.target.style.background = 'white'}
                    >{cat}</div>
                  )) : (
                    <div style={{ padding: '0.5rem 0.75rem', color: 'var(--color-text-light)', fontSize: '0.85rem' }}>No matching categories. Add new ones in Settings → Admin → Categories.</div>
                  )}
                </div>
              )}
            </div>
            {categoryError && <p style={{ fontSize: '0.85rem', color: '#f44336', marginTop: '0.25rem' }}>{categoryError}</p>}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Description</label>
            <textarea value={newService.description} onChange={(e) => setNewService({ ...newService, description: e.target.value })} rows="3"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem', resize: 'vertical' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Duration (min) *</label>
              <input type="number" required min="5" step="5" value={newService.duration} onChange={(e) => setNewService({ ...newService, duration: parseInt(e.target.value) })}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Price ($) *</label>
              <input type="number" required min="0" step="0.01" value={newService.price} onChange={(e) => setNewService({ ...newService, price: parseFloat(e.target.value) })}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Buffer Time (minutes)</label>
            <input type="number" min="0" step="5" value={newService.bufferMinutes} onChange={(e) => setNewService({ ...newService, bufferMinutes: e.target.value === '' ? '' : parseInt(e.target.value) })}
              placeholder="Default (15 min)" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={newService.houseFeeEnabled} onChange={(e) => setNewService({ ...newService, houseFeeEnabled: e.target.checked })} style={{ width: '20px', height: '20px' }} />
              <span>House Fee Enabled</span>
            </label>
          </div>
          {newService.houseFeeEnabled && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>House Fee Amount ($)</label>
              <input type="number" min="0" step="0.01" value={newService.houseFeeAmount} onChange={(e) => setNewService({ ...newService, houseFeeAmount: parseFloat(e.target.value) || 0 })}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={newService.requiresConsultation} onChange={(e) => setNewService({ ...newService, requiresConsultation: e.target.checked })} style={{ width: '20px', height: '20px' }} />
              <span>Requires Consultation</span>
            </label>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={newService.cardPaymentDisabled} onChange={(e) => setNewService({ ...newService, cardPaymentDisabled: e.target.checked })} style={{ width: '20px', height: '20px' }} />
              <span>Disable Card Payment</span>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Max Qty Per Booking</label>
              <input type="number" min="1" max="10" value={newService.maxQuantityPerBooking} onChange={(e) => setNewService({ ...newService, maxQuantityPerBooking: parseInt(e.target.value) || 1 })}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Providers Required</label>
              <input type="number" min="1" max="10" value={newService.providersRequired} onChange={(e) => setNewService({ ...newService, providersRequired: parseInt(e.target.value) || 1 })}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Resource Type</label>
            <select value={newService.resourceType} onChange={(e) => setNewService({ ...newService, resourceType: e.target.value })}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }}>
              <option value="staff">Staff</option>
              <option value="room">Spa Room</option>
              <option value="sauna">Sauna</option>
            </select>
          </div>

          {(newService.resourceType === 'staff' || newService.resourceType === 'room') && <AllowedStaffSelector />}
        </>
      )}

      <div style={{ display: 'flex', gap: '1rem' }}>
        <button type="submit" className="cta">{isEdit ? 'Update Service' : 'Save Service'}</button>
        <button type="button" onClick={handleCancelEdit} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: '1px solid var(--color-border)', cursor: 'pointer', background: 'white', fontSize: '1rem' }}>Cancel</button>
      </div>
    </form>
  )

  // Filter & sort
  let filtered = parentServices
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase()
    filtered = filtered.filter(s => s.name?.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q))
  }
  if (filterCategory) {
    filtered = filtered.filter(s => (s.categories && s.categories.includes(filterCategory)) || (s.category && s.category === filterCategory))
  }
  filtered = [...filtered].sort((a, b) => {
    if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '')
    if (sortBy === 'price') return (a.price || 0) - (b.price || 0)
    if (sortBy === 'duration') return (a.duration || 0) - (b.duration || 0)
    return 0
  })

  const allCategories = [...new Set(services.flatMap(s => s.categories || (s.category ? [s.category] : [])))].sort()
  const addons = services.filter(s => s.parentServiceIds?.length > 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>💆 Services</h2>
          <p style={{ color: 'var(--color-text-light)', margin: '0.25rem 0 0' }}>
            Manage your service offerings. Add-ons are managed separately below.
          </p>
        </div>
        {canCreate && (
          <button onClick={() => { if (showAddForm) handleCancelEdit(); else { setEditingService(null); setShowAddForm(true) } }} className="cta">
            {showAddForm ? 'Cancel' : '+ Add New Service'}
          </button>
        )}
      </div>

      {showAddForm && !editingService && canCreate && renderServiceForm(false)}

      {/* Filter & Sort Controls */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="Search services..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: '1 1 200px', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }} />
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
          style={{ padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}>
          <option value="">All Categories</option>
          {allCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
          style={{ padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}>
          <option value="name">Sort: Name</option>
          <option value="price">Sort: Price</option>
          <option value="duration">Sort: Duration</option>
        </select>
        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>{filtered.length} service{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Services List */}
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {filtered.length === 0 && <p style={{ color: 'var(--color-text-light)', textAlign: 'center', padding: '2rem' }}>No services found.</p>}
        {filtered.map(service => {
          const serviceAddons = addons.filter(a => a.parentServiceIds?.includes(service.serviceId))
          const staffNames = service.allowedStaff && service.allowedStaff.length > 0
            ? service.allowedStaff.map(id => { const staff = staffSchedules.find(s => s.visibleId === id); return staff?.staffName?.split(' ')[0] || id.replace('staff-', '') })
            : null
          const categories = service.categories && Array.isArray(service.categories) ? service.categories : (service.category ? [service.category] : [])

          return (
            <div key={service.serviceId}>
              <div style={{ background: 'var(--color-accent)', padding: '1.25rem 1.5rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <h4 style={{ margin: '0 0 0.3rem' }}>{service.name}</h4>
                  {service.description && <p style={{ color: 'var(--color-text)', fontSize: '0.85rem', margin: '0 0 0.3rem' }}>{service.description}</p>}
                  <p style={{ color: 'var(--color-text-light)', fontSize: '0.85rem', margin: 0 }}>
                    {categories.length > 0 && `${categories.join(', ')} • `}{service.duration} min • ${service.price}
                    {service.houseFeeEnabled && ` • 🏠 $${service.houseFeeAmount}`}
                    {service.maxQuantityPerBooking > 1 && ` • 🔢 Up to ${service.maxQuantityPerBooking}`}
                    {service.providersRequired > 1 && ` • 👥 ${service.providersRequired} providers`}
                    {staffNames ? ` • 👤 ${staffNames.join(', ')}` : ' • 👤 All Staff'}
                    {service.requiresConsultation && ' • ⚠️ Consult'}
                    {service.cardPaymentDisabled && ' • 💳 No Card'}
                    {serviceAddons.length > 0 && ` • 🧩 ${serviceAddons.length} add-on${serviceAddons.length > 1 ? 's' : ''}`}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap' }}>
                  <button onClick={() => handleEdit(service)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'var(--color-primary)', color: 'white' }}>Edit</button>
                  {canCreate && (
                    <button onClick={() => handleToggleActive(service)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', background: service.isActive ? '#4CAF50' : '#999', color: 'white' }}>
                      {service.isActive ? 'Active' : 'Inactive'}
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => handleDelete(service)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', background: '#f44336', color: 'white' }}>Delete</button>
                  )}
                </div>
              </div>
              {editingService?.serviceId === service.serviceId && (
                <div style={{ marginTop: '0.5rem' }}>{renderServiceForm(true)}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
