'use client'

import { useState, useEffect } from 'react'
import { fetchAuthSession } from 'aws-amplify/auth'

export default function Staff() {
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [role, setRole] = useState('staff')
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [vendors, setVendors] = useState([])
  const [selectedVendor, setSelectedVendor] = useState('')
  const [currentUserRole, setCurrentUserRole] = useState(null)
  const [currentUserVendorId, setCurrentUserVendorId] = useState(null)
  const [currentUserEmail, setCurrentUserEmail] = useState(null)
  const [editingUser, setEditingUser] = useState(null)

  useEffect(() => {
    loadCurrentUser()
    loadUsers()
    loadVendors()
  }, [])

  const loadCurrentUser = async () => {
    try {
      const session = await fetchAuthSession()
      const vendorId = session.tokens?.idToken?.payload['custom:vendorId']
      const role = session.tokens?.idToken?.payload['custom:role'] || 'staff'
      const email = session.tokens?.idToken?.payload['email']
      setCurrentUserRole(role)
      setCurrentUserVendorId(vendorId)
      setCurrentUserEmail(email)
      if (role === 'staff' && vendorId) {
        setSelectedVendor(vendorId)
      }
    } catch (error) {
      console.error('Error loading current user:', error)
    }
  }

  const loadVendors = async () => {
    try {
      const response = await fetch('/api/vendors')
      const data = await response.json()
      const vendorList = data.vendors || []
      setVendors(vendorList)
      if (vendorList.length > 0) {
        setSelectedVendor(vendorList[0].vendorId)
      }
    } catch (error) {
      console.error('Error loading vendors:', error)
    }
  }

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

    const vendorId = currentUserRole === 'staff' ? currentUserVendorId : selectedVendor

    setLoading(true)
    try {
      const response = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email,
          firstName,
          lastName,
          vendorId,
          role
        })
      })

      const data = await response.json()

      if (response.ok) {
        alert(data.message)
        setEmail('')
        setFirstName('')
        setLastName('')
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

  const handleUpdate = async (username, newRole, newVendorId, newFirstName, newLastName) => {
    try {
      const response = await fetch('/api/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username, 
          role: newRole, 
          vendorId: newVendorId,
          firstName: newFirstName,
          lastName: newLastName
        })
      })

      if (response.ok) {
        alert('User updated successfully')
        setEditingUser(null)
        loadUsers()
      } else {
        alert('Failed to update user')
      }
    } catch (error) {
      console.error('Error updating user:', error)
      alert('Error updating user')
    }
  }

  const handleDelete = async (username, email) => {
    if (!confirm(`Delete user ${email}?`)) return

    try {
      const response = await fetch(`/api/staff?username=${username}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        alert('User deleted successfully')
        loadUsers()
      } else {
        alert('Failed to delete user')
      }
    } catch (error) {
      console.error('Error deleting user:', error)
      alert('Error deleting user')
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
          {(currentUserRole === 'admin' || currentUserRole === 'superadmin') && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                  Role *
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    fontSize: '1rem'
                  }}
                >
                  <option value="staff">Staff (Vendor Access)</option>
                  <option value="admin">Admin (All Vendors)</option>
                  {currentUserRole === 'superadmin' && <option value="superadmin">Super Admin (Full Access)</option>}
                </select>
              </div>
              {role === 'staff' && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                    Assign to Vendor *
                  </label>
                  <select
                    value={selectedVendor}
                    onChange={(e) => setSelectedVendor(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      fontSize: '1rem'
                    }}
                  >
                    {vendors.map(vendor => (
                      <option key={vendor.vendorId} value={vendor.vendorId}>
                        {vendor.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>
              First Name
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="John"
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
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>
              Last Name
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Doe"
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
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Name</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Email</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Role</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Vendor</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.username} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '1rem' }}>
                      {editingUser === user.username ? (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input
                            type="text"
                            defaultValue={user.firstName || ''}
                            placeholder="First"
                            onChange={(e) => user.editFirstName = e.target.value}
                            style={{ padding: '0.5rem', borderRadius: '4px', flex: 1 }}
                          />
                          <input
                            type="text"
                            defaultValue={user.lastName || ''}
                            placeholder="Last"
                            onChange={(e) => user.editLastName = e.target.value}
                            style={{ padding: '0.5rem', borderRadius: '4px', flex: 1 }}
                          />
                        </div>
                      ) : (
                        user.firstName || user.lastName 
                          ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                          : '-'
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>{user.email}</td>
                    <td style={{ padding: '1rem' }}>
                      {editingUser === user.username && (currentUserRole !== 'staff' || user.email === currentUserEmail) ? (
                        <select
                          defaultValue={user.role}
                          onChange={(e) => user.editRole = e.target.value}
                          disabled={currentUserRole === 'staff'}
                          style={{ padding: '0.5rem', borderRadius: '4px' }}
                        >
                          <option value="staff">Staff</option>
                          <option value="admin">Admin</option>
                          {currentUserRole === 'superadmin' && <option value="superadmin">Super Admin</option>}
                        </select>
                      ) : (
                        <span style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '12px',
                          fontSize: '0.85rem',
                          background: user.role === 'superadmin' ? '#9C27B0' : user.role === 'admin' ? '#2196F3' : '#4CAF50',
                          color: 'white'
                        }}>
                          {user.role}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {editingUser === user.username && (currentUserRole !== 'staff' || user.email === currentUserEmail) ? (
                        <select
                          defaultValue={user.vendorId || ''}
                          onChange={(e) => user.editVendorId = e.target.value}
                          disabled={currentUserRole === 'staff'}
                          style={{ padding: '0.5rem', borderRadius: '4px' }}
                        >
                          <option value="">All</option>
                          {vendors.map(v => (
                            <option key={v.vendorId} value={v.vendorId}>{v.name}</option>
                          ))}
                        </select>
                      ) : (
                        user.vendorId ? vendors.find(v => v.vendorId === user.vendorId)?.name || user.vendorId : 'All'
                      )}
                    </td>
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
                    <td style={{ padding: '1rem', display: 'flex', gap: '0.5rem' }}>
                      {editingUser === user.username ? (
                        <>
                          <button
                            onClick={() => handleUpdate(
                              user.username, 
                              user.editRole || user.role, 
                              user.editVendorId || user.vendorId,
                              user.editFirstName !== undefined ? user.editFirstName : user.firstName,
                              user.editLastName !== undefined ? user.editLastName : user.lastName
                            )}
                            style={{
                              padding: '0.5rem 1rem',
                              borderRadius: '4px',
                              border: 'none',
                              background: '#4CAF50',
                              color: 'white',
                              cursor: 'pointer',
                              fontSize: '0.85rem'
                            }}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingUser(null)}
                            style={{
                              padding: '0.5rem 1rem',
                              borderRadius: '4px',
                              border: 'none',
                              background: '#999',
                              color: 'white',
                              cursor: 'pointer',
                              fontSize: '0.85rem'
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          {/* Staff can only edit their own account */}
                          {(currentUserRole !== 'staff' || user.email === currentUserEmail) && (
                            <button
                              onClick={() => setEditingUser(user.username)}
                              style={{
                                padding: '0.5rem 1rem',
                                borderRadius: '4px',
                                border: 'none',
                                background: '#2196F3',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                              }}
                            >
                              Edit
                            </button>
                          )}
                          {/* Only admin/superadmin can delete users */}
                          {(currentUserRole === 'admin' || currentUserRole === 'superadmin') && (
                            <button
                              onClick={() => handleDelete(user.username, user.email)}
                              style={{
                                padding: '0.5rem 1rem',
                                borderRadius: '4px',
                                border: 'none',
                                background: '#F44336',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </>
                      )}
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