import { NextRequest } from 'next/server'
import { Client, Environment } from 'square'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '@/amplify/data/resource'
import { Amplify } from 'aws-amplify'
import config from '@/amplify_outputs.json'

Amplify.configure(config, { ssr: true })
const client = generateClient<Schema>()

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  try {
    const code = request.nextUrl.searchParams.get('code')
    const state = request.nextUrl.searchParams.get('state')
    const error = request.nextUrl.searchParams.get('error')

    if (error) {
      return Response.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed&details=${encodeURIComponent(error)}`)
    }

    if (!code || !state) {
      return Response.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed&details=missing_code_or_state`)
    }

    // Decode state to get vendorId
    let vendorId: string
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString())
      vendorId = decoded.vendorId
    } catch {
      return Response.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed&details=invalid_state`)
    }

    if (!vendorId) {
      return Response.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed&details=missing_vendor_id`)
    }

    // Exchange code for tokens
    const appId = process.env.SQUARE_APPLICATION_ID || process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
    const appSecret = process.env.SQUARE_APPLICATION_SECRET
    if (!appId || !appSecret) {
      console.error('Square callback: missing credentials', { hasAppId: !!appId, hasAppSecret: !!appSecret })
      return Response.redirect(`${baseUrl}/dashboard/settings?error=missing_credentials`)
    }

    const isSandbox = appId.startsWith('sandbox-')
    const squareClient = new Client({
      environment: isSandbox ? Environment.Sandbox : Environment.Production,
    })

    const { result } = await squareClient.oAuthApi.obtainToken({
      clientId: appId,
      clientSecret: appSecret,
      grantType: 'authorization_code',
      code,
      redirectUri: `${baseUrl}/api/square/callback`,
    })

    if (!result.accessToken) {
      return Response.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed&details=no_access_token`)
    }

    // Get merchant's location
    const merchantClient = new Client({
      accessToken: result.accessToken,
      environment: isSandbox ? Environment.Sandbox : Environment.Production,
    })

    let locationId: string | null = null
    try {
      const { result: locResult } = await merchantClient.locationsApi.listLocations()
      const activeLocation = locResult.locations?.find(l => l.status === 'ACTIVE')
      locationId = activeLocation?.id || locResult.locations?.[0]?.id || null
    } catch (locError) {
      console.error('Error fetching locations:', locError)
    }

    if (!locationId) {
      return Response.redirect(`${baseUrl}/dashboard/settings?error=no_locations`)
    }

    // Calculate token expiry
    const expiresAt = result.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    // Update vendor record
    const { errors } = await client.models.Vendor.update({
      vendorId,
      squareAccessToken: result.accessToken,
      squareRefreshToken: result.refreshToken || null,
      squareMerchantId: result.merchantId || null,
      squareLocationId: locationId,
      squareApplicationId: appId,
      squareOAuthStatus: 'connected',
      squareTokenExpiresAt: expiresAt,
      squareConnectedAt: new Date().toISOString(),
    } as any)

    if (errors) {
      console.error('Error updating vendor:', errors)
      return Response.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed&details=db_update_failed`)
    }

    return Response.redirect(`${baseUrl}/dashboard/settings?success=square_connected`)
  } catch (error: any) {
    console.error('Square callback error:', error)
    return Response.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed&details=${encodeURIComponent(error.message || 'unknown')}`)
  }
}
