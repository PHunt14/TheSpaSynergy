import { NextRequest } from 'next/server'
import { Client, Environment } from 'square'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '@/amplify/data/resource'
import { Amplify } from 'aws-amplify'
import config from '@/amplify_outputs.json'
import { cookies } from 'next/headers'
import { fetchAuthSession } from 'aws-amplify/auth/server'
import { createServerRunner } from '@aws-amplify/adapter-nextjs'

Amplify.configure(config, { ssr: true })
const { runWithAmplifyServerContext } = createServerRunner({ config })
const client = generateClient<Schema>()

export async function POST(request: NextRequest) {
  try {
    const { vendorId } = await request.json()
    if (!vendorId) {
      return Response.json({ error: 'vendorId required' }, { status: 400 })
    }

    // Auth check
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
      return Response.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get vendor to revoke token
    const { data: vendor } = await client.models.Vendor.get({ vendorId })
    if (vendor?.squareAccessToken) {
      try {
        const appId = process.env.SQUARE_APPLICATION_ID || process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
        const appSecret = process.env.SQUARE_APPLICATION_SECRET
        if (appId && appSecret) {
          const env = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT || 'sandbox'
          const squareClient = new Client({
            environment: env === 'production' ? Environment.Production : Environment.Sandbox,
          })
          await squareClient.oAuthApi.revokeToken({
            clientId: appId,
            accessToken: vendor.squareAccessToken,
          }, `Client ${appSecret}`)
        }
      } catch (revokeError) {
        console.error('Token revocation failed (continuing with disconnect):', revokeError)
      }
    }

    // Clear vendor Square fields
    const { errors } = await client.models.Vendor.update({
      vendorId,
      squareAccessToken: null,
      squareRefreshToken: null,
      squareMerchantId: null,
      squareLocationId: null,
      squareApplicationId: null,
      squareOAuthStatus: 'disconnected',
      squareTokenExpiresAt: null,
      squareConnectedAt: null,
    } as any)

    if (errors) {
      return Response.json({ error: 'Failed to update vendor' }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (error: any) {
    console.error('Square disconnect error:', error)
    return Response.json({ error: error.message || 'Disconnect failed' }, { status: 500 })
  }
}
