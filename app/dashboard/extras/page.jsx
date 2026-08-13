'use client'

import { useState, useEffect } from 'react'
import useIsMobile from '../../hooks/useIsMobile'

export default function ExtrasManagement() {
  const [extras, setExtras] = useState([])
  const [bundles, setBundles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingExtra, setEditingExtra] = useState(null)
  const [error, setError] = useState(null)
  const isMobile = useIsMobile()

  const emptyForm = {
    name: '',
    description: '',
    price: '',
    perPerson: false,
    groupOnly: false,
    assignedBundleIds: [],
  }
  const [formData, setFormData] = useState(emptyForm)
  const [formErrors, setFormErrors] = useState({})

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [extrasRes, bundlesRes] = await Promise.all([
        fetch('/api/extras?includeInactive=true'),
        fetch('/api/bundles'),
      ])

      const extrasData = await extrasRes.json()
      const bundlesData = await bundlesRes.json()

      setExtras(extrasData.extras || [])
      setBundles(bundlesData.bundles || [])
      setLoading(false)
    } catch (err) {
      console.error('Error loading data:', err)
      setError('Failed to load data. Please refresh the page.')
      setLoading(false)
    }
  }

  const validateForm = () => {
    const errors = {}
    
    if (!formData.name || formData.name.trim().length === 0) {
      errors.name = 'Name is required'
    } else if (formData.name.trim().length > 100) {
      errors.name = 'Name must be 100 characters or fewer'
    }

    const price = parseFloat(formData.price)
    if (!formData.price && formData.price !== 0) {
      errors.price = 'Price is required'
    } else if (isNaN(price) || price < 0.01 || price > 99999.99) {
      errors.price = 'Price must be between 0.01 and 99999.99'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!validateForm()) return

    const payload = {
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      price: parseFloat(formData.price),
      perPerson: formData.perPerson,
      groupOnly: formData.groupOnly,
      assignedBundleIds: formData.assignedBundleIds,
    }

    try {
      let response
      if (editingExtra) {
        response = await fetch('/api/extras', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, extraId: editingExtra.extraId }),
        })
      } else {
        response = await fetch('/api/extras', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Failed to save extra')
        return
      }

      // Success - reset form and reload
      setShowAddForm(false)
      setEditingExtra(null)
      setFormData(emptyForm)
      setFormErrors({})
      await loadData()
    } catch (err) {
      console.error('Error saving extra:', err)
      setError('Failed to save extra. Please try again.')
    }
  }

  const handleEdit = (extra) => {
    setEditingExtra(extra)
    setFormData({
      name: extra.name || '',
      description: extra.description || '',
      price: extra.price?.toString() || '',
      perPerson: extra.perPerson || false,
      groupOnly: extra.groupOnly || false,
      assignedBundleIds: extra.assignedBundleIds || [],
    })
    setFormErrors({})
    setError(null)
    setShowAddForm(false)
  }

  const handleCancelForm = () => {
    setShowAddForm(false)
    setEditingExtra(null)
    setFormData(emptyForm)
    setFormErrors({})
    setError(null)
  }

  const handleToggleActive = async (extra) => {
    setError(null)
    try {
      let response
      if (extra.isActive) {
        // Deactivate via DELETE (soft-delete)
        response = await fetch(`/api/extras?extraId=${extra.extraId}`, {
          method: 'DELETE',
        })
      } else {
        // Reactivate via PATCH
        response = await fetch('/api/extras', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ extraId: extra.extraId, isActive: true }),
        })
      }

      if (!response.ok) {
        const result = await response.json()
        setError(result.error || 'Failed to update extra status')
        return
      }

      await loadData()
    } catch (err) {
      console.error('Error toggling extra status:', err)
      setError('Failed to update extra status. Please try again.')
    }
  }

  const handleBundleToggle = (bundleId, checked) => {
    setFormData((prev) => ({
      ...prev,
      assignedBundleIds: checked
        ? [...prev.assignedBundleIds, bundleId]
        : prev.assignedBundleIds.filter((id) => id !== bundleId),
    }))
  }

  const getBundleName = (bundleId) => {
    const bundle = bundles.find((b) => b.bundleId === bundleId)
    return bundle ? bundle.name : bundleId
  }

  if (loading) return <div>Loading...</div>

  return (
    <div>
      <h1>Extras Management</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        Manage hospitality extras available for bundle bookings
      </p>

      {error && (
        <div
          style={{
            background: '#ffebee',
            color: '#c62828',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            border: '1px solid #ef9a9a',
          }}
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Add button */}
      <button
        onClick={() => {
          if (showAddForm || editingExtra) {
            handleCancelForm()
          } else {
            setShowAddForm(true)
            setEditingExtra(null)
            setFormData(emptyForm)
            setFormErrors({})
          }
        }}
        className="cta"
        style={{ marginBottom: '2rem' }}
      >
        {showAddForm || editingExtra ? 'Cancel' : '+ Create Extra'}
      </button>

      {/* Create/Edit Form */}
      {(showAddForm || editingExtra) && (
        <form
          onSubmit={handleSubmit}
          style={{
            background: editingExtra ? '#fff8f0' : 'var(--color-accent)',
            padding: '1.5rem',
            borderRadius: '8px',
            marginBottom: '2rem',
            border: editingExtra ? '2px solid var(--color-primary)' : 'none',
          }}
        >
          <h3 style={{ marginBottom: '1rem' }}>
            {editingExtra ? `Editing: ${editingExtra.name}` : 'Create New Extra'}
          </h3>

          {/* Name field */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>
              Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              maxLength={100}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: formErrors.name
                  ? '2px solid #c62828'
                  : '1px solid var(--color-border)',
              }}
              aria-invalid={!!formErrors.name}
              aria-describedby={formErrors.name ? 'name-error' : undefined}
            />
            {formErrors.name && (
              <p
                id="name-error"
                style={{ color: '#c62828', fontSize: '0.85rem', marginTop: '0.25rem' }}
              >
                {formErrors.name}
              </p>
            )}
          </div>

          {/* Description field */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows="3"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Price field */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>
              Price ($) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max="99999.99"
              value={formData.price}
              onChange={(e) =>
                setFormData({ ...formData, price: e.target.value })
              }
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: formErrors.price
                  ? '2px solid #c62828'
                  : '1px solid var(--color-border)',
              }}
              aria-invalid={!!formErrors.price}
              aria-describedby={formErrors.price ? 'price-error' : undefined}
            />
            {formErrors.price && (
              <p
                id="price-error"
                style={{ color: '#c62828', fontSize: '0.85rem', marginTop: '0.25rem' }}
              >
                {formErrors.price}
              </p>
            )}
          </div>

          {/* Per Person toggle */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={formData.perPerson}
                onChange={(e) =>
                  setFormData({ ...formData, perPerson: e.target.checked })
                }
                style={{ width: '18px', height: '18px' }}
              />
              <span>Per Person pricing (price multiplied by group size)</span>
            </label>
          </div>

          {/* Group Only toggle */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={formData.groupOnly}
                onChange={(e) =>
                  setFormData({ ...formData, groupOnly: e.target.checked })
                }
                style={{ width: '18px', height: '18px' }}
              />
              <span>Group Only (only available for groups of 3+)</span>
            </label>
          </div>

          {/* Bundle Assignment multi-select */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>
              Assign to Bundles
            </label>
            <div
              style={{
                maxHeight: '200px',
                overflowY: 'auto',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                padding: '1rem',
              }}
            >
              {bundles.length === 0 ? (
                <p style={{ color: 'var(--color-text-light)', fontSize: '0.9rem' }}>
                  No bundles available
                </p>
              ) : (
                bundles.map((bundle) => (
                  <label
                    key={bundle.bundleId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '0.5rem',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.assignedBundleIds.includes(bundle.bundleId)}
                      onChange={(e) =>
                        handleBundleToggle(bundle.bundleId, e.target.checked)
                      }
                      style={{ width: '18px', height: '18px' }}
                    />
                    <span>{bundle.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button type="submit" className="cta">
              {editingExtra ? 'Save Changes' : 'Create Extra'}
            </button>
            <button
              type="button"
              onClick={handleCancelForm}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'white',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Extras List */}
      <div style={{ display: 'grid', gap: '1rem' }}>
        {extras.length === 0 && !loading && (
          <p style={{ color: 'var(--color-text-light)', textAlign: 'center', padding: '2rem' }}>
            No extras yet. Create one to get started.
          </p>
        )}
        {extras.map((extra) => (
          <div
            key={extra.extraId}
            style={{
              background: 'var(--color-accent)',
              padding: '1.5rem',
              borderRadius: '8px',
              opacity: extra.isActive ? 1 : 0.7,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: isMobile ? 'flex-start' : 'center',
              flexDirection: isMobile ? 'column' : 'row',
              gap: '1rem',
            }}
          >
            <div style={{ flex: 1 }}>
              <h3 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                {extra.name}
                {extra.perPerson && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      background: '#e3f2fd',
                      color: '#1565c0',
                    }}
                  >
                    Per Person
                  </span>
                )}
                {extra.groupOnly && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      background: '#f3e5f5',
                      color: '#7b1fa2',
                    }}
                  >
                    Group Only
                  </span>
                )}
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    background: extra.isActive ? '#e8f5e9' : '#eeeeee',
                    color: extra.isActive ? '#2e7d32' : '#666',
                  }}
                >
                  {extra.isActive ? '● Active' : '○ Inactive'}
                </span>
              </h3>
              {extra.description && (
                <p style={{ color: 'var(--color-text)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  {extra.description}
                </p>
              )}
              <p style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>
                ${extra.price?.toFixed(2)}
                {extra.perPerson && ' /person'}
                {extra.assignedBundleIds && extra.assignedBundleIds.length > 0 && (
                  <> • Bundles: {extra.assignedBundleIds.map(getBundleName).join(', ')}</>
                )}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap' }}>
              <button
                onClick={() => handleEdit(extra)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  background: 'var(--color-primary)',
                  color: 'white',
                }}
              >
                Edit
              </button>
              <button
                onClick={() => handleToggleActive(extra)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  background: extra.isActive ? '#4CAF50' : '#999',
                  color: 'white',
                }}
              >
                {extra.isActive ? 'Active' : 'Inactive'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
