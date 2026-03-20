import { NextRequest } from 'next/server'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '@/amplify/data/resource'
import { Amplify } from 'aws-amplify'
import config from '@/amplify_outputs.json'
import { cookies } from 'next/headers'
import { fetchAuthSession } from 'aws-amplify/auth/server'
import { createServerRunner } from '@aws-amplify/adapter-nextjs'
import { randomUUID } from 'crypto'

Amplify.configure(config, { ssr: true })
const { runWithAmplifyServerContext } = createServerRunner({ config })
const client = generateClient<Schema>()

export async function GET(request: NextRequest) {
  try {
    const vendorId = request.nextUrl.searchParams.get('vendorId')
    if (!vendorId) {
      return Response.json({ error: 'vendorId required' }, { status: 400 })
    }

    // Validate caller is admin/owner for this vendor
    const currentUser = await runWithAmplifyServerContext({
      nextServerContext: { cookies },
      operation: async (contextSpec) => {
        const session = await fetchAuthSession(contextSpec)
        const idToken = session.tokens?.idToken
        if (!idToken) return null
        return {
          role: idToken.payload['custom:role'] as string || 'vendor',
          vendorId: idToken.payload['custom:vendorId'] as string
        }
      }
    })

    if (!currentUser) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (currentUser.role === 'vendor' || (currentUser.role === 'owner' && currentUser.vendorId !== vendorId)) {
      return Response.json({ error: 'Unauthorized: Insufficient permissions' }, { status: 403 })
    }

    const appId = process.env.SQUARE_APPLICATION_ID || process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    if (!appId) {
      return Response.redirect(`${baseUrl}/dashboard/settings?error=missing_credentials`)
    }

    // State param encodes vendorId + CSRF nonce
    const nonce = randomUUID()
    const state = Buffer.from(JSON.stringify({ vendorId, nonce })).toString('base64url')

    const env = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT || 'sandbox'
    const squareBase = env === 'production'
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

    const oauthUrl = `${squareBase}/oauth2/authorize?client_id=${appId}&scope=${scopes}&session=false&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`

    return Response.redirect(oauthUrl)
  } catch (error) {
    console.error('Square connect error:', error)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    return Response.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed`)
  }
}
