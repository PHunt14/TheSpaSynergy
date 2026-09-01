import { randomUUID, createHmac } from 'node:crypto'

// ── OAuth URL Generation ──────────────────────────────────────

export function buildOAuthUrl(vendorId, { appId, baseUrl, environment }) {
  if (!appId) return null

  const nonce = randomUUID()
  const state = Buffer.from(JSON.stringify({ vendorId, nonce })).toString('base64url')

  const squareBase = environment === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com'

  const redirectUri = `${baseUrl}/api/square/callback`
  const scopes = [
    'MERCHANT_PROFILE_READ',
    'PAYMENTS_WRITE',
    'PAYMENTS_READ',
    'ORDERS_WRITE',
    'ORDERS_READ',
    'ITEMS_WRITE',
    'ITEMS_READ',
  ].join('+')

  return `${squareBase}/oauth2/authorize?client_id=${appId}&scope=${scopes}&session=false&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`
}

// ── State Decoding ────────────────────────────────────────────

export function decodeOAuthState(state) {
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString())
    return decoded.vendorId ? decoded : null
  } catch {
    return null
  }
}

// ── Webhook Signature Verification ────────────────────────────

export function verifyWebhookSignature(body, signature, webhookUrl, sigKey) {
  if (!sigKey || !signature) return false
  const hmac = createHmac('sha256', sigKey)
  hmac.update(webhookUrl + body)
  return hmac.digest('base64') === signature
}

// ── Vendor Token Fields Builder ───────────────────────────────

export function buildVendorTokenUpdate(vendorId, tokenResult, locationId, appId) {
  if (!tokenResult.accessToken) return null

  return {
    vendorId,
    squareAccessToken: tokenResult.accessToken,
    squareRefreshToken: tokenResult.refreshToken || null,
    squareMerchantId: tokenResult.merchantId || null,
    squareLocationId: locationId,
    squareApplicationId: appId,
    squareOAuthStatus: 'connected',
    squareTokenExpiresAt: tokenResult.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    squareConnectedAt: new Date().toISOString(),
  }
}

export function buildVendorDisconnectUpdate(vendorId) {
  return {
    vendorId,
    squareAccessToken: null,
    squareRefreshToken: null,
    squareMerchantId: null,
    squareLocationId: null,
    squareApplicationId: null,
    squareOAuthStatus: 'disconnected',
    squareTokenExpiresAt: null,
    squareConnectedAt: null,
  }
}

// ── Staff Token Fields Builder ────────────────────────────────

export function buildStaffTokenUpdate(visibleId, tokenResult, locationId) {
  if (!tokenResult.accessToken) return null

  return {
    visibleId,
    squareAccessToken: tokenResult.accessToken,
    squareRefreshToken: tokenResult.refreshToken || null,
    squareMerchantId: tokenResult.merchantId || null,
    squareLocationId: locationId,
    squareOAuthStatus: 'connected',
    squareTokenExpiresAt: tokenResult.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    squareConnectedAt: new Date().toISOString(),
  }
}

export function buildStaffDisconnectUpdate(visibleId) {
  return {
    visibleId,
    squareAccessToken: null,
    squareRefreshToken: null,
    squareMerchantId: null,
    squareLocationId: null,
    squareOAuthStatus: 'disconnected',
    squareTokenExpiresAt: null,
    squareConnectedAt: null,
  }
}

// ── Webhook Event Processing ──────────────────────────────────

export function processPaymentEvent(event, existingAppointment) {
  const payment = event.data?.object?.payment
  if (!payment?.id) return null

  // Idempotency check
  if (existingAppointment?.paymentStatus === payment.status) return null

  const newStatus = payment.status === 'COMPLETED' ? 'confirmed' : existingAppointment?.status

  return {
    appointmentId: existingAppointment.appointmentId,
    paymentStatus: payment.status,
    paymentAmount: payment.amountMoney ? payment.amountMoney.amount / 100 : undefined,
    paymentRaw: JSON.stringify(payment),
    ...(newStatus !== existingAppointment.status ? { status: newStatus } : {}),
  }
}

