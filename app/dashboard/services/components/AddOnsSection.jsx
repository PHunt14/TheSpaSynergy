'use client'

import { useState } from 'react'

/**
 * Add-Ons Section — manages services that have parentServiceIds.
 * Add-ons are services attached to a parent service (e.g., Mini Facial add-on to Head Bath).
 */
export default function AddOnsSection({ services, staffSchedules, onReload }) {
  const [editingAddon, setEditingAddon] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    duration: 15,
    price: 0,
    parentServiceIds: [],
  })

  // Add-ons are services that have parentServiceIds
  const addons = services.filter(s => s.parentServiceIds && s.parentServiceIds.length > 0)
  const parentServices = services.filter(s => !s.parentServiceIds?.length && s.isActive !== false)

  const filtered = searchQuery.trim()
    ? addons.filter(a =>
        a.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : addons

  const resetForm = () => {
    setFormData({ name: '', description: '', duration: 15, price: 0, parentServiceIds: [] })
    setEditingAddon(null)
    setShowCreateForm(false)
  }

  const handleEdit = (addon) => {
    setEditingAddon(addon)
    setFormData({
      name: addon.name || '',
      description: addon.description || '',
      duration: addon.duration || 15,
      price: addon.price || 0,
      parentServiceIds: addon.parentServiceIds || [],
    })
    setShowCreateForm(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name.trim()) return

    const payload = {
      serviceId: editingAddon ? editingAddon.serviceId : `svc-addon-${Date.now()}`,
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      duration: formData.duration,
      price: formData.price,
      parentServiceIds: formData.parentServiceIds.length > 0 ? formData.parentServiceIds : null,
      categories: editingAddon?.categories || [],
      resourceType: editingAddon?.resourceType || 'staff',
      isActive: editingAddon ? editingAddon.isActive : true,
    }

    try {
      const response = await fetch('/api/services', {
        method: editingAddon ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        resetForm()
        await onReload()
      } else {
        alert('Failed to save add-on')
      }
    } catch (err) {
      console.error('Error saving add-on:', err)
      alert('Error saving add-on')
    }
  }

  const handleToggleActive = async (addon) => {
    try {
      const response = await fetch('/api/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId: addon.serviceId, isActive: !addon.isActive }),
      })
      if (response.ok) await onReload()
    } catch (err) {
      console.error('Error toggling add-on:', err)
    }
  }

  const handleDelete = async (addon) => {
    if (!confirm(`Delete "${addon.name}"? This will permanently remove it.`)) return
    try {
      const response = await fetch(`/api/services?serviceId=${addon.serviceId}`, { method: 'DELETE' })
      if (response.ok) await onReload()
      else alert('Failed to delete add-on')
    } catch (err) {
      console.error('Error deleting add-on:', err)
    }
  }

  const handleParentToggle = (parentId, checked) => {
    setFormData(prev => ({
      ...prev,
      parentServiceIds: checked
        ? [...prev.parentServiceIds, parentId]
        : prev.parentServiceIds.filter(id => id !== parentId),
    }))
  }

  const getParentNames = (parentIds) => {
    if (!parentIds || parentIds.length === 0) return 'Unassigned'
    return parentIds
      .map(id => services.find(s => s.serviceId === id)?.name || id)
      .join(', ')
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>🧩 Service Add-Ons</h2>
          <p style={{ color: 'var(--color-text-light)', margin: '0.25rem 0 0' }}>
            Add-ons are attached to parent services and offered during booking.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (showCreateForm || editingAddon) resetForm()
            else { setShowCreateForm(true); setEditingAddon(null) }
          }}
          className="cta"
        >
          {showCreateForm || editingAddon ? 'Cancel' : '+ Create Add-On'}
        </button>
      </div>

      {/* Create/Edit Form */}
      {(showCreateForm || editingAddon) && (
        <form
          onSubmit={handleSubmit}
          style={{
            background: editingAddon ? '#fff8f0' : 'var(--color-accent)',
            padding: '1.5rem',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            border: editingAddon ? '2px solid var(--color-primary)' : 'none',
          }}
        >
          <h3 style={{ marginBottom: '1rem' }}>
            {editingAddon ? `Editing: ${editingAddon.name}` : 'Create New Add-On'}
          </h3>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="addon-name" style={{ display: 'block', marginBottom: '0.5rem' }}>Name *</label>
            <input
              id="addon-name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Mini Facial, Scalp Massage"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="addon-description" style={{ display: 'block', marginBottom: '0.5rem' }}>Description</label>
            <textarea
              id="addon-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows="2"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label htmlFor="addon-duration" style={{ display: 'block', marginBottom: '0.5rem' }}>Duration (min) *</label>
              <input
                id="addon-duration"
                type="number"
                required
                min="5"
                step="5"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: Number.parseInt(e.target.value) || 15 })}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }}
              />
            </div>
            <div>
              <label htmlFor="addon-price" style={{ display: 'block', marginBottom: '0.5rem' }}>Price ($) *</label>
              <input
                id="addon-price"
                type="number"
                required
                min="0"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: Number.parseFloat(e.target.value) || 0 })}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }}
              />
            </div>
          </div>

          {/* Parent service assignment */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="addon-parent-services" style={{ display: 'block', marginBottom: '0.5rem' }}>Attach to Parent Services</label>
            <div id="addon-parent-services" style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '0.75rem' }}>
              {parentServices.length === 0 ? (
                <p style={{ color: 'var(--color-text-light)', fontSize: '0.9rem', margin: 0 }}>No parent services available</p>
              ) : (
                parentServices.map(s => (
                  <label key={s.serviceId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.35rem 0' }}>
                    <input
                      type="checkbox"
                      checked={formData.parentServiceIds.includes(s.serviceId)}
                      onChange={(e) => handleParentToggle(s.serviceId, e.target.checked)}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <span>{s.name} (${s.price}, {s.duration} min)</span>
                  </label>
                ))
              )}
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.25rem' }}>
              Select which services this add-on should be offered with during booking.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button type="submit" className="cta">
              {editingAddon ? 'Save Changes' : 'Create Add-On'}
            </button>
            <button type="button" onClick={resetForm} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Search */}
      {addons.length > 3 && (
        <input
          type="text"
          placeholder="Search add-ons..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: '100%', maxWidth: '300px', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.9rem', marginBottom: '1rem' }}
        />
      )}

      {/* Add-Ons List */}
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {filtered.length === 0 && (
          <p style={{ color: 'var(--color-text-light)', textAlign: 'center', padding: '2rem' }}>
            {addons.length === 0 ? 'No add-ons yet. Create one or attach a service as an add-on from the Services section.' : 'No add-ons match your search.'}
          </p>
        )}
        {filtered.map(addon => (
          <div
            key={addon.serviceId}
            style={{
              background: 'var(--color-accent)',
              padding: '1.25rem 1.5rem',
              borderRadius: '8px',
              opacity: addon.isActive !== false ? 1 : 0.7,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: 1, minWidth: '200px' }}>
              <h4 style={{ margin: '0 0 0.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                {addon.name}
                <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: addon.isActive !== false ? '#e8f5e9' : '#eeeeee', color: addon.isActive !== false ? '#2e7d32' : '#666' }}>
                  {addon.isActive !== false ? '● Active' : '○ Inactive'}
                </span>
              </h4>
              {addon.description && (
                <p style={{ color: 'var(--color-text)', fontSize: '0.85rem', margin: '0 0 0.3rem' }}>{addon.description}</p>
              )}
              <p style={{ color: 'var(--color-text-light)', fontSize: '0.85rem', margin: 0 }}>
                ${addon.price} • {addon.duration} min • Parent: {getParentNames(addon.parentServiceIds)}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              <button type="button" onClick={() => handleEdit(addon)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'var(--color-primary)', color: 'white' }}>Edit</button>
              <button type="button" onClick={() => handleToggleActive(addon)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', background: addon.isActive !== false ? '#4CAF50' : '#999', color: 'white' }}>
                {addon.isActive !== false ? 'Active' : 'Inactive'}
              </button>
              <button type="button" onClick={() => handleDelete(addon)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', background: '#f44336', color: 'white' }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
