'use client'

import { useState, useEffect } from 'react'

/**
 * Hook that handles Square Web Payments SDK initialization.
 * Loads the Square script, initializes payments, and attaches a card form.
 *
 * @param {string|null} squareLocationId - The Square location ID to use
 * @param {boolean} disabled - If true, skip initialization (e.g. already paid)
 * @returns {{ card: object|null }} - The Square card instance
 */
export default function useSquarePayment(squareLocationId, disabled = false) {
  const [card, setCard] = useState(null)

  useEffect(() => {
    if (!squareLocationId || disabled) return
    let isMounted = true

    const loadSquare = async () => {
      const src = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production'
        ? 'https://web.squarecdn.com/v1/square.js'
        : 'https://sandbox.web.squarecdn.com/v1/square.js'

      if (!window.Square) {
        const script = document.createElement('script')
        script.src = src
        script.async = true
        script.onload = () => { if (isMounted) initSquare() }
        document.body.appendChild(script)
      } else {
        if (isMounted) initSquare()
      }
    }

    const initSquare = async () => {
      try {
        const appId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
        if (!appId || !squareLocationId) return
        const payments = await window.Square.payments(appId, squareLocationId)
        const cardInstance = await payments.card()
        await cardInstance.attach('#card-container')
        setCard(cardInstance)
      } catch (err) {
        console.error('Square init error:', err)
      }
    }

    loadSquare()
    return () => { isMounted = false }
  }, [squareLocationId, disabled])

  return { card }
}

/**
 * Resolves a Square location ID from a vendor, with staff fallback.
 * Returns the locationId via the callback.
 *
 * @param {string} vendorId
 * @param {function} onResolved - Called with the squareLocationId when found
 */
export function resolveSquareLocation(vendorId, onResolved) {
  if (!vendorId) return

  fetch(`/api/vendors?vendorId=${vendorId}`)
    .then(r => r.json())
    .then(vData => {
      if (vData.vendor?.squareLocationId) {
        onResolved(vData.vendor.squareLocationId)
      } else {
        fetch(`/api/staff-schedules?vendorId=${vendorId}`)
          .then(r => r.json())
          .then(sData => {
            const connected = (sData.schedules || []).find(s =>
              s.squareLocationId && s.squareOAuthStatus === 'connected'
            )
            if (connected) onResolved(connected.squareLocationId)
          })
          .catch(() => {})
      }
    })
    .catch(() => {})
}