// ── Payment Validation ────────────────────────────────────────

export function validateVendorForPayment(vendor, staff) {
  if (!staff?.squareAccessToken) {
    return { error: 'Payment configuration error', details: 'Staff member has not connected Square', status: 400 }
  }
  if (staff.squareOAuthStatus === 'error') {
    return { error: 'Payment unavailable', details: 'Staff Square account needs to be reconnected', status: 400 }
  }
  return { accessToken: staff.squareAccessToken, locationId: staff.squareLocationId }
}

// ── Token Refresh ─────────────────────────────────────────────

export function isTokenExpiringSoon(expiresAt, thresholdDays = 7) {
  if (!expiresAt) return true
  const expiry = new Date(expiresAt).getTime()
  const threshold = Date.now() + thresholdDays * 24 * 60 * 60 * 1000
  return expiry < threshold
}

// ── Square record chargeability (shared by kiosk status + payment gating) ─────

/** True when the token expiry is in the past (already expired). Null/empty = expired. */
export function isTokenExpired(expiresAt) {
  return isTokenExpiringSoon(expiresAt, 0)
}

/**
 * True when a Square-connected record (StaffSchedule or Vendor) can actually be
 * charged. This mirrors what the authenticated payment path can do: it refreshes
 * an expired access token just-in-time using the refresh token, so an expired
 * access token that still has a refresh token is considered chargeable.
 *
 * Requires: a location, an access token, a status that is not 'error'/'disconnected',
 * and either a non-expired access token OR a refresh token to recover it.
 *
 * This is the single source of truth so the kiosk status endpoint never hides
 * the card form for a provider the payment path would successfully charge.
 */
export function isSquareRecordChargeable(rec) {
  if (!rec) return false
  const hasCreds = Boolean(rec.squareLocationId && rec.squareAccessToken)
  if (!hasCreds) return false
  if (rec.squareOAuthStatus === 'error' || rec.squareOAuthStatus === 'disconnected') return false
  // Chargeable unless the token is expired AND there is no refresh token to recover it.
  if (isTokenExpired(rec.squareTokenExpiresAt) && !rec.squareRefreshToken) return false
  return true
}

/**
 * True when a record has credentials but cannot be recovered without a manual
 * reconnect: either the OAuth status is 'error', or the access token is expired
 * and there is no refresh token. Used to surface the accurate "needs reconnect"
 * message instead of the misleading "not connected".
 */
export function squareRecordNeedsReconnect(rec) {
  if (!rec) return false
  const hasCreds = Boolean(rec.squareLocationId && rec.squareAccessToken)
  if (!hasCreds) return false
  if (rec.squareOAuthStatus === 'disconnected') return false
  if (rec.squareOAuthStatus === 'error') return true
  return isTokenExpired(rec.squareTokenExpiresAt) && !rec.squareRefreshToken
}

/**
 * Decides whether the scheduled background job should proactively refresh a
 * record's Square OAuth access token. Used by the daily refresh function so
 * tokens are renewed BEFORE they expire, instead of relying on a just-in-time
 * refresh at payment time.
 *
 * A record should be refreshed when:
 *  - it has a refresh token (nothing to refresh with otherwise), AND
 *  - it is not explicitly disconnected (disconnected = intentionally off), AND
 *  - its access token is expired or expiring within `thresholdDays` (default 7).
 *
 * Records in 'error' status are still attempted: a successful refresh clears the
 * error and restores card payments without a manual reconnect. If the refresh
 * fails, the caller leaves/sets the record's status so staff are prompted.
 *
 * @param {object} rec - StaffSchedule or Vendor record
 * @param {number} [thresholdDays=7] - refresh when expiry is within this many days
 */
export function shouldProactivelyRefresh(rec, thresholdDays = 7) {
  if (!rec) return false
  if (!rec.squareRefreshToken) return false
  if (rec.squareOAuthStatus === 'disconnected') return false
  return isTokenExpiringSoon(rec.squareTokenExpiresAt, thresholdDays)
}
