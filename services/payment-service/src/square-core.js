import { randomUUID, createHmac } from 'crypto'

export function buildOAuthUrl(vendorId, staffId) {
  const appId = process.env.SQUARE_APPLICATION_ID
  const baseUrl = process.env.APP_URL
  if (!appId) return null

  const state = Buffer.from(JSON.stringify({ vendorId, staffId, nonce: randomUUID() })).toString('base64url')
  const squareBase = appId.startsWith('sandbox-')
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com'
  const redirectUri = encodeURIComponent(`${baseUrl}/api/square/callback`)
  const scopes = ['MERCHANT_PROFILE_READ', 'PAYMENTS_WRITE', 'PAYMENTS_READ', 'ORDERS_WRITE', 'ORDERS_READ'].join('%20')
  return `${squareBase}/oauth2/authorize?client_id=${appId}&scope=${scopes}&state=${state}&redirect_uri=${redirectUri}`
}

export function decodeOAuthState(state) {
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString())
    return decoded.vendorId ? decoded : null
  } catch { return null }
}

export function verifyWebhookSignature(body, signature, webhookUrl, sigKey) {
  if (!sigKey || !signature) return false
  const hmac = createHmac('sha256', sigKey)
  hmac.update(webhookUrl + body)
  return hmac.digest('base64') === signature
}

export function squareEnv() {
  return process.env.SQUARE_ENVIRONMENT === 'production' ? 'Production' : 'Sandbox'
}
