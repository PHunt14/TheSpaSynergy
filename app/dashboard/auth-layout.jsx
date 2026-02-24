'use client'

import { Authenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import { Amplify } from 'aws-amplify'
import { useEffect, useRef } from 'react'
import outputs from '../../amplify_outputs.json'

Amplify.configure(outputs)

const TIMEOUT_DURATION = 60 * 60 * 1000 // 1 hour

export default function DashboardAuthLayout({ children }) {
  return (
    <Authenticator 
      hideSignUp={true}
      components={{
        Header() {
          return (
            <div style={{ textAlign: 'center', padding: '2rem 0 1rem' }}>
              <h2>Vendor Login</h2>
            </div>
          )
        }
      }}
    >
      {({ signOut, user }) => (
        <AutoLogout signOut={signOut}>
          <div>
            <div style={{ 
              padding: '1rem', 
              background: 'var(--color-accent)', 
              display: 'flex', 
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '2rem'
            }}>
              <span>Signed in as: {user?.signInDetails?.loginId}</span>
              <button 
                onClick={signOut}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--color-primary)',
                  color: 'white',
                  cursor: 'pointer'
                }}
              >
                Sign Out
              </button>
            </div>
            {children}
          </div>
        </AutoLogout>
      )}
    </Authenticator>
  )
}

function AutoLogout({ signOut, children }) {
  const timeoutRef = useRef(null)

  const resetTimeout = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => signOut(), TIMEOUT_DURATION)
  }

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach(event => document.addEventListener(event, resetTimeout))
    resetTimeout()

    return () => {
      events.forEach(event => document.removeEventListener(event, resetTimeout))
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [signOut])

  return children
}
