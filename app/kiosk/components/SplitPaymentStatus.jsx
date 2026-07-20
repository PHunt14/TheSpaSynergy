'use client'

import { centsToDollars } from '../../utils/splitCalculator'

/**
 * SplitPaymentStatus — displays the current state of a split payment session.
 *
 * Props:
 *   session       (object)   – { sessionId, status, payers, expiresAt, totalAmountCents }
 *   onPayPayer    (function) – called with payerIndex when a pending payer's Pay button is clicked
 *   showPayButtons (boolean) – whether to show pay buttons (false on read-only view)
 */
export default function SplitPaymentStatus({ session, onPayPayer, showPayButtons }) {
  const isExpired = session.status === 'expired'

  const statusLabel = {
    pending: 'Pending',
    partial: 'Partial',
    completed: 'Completed',
    expired: 'Expired',
  }

  const statusColor = {
    pending: '#ff9800',
    partial: '#ff9800',
    completed: '#4caf50',
    expired: '#c33',
  }

  return (
    <div style={{
      background: 'var(--color-accent)', borderRadius: '12px', padding: '1.5rem',
      border: '1px solid var(--color-border)', marginBottom: '2rem',
    }}>
      {/* Header */}
      <h3 style={{ marginTop: 0, marginBottom: '0.5rem', textAlign: 'center' }}>
        Split Payment
      </h3>
      <p style={{ textAlign: 'center', marginBottom: '1rem', color: 'var(--color-text-light)' }}>
        Total: ${centsToDollars(session.totalAmountCents)}
      </p>

      {/* Session status indicator */}
      <div
        role="status"
        aria-label="Session status"
        style={{
          textAlign: 'center', marginBottom: '1.5rem',
          padding: '0.5rem 1rem', borderRadius: '8px',
          background: isExpired ? '#fee' : 'rgba(0,0,0,0.02)',
          border: `1px solid ${statusColor[session.status] || '#ccc'}`,
        }}
      >
        <span style={{
          fontWeight: '600',
          color: statusColor[session.status] || 'var(--color-text)',
        }}>
          Status: {statusLabel[session.status] || session.status}
        </span>
      </div>

      {/* Expiration message */}
      {isExpired && (
        <div role="alert" style={{
          padding: '1rem', background: '#fee', border: '1px solid #f5c6cb',
          borderRadius: '8px', color: '#c33', marginBottom: '1rem',
          fontWeight: '500', textAlign: 'center',
        }}>
          This session has expired
        </div>
      )}

      {/* Payer status table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem' }} aria-label="Payer payment status">
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.6rem 0.5rem', fontWeight: '600', borderBottom: '2px solid var(--color-border)' }}>Payer</th>
            <th style={{ textAlign: 'right', padding: '0.6rem 0.5rem', fontWeight: '600', borderBottom: '2px solid var(--color-border)' }}>Amount</th>
            <th style={{ textAlign: 'center', padding: '0.6rem 0.5rem', fontWeight: '600', borderBottom: '2px solid var(--color-border)' }}>Status</th>
            {showPayButtons && (
              <th style={{ textAlign: 'center', padding: '0.6rem 0.5rem', fontWeight: '600', borderBottom: '2px solid var(--color-border)' }}>Action</th>
            )}
          </tr>
        </thead>
        <tbody>
          {session.payers.map((payer) => {
            const isPaid = payer.status === 'paid'
            const payDisabled = isPaid || isExpired

            return (
              <tr key={payer.payerIndex} style={{
                background: payer.payerIndex % 2 === 0 ? 'rgba(0,0,0,0.02)' : 'transparent',
              }}>
                <td style={{ padding: '0.6rem 0.5rem', verticalAlign: 'middle' }}>
                  {payer.label}
                </td>
                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: '500', verticalAlign: 'middle' }}>
                  ${centsToDollars(payer.amountCents)}
                </td>
                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center', verticalAlign: 'middle' }}>
                  {isPaid ? (
                    <span style={{ color: '#4caf50', fontWeight: '500' }}>
                      <span aria-hidden="true">✓ </span>Paid
                    </span>
                  ) : (
                    <span style={{ color: '#ff9800', fontWeight: '500' }}>
                      <span aria-hidden="true" style={{
                        display: 'inline-block', width: '8px', height: '8px',
                        borderRadius: '50%', background: '#ff9800', marginRight: '4px',
                        verticalAlign: 'middle',
                      }}></span>
                      Pending
                    </span>
                  )}
                </td>
                {showPayButtons && (
                  <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center', verticalAlign: 'middle' }}>
                    <button
                      onClick={() => onPayPayer(payer.payerIndex)}
                      disabled={payDisabled}
                      aria-label={isPaid ? `Person ${payer.payerIndex + 1} already paid` : `Pay for ${payer.label}`}
                      style={{
                        padding: '0.4rem 1rem', borderRadius: '6px',
                        border: 'none', fontWeight: '500', fontSize: '0.9rem',
                        background: payDisabled ? '#e0e0e0' : 'var(--color-primary)',
                        color: payDisabled ? '#999' : 'white',
                        cursor: payDisabled ? 'not-allowed' : 'pointer',
                        opacity: payDisabled ? 0.6 : 1,
                      }}
                    >
                      Pay
                    </button>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
