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

    const squareBase = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'sandbox'
      ? 'https://connect.squareupsandbox.com'
      : 'https://connect.squareup.com'

    const redirectUri = encodeURIComponent(`${baseUrl}/api/square/callback`)
    const scopes = 'MERCHANT_PROFILE_READ+PAYMENTS_WRITE+PAYMENTS_READ+ORDERS_WRITE+ORDERS_READ'

    const oauthUrl = `${squareBase}/oauth2/authorize?client_id=${appId}&scope=${scopes}&session=false&state=${state}&redirect_uri=${redirectUri}`

    return NextResponse.redirect(new URL(oauthUrl))
  } catch (error) {
    console.error('Square connect error:', error)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    return NextResponse.redirect(new URL('/dashboard/settings?error=oauth_failed', baseUrl))
  }
}
