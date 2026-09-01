'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

function formatTime(dateTime) {
  if (!dateTime) return ''
  try {
    const d = new Date(dateTime.includes('T') ? dateTime : dateTime.replace(' ', 'T'))
    if (isNaN(d.getTime())) return dateTime
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch { return dateTime }
}

function formatDate(dateTime) {
  if (!dateTime) return ''
  try {
    const d = new Date(dateTime.includes('T') ? dateTime : dateTime.replace(' ', 'T'))
    if (isNaN(d.getTime())) return dateTime
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  } catch { return dateTime }
}

function getLocalDateString(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function StatusBadge({ status }) {
  const colors = {
    confirmed: { bg: '#d4edda', text: '#155724' },
    'pending-confirmation': { bg: '#fff3cd', text: '#856404' },
    pending: { bg: '#fff3cd', text: '#856404' },
    cancelled: { bg: '#f8d7da', text: '#721c24' },
  }
  const c = colors[status] || { bg: '#e2e8f0', text: '#4a5568' }
  return (
    <span style={{ padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600', background: c.bg, color: c.text }}>
      {status || 'unknown'}
    </span>
  )
}

function PaymentBadge({ paymentId, paymentStatus, paymentAmount }) {
  if (paymentId || paymentStatus === 'paid') {
    return (
      <span style={{ padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600', background: '#d4edda', color: '#155724' }}>
        ✓ Paid {paymentAmount ? `$${paymentAmount.toFixed(2)}` : ''}
      </span>
    )
  }
  return (
    <span style={{ padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600', background: '#ffeaa7', color: '#6c5ce7' }}>
      Unpaid
    </span>
  )
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([])
  const [summary, setSummary] = useState({ totalAppointments: 0, paidCount: 0, unpaidCount: 0, totalRevenue: 0 })
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [selectedDate, setSelectedDate] = useState(getLocalDateString(new Date()))
  const [statusFilter, setStatusFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null)
  const [pagination, setPagination] = useState({ nextToken: null, hasMore: false, totalCount: 0, limit: 50 })

  const loadTransactions = (isLoadMore = false) => {
    if (isLoadMore) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setTransactions([])
      setPagination({ nextToken: null, hasMore: false, totalCount: 0, limit: 50 })
    }
    setError(null)

    const startDate = `${selectedDate}T00:00`
    const endDate = `${selectedDate}T23:59`

    const params = new URLSearchParams({ startDate, endDate, limit: '50' })
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (paymentFilter !== 'all') params.set('paymentStatus', paymentFilter)
    if (isLoadMore && pagination.nextToken) params.set('nextToken', pagination.nextToken)

    fetch(`/api/dashboard/transactions?${params}`)
      .then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`)
        return res.json()
      })
      .then(data => {
        if (isLoadMore) {
          setTransactions(prev => [...prev, ...(data.transactions || [])])
        } else {
          setTransactions(data.transactions || [])
        }
        setSummary(data.summary || { totalAppointments: 0, paidCount: 0, unpaidCount: 0, totalRevenue: 0 })
        setPagination(data.pagination || { nextToken: null, hasMore: false, totalCount: 0, limit: 50 })
        setLoading(false)
        setLoadingMore(false)
      })
      .catch(err => {
        setError(err.message || 'Failed to load transactions')
        setLoading(false)
        setLoadingMore(false)
      })
  }

  useEffect(() => { loadTransactions() }, [selectedDate, statusFilter, paymentFilter])

  // Group by groupId for visual clustering
  const grouped = []
  const seenGroups = new Set()
  transactions.forEach(txn => {
    if (txn.groupId && !seenGroups.has(txn.groupId)) {
      seenGroups.add(txn.groupId)
      const groupMembers = transactions.filter(t => t.groupId === txn.groupId)
      grouped.push({ type: 'group', groupId: txn.groupId, members: groupMembers })
    } else if (!txn.groupId) {
      grouped.push({ type: 'single', ...txn })
    }
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.6rem' }}>Transactions</h1>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--color-primary)', fontSize: '0.95rem' }}
            aria-label="Select date"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #ccc', fontSize: '0.9rem' }}
            aria-label="Filter by status"
          >
            <option value="all">All Statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending-confirmation">Pending</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={paymentFilter}
            onChange={e => setPaymentFilter(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #ccc', fontSize: '0.9rem' }}
            aria-label="Filter by payment"
          >
            <option value="all">All Payments</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: 'white', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--color-primary)', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--color-primary-dark)' }}>{summary.totalAppointments}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>Total Appointments</div>
        </div>
        <div style={{ background: 'white', borderRadius: '12px', padding: '1.25rem', border: '1px solid #4CAF50', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#4CAF50' }}>{summary.paidCount}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>Paid</div>
        </div>
        <div style={{ background: 'white', borderRadius: '12px', padding: '1.25rem', border: '1px solid #ff9800', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#ff9800' }}>{summary.unpaidCount}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>Unpaid</div>
        </div>
        <div style={{ background: 'white', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--color-primary-dark)', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--color-primary-dark)' }}>${summary.totalRevenue.toFixed(2)}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>Revenue</div>
        </div>
      </div>

      {loading && <p>Loading transactions...</p>}
      {error && <p style={{ color: '#c33' }}>Error: {error}</p>}

      {!loading && transactions.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem 2rem', background: 'var(--color-accent)', borderRadius: '12px', border: '1px solid var(--color-primary)' }}>
          <p style={{ color: 'var(--color-text-light)', fontSize: '1.1rem' }}>No transactions found for {formatDate(selectedDate + 'T12:00')}.</p>
        </div>
      )}

      {!loading && grouped.length > 0 && (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {grouped.map((item, idx) => {
              if (item.type === 'group') {
                return <GroupRow key={item.groupId} group={item} expandedId={expandedId} setExpandedId={setExpandedId} />
              }
              return <TransactionRow key={item.appointmentId || idx} txn={item} expandedId={expandedId} setExpandedId={setExpandedId} />
            })}
          </div>

          {/* Pagination: Load More button */}
          {pagination.hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
              <button
                onClick={() => loadTransactions(true)}
                disabled={loadingMore}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  border: '1px solid var(--color-primary)',
                  background: loadingMore ? '#f0f0f0' : 'white',
                  color: 'var(--color-primary)',
                  cursor: loadingMore ? 'not-allowed' : 'pointer',
                  fontSize: '1rem',
                  fontWeight: '600',
                  opacity: loadingMore ? 0.6 : 1,
                }}
              >
                {loadingMore ? 'Loading...' : `Load More (${pagination.totalCount - transactions.length} remaining)`}
              </button>
            </div>
          )}

          {/* Pagination info */}
          {pagination.totalCount > 0 && (
            <div style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
              Showing {transactions.length} of {pagination.totalCount} transactions
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TransactionRow({ txn, expandedId, setExpandedId }) {
  const isExpanded = expandedId === txn.appointmentId
  return (
    <div
      style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', overflow: 'hidden' }}
    >
      <button
        onClick={() => setExpandedId(isExpanded ? null : txn.appointmentId)}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '1rem 1.25rem', textAlign: 'left' }}
        aria-expanded={isExpanded}
        aria-label={`Transaction details for ${txn.customer?.name}`}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '150px' }}>
            <div style={{ fontWeight: '600', fontSize: '1rem' }}>{txn.customer?.name}</div>
            <div style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>
              {txn.serviceName} · {txn.staffName || 'Unassigned'} · {txn.vendorName}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>{formatTime(txn.dateTime)}</span>
            <StatusBadge status={txn.status} />
            <PaymentBadge paymentId={txn.paymentId} paymentStatus={txn.paymentStatus} paymentAmount={txn.paymentAmount} />
            <span style={{ fontWeight: '700', fontSize: '1rem', minWidth: '60px', textAlign: 'right' }}>
              ${(txn.displayAmount || txn.servicePrice || 0).toFixed(2)}
            </span>
          </div>
        </div>
      </button>
      {isExpanded && <TransactionDetail txn={txn} />}
    </div>
  )
}

function GroupRow({ group, expandedId, setExpandedId }) {
  const isExpanded = expandedId === group.groupId
  const firstMember = group.members[0]
  const allPaid = group.members.every(m => m.paymentId || m.paymentStatus === 'paid')
  const anyPaid = group.members.some(m => m.paymentId || m.paymentStatus === 'paid')
  // Service price is for the whole group (not per-appointment)
  const servicePrice = firstMember?.servicePrice || 0
  const houseFee = firstMember?.houseFeeAmount || 0
  // Actual revenue is sum of what was paid to providers
  const paidTotal = group.members.reduce((sum, m) => sum + (m.paymentAmount || 0), 0)

  // Extract house payment ID from paymentRaw (stored on any group member)
  const rawData = group.members.find(m => m.paymentRaw)?.paymentRaw
  const housePaymentId = rawData?.houseFee?.paymentId || null

  return (
    <div style={{ background: 'white', borderRadius: '10px', border: '2px solid var(--color-primary)', overflow: 'hidden' }}>
      <button
        onClick={() => setExpandedId(isExpanded ? null : group.groupId)}
        style={{ width: '100%', background: 'linear-gradient(135deg, #f8fffe, #f0f8ff)', border: 'none', cursor: 'pointer', padding: '1rem 1.25rem', textAlign: 'left' }}
        aria-expanded={isExpanded}
        aria-label={`Group transaction for ${firstMember?.customer?.name}`}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '150px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--color-primary-dark)', textTransform: 'uppercase', marginBottom: '0.15rem' }}>
              🔗 Group · {group.members.length} providers
            </div>
            <div style={{ fontWeight: '600', fontSize: '1rem' }}>{firstMember?.customer?.name}</div>
            <div style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>
              {firstMember?.serviceName} · {group.members.map(m => m.staffName || 'Unassigned').join(' + ')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>{formatTime(firstMember?.dateTime)}</span>
            {allPaid ? (
              <span style={{ padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600', background: '#d4edda', color: '#155724' }}>✓ All Paid</span>
            ) : anyPaid ? (
              <span style={{ padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600', background: '#fff3cd', color: '#856404' }}>⚠ Partial</span>
            ) : (
              <span style={{ padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600', background: '#ffeaa7', color: '#6c5ce7' }}>Unpaid</span>
            )}
            <span style={{ fontWeight: '700', fontSize: '1rem', minWidth: '60px', textAlign: 'right' }}>
              ${servicePrice.toFixed(2)}
            </span>
          </div>
        </div>
      </button>
      {isExpanded && (
        <div style={{ borderTop: '1px solid #e0e0e0', padding: '1rem 1.25rem', background: '#fafffe' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', marginBottom: '0.5rem' }}>
            Group ID: <code style={{ fontSize: '0.75rem', background: '#eee', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{group.groupId}</code>
          </div>

          {/* Payment split breakdown */}
          <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: '#f0f8ff', borderRadius: '6px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <span>Service total</span>
              <span style={{ fontWeight: '600' }}>${servicePrice.toFixed(2)}</span>
            </div>
            {houseFee > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', color: '#6c5ce7' }}>
                <span>
                  ↳ House fee
                  {housePaymentId && <code style={{ fontSize: '0.65rem', background: '#eee', padding: '0.1rem 0.3rem', borderRadius: '3px', marginLeft: '0.4rem' }}>{housePaymentId.slice(0, 12)}...</code>}
                </span>
                <span>${houseFee.toFixed(2)}</span>
              </div>
            )}
            {group.members.map(m => (
              <div key={m.appointmentId} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                <span>↳ {m.staffName || 'Unassigned'} ({m.vendorName})</span>
                <span>${(m.providerShare || m.displayAmount || 0).toFixed(2)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #ccc', paddingTop: '0.35rem', marginTop: '0.35rem', fontWeight: '600' }}>
              <span>Total accounted</span>
              <span>${(houseFee + group.members.reduce((s, m) => s + (m.providerShare || m.displayAmount || 0), 0)).toFixed(2)}</span>
            </div>
          </div>

          {/* Actual payment status per provider */}
          <div style={{ fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--color-text-light)' }}>Actual payments:</div>
          {group.members.map(m => (
            <div key={m.appointmentId} style={{ padding: '0.5rem 0', borderTop: '1px dashed #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <div>
                <strong>{m.staffName || 'Unassigned'}</strong> — {m.vendorName}
                {m.paymentId && <code style={{ fontSize: '0.7rem', background: '#eee', padding: '0.1rem 0.3rem', borderRadius: '3px', marginLeft: '0.5rem' }}>{m.paymentId.slice(0, 12)}...</code>}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <PaymentBadge paymentId={m.paymentId} paymentStatus={m.paymentStatus} paymentAmount={m.paymentAmount} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TransactionDetail({ txn, nested }) {
  return (
    <div style={{ padding: nested ? '0.75rem 0' : '1rem 1.25rem', borderTop: nested ? '1px dashed #ddd' : '1px solid #e0e0e0', fontSize: '0.85rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
        <div>
          <strong>Customer:</strong> {txn.customer?.name}<br />
          {txn.customer?.phone && <><span style={{ color: '#666' }}>{txn.customer.phone}</span><br /></>}
          {txn.customer?.email && <span style={{ color: '#666' }}>{txn.customer.email}</span>}
        </div>
        <div>
          <strong>Service:</strong> {txn.serviceName} (${txn.servicePrice?.toFixed(2)})<br />
          <strong>Staff:</strong> {txn.staffName || 'Unassigned'}<br />
          <strong>Vendor:</strong> {txn.vendorName}
        </div>
        <div>
          <strong>This provider&rsquo;s share:</strong> ${txn.displayAmount?.toFixed(2) || '0.00'}<br />
          <strong>Payment Amount:</strong> {txn.paymentAmount ? `$${txn.paymentAmount.toFixed(2)}` : '—'}<br />
          <strong>Payment Status:</strong> {txn.paymentStatus || 'none'}
        </div>
        <div>
          <strong>Payment ID:</strong>{' '}
          {txn.paymentId ? (
            <code style={{ fontSize: '0.7rem', background: '#eee', padding: '0.1rem 0.3rem', borderRadius: '3px', wordBreak: 'break-all' }}>
              {txn.paymentId}
            </code>
          ) : '—'}<br />
          {txn.groupId && <><strong>Group ID:</strong> <code style={{ fontSize: '0.7rem', background: '#eee', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>{txn.groupId.slice(0, 8)}...</code><br /></>}
          {txn.bundleId && <><strong>Bundle:</strong> <code style={{ fontSize: '0.7rem', background: '#eee', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>{txn.bundleId}</code><br /></>}
          <strong>Appointment ID:</strong> <code style={{ fontSize: '0.7rem', background: '#eee', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>{txn.appointmentId?.slice(0, 8)}...</code>
        </div>
      </div>
    </div>
  )
}
