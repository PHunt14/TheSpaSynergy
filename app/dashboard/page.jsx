'use client'

import { useState, useEffect } from 'react'
import { fetchAuthSession } from 'aws-amplify/auth'

export default function DashboardHome() {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [userVendorId, setUserVendorId] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [vendors, setVendors] = useState([])
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
    } catch (error) {
      console.error('Error loading user:', error)
      setLoading(false)
    }
  }

  useEffect(() => {
    if (userRole === 'admin') {
      fetch('/api/vendors').then(r => r.json()).then(d => {
        setVendors(d.vendors || [])
        if (!userVendorId && d.vendors?.length > 0) setUserVendorId(d.vendors[0].vendorId)
      })
    }
  }, [userRole])

  useEffect(() => {
    if (!userVendorId) return
    setLoading(true)
    fetch(`/api/dashboard?vendorId=${userVendorId}`)
      .then(r => r.json())
      .then(d => { setAppointments(d.appointments || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [userVendorId])

  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfYear = new Date(now.getFullYear(), 0, 1)

  const parseDate = (dt) => {
    if (!dt) return null
    const d = new Date(dt)
    return isNaN(d.getTime()) ? null : d
  }

  const calcRevenue = (start) => {
    return appointments
      .filter(a => a.status === 'confirmed')
      .filter(a => {
        const d = parseDate(a.createdAt || a.dateTime)
        return d && d >= start
      })
      .reduce((sum, a) => sum + (a.service?.price || a.paymentAmount || 0), 0)
  }

  const weekRevenue = calcRevenue(startOfWeek)
  const monthRevenue = calcRevenue(startOfMonth)
  const yearRevenue = calcRevenue(startOfYear)

  const periodStart = period === 'week' ? startOfWeek : period === 'month' ? startOfMonth : startOfYear
  const periodAppointments = appointments
    .filter(a => a.status === 'confirmed')
    .filter(a => { const d = parseDate(a.createdAt || a.dateTime); return d && d >= periodStart })

  const totalCount = appointments.filter(a => a.status !== 'cancelled').length
  const confirmedCount = appointments.filter(a => a.status === 'confirmed').length
  const pendingCount = appointments.filter(a => a.status === 'pending').length

  return (
    <div>
      <h1>Vendor Dashboard</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        Welcome to your business dashboard.
      </p>

      {userRole === 'admin' && vendors.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Select Vendor:</label>
          <select
            value={userVendorId || ''}
            onChange={(e) => setUserVendorId(e.target.value)}
            style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem', minWidth: '250px' }}
          >
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

          {/* Revenue Cards */}
          <h2 style={{ marginBottom: '1rem' }}>Revenue</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            {[
              { label: 'This Week', value: weekRevenue, key: 'week' },
              { label: 'This Month', value: monthRevenue, key: 'month' },
              { label: 'This Year', value: yearRevenue, key: 'year' },
            ].map(r => (
              <div
                key={r.key}
                onClick={() => setPeriod(r.key)}
                style={{
                  background: period === r.key ? 'var(--color-primary)' : 'var(--color-accent)',
                  color: period === r.key ? 'white' : 'var(--color-text)',
                  borderRadius: '12px', padding: '1.5rem', cursor: 'pointer', transition: '0.2s'
                }}
              >
                <div style={{ fontSize: '0.9rem', opacity: 0.8, marginBottom: '0.5rem' }}>{r.label}</div>
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>${r.value.toFixed(2)}</div>
                <div style={{ fontSize: '0.85rem', opacity: 0.7, marginTop: '0.25rem' }}>
                  {appointments.filter(a => a.status === 'confirmed').filter(a => { const d = parseDate(a.createdAt || a.dateTime); return d && d >= (r.key === 'week' ? startOfWeek : r.key === 'month' ? startOfMonth : startOfYear) }).length} paid appointments
                </div>
              </div>
            ))}
          </div>

          {/* Period Detail */}
          {periodAppointments.length > 0 && (
            <div style={{ background: 'var(--color-accent)', borderRadius: '12px', padding: '1.5rem' }}>
              <h3 style={{ marginBottom: '1rem' }}>
                Confirmed Appointments — This {period.charAt(0).toUpperCase() + period.slice(1)}
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Date</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Service</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Customer</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodAppointments.map(a => (
                      <tr key={a.appointmentId} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '0.75rem' }}>{a.dateTime}</td>
                        <td style={{ padding: '0.75rem' }}>{a.service?.name || 'N/A'}</td>
                        <td style={{ padding: '0.75rem' }}>{a.customer?.name || 'N/A'}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>${a.service?.price || a.paymentAmount || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
