import { NextRequest } from 'next/server'
import { Client, Environment } from 'square'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '@/amplify/data/resource'
import { Amplify } from 'aws-amplify'
import config from '@/amplify_outputs.json'
import { cookies } from 'next/headers'
import { fetchAuthSession } from 'aws-amplify/auth/server'
import { createServerRunner } from '@aws-amplify/adapter-nextjs'
import { withErrorLogging } from '@/lib/logger/middleware';

Amplify.configure(config, { ssr: true })
const { runWithAmplifyServerContext } = createServerRunner({ config })
const client = generateClient<Schema>()

async function revokeSquareToken(accessToken: string) {
  const appId = process.env.SQUARE_APPLICATION_ID || process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
  const appSecret = process.env.SQUARE_APPLICATION_SECRET
  if (!appId || !appSecret) return

  const env = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT || 'sandbox'
  const squareClient = new Client({
    environment: env === 'production' ? Environment.Production : Environment.Sandbox,
  })
  await squareClient.oAuthApi.revokeToken({ clientId: appId, accessToken }, `Client ${appSecret}`)
}

function isAuthorizedToDisconnect(staff: any, currentUser: any): boolean {
  const isOwnAccount = staff.staffEmail === currentUser.email
  const isAdminOrOwner = currentUser.role === 'admin' || (currentUser.role === 'owner' && staff.vendorId === currentUser.vendorId)
  return isOwnAccount || isAdminOrOwner
}

export const POST = withErrorLogging(async function POST(request: Request) {
  try {
    const { staffId } = await request.json()
    if (!staffId) return Response.json({ error: 'staffId required' }, { status: 400 })

    const currentUser = await runWithAmplifyServerContext({
      nextServerContext: { cookies },
      operation: async (contextSpec) => {
        const session = await fetchAuthSession(contextSpec)
        const idToken = session.tokens?.idToken
        if (!idToken) return null
        return {
          role: idToken.payload['custom:role'] as string || 'vendor',
          vendorId: idToken.payload['custom:vendorId'] as string,
          email: idToken.payload['email'] as string,
        }
      }
    })
    if (!currentUser) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: staff } = await client.models.StaffSchedule.get({ visibleId: staffId } as any)
    if (!staff) return Response.json({ error: 'Staff not found' }, { status: 404 })
    if (!isAuthorizedToDisconnect(staff, currentUser)) return Response.json({ error: 'Unauthorized' }, { status: 403 })

    if (staff.squareAccessToken) {
      try { await revokeSquareToken(staff.squareAccessToken) }
      catch (e) { console.error('Staff token revocation failed (continuing):', e) }
    }

    const { errors } = await client.models.StaffSchedule.update({
      visibleId: staffId,
      squareAccessToken: null, squareRefreshToken: null, squareMerchantId: null,
      squareLocationId: null, squareOAuthStatus: 'disconnected',
      squareTokenExpiresAt: null, squareConnectedAt: null,
    } as any)

    if (errors) return Response.json({ error: 'Failed to update staff' }, { status: 500 })
    return Response.json({ success: true })
  } catch (error: any) {
    console.error('Square disconnect error:', error)
    return Response.json({ error: error.message || 'Disconnect failed' }, { status: 500 })
  }
})
