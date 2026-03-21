import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

export async function GET(request: NextRequest) {
  try {
    const vendorId = request.nextUrl.searchParams.get('vendorId')
    if (!vendorId) {
      return Response.json({ error: 'vendorId required' }, { status: 400 })
    }

    const appId = process.env.SQUARE_APPLICATION_ID || process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    if (!appId) {
      return NextResponse.redirect(new URL('/dashboard/settings?error=missing_credentials', baseUrl))
    }

    const nonce = randomUUID()
    const state = Buffer.from(JSON.stringify({ vendorId, nonce })).toString('base64url')

    const env = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT || 'sandbox'
    const squareBase = env === 'production'
      ? 'https://connect.squareup.com'
      : 'https://connect.squareupsandbox.com'

    const oauthUrl = new URL('/oauth2/authorize', squareBase)
    oauthUrl.searchParams.set('client_id', appId)
    oauthUrl.searchParams.set('scope', 'MERCHANT_PROFILE_READ PAYMENTS_WRITE PAYMENTS_READ ORDERS_WRITE ORDERS_READ')
    oauthUrl.searchParams.set('session', 'false')
    oauthUrl.searchParams.set('state', state)
    oauthUrl.searchParams.set('redirect_uri', `${baseUrl}/api/square/callback`)

    return NextResponse.redirect(oauthUrl)
  } catch (error) {
    console.error('Square connect error:', error)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    return NextResponse.redirect(new URL('/dashboard/settings?error=oauth_failed', baseUrl))
  }
}
