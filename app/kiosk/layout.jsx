'use client'

import '../styles/globals.css'
import '../styles/variables.css'
import { Authenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import { Amplify } from 'aws-amplify'
import outputs from '../../amplify_outputs.json'

Amplify.configure(outputs, { ssr: true })

export default function KioskLayout({ children }) {
  return (
    <Authenticator
      hideSignUp={true}
      components={{
        Header() {
          return (
            <div style={{ textAlign: 'center', padding: '2rem 0 1rem' }}>
              <h2>Kiosk Login</h2>
              <p style={{ color: '#666', fontSize: '0.9rem' }}>Sign in to access the checkout kiosk</p>
            </div>
          )
        }
      }}
    >
      {({ signOut }) => (
        <div>
          <div style={{
            background: 'var(--color-primary)', color: 'white', padding: '1rem 2rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span style={{ fontSize: '1.25rem', fontWeight: '600' }}>The Spa Synergy — Checkout</span>
            <button onClick={signOut} style={{
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
      )}
    </Authenticator>
  )
}
