'use client'

import { useEffect, useState } from 'react'

/**
 * On dashboard login, checks whether the signed-in staff member's own Square
 * account needs to be reconnected and, if so, shows a modal they must dismiss.
 *
 * "Needs reconnect" means the account is in an error state, or the access token
 * is expired with no refresh token to recover it — i.e. card payments to this
 * person would fail until they reconnect. A merely expiring-soon or refreshable
 * token does NOT trigger the warning (the payment path refreshes it just-in-time).
 *
 * The check runs once per browser session (sessionStorage) so the staff member
 * is not nagged on every page navigation, but is reminded again next login.
 */
export default function SquareReconnectGate({ email }) {
  const [staffName, setStaffName] = useState(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!email) return

    // Only prompt once per browser session.
    const dismissedKey = `squareReconnectDismissed:${email.toLowerCase()}`
    if (sessionStorage.getItem(dismissedKey) === '1') return

    let cancelled = false
    const qs = new URLSearchParams({ email })
    fetch(`/api/square/my-status?${qs.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        if (data.found && data.needsReconnect) {
          setStaffName(data.staffName)
          setShow(true)
        }
      })
      .catch(() => { /* fail silently — never block the dashboard on this check */ })

    return () => { cancelled = true }
  }, [email])

  const dismiss = () => {
    if (email) sessionStorage.setItem(`squareReconnectDismissed:${email.toLowerCase()}`, '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="square-reconnect-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: 'white', borderRadius: '12px', maxWidth: '440px', width: '100%',
          padding: '1.75rem', boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
        }}
      >
        <h2 id="square-reconnect-title" style={{ margin: '0 0 0.75rem', fontSize: '1.25rem' }}>
          ⚠ Reconnect your Square account
        </h2>
        <p style={{ margin: '0 0 1rem', color: 'var(--color-text)', lineHeight: 1.5 }}>
          {staffName ? `${staffName}, your` : 'Your'} Square connection has expired and
          needs to be reconnected. Until you reconnect, customers cannot pay by card
          for your services and will be asked to pay in person.
        </p>
        <p style={{ margin: '0 0 1.5rem', color: 'var(--color-text-light)', fontSize: '0.9rem' }}>
          Go to <strong>Settings → My Settings</strong> and click <strong>Connect Square</strong>.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={dismiss}
            style={{
              padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--color-border)',
              background: 'white', color: 'var(--color-text)', cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
          <a
            href="/dashboard/settings"
            onClick={dismiss}
            style={{
              padding: '0.6rem 1rem', borderRadius: '8px', border: 'none',
              background: 'var(--color-primary)', color: 'white', cursor: 'pointer',
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
            }}
          >
            Go to Settings
          </a>
        </div>
      </div>
    </div>
  )
}
