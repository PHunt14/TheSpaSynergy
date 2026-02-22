'use client'

import { useState, useEffect } from 'react'

export default function Staff() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(true)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      const response = await fetch('/api/staff')
      const data = await response.json()
      setUsers(data.users || [])
    } catch (error) {
      console.error('Error loading users:', error)
    } finally {
      setLoadingUsers(false)
    }
  }

  const handleInvite = async (e) => {
    e.preventDefault()
    if (!email) return

    setLoading(true)
    try {
      const response = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })

      const data = await response.json()

      if (response.ok) {
        alert(data.message)
        setEmail('')
        loadUsers()
      } else {
        alert('Error: ' + data.error)
      }
    } catch (error) {
      console.error('Error inviting user:', error)
      alert('Failed to invite user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1>Staff Management</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        Invite new staff members to access the dashboard.
      </p>

      <div style={{
        background: 'var(--color-accent)',
        padding: '2rem',
        borderRadius: '8px',
        marginBottom: '2rem',
        maxWidth: '500px'
      }}>
        <h3>Invite New User</h3>
        <form onSubmit={handleInvite}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>
              Email Address *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                fontSize: '1rem'
              }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="cta"
            style={{ width: '100%' }}
          >
            {loading ? 'Sending Invitation...' : 'Invite User'}
          </button>
        </form>
      </div>

      <div>
        <h3>Current Users</h3>
        {loadingUsers && <p>Loading users...</p>}
        
        {!loadingUsers && users.length === 0 && (
          <p style={{ color: 'var(--color-text-light)' }}>No users found.</p>
        )}

        {!loadingUsers && users.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              background: 'var(--color-accent)',
              borderRadius: '8px',
              overflow: 'hidden'
            }}>
              <thead>
                <tr style={{ background: 'var(--color-primary)', color: 'white' }}>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Email</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.username} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '1rem' }}>{user.email}</td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '12px',
                        fontSize: '0.85rem',
                        background: user.status === 'CONFIRMED' ? '#4CAF50' : '#FF9800',
                        color: 'white'
                      }}>
                        {user.status}
                      </span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {new Date(user.created).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}