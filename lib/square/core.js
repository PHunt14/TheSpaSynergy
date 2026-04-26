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
