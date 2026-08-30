import { NextRequest } from 'next/server'
import { Client, Environment } from 'square'
import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data'
import { cookies } from 'next/headers'
import type { Schema } from '@/amplify/data/resource'
import { Amplify } from 'aws-amplify'
import config from '@/amplify_outputs.json'
import { withErrorLogging } from '@/lib/logger/middleware';

Amplify.configure(config, { ssr: true })
const client = generateServerClientUsingCookies<Schema>({ config, cookies })

export const GET = withErrorLogging(async function GET(request: Request) {
  const nextRequest = request as unknown as NextRequest;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  try {
    const code = nextRequest.nextUrl.searchParams.get('code')
    const state = nextRequest.nextUrl.searchParams.get('state')
    const error = nextRequest.nextUrl.searchParams.get('error')

    if (error) {
      return Response.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed&details=${encodeURIComponent(error)}`)
    }

    if (!code || !state) {
      return Response.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed&details=missing_code_or_state`)
    }

    let vendorId: string
    let staffId: string | null = null
    let nonce: string | null = null
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString())
      vendorId = decoded.vendorId
      staffId = decoded.staffId || null
      nonce = decoded.nonce || null
    } catch {
      return Response.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed&details=invalid_state`)
    }

    // Verify nonce against the cookie set during connect to prevent CSRF
    const cookieStore = await cookies()
    const storedNonce = cookieStore.get('square_oauth_nonce')?.value
    cookieStore.delete('square_oauth_nonce')
    if (!nonce || !storedNonce || nonce !== storedNonce) {
      return Response.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed&details=invalid_nonce`)
    }

    if (!vendorId) {
      return Response.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed&details=missing_vendor_id`)
    }

    // Exchange code for tokens
    const appId = process.env.SQUARE_APPLICATION_ID || process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
    const appSecret = process.env.SQUARE_APPLICATION_SECRET
    if (!appId || !appSecret) {
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
      console.error('Square OAuth: no access token in result', JSON.stringify(result))
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

    const expiresAt = result.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const tokenFields = {
      squareAccessToken: result.accessToken,
      squareRefreshToken: result.refreshToken || null,
      squareMerchantId: result.merchantId || null,
      squareLocationId: locationId,
      squareOAuthStatus: 'connected',
      squareTokenExpiresAt: expiresAt,
      squareConnectedAt: new Date().toISOString(),
    }

    if (!staffId) {
      return Response.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed&details=staff_id_required`)
    }

    // Save to StaffSchedule
    const { errors } = await client.models.StaffSchedule.update({
      visibleId: staffId,
      ...tokenFields,
    } as any)
    if (errors) {
      console.error('Error updating staff schedule:', JSON.stringify(errors, null, 2))
      return Response.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed&details=db_update_failed`)
    }

    // Best-effort: backfill the vendor's location so the kiosk fast-path
    // (/api/providers) can surface a location for this vendor. We intentionally
    // do NOT copy the staff access token onto the vendor — payment routing and
    // the authoritative /api/square/status check remain staff-scoped and
    // token-gated, so this only helps location resolution and never falsely
    // reports the vendor itself as chargeable.
    if (vendorId) {
      try {
        const { data: vendor } = await client.models.Vendor.get({ vendorId })
        if (vendor && !vendor.squareLocationId) {
          await client.models.Vendor.update({ vendorId, squareLocationId: locationId } as any)
        }
      } catch (vendorErr) {
        console.error('Square callback: vendor location backfill failed', vendorErr)
      }
    }

    return Response.redirect(`${baseUrl}/dashboard/settings?success=square_connected&staffId=${staffId}`)
  } catch (error: any) {
    console.error('Square callback error:', error)
    return Response.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed&details=${encodeURIComponent(error.message || 'unknown')}`)
  }
})
