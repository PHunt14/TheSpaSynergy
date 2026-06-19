'use client'

import { useState } from 'react'

const TIP_PRESETS = [
  { label: '15%', multiplier: 0.15 },
  { label: '20%', multiplier: 0.20 },
  { label: '25%', multiplier: 0.25 },
]

export default function TipSelection({ servicePrice, tipAmount, onTipChange }) {
  const [customMode, setCustomMode] = useState(false)
  const [customValue, setCustomValue] = useState('')

  const handlePreset = (multiplier) => {
    setCustomMode(false)
    setCustomValue('')
    onTipChange(Math.round(servicePrice * multiplier * 100) / 100)
  }

  const handleNoTip = () => {
    setCustomMode(false)
    setCustomValue('')
    onTipChange(0)
  }

  const handleCustom = () => {
    setCustomMode(true)
    onTipChange(0)
  }

  const handleCustomChange = (e) => {
    const val = e.target.value.replace(/[^0-9.]/g, '')
    setCustomValue(val)
    const parsed = parseFloat(val)
    onTipChange(isNaN(parsed) || parsed < 0 ? 0 : Math.round(parsed * 100) / 100)
  }

  const isPresetActive = (multiplier) => {
    if (customMode) return false
    const expected = Math.round(servicePrice * multiplier * 100) / 100
    return tipAmount === expected && tipAmount > 0
  }

  return (
    <div style={{
      background: 'var(--color-accent)', borderRadius: '12px', padding: '1.5rem',
      border: '1px solid var(--color-border)', marginBottom: '2rem'
    }}>
      <h3 style={{ marginTop: 0, marginBottom: '1rem', textAlign: 'center' }}>Add a Tip?</h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
        {TIP_PRESETS.map(({ label, multiplier }) => {
          const amount = Math.round(servicePrice * multiplier * 100) / 100
          const active = isPresetActive(multiplier)
          return (
            <button
              key={label}
              onClick={() => handlePreset(multiplier)}
              style={{
                padding: '1rem 0.5rem',
                borderRadius: '8px',
                border: active ? '2px solid var(--color-primary)' : '2px solid var(--color-border)',
                background: active ? 'var(--color-primary)' : 'white',
                color: active ? 'white' : 'var(--color-text)',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '1rem',
                textAlign: 'center',
              }}
            >
              <div>{label}</div>
              <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.8 }}>
                ${amount.toFixed(2)}
              </div>
            </button>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <button
          onClick={handleCustom}
          style={{
            padding: '0.75rem',
            borderRadius: '8px',
            border: customMode ? '2px solid var(--color-primary)' : '2px solid var(--color-border)',
            background: customMode ? 'var(--color-primary)' : 'white',
            color: customMode ? 'white' : 'var(--color-text)',
            cursor: 'pointer',
            fontWeight: '500',
          }}
        >
          Custom
        </button>
        <button
          onClick={handleNoTip}
          style={{
            padding: '0.75rem',
            borderRadius: '8px',
            border: tipAmount === 0 && !customMode ? '2px solid var(--color-primary)' : '2px solid var(--color-border)',
            background: tipAmount === 0 && !customMode ? 'var(--color-primary)' : 'white',
            color: tipAmount === 0 && !customMode ? 'white' : 'var(--color-text)',
            cursor: 'pointer',
            fontWeight: '500',
          }}
        >
          No Tip
        </button>
      </div>

      {customMode && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)',
              fontSize: '1.1rem', color: 'var(--color-text-light)'
            }}>$</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={customValue}
              onChange={handleCustomChange}
              autoFocus
              style={{
                width: '100%',
                padding: '1rem 1rem 1rem 2rem',
                borderRadius: '8px',
                border: '2px solid var(--color-primary)',
                fontSize: '1.2rem',
                fontWeight: '600',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
