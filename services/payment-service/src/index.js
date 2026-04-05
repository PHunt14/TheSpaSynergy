import express from 'express'
import cors from 'cors'
import { randomUUID } from 'crypto'
import { Client, Environment } from 'square'
import { getVendor, getStaff, listVendors, updateVendor, updateStaff, findAppointmentByPaymentId, updateAppointment } from './db.js'
import { verifyWebhookSignature, squareEnv } from './square-core.js'

const app = express()

app.use(cors({ origin: (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()) }))
app.use('/webhooks/square', express.text({ type: '*/*' }))
app.use(express.json())

const env = () => squareEnv() === 'Production' ? Environment.Production : Environment.Sandbox

// ── Health ────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

// ── POST /payment ─────────────────────────────────────────────

app.post('/payment', async (req, res) => {
  try {
    const { sourceId, amount, vendorId, staffId, bundlePayments } = req.body
    if (!sourceId || !amount) return res.status(400).json({ error: 'Missing payment details' })

    if (vendorId && !bundlePayments) {
      return await handleSinglePayment(res, sourceId, amount, vendorId, staffId)
    }
    if (bundlePayments?.length > 0) {
      return await handleBundlePayment(res, sourceId, amount, bundlePayments)
    }
    res.status(400).json({ error: 'Invalid payment configuration' })
  } catch (err) {
    console.error('Payment error:', err)
    res.status(500).json({ error: 'Payment failed', details: err.message })
  }
})

async function resolveSquareCredentials(vendorId, staffId) {
  if (staffId) {
    const staff = await getStaff(staffId)
    if (staff?.squareAccessToken && staff.squareOAuthStatus !== 'error') {
      return { accessToken: staff.squareAccessToken, locationId: staff.squareLocationId }
    }
  }
  const vendor = await getVendor(vendorId)
  if (!vendor) return { error: 'Vendor not found', status: 404 }
  if (vendor.squareOAuthStatus === 'error') {
    return { error: 'Payment unavailable', details: 'Square account needs to be reconnected', status: 400 }
  }
  const accessToken = vendor.squareAccessToken || process.env.SQUARE_ACCESS_TOKEN
  const locationId = vendor.squareLocationId
  if (!accessToken || !locationId) {
    return { error: 'Payment configuration error', details: 'Square payment not configured', status: 500 }
  }
  return { accessToken, locationId }
}

async function handleSinglePayment(res, sourceId, amount, vendorId, staffId) {
  const creds = await resolveSquareCredentials(vendorId, staffId)
  if (creds.error) return res.status(creds.status).json({ error: creds.error, details: creds.details })

  const client = new Client({ accessToken: creds.accessToken, environment: env() })
  const { result } = await client.paymentsApi.createPayment({
    sourceId,
    idempotencyKey: randomUUID(),
    amountMoney: { amount: Math.round(amount * 100), currency: 'USD' },
    locationId: creds.locationId,
  })
  res.json({ success: true, paymentId: result.payment.id, status: result.payment.status })
}

