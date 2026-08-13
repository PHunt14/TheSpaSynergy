'use client'

import PropTypes from 'prop-types'

export default function NewClientCheckbox({ checked = false, onChange, isReturningClient = false, showSuggestion = false }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={
            isReturningClient ? 'returning-client-badge' :
            showSuggestion ? 'new-client-suggestion' :
            undefined
          }
          style={{ marginTop: '0.1rem' }}
        />
        <span style={{ fontSize: '0.95rem' }}>First time visiting?</span>
      </label>

      {isReturningClient && (
        <span
          id="returning-client-badge"
          style={{
            display: 'inline-block',
            marginTop: '0.4rem',
            marginLeft: '1.5rem',
            padding: '0.2rem 0.6rem',
            background: '#e8f5e9',
            color: '#2e7d32',
            borderRadius: '12px',
            fontSize: '0.8rem',
            fontWeight: '600',
          }}
        >
          ✓ Welcome back
        </span>
      )}

      {showSuggestion && (
        <p
          id="new-client-suggestion"
          style={{
            marginTop: '0.4rem',
            marginLeft: '1.5rem',
            marginBottom: 0,
            fontSize: '0.8rem',
            color: 'var(--color-text-light, #666)',
            fontStyle: 'italic',
          }}
        >
          If this is your first visit, please check the box above
        </p>
      )}
    </div>
  )
}

NewClientCheckbox.propTypes = {
  checked: PropTypes.bool,
  onChange: PropTypes.func.isRequired,
  isReturningClient: PropTypes.bool,
  showSuggestion: PropTypes.bool,
}
