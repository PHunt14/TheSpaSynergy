'use client'

import { useState, useEffect } from 'react'
import { validateSquareClientConfig } from '../../../lib/square/config.js'

/**
 * Hook that handles Square Web Payments SDK initialization.
 * Loads the Square script, initializes payments, and attaches a card form.
 *
 * Fails loudly: if Square is misconfigured (missing app id, or the app id's
 * environment does not match NEXT_PUBLIC_SQUARE_ENVIRONMENT) or the SDK fails
 * to initialize/attach, `initError` is set so the UI can surface a clear,
 * actionable banner instead of silently rendering nothing.
 *
 * @param {string|null} squareLocationId - The Square location ID to use
 * @param {boolean} disabled - If true, skip initialization (e.g. already paid)
 * @returns {{ card: object|null, initError: { code: string, message: string }|null }}
 */
export default function useSquarePayment(squareLocationId, disabled = false) {
  const [card, setCard] = useState(null)
  const [initError, setInitError] = useState(null)

  useEffect(() => {
    if (!squareLocationId || disabled) return
    let isMounted = true

    setInitError(null)

    const appId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
    const environment = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT

    // Validate configuration up front — surface misconfiguration loudly
    // instead of letting Square.payments() throw into a silent catch.
    const cfg = validateSquareClientConfig({ appId, environment })
    if (!cfg.ok) {
      console.error(`Square config error [${cfg.code}]: ${cfg.message}`)
      setInitError({ code: cfg.code, message: cfg.message })
      return
    }

    const loadSquare = async () => {
      const src = cfg.environment === 'production'
        ? 'https://web.squarecdn.com/v1/square.js'
        : 'https://sandbox.web.squarecdn.com/v1/square.js'

      if (!window.Square) {
        const script = document.createElement('script')
        script.src = src
        script.async = true
        script.onload = () => { if (isMounted) initSquare() }
        script.onerror = () => {
          if (!isMounted) return
          console.error('Square SDK load error:', src)
          setInitError({ code: 'sdk_load_failed', message: 'Failed to load the Square payment library. Check the network connection and try again.' })
        }
        document.body.appendChild(script)
      } else {
        if (isMounted) initSquare()
      }
    }

    const initSquare = async () => {
      try {
        // Wait for the DOM element to be available (React may not have painted yet)
        let container = null
        for (let i = 0; i < 10; i++) {
          container = document.getElementById('card-container')
          if (container) break
          await new Promise(resolve => setTimeout(resolve, 150))
        }
        if (!isMounted) return
        if (!container) {
          setInitError({ code: 'no_container', message: 'The payment form could not be mounted. Please refresh and try again.' })
          return
        }

        const payments = await window.Square.payments(appId, squareLocationId)
        const cardInstance = await payments.card()
        await cardInstance.attach('#card-container')
        if (isMounted) { setCard(cardInstance); setInitError(null) }
      } catch (err) {
        console.error('Square init error:', err)
        if (isMounted) {
          setInitError({
            code: 'init_failed',
            message: 'The card payment form failed to initialize. This can happen if the Square account is misconfigured. Please pay in person and notify the provider.',
          })
        }
      }
    }

    loadSquare()
    return () => { isMounted = false }
  }, [squareLocationId, disabled])

  return { card, initError }
}

/**
 * Resolves the authoritative Square connection status for a vendor/staff via
 * the server (/api/square/status). The server checks the assigned staff, any
 * connected staff on the vendor, and the vendor record, refreshing expiring
 * tokens as needed.
 *
 * This ALWAYS resolves to a definite object — it never silently hangs. On a
 * network failure it resolves as not-connected with reason 'network_error' so
 * the kiosk can surface a retryable message instead of an ambiguous blank.
 *
 * @param {{ vendorId?: string, staffId?: string }} params
 * @returns {Promise<{ connected: boolean, locationId: string|null, reason: string }>}
 */
export async function resolveSquareStatus({ vendorId, staffId } = {}) {
  if (!vendorId && !staffId) {
    return { connected: false, locationId: null, reason: 'missing_params' }
  }

  const qs = new URLSearchParams()
  if (vendorId) qs.set('vendorId', vendorId)
  if (staffId) qs.set('staffId', staffId)

  try {
    const res = await fetch(`/api/square/status?${qs.toString()}`)
    const data = await res.json().catch(() => null)
    if (!data) {
      return { connected: false, locationId: null, reason: 'network_error' }
    }
    return {
      connected: Boolean(data.connected && data.locationId),
      locationId: data.locationId || null,
      reason: data.reason || (data.connected ? 'ok' : 'not_connected'),
    }
  } catch {
    return { connected: false, locationId: null, reason: 'network_error' }
  }
}

/**
 * Backward-compatible resolver. Resolves a Square location ID for a vendor
 * (with staff fallback handled server-side) and always invokes the callback
 * exactly once with the location id (or null when unavailable), so callers
 * never hang waiting for a callback that may never fire.
 *
 * @param {string} vendorId
 * @param {function} onResolved - Called with the squareLocationId, or null if unavailable
 * @param {string} [staffId] - Optional assigned staff member (preferred routing)
 */
export function resolveSquareLocation(vendorId, onResolved, staffId) {
  if (!vendorId && !staffId) {
    onResolved(null)
    return
  }

  resolveSquareStatus({ vendorId, staffId })
    .then(status => onResolved(status.locationId))
    .catch(() => onResolved(null))
}
