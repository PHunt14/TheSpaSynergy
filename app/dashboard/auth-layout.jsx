'use client'

import { Authenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import { Amplify } from 'aws-amplify'
import outputs from '../../amplify_outputs.json'

Amplify.configure(outputs)

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
      )}
    </Authenticator>
  )
}