async function handleBundlePayment(res, sourceId, totalAmount, bundlePayments) {
  const vendors = await listVendors()
  const houseVendor = vendors.find(v => v.isHouse)
  if (!houseVendor) return res.status(500).json({ error: 'House vendor not configured' })

  // Consolidate by vendor
  const map = new Map()
  bundlePayments.forEach(({ vendorId, amount }) => {
    map.set(vendorId, (map.get(vendorId) || 0) + amount)
  })
  const consolidated = Array.from(map.entries()).map(([vendorId, amount]) => ({ vendorId, amount }))

  // Validate non-house vendors
  const vendorChecks = await Promise.all(
    consolidated.filter(p => p.vendorId !== houseVendor.vendorId)
      .map(async ({ vendorId }) => ({ vendorId, vendor: await getVendor(vendorId) }))
  )
  const missing = vendorChecks.filter(({ vendor }) => !vendor?.squareAccessToken)
  if (missing.length) return res.status(400).json({ error: 'Some vendors not connected to Square', vendors: missing.map(v => v.vendorId) })

  const housePayment = consolidated.find(p => p.vendorId === houseVendor.vendorId)
  const otherPayments = consolidated.filter(p => p.vendorId !== houseVendor.vendorId)

  let primaryVendor, additionalRecipients
  if (housePayment) {
    primaryVendor = houseVendor
    additionalRecipients = otherPayments.map(({ vendorId, amount }) => {
      const v = vendorChecks.find(c => c.vendorId === vendorId).vendor
      return { locationId: v.squareLocationId, amountMoney: { amount: Math.round(amount * 100), currency: 'USD' }, description: 'Bundle service payment' }
    })
  } else {
    primaryVendor = vendorChecks[0].vendor
    additionalRecipients = otherPayments.slice(1).map(({ vendorId, amount }) => {
      const v = vendorChecks.find(c => c.vendorId === vendorId).vendor
      return { locationId: v.squareLocationId, amountMoney: { amount: Math.round(amount * 100), currency: 'USD' }, description: 'Bundle service payment' }
    })
  }

  const client = new Client({ accessToken: primaryVendor.squareAccessToken || process.env.SQUARE_ACCESS_TOKEN, environment: env() })
  const { result } = await client.paymentsApi.createPayment({
    sourceId,
    idempotencyKey: randomUUID(),
    amountMoney: { amount: Math.round(totalAmount * 100), currency: 'USD' },
    locationId: primaryVendor.squareLocationId,
    additionalRecipients: additionalRecipients.length ? additionalRecipients : undefined,
  })
  res.json({ success: true, paymentId: result.payment.id, status: result.payment.status, splitPayments: consolidated })
}

// ── GET /square/connect ───────────────────────────────────────

app.get('/square/connect', (req, res) => {
  const { vendorId, staffId } = req.query
  if (!vendorId) return res.status(400).json({ error: 'vendorId required' })

  const appId = process.env.SQUARE_APPLICATION_ID
  const baseUrl = process.env.APP_URL
  if (!appId) return res.redirect(`${baseUrl}/dashboard/settings?error=missing_credentials`)

  const state = Buffer.from(JSON.stringify({ vendorId, staffId, nonce: randomUUID() })).toString('base64url')
  const redirectUri = encodeURIComponent(`${baseUrl}/api/square/callback`)
  const scopes = ['MERCHANT_PROFILE_READ', 'PAYMENTS_WRITE', 'PAYMENTS_READ', 'ORDERS_WRITE', 'ORDERS_READ'].join('%20')
  const squareBase = appId.startsWith('sandbox-') ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com'

  res.redirect(`${squareBase}/oauth2/authorize?client_id=${appId}&scope=${scopes}&state=${state}&redirect_uri=${redirectUri}`)
})

// ── GET /square/callback ──────────────────────────────────────

