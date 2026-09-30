'use client'

import { useState, useEffect, useCallback } from 'react'

function currentMonth() {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(month) {
  // month is YYYY-MM
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return month
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch { return iso }
}

export default function HouseFeesPage() {
  const [month, setMonth] = useState(currentMonth())
  const [statusFilter, setStatusFilter] = useState('all')
  const [data, setData] = useState({ providers: [], totals: { owed: 0, settled: 0, count: 0 }, isAdmin: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [settling, setSettling] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ month, status: statusFilter })
    fetch(`/api/dashboard/house-fees?${params}`)
      .then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`)
        return res.json()
      })
      .then(d => {
        setData(d)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message || 'Failed to load house fees')
        setLoading(false)
      })
  }, [month, statusFilter])

  useEffect(() => { load() }, [load])

  const settle = async (ledgerIds) => {
    setSettling(ledgerIds.join(','))
    try {
      const res = await fetch('/api/dashboard/house-fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ledgerIds }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.details || d.error || `Server returned ${res.status}`)
      }
      load()
    } catch (err) {
      setError(err.message || 'Failed to settle')
    } finally {
      setSettling(null)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem' }}>House Fees</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-light)', fontSize: '0.9rem' }}>
            {data.isAdmin
              ? 'House fees owed by each provider. The provider collects the full payment and owes the house its fee.'
              : 'House fees you owe the house. You collected the full payment for these services.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--color-primary)', fontSize: '0.95rem' }}
            aria-label="Select month"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #ccc', fontSize: '0.9rem' }}
            aria-label="Filter by status"
          >
            <option value="all">All</option>
            <option value="owed">Owed</option>
            <option value="settled">Settled</option>
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: 'white', borderRadius: '12px', padding: '1.25rem', border: '1px solid #ff9800', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#ff9800' }}>${data.totals.owed.toFixed(2)}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>Owed ({formatMonthLabel(month)})</div>
        </div>
        <div style={{ background: 'white', borderRadius: '12px', padding: '1.25rem', border: '1px solid #4CAF50', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#4CAF50' }}>${data.totals.settled.toFixed(2)}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>Settled</div>
        </div>
        <div style={{ background: 'white', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--color-primary)', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--color-primary-dark)' }}>{data.totals.count}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>Charges</div>
        </div>
      </div>

      {loading && <p>Loading house fees...</p>}
      {error && <p style={{ color: '#c33' }}>Error: {error}</p>}

      {!loading && data.providers.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem 2rem', background: 'var(--color-accent)', borderRadius: '12px', border: '1px solid var(--color-primary)' }}>
          <p style={{ color: 'var(--color-text-light)', fontSize: '1.1rem' }}>No house fees for {formatMonthLabel(month)}.</p>
        </div>
      )}

      {!loading && data.providers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {data.providers.map(provider => {
            const isOpen = expanded === provider.staffId
            const owedLedgerIds = provider.entries.filter(e => e.status === 'owed').map(e => e.ledgerId)
            return (
              <div key={provider.staffId} style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', overflow: 'hidden' }}>
                <button
                  onClick={() => setExpanded(isOpen ? null : provider.staffId)}
                  style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '1rem 1.25rem', textAlign: 'left' }}
                  aria-expanded={isOpen}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '150px' }}>
                      <div style={{ fontWeight: '600', fontSize: '1rem' }}>{provider.staffName}</div>
                      <div style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>
                        {provider.owedCount} owed · {provider.settledCount} settled
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      {provider.owedAmount > 0 && (
                        <span style={{ padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '700', background: '#fff3cd', color: '#856404' }}>
                          ${provider.owedAmount.toFixed(2)} owed
                        </span>
                      )}
                      {provider.settledAmount > 0 && (
                        <span style={{ fontSize: '0.8rem', color: '#4CAF50' }}>${provider.settledAmount.toFixed(2)} settled</span>
                      )}
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div style={{ borderTop: '1px solid #e0e0e0', padding: '1rem 1.25rem', background: '#fafffe' }}>
                    {data.isAdmin && owedLedgerIds.length > 0 && (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <button
                          onClick={() => settle(owedLedgerIds)}
                          disabled={settling !== null}
                          style={{
                            padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #4CAF50',
                            background: settling !== null ? '#f0f0f0' : '#4CAF50', color: settling !== null ? '#999' : 'white',
                            cursor: settling !== null ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '0.9rem',
                          }}
                        >
                          Mark all {owedLedgerIds.length} owed as settled (${provider.owedAmount.toFixed(2)})
                        </button>
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {provider.entries.map(entry => (
                        <div key={entry.ledgerId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderTop: '1px dashed #ddd', fontSize: '0.85rem', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: '160px' }}>
                            <strong>{entry.serviceName || 'Service'}</strong>
                            {entry.customerName ? ` · ${entry.customerName}` : ''}
                            <span style={{ color: 'var(--color-text-light)' }}> · {formatDate(entry.createdAt)}</span>
                          </div>
                          <span style={{ fontWeight: '600' }}>${entry.houseFeeAmount.toFixed(2)}</span>
                          {entry.status === 'settled' ? (
                            <span style={{ padding: '0.15rem 0.5rem', borderRadius: '10px', fontSize: '0.7rem', fontWeight: '600', background: '#d4edda', color: '#155724' }}>✓ Settled</span>
                          ) : (
                            <>
                              <span style={{ padding: '0.15rem 0.5rem', borderRadius: '10px', fontSize: '0.7rem', fontWeight: '600', background: '#fff3cd', color: '#856404' }}>Owed</span>
                              {data.isAdmin && (
                                <button
                                  onClick={() => settle([entry.ledgerId])}
                                  disabled={settling !== null}
                                  style={{ padding: '0.15rem 0.6rem', borderRadius: '8px', border: '1px solid #4CAF50', background: 'white', color: '#4CAF50', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600' }}
                                >
                                  Settle
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
