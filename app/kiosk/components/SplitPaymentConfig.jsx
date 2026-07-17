'use client'

import { useState, useMemo } from 'react'
import { calculateEqualSplit, validateCustomSplit, centsToDollars, dollarsToCents } from '../../utils/splitCalculator'

/**
 * SplitPaymentConfig — configures how a bundle total is split among payers.
 *
 * Props:
 *   totalAmountCents (number)  – the bundle total in cents
 *   onConfigured (function)    – callback({ splitType, payerCount, payerAmountsCents })
 */
export default function SplitPaymentConfig({ totalAmountCents, onConfigured }) {
  const [splitMode, setSplitMode] = useState(null) // 'equal' | 'custom' | null
  const [payerCount, setPayerCount] = useState(2)
  const [payerCountInput, setPayerCountInput] = useState('2')
  const [customAmounts, setCustomAmounts] = useState(['', '']) // dollar strings

  // --- Equal split calculation ---
  const equalSplit = useMemo(() => {
    if (splitMode !== 'equal') return null
    if (payerCount < 2 || payerCount > 10 || !Number.isInteger(payerCount)) return null
    return calculateEqualSplit({ totalCents: totalAmountCents, payerCount })
  }, [splitMode, payerCount, totalAmountCents])

  // --- Custom split validation ---
  const customValidation = useMemo(() => {
    if (splitMode !== 'custom') return null
    const payerAmountsCents = customAmounts.map((str) => {
      const parsed = parseFloat(str)
      if (isNaN(parsed)) return 0
      return dollarsToCents(parsed)
    })
    return validateCustomSplit({ totalCents: totalAmountCents, payerAmountsCents })
  }, [splitMode, customAmounts, totalAmountCents])

  const customTotalCents = useMemo(() => {
    if (splitMode !== 'custom') return 0
    return customAmounts.reduce((sum, str) => {
      const parsed = parseFloat(str)
      return sum + (isNaN(parsed) ? 0 : dollarsToCents(parsed))
    }, 0)
  }, [splitMode, customAmounts])

  const remainingCents = totalAmountCents - customTotalCents

  // --- Payer count validation ---
  const payerCountValid = payerCount >= 2 && payerCount <= 10 && Number.isInteger(payerCount)
  const payerCountError = payerCountInput !== '' && !payerCountValid
    ? 'Enter an integer between 2 and 10'
    : null

  // --- Handlers ---
  const handleModeChange = (mode) => {
    setSplitMode(mode)
  }

  const handlePayerCountChange = (e) => {
    const raw = e.target.value
    setPayerCountInput(raw)
    const parsed = parseInt(raw, 10)
    if (!isNaN(parsed)) {
      setPayerCount(parsed)
    }
  }

  const handleCustomAmountChange = (index, value) => {
    // Allow only valid dollar format (digits and one decimal point)
    const sanitized = value.replace(/[^0-9.]/g, '')
    const parts = sanitized.split('.')
    // Limit to 2 decimal places
    let formatted = parts[0]
    if (parts.length > 1) {
      formatted += '.' + parts[1].slice(0, 2)
    }
    const next = [...customAmounts]
    next[index] = formatted
    setCustomAmounts(next)
  }

  const handleAddPayer = () => {
    if (customAmounts.length >= 10) return
    setCustomAmounts([...customAmounts, ''])
  }

  const handleRemovePayer = (index) => {
    if (customAmounts.length <= 2) return
    const next = customAmounts.filter((_, i) => i !== index)
    setCustomAmounts(next)
  }

  const handleContinue = () => {
    if (splitMode === 'equal' && payerCountValid && equalSplit) {
      onConfigured({
        splitType: 'equal',
        payerCount,
        payerAmountsCents: equalSplit.payerAmounts,
      })
    } else if (splitMode === 'custom' && customValidation && customValidation.valid) {
      const payerAmountsCents = customAmounts.map((str) => {
        const parsed = parseFloat(str)
        return isNaN(parsed) ? 0 : dollarsToCents(parsed)
      })
      onConfigured({
        splitType: 'custom',
        payerCount: customAmounts.length,
        payerAmountsCents,
      })
    }
  }

  // --- Can submit? ---
  const canSubmit = splitMode === 'equal'
    ? payerCountValid
    : splitMode === 'custom'
      ? customValidation && customValidation.valid
      : false

  return (
    <div style={{
      background: 'var(--color-accent)', borderRadius: '12px', padding: '1.5rem',
      border: '1px solid var(--color-border)', marginBottom: '2rem'
    }}>
      <h3 style={{ marginTop: 0, marginBottom: '1rem', textAlign: 'center' }}>
        Split Payment Configuration
      </h3>
      <p style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--color-text-light)' }}>
        Total: ${centsToDollars(totalAmountCents)}
      </p>

      {/* Mode selection */}
      <fieldset style={{ border: 'none', padding: 0, margin: '0 0 1.5rem 0' }}>
        <legend style={{ fontWeight: '600', marginBottom: '0.75rem' }}>Split Type</legend>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '1rem', borderRadius: '8px', cursor: 'pointer',
            border: splitMode === 'equal' ? '2px solid var(--color-primary)' : '2px solid var(--color-border)',
            background: splitMode === 'equal' ? 'var(--color-primary)' : 'white',
            color: splitMode === 'equal' ? 'white' : 'var(--color-text)',
            fontWeight: '500',
          }}>
            <input
              type="radio"
              name="splitMode"
              value="equal"
              checked={splitMode === 'equal'}
              onChange={() => handleModeChange('equal')}
              aria-label="Equal split"
              style={{ accentColor: splitMode === 'equal' ? 'white' : 'var(--color-primary)' }}
            />
            Equal Split
          </label>
          <label style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '1rem', borderRadius: '8px', cursor: 'pointer',
            border: splitMode === 'custom' ? '2px solid var(--color-primary)' : '2px solid var(--color-border)',
            background: splitMode === 'custom' ? 'var(--color-primary)' : 'white',
            color: splitMode === 'custom' ? 'white' : 'var(--color-text)',
            fontWeight: '500',
          }}>
            <input
              type="radio"
              name="splitMode"
              value="custom"
              checked={splitMode === 'custom'}
              onChange={() => handleModeChange('custom')}
              aria-label="Custom split"
              style={{ accentColor: splitMode === 'custom' ? 'white' : 'var(--color-primary)' }}
            />
            Custom Split
          </label>
        </div>
      </fieldset>

      {/* Equal split mode */}
      {splitMode === 'equal' && (
        <div role="region" aria-label="Equal split configuration">
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="payerCount" style={{ display: 'block', fontWeight: '500', marginBottom: '0.5rem' }}>
              Number of Payers
            </label>
            <input
              id="payerCount"
              type="number"
              min="2"
              max="10"
              step="1"
              value={payerCountInput}
              onChange={handlePayerCountChange}
              aria-describedby={payerCountError ? 'payerCountError' : undefined}
              aria-invalid={payerCountError ? 'true' : 'false'}
              style={{
                width: '100%', padding: '0.75rem', borderRadius: '8px',
                border: payerCountError ? '2px solid #c33' : '2px solid var(--color-border)',
                fontSize: '1rem', boxSizing: 'border-box',
              }}
            />
            {payerCountError && (
              <p id="payerCountError" role="alert" style={{ color: '#c33', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                {payerCountError}
              </p>
            )}
          </div>

          {equalSplit && (
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Payment Breakdown</h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} aria-label="Payer amounts">
                {equalSplit.payerAmounts.map((amountCents, idx) => (
                  <li key={idx} style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem', borderRadius: '6px',
                    background: idx % 2 === 0 ? 'rgba(0,0,0,0.02)' : 'transparent',
                  }}>
                    <span>Person {idx + 1}</span>
                    <span style={{ fontWeight: '600' }}>${centsToDollars(amountCents)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Custom split mode */}
      {splitMode === 'custom' && (
        <div role="region" aria-label="Custom split configuration">
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem' }} aria-label="Custom payer amounts">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.5rem', fontWeight: '600' }}>Payer</th>
                <th style={{ textAlign: 'left', padding: '0.5rem', fontWeight: '600' }}>Amount</th>
                <th style={{ width: '60px', padding: '0.5rem' }}></th>
              </tr>
            </thead>
            <tbody>
              {customAmounts.map((amount, idx) => (
                <tr key={idx}>
                  <td style={{ padding: '0.5rem', verticalAlign: 'middle' }}>
                    <span>Person {idx + 1}</span>
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <div style={{ position: 'relative' }}>
                      <span style={{
                        position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                        color: 'var(--color-text-light)',
                      }}>$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => handleCustomAmountChange(idx, e.target.value)}
                        aria-label={`Amount for Person ${idx + 1}`}
                        style={{
                          width: '100%', padding: '0.6rem 0.75rem 0.6rem 1.75rem',
                          borderRadius: '8px', border: '2px solid var(--color-border)',
                          fontSize: '1rem', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </td>
                  <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                    <button
                      onClick={() => handleRemovePayer(idx)}
                      disabled={customAmounts.length <= 2}
                      aria-label={`Remove Person ${idx + 1}`}
                      style={{
                        padding: '0.4rem 0.6rem', borderRadius: '6px',
                        border: '1px solid var(--color-border)', background: 'white',
                        color: customAmounts.length <= 2 ? '#ccc' : '#c33',
                        cursor: customAmounts.length <= 2 ? 'not-allowed' : 'pointer',
                        fontSize: '0.85rem', fontWeight: '600',
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            onClick={handleAddPayer}
            disabled={customAmounts.length >= 10}
            aria-label="Add payer"
            style={{
              width: '100%', padding: '0.75rem', borderRadius: '8px',
              border: '2px dashed var(--color-border)', background: 'transparent',
              color: customAmounts.length >= 10 ? '#ccc' : 'var(--color-primary)',
              cursor: customAmounts.length >= 10 ? 'not-allowed' : 'pointer',
              fontWeight: '500', fontSize: '0.95rem', marginBottom: '1rem',
            }}
          >
            + Add Payer
          </button>

          {/* Remaining balance */}
          <div style={{
            padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem',
            background: remainingCents === 0 ? '#e6f7e6' : '#fff3e0',
            border: remainingCents === 0 ? '1px solid #a3d9a3' : '1px solid #ffcc80',
          }} role="status" aria-live="polite" aria-label="Remaining balance">
            <span style={{ fontWeight: '500' }}>
              Remaining: ${centsToDollars(remainingCents)}
            </span>
            {remainingCents < 0 && (
              <span style={{ color: '#c33', marginLeft: '0.5rem', fontSize: '0.85rem' }}>
                (exceeds total)
              </span>
            )}
          </div>

          {customValidation && !customValidation.valid && customValidation.error && (
            <p role="alert" style={{ color: '#c33', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {customValidation.error}
            </p>
          )}
        </div>
      )}

      {/* Continue button */}
      {splitMode && (
        <button
          onClick={handleContinue}
          disabled={!canSubmit}
          className="cta"
          aria-label="Continue with split payment"
          style={{
            width: '100%', padding: '1.25rem', fontSize: '1.1rem',
            opacity: canSubmit ? 1 : 0.6,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          Continue
        </button>
      )}
    </div>
  )
}
