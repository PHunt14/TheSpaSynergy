'use client'

import { useState, useEffect } from 'react'

export default function CategorySettings({ showMessage }) {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
    try {
      const res = await fetch('/api/categories')
      const data = await res.json()
      setCategories(data.categories || [])
    } catch (err) {
      console.error('Error loading categories:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    const trimmed = newCategoryName.trim()
    if (!trimmed) return

    setError('')
    setAdding(true)

    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to add category')
      } else {
        setNewCategoryName('')
        showMessage(`Category "${trimmed}" added`)
        await loadCategories()
      }
    } catch (err) {
      setError('Failed to add category')
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (category) => {
    if (!confirm(`Delete category "${category.name}"? This won't remove it from existing services.`)) return

    try {
      const res = await fetch(`/api/categories?categoryId=${encodeURIComponent(category.categoryId)}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        showMessage(`Category "${category.name}" deleted`)
        await loadCategories()
      } else {
        const data = await res.json()
        showMessage(data.error || 'Failed to delete category')
      }
    } catch (err) {
      showMessage('Failed to delete category')
    }
  }

  if (loading) return <div>Loading categories...</div>

  return (
    <div style={{ maxWidth: '600px' }}>
      <h2 style={{ marginBottom: '0.5rem' }}>Service Categories</h2>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
        Manage the predefined categories available when creating or editing services.
      </p>

      {/* Add new category */}
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <input
          type="text"
          value={newCategoryName}
          onChange={(e) => { setNewCategoryName(e.target.value); setError('') }}
          placeholder="New category name..."
          style={{
            flex: 1,
            padding: '0.75rem',
            borderRadius: '8px',
            border: `1px solid ${error ? '#f44336' : 'var(--color-border)'}`,
            fontSize: '1rem',
          }}
          maxLength={50}
          minLength={2}
        />
        <button
          type="submit"
          disabled={adding || !newCategoryName.trim()}
          className="cta"
          style={{
            margin: 0,
            padding: '0.75rem 1.5rem',
            opacity: adding || !newCategoryName.trim() ? 0.6 : 1,
            cursor: adding || !newCategoryName.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {adding ? 'Adding...' : 'Add'}
        </button>
      </form>

      {error && (
        <p style={{ color: '#f44336', fontSize: '0.9rem', marginTop: '-1rem', marginBottom: '1rem' }}>{error}</p>
      )}

      {/* Category list */}
      {categories.length === 0 ? (
        <p style={{ color: 'var(--color-text-light)', fontStyle: 'italic' }}>
          No categories defined yet. Add one above.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {categories.map(cat => (
            <div
              key={cat.categoryId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                background: 'var(--color-accent)',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
              }}
            >
              <span style={{ fontSize: '1rem' }}>{cat.name}</span>
              <button
                onClick={() => handleDelete(cat)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#f44336',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                }}
                onMouseEnter={(e) => e.target.style.background = '#ffebee'}
                onMouseLeave={(e) => e.target.style.background = 'none'}
                aria-label={`Delete category ${cat.name}`}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      <p style={{ color: 'var(--color-text-light)', fontSize: '0.85rem', marginTop: '1.5rem' }}>
        Categories are available as options when creating or editing services.
        Deleting a category here removes it from the dropdown but won&apos;t remove it from existing services.
      </p>
    </div>
  )
}
