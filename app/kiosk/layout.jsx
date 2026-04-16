'use client'

import '../styles/globals.css'
import '../styles/variables.css'
import { useState, useEffect } from 'react'

export default function KioskLayout({ children }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [checking, setChecking] = useState(true)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch('/api/kiosk/auth')
      .then(res => res.json())
      .then(data => { setAuthenticated(data.authenticated); setChecking(false) })
      .catch(() => setChecking(false))
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/kiosk/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const data = await res.json()
      if (data.success) {
        setAuthenticated(true)
      } else {
        setError(data.error || 'Invalid PIN')
        setPin('')
      }
    } catch {
      setError('Connection error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSignOut = async () => {
    await fetch('/api/kiosk/auth', { method: 'DELETE' })
    setAuthenticated(false)
    setPin('')
  }

  if (checking) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>

  if (!authenticated) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--color-accent)' }}>
        <form onSubmit={handleSubmit} style={{
          background: 'white', padding: '3rem', borderRadius: '16px', textAlign: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px'
        }}>
          <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Kiosk Login</h2>
          <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '2rem' }}>Enter the kiosk PIN to access checkout</p>

          {error && (
            <div style={{ padding: '0.75rem', background: '#fee', border: '1px solid #f5c6cb', borderRadius: '8px', color: '#c33', marginBottom: '1rem', fontWeight: '500' }}>
              {error}
            </div>
          )}

          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="Enter PIN"
            autoFocus
            maxLength={8}
            style={{
              width: '100%', padding: '1rem', fontSize: '1.5rem', textAlign: 'center',
              borderRadius: '8px', border: '2px solid var(--color-border)', letterSpacing: '0.5rem',
              boxSizing: 'border-box',
            }}
          />

          <button type="submit" disabled={!pin || submitting} className="cta" style={{
            width: '100%', padding: '1rem', fontSize: '1.1rem', marginTop: '1.5rem',
            opacity: (!pin || submitting) ? 0.6 : 1,
          }}>
            {submitting ? 'Verifying...' : 'Unlock'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div>
      <div style={{
        background: 'var(--color-primary)', color: 'white', padding: '1rem 2rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <span style={{ fontSize: '1.25rem', fontWeight: '600' }}>The Spa Synergy — Checkout</span>
        <button onClick={handleSignOut} style={{
          padding: '0.4rem 1rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.3)',
          background: 'transparent', color: 'white', cursor: 'pointer', fontSize: '0.85rem'
        }}>
          Sign Out
        </button>
      </div>
      <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        {children}
      </div>
    </div>
  )
}