app.get('/square/callback', async (req, res) => {
  const baseUrl = process.env.APP_URL
  try {
    const { code, state, error } = req.query
    if (error) return res.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed&details=${encodeURIComponent(error)}`)
    if (!code || !state) return res.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed&details=missing_code_or_state`)

    let vendorId, staffId
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString())
      vendorId = decoded.vendorId
      staffId = decoded.staffId || null
    } catch {
      return res.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed&details=invalid_state`)
    }

    const appId = process.env.SQUARE_APPLICATION_ID
    const appSecret = process.env.SQUARE_APPLICATION_SECRET
    if (!appId || !appSecret) return res.redirect(`${baseUrl}/dashboard/settings?error=missing_credentials`)

    const squareClient = new Client({ environment: env() })
    const { result } = await squareClient.oAuthApi.obtainToken({
      clientId: appId, clientSecret: appSecret, grantType: 'authorization_code',
      code, redirectUri: `${baseUrl}/api/square/callback`,
    })
    if (!result.accessToken) return res.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed&details=no_access_token`)

    const merchantClient = new Client({ accessToken: result.accessToken, environment: env() })
    let locationId = null
    try {
      const { result: locResult } = await merchantClient.locationsApi.listLocations()
      const active = locResult.locations?.find(l => l.status === 'ACTIVE')
      locationId = active?.id || locResult.locations?.[0]?.id || null
    } catch (e) { console.error('Error fetching locations:', e) }
    if (!locationId) return res.redirect(`${baseUrl}/dashboard/settings?error=no_locations`)

    const tokenFields = {
      squareAccessToken: result.accessToken,
      squareRefreshToken: result.refreshToken || null,
      squareMerchantId: result.merchantId || null,
      squareLocationId: locationId,
      squareOAuthStatus: 'connected',
      squareTokenExpiresAt: result.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      squareConnectedAt: new Date().toISOString(),
    }

    if (staffId) {
      await updateStaff(staffId, tokenFields)
      return res.redirect(`${baseUrl}/dashboard/settings?success=square_connected&staffId=${staffId}`)
    }
    await updateVendor(vendorId, { squareApplicationId: appId, ...tokenFields })
    res.redirect(`${baseUrl}/dashboard/settings?success=square_connected`)
  } catch (err) {
    console.error('Square callback error:', err)
    res.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed&details=${encodeURIComponent(err.message || 'unknown')}`)
  }
})

// ── POST /square/disconnect ───────────────────────────────────

app.post('/square/disconnect', async (req, res) => {
  try {
    const { vendorId, staffId } = req.body
    if (!vendorId && !staffId) return res.status(400).json({ error: 'vendorId or staffId required' })

    const appId = process.env.SQUARE_APPLICATION_ID
    const appSecret = process.env.SQUARE_APPLICATION_SECRET
    const clearFields = {
      squareAccessToken: null, squareRefreshToken: null, squareMerchantId: null,
      squareLocationId: null, squareOAuthStatus: 'disconnected',
      squareTokenExpiresAt: null, squareConnectedAt: null,
    }

    if (staffId) {
      const staff = await getStaff(staffId)
      if (!staff) return res.status(404).json({ error: 'Staff not found' })
      if (staff.squareAccessToken && appId && appSecret) {
        try {
          const sq = new Client({ environment: env() })
          await sq.oAuthApi.revokeToken({ clientId: appId, accessToken: staff.squareAccessToken }, `Client ${appSecret}`)
        } catch (e) { console.error('Staff token revocation failed:', e) }
      }
      await updateStaff(staffId, clearFields)
      return res.json({ success: true })
    }

    const vendor = await getVendor(vendorId)
    if (vendor?.squareAccessToken && appId && appSecret) {
      try {
        const sq = new Client({ environment: env() })
        await sq.oAuthApi.revokeToken({ clientId: appId, accessToken: vendor.squareAccessToken }, `Client ${appSecret}`)
      } catch (e) { console.error('Token revocation failed:', e) }
    }
    await updateVendor(vendorId, { ...clearFields, squareApplicationId: null })
    res.json({ success: true })
  } catch (err) {
    console.error('Disconnect error:', err)
    res.status(500).json({ error: err.message || 'Disconnect failed' })
  }
})

// ── POST /webhooks/square ─────────────────────────────────────

app.post('/webhooks/square', async (req, res) => {
  try {
    const body = req.body // raw text
    const signature = req.headers['x-square-hmacsha256-signature']
    const webhookUrl = `${process.env.APP_URL}/webhooks/square`
    const sigKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || ''

    if (!verifyWebhookSignature(body, signature, webhookUrl, sigKey)) {
      return res.status(401).json({ error: 'Invalid signature' })
    }

    const event = JSON.parse(body)
    if (event.type === 'payment.updated' || event.type === 'payment.completed') {
      const paymentId = event.data?.object?.payment?.id
      if (paymentId) {
        const appt = await findAppointmentByPaymentId(paymentId)
        if (appt) {
          const payment = event.data.object.payment
          if (appt.paymentStatus !== payment.status) {
            const update = { paymentStatus: payment.status }
            if (payment.amountMoney) update.paymentAmount = payment.amountMoney.amount / 100
            update.paymentRaw = JSON.stringify(payment)
            if (payment.status === 'COMPLETED' && appt.status !== 'confirmed') update.status = 'confirmed'
            await updateAppointment(appt.appointmentId, update)
          }
        }
      }
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('Webhook error:', err)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

// ── Export for testing ─────────────────────────────────────────

export { app }

// ── Start (only when run directly) ────────────────────────────

const isDirectRun = process.argv[1]?.endsWith('index.js')
if (isDirectRun) {
  const port = process.env.PORT || 3001
  app.listen(port, () => console.log(`Payment service listening on :${port}`))
}
