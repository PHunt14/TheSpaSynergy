'use client'

import { useState, useEffect } from 'react'
import TipSelection from './TipSelection'
import useSquarePayment from './useSquarePayment'

/**
 * Custom Charge Form for the kiosk.
 * Allows front desk operators to charge arbitrary amounts not tied to appointments.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7, 3.8
 */
export default function CustomChargeForm() {
  // Form state
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [clientName, setClientName] = useState('')
  const [tipAmount, setTipAmount] = useState(0)

  // UI state
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null) // { paymentId }
  const [amountError, setAmountError] = useState(null)

  // Square SDK state
  const [squareLocationId, setSquareLocationId] = useState(null)
  const [locationLoading, setLocationLoading] = useState(true)
  const { card } = useSquarePayment(squareLocationId, !!success)

  // Fetch the house provider's Square location on mount
  useEffect(() => {
    fetch('/api/providers')
      .then(res => res.json())
      .then(data => {
        const house = (data.providers || []).find(p => p.isHouse)
        if (house?.squareLocationId) {
          setSquareLocationId(house.squareLocationId)
        }
        setLocationLoading(false)
      })
      .catch(() => {
        setLocationLoading(false)
      })
  }, [])

  // Parse and validate amount
  const parsedAmount = parseFloat(amount)
  const isAmountValid = !isNaN(parsedAmount) &&
    parsedAmount >= 0.50 &&
    parsedAmount <= 9999.99 &&
    /^\d+(\.\d{1,2})?$/.test(amount)

  const isDescriptionValid = description.trim().length >= 3 && description.trim().length <= 200
  const isClientNameValid = clientName.length <= 100

  const totalDue = (isAmountValid ? parsedAmount : 0) + tipAmount
  const canSubmit = isAmountValid && isDescriptionValid && isClientNameValid && card && !paying

  // Validate amount on blur
  const handleAmountBlur = () => {
    if (!amount) {
      setAmountError(null)
      return
    }
    if (isNaN(parsedAmount) || parsedAmount < 0.50) {
      setAmountError('Minimum charge is $0.50')
    } else if (parsedAmount > 9999.99) {
      setAmountError('Maximum charge is $9,999.99')
    } else if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      setAmountError('Maximum 2 decimal places')
    } else {
      setAmountError(null)
    }
  }

  const handleSubmit = async () => {
    if (!canSubmit) return

    // Final validation
    if (!isAmountValid) {
      setAmountError('Please enter a valid amount ($0.50–$9,999.99)')
      return
    }

    setPaying(true)
    setError(null)

    try {
      const tokenResult = await card.tokenize()
      if (tokenResult.status !== 'OK') {
        setError('Card error — please try again')
        setPaying(false)
        return
      }

      const response = await fetch('/api/payment/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: tokenResult.token,
          amount: parsedAmount,
          description: description.trim(),
          clientName: clientName.trim() || undefined,
          tipAmount: tipAmount > 0 ? tipAmount : undefined,
        })
      })

      const data = await response.json()

      if (!data.success) {
        setError(data.error || 'Payment failed — please try again')
        setPaying(false)
        return
      }

      setSuccess({ paymentId: data.paymentId })
    } catch (err) {
      setError('Something went wrong — please try again')
    } finally {
      setPaying(false)
    }
  }

  // Success state
  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✓</div>
        <h2 style={{ color: 'var(--color-primary)', marginBottom: '0.5rem' }}>Payment Successful</h2>
        <p style={{ color: 'var(--color-text-light)', marginBottom: '1.5rem' }}>
          ${totalDue.toFixed(2)} charged successfully
        </p>
        <div style={{
          background: 'var(--color-accent)', borderRadius: '8px', padding: '1rem',
          border: '1px solid var(--color-border)', marginBottom: '1.5rem', display: 'inline-block'
        }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>Payment ID: </span>
          <span style={{ fontWeight: '600', fontFamily: 'monospace', fontSize: '0.9rem' }}>{success.paymentId}</span>
        </div>
        <div>
          <button
            onClick={() => {
              setSuccess(null)
              setAmount('')
              setDescription('')
              setClientName('')
              setTipAmount(0)
              setError(null)
              setAmountError(null)
            }}
            className="cta"
            style={{ padding: '1rem 2rem', fontSize: '1rem' }}
          >
            New Charge
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Custom Charge</h2>

      {/* Amount input */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
          Amount <span style={{ color: '#c33' }}>*</span>
        </label>
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)',
            fontSize: '1.1rem', color: 'var(--color-text-light)', fontWeight: '500'
          }}>$</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9.]/g, '')
              setAmount(val)
              if (amountError) setAmountError(null)
            }}
            onBlur={handleAmountBlur}
            style={{
              width: '100%',
              padding: '1rem 1rem 1rem 2.5rem',
              borderRadius: '8px',
              border: amountError ? '2px solid #c33' : '2px solid var(--color-border)',
              fontSize: '1.2rem',
              fontWeight: '600',
              boxSizing: 'border-box',
            }}
          />
        </div>
        {amountError && (
          <p style={{ color: '#c33', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>{amountError}</p>
        )}
        <p style={{ color: 'var(--color-text-light)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
          $0.50 – $9,999.99
        </p>
      </div>

      {/* Description field */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
          Description <span style={{ color: '#c33' }}>*</span>
        </label>
        <textarea
          placeholder="What is this charge for?"
          value={description}
          onChange={(e) => {
            if (e.target.value.length <= 200) {
              setDescription(e.target.value)
            }
          }}
          rows={3}
          style={{
            width: '100%',
            padding: '1rem',
            borderRadius: '8px',
            border: '2px solid var(--color-border)',
            fontSize: '1rem',
            resize: 'vertical',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
        />
        <p style={{
          color: description.trim().length < 3 && description.length > 0 ? '#c33' : 'var(--color-text-light)',
          fontSize: '0.8rem', margin: '0.25rem 0 0', textAlign: 'right'
        }}>
          {description.trim().length}/200 characters
        </p>
      </div>

      {/* Client name field */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
          Client Name <span style={{ color: 'var(--color-text-light)', fontWeight: '400' }}>(optional)</span>
        </label>
        <input
          type="text"
          placeholder="Enter client name"
          value={clientName}
          onChange={(e) => {
            if (e.target.value.length <= 100) {
              setClientName(e.target.value)
            }
          }}
          style={{
            width: '100%',
            padding: '1rem',
            borderRadius: '8px',
            border: '2px solid var(--color-border)',
            fontSize: '1rem',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Tip selection */}
      {isAmountValid && (
        <TipSelection
          servicePrice={parsedAmount}
          tipAmount={tipAmount}
          onTipChange={setTipAmount}
        />
      )}

      {/* Total display */}
      {isAmountValid && (
        <div style={{
          background: 'var(--color-accent)', borderRadius: '12px', padding: '1.25rem',
          border: '1px solid var(--color-border)', marginBottom: '1.5rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span>Charge</span>
            <span>${parsedAmount.toFixed(2)}</span>
          </div>
          {tipAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span>Tip</span>
              <span>${tipAmount.toFixed(2)}</span>
            </div>
          )}
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem', marginTop: '0.25rem',
            fontWeight: '700', fontSize: '1.1rem'
          }}>
            <span>Total</span>
            <span>${totalDue.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Card container */}
      {!locationLoading && !squareLocationId && (
        <div style={{
          padding: '1.5rem', background: '#fff3cd', borderRadius: '8px',
          border: '1px solid #ffc107', textAlign: 'center', marginBottom: '1.5rem'
        }}>
          <strong>House payment account not configured</strong>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
            Custom charges require the house Square account to be connected.
          </p>
        </div>
      )}

      {squareLocationId && (
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Card Information</label>
          <div id="card-container" style={{
            minHeight: '100px', padding: '1rem', background: 'white', borderRadius: '8px',
            border: '1px solid var(--color-border)'
          }}></div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div style={{
          padding: '1rem', background: '#fee', border: '1px solid #f5c6cb',
          borderRadius: '8px', color: '#c33', marginBottom: '1rem', fontWeight: '500'
        }}>
          {error}
        </div>
      )}

      {/* Pay button */}
      {squareLocationId && (
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="cta"
          style={{
            width: '100%', padding: '1.25rem', fontSize: '1.2rem',
            opacity: !canSubmit ? 0.6 : 1
          }}
        >
          {paying ? 'Processing...' : `Pay $${totalDue.toFixed(2)}`}
        </button>
      )}
    </div>
  )
}
