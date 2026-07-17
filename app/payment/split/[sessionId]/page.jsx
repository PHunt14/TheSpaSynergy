'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Suspense } from 'react'
import SplitPaymentStatus from '../../../kiosk/components/SplitPaymentStatus'
import useSquarePayment from '../../../kiosk/components/useSquarePayment'
import { centsToDollars } from '../../../utils/splitCalculator'

function SplitPaymentContent() {
  const { sessionId } = useParams()

  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [payingPayer, setPayingPayer] = useState(null) // payerIndex currently being paid
  const [payError, setPayError] = useState(null)
  const [payProcessing, setPayProcessing] = useState(false)
  const [squareLocationId, setSquareLocationId] = useState(null)

  // Only initialize the Square card when a payer is selected for payment
  const { card } = useSquarePayment(squareLocationId, payingPayer === null)

  // Fetch session data on mount
  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch('/api/payment/split', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'getSession', sessionId }),
        })
        const data = await res.json()

        if (!res.ok || data.error) {
          setError(data.error || 'Failed to load session')
          setLoading(false)
          return
        }

        setSession(data)
        setLoading(false)
      } catch (err) {
        setError('Failed to load split payment session')
        setLoading(false)
      }
    }

    loadSession()
  }, [sessionId])

  // Fetch Square location ID from house vendor
  useEffect(() => {
    async function loadSquareLocation() {
      try {
        const res = await fetch('/api/vendors')
        const data = await res.json()
        const houseVendor = (data.vendors || []).find(v => v.isHouse)
        if (houseVendor?.squareLocationId) {
          setSquareLocationId(houseVendor.squareLocationId)
        }
      } catch (err) {
        // Non-critical — card form just won't initialize
        console.error('Failed to fetch square location:', err)
      }
    }

    loadSquareLocation()
  }, [])

  const handlePayPayer = useCallback((payerIndex) => {
    setPayingPayer(payerIndex)
    setPayError(null)
  }, [])

  const handleCancelPay = useCallback(() => {
    setPayingPayer(null)
    setPayError(null)
  }, [])

  const handleSubmitPayment = async () => {
    if (!card || payingPayer === null) return

    setPayProcessing(true)
    setPayError(null)

    try {
      const tokenResult = await card.tokenize()
      if (tokenResult.status !== 'OK') {
        setPayError('Card error — please check your details and try again')
        setPayProcessing(false)
        return
      }

      const res = await fetch('/api/payment/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'payPayer',
          sessionId,
          payerIndex: payingPayer,
          sourceId: tokenResult.token,
        }),
      })
      const data = await res.json()

      if (!res.ok || data.error) {
        setPayError(data.error || data.details || 'Payment failed — please try again')
        setPayProcessing(false)
        return
      }

      // Update local state immediately to reflect paid status
      setSession(prev => {
        const updatedPayers = [...prev.payers]
        updatedPayers[payingPayer] = {
          ...updatedPayers[payingPayer],
          status: 'paid',
          squarePaymentId: data.squarePaymentId,
          paidAt: data.paidAt,
        }

        return {
          ...prev,
          payers: updatedPayers,
          status: data.sessionStatus || prev.status,
        }
      })

      setPayingPayer(null)
    } catch (err) {
      setPayError('Payment error — please try again')
      console.error('Split payer payment error:', err)
    } finally {
      setPayProcessing(false)
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <p>Loading split payment...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <h2>Error</h2>
        <p style={{ color: '#c33' }}>{error}</p>
      </div>
    )
  }

  if (!session) return null

  const currentPayer = payingPayer !== null ? session.payers[payingPayer] : null
  const isExpired = session.status === 'expired'
  const isCompleted = session.status === 'completed'

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Split Payment</h1>
      <p style={{ textAlign: 'center', color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        Share the cost with your group
      </p>

      {/* Session Status Display */}
      <SplitPaymentStatus
        session={session}
        onPayPayer={handlePayPayer}
        showPayButtons={!isExpired && !isCompleted}
      />

      {/* Completion message */}
      {isCompleted && (
        <div style={{
          textAlign: 'center', padding: '1.5rem', background: '#e8f5e9',
          borderRadius: '12px', border: '1px solid #a5d6a7',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✓</div>
          <h3 style={{ margin: '0 0 0.5rem', color: '#2e7d32' }}>All Payments Complete</h3>
          <p style={{ margin: 0, color: '#4caf50' }}>
            Total of ${centsToDollars(session.totalAmountCents)} has been paid
          </p>
        </div>
      )}

      {/* Payment Form for selected payer */}
      {payingPayer !== null && currentPayer && !isExpired && (
        <div style={{
          background: 'white', borderRadius: '12px', padding: '1.5rem',
          border: '2px solid var(--color-primary)', marginTop: '1.5rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>
              Pay for {currentPayer.label}
            </h3>
            <button
              onClick={handleCancelPay}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '1.5rem', color: 'var(--color-text-light)', padding: '0.25rem',
              }}
              aria-label="Cancel payment"
            >
              ×
            </button>
          </div>

          <p style={{
            textAlign: 'center', fontSize: '1.5rem', fontWeight: '700',
            margin: '1rem 0',
          }}>
            ${centsToDollars(currentPayer.amountCents)}
          </p>

          {!squareLocationId ? (
            <div style={{
              padding: '1rem', background: '#fff3cd', borderRadius: '8px',
              border: '1px solid #ffc107', textAlign: 'center',
            }}>
              <strong>Card payment not available</strong>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
                Payment processing is not configured.
              </p>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Card Information
                </label>
                <div
                  id="card-container"
                  style={{
                    minHeight: '100px', padding: '1rem', background: 'var(--color-accent)',
                    borderRadius: '8px', border: '1px solid var(--color-border)',
                  }}
                ></div>
              </div>

              {payError && (
                <div role="alert" style={{
                  padding: '1rem', background: '#fee', border: '1px solid #f5c6cb',
                  borderRadius: '8px', color: '#c33', marginBottom: '1rem', fontWeight: '500',
                }}>
                  {payError}
                </div>
              )}

              <button
                onClick={handleSubmitPayment}
                disabled={payProcessing || !card}
                className="cta"
                style={{
                  width: '100%', padding: '1.25rem', fontSize: '1.1rem',
                  opacity: (payProcessing || !card) ? 0.6 : 1,
                }}
              >
                {payProcessing
                  ? 'Processing...'
                  : `Pay $${centsToDollars(currentPayer.amountCents)}`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function SplitPaymentPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <SplitPaymentContent />
    </Suspense>
  )
}
