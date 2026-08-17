'use client'

import { useState, useEffect } from 'react'
import { fetchAuthSession } from 'aws-amplify/auth'

export default function DashboardHome() {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [userVendorId, setUserVendorId] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [vendors, setVendors] = useState([])
  const [selectedVendorId, setSelectedVendorId] = useState('all')
  const [period, setPeriod] = useState('month')

  useEffect(() => {
    loadUser()
  }, [])

  const loadUser = async () => {
    try {
      const session = await fetchAuthSession()
      const vendorId = session.tokens?.idToken?.payload['custom:vendorId']
      const role = session.tokens?.idToken?.payload['custom:role'] || 'vendor'
      setUserVendorId(vendorId)
      setUserRole(role)

      if (role !== 'admin' && vendorId) {
        setSelectedVendorId(vendorId)
      } else if (role === 'admin') {
        // Admin doesn't need appointments on this page
        setLoading(false)
      }
    } catch (error) {
      console.error('Error loading user:', error)
      setLoading(false)
    }
  }

  useEffect(() => {
    if (userRole === 'admin') return
    if (userRole === 'admin') {
      fetch('/api/vendors').then(r => r.json()).then(d => {
        setVendors(d.vendors || [])
      })
    }
  }, [userRole])

  useEffect(() => {
    if (userRole === 'admin') return
    if (userRole === 'admin' && selectedVendorId === 'all' && vendors.length > 0) {
      loadAllVendorAppointments()
    } else if (selectedVendorId && selectedVendorId !== 'all') {
      loadSingleVendorAppointments(selectedVendorId)
    } else if (userRole !== 'admin' && userVendorId) {
      loadSingleVendorAppointments(userVendorId)
    }
  }, [selectedVendorId, userVendorId, userRole, vendors])

  const loadSingleVendorAppointments = (vendorId) => {
    setLoading(true)
    fetch(`/api/dashboard?vendorId=${vendorId}`)
      .then(r => r.json())
      .then(d => { setAppointments(d.appointments || []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  const loadAllVendorAppointments = () => {
    setLoading(true)
    Promise.all(
      vendors.map(v =>
        fetch(`/api/dashboard?vendorId=${v.vendorId}`)
          .then(r => r.json())
          .then(d => d.appointments || [])
          .catch(() => [])
      )
    )
      .then(results => {
        setAppointments(results.flat())
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  // Admin gets a simple welcome page
  if (!loading && userRole === 'admin') {
    return (
      <div>
        <h1>Welcome, Admin</h1>
        <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem', fontSize: '1.1rem' }}>
          Use the sidebar to manage vendors, services, staff, and more.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          {[
            { label: 'Calendar', icon: '📅', href: '/dashboard/calendar' },
            { label: 'Services', icon: '💆', href: '/dashboard/services' },
            { label: 'Packages', icon: '📦', href: '/dashboard/bundles' },
            { label: 'Providers', icon: '👤', href: '/dashboard/providers' },
            { label: 'Staff', icon: '👥', href: '/dashboard/staff' },
            { label: 'Clients', icon: '🧑‍🤝‍🧑', href: '/dashboard/clients' },
            { label: 'Settings', icon: '⚙️', href: '/dashboard/settings' },
          ].map(item => (
            <a
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '1.25rem',
                background: 'var(--color-accent)',
                borderRadius: '12px',
                textDecoration: 'none',
                color: 'var(--color-text)',
                fontSize: '1rem',
                fontWeight: '500',
                transition: 'box-shadow 0.2s',
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>{item.icon}</span>
              {item.label}
            </a>
          ))}
        </div>
      </div>
    )
  }

  const now = new Date()

  const parseDate = (dt) => {
    if (!dt) return null
    const d = new Date(dt)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const getPeriodRange = (p) => {
    if (p === 'week') {
      const start = new Date(now)
      start.setDate(now.getDate() - now.getDay())
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setDate(start.getDate() + 7)
      return { start, end }
    }
    if (p === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      return { start, end }
    }
    // year
    const start = new Date(now.getFullYear(), 0, 1)
    const end = new Date(now.getFullYear() + 1, 0, 1)
    return { start, end }
  }

  const { start: periodStart, end: periodEnd } = getPeriodRange(period)
  const periodAppointments = appointments
    .filter(a => a.status === 'confirmed' || a.status === 'pending' || a.status === 'pending-confirmation')
    .filter(a => {
      const d = parseDate(a.rawDateTime)
      return d && d >= periodStart && d < periodEnd
    })
    .sort((a, b) => new Date(a.rawDateTime) - new Date(b.rawDateTime))

  const totalCount = appointments.filter(a => a.status !== 'cancelled').length
  const confirmedCount = appointments.filter(a => a.status === 'confirmed').length
  const pendingCount = appointments.filter(a => a.status === 'pending' || a.status === 'pending-confirmation').length

  return (
    <div>
      <h1>Vendor Dashboard</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        Welcome to your business dashboard.
      </p>

      {userRole === 'admin' && vendors.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <label htmlFor="vendor-select-overview" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>View:</label>
          <select
            id="vendor-select-overview"
            value={selectedVendorId || 'all'}
            onChange={(e) => setSelectedVendorId(e.target.value)}
            style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem', minWidth: '250px' }}
          >
            <option value="all">All Vendors</option>
            {vendors.map(v => <option key={v.vendorId} value={v.vendorId}>{v.name}</option>)}
          </select>
        </div>
      )}

      {loading ? <p>Loading...</p> : (
        <>
          {/* Appointment Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            {[
              { label: 'Total Appointments', value: totalCount, color: 'var(--color-primary)' },
              { label: 'Confirmed', value: confirmedCount, color: '#4CAF50' },
              { label: 'Pending', value: pendingCount, color: '#FF9800' },
            ].map(stat => (
              <div key={stat.label} style={{ background: 'var(--color-accent)', borderRadius: '12px', padding: '1.5rem', borderLeft: `4px solid ${stat.color}` }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--color-text-light)', marginBottom: '0.5rem' }}>{stat.label}</div>
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Period Toggle */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
            {['week', 'month', 'year'].map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: '0.5rem 1.2rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: period === p ? 'var(--color-primary)' : 'var(--color-accent)',
                  color: period === p ? 'white' : 'var(--color-text)',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '0.9rem',
                  textTransform: 'capitalize',
                }}
              >
                This {p}
              </button>
            ))}
          </div>

          {/* Period Appointments */}
          {periodAppointments.length > 0 ? (
            <div style={{ background: 'var(--color-accent)', borderRadius: '12px', padding: '1.5rem' }}>
              <h3 style={{ marginBottom: '1rem' }}>
                Appointments — This {period.charAt(0).toUpperCase() + period.slice(1)} ({periodAppointments.length})
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Date</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Service</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Customer</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodAppointments.map(a => (
                      <tr key={a.appointmentId} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '0.75rem' }}>
                          {a.timeFrame
                            ? (() => {
                                const d = parseDate(a.rawDateTime)
                                const dateStr = d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
                                return `${dateStr} — ${a.timeFrame.charAt(0).toUpperCase() + a.timeFrame.slice(1)}`
                              })()
                            : a.dateTime}
                        </td>
                        <td style={{ padding: '0.75rem' }}>{a.service?.name || 'N/A'}</td>
                        <td style={{ padding: '0.75rem' }}>{a.customer?.name || 'N/A'}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{
                            padding: '0.2rem 0.6rem', borderRadius: '8px', fontSize: '0.8rem',
                            background: a.status === 'confirmed' ? '#d4edda' : '#fff3cd',
                            color: a.status === 'confirmed' ? '#155724' : '#856404',
                          }}>{a.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--color-text-light)' }}>No appointments this {period}.</p>
          )}
        </>
      )}
    </div>
  )
}
