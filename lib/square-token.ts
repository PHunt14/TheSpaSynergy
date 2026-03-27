import { Client, Environment } from 'square'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '@/amplify/data/resource'

const dataClient = generateClient<Schema>()

export async function refreshSquareToken(vendorId: string, staffId?: string): Promise<boolean> {
  const appId = process.env.SQUARE_APPLICATION_ID || process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
  const appSecret = process.env.SQUARE_APPLICATION_SECRET
  if (!appId || !appSecret) return false

  const env = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT || 'sandbox'
  const squareClient = new Client({
    environment: env === 'production' ? Environment.Production : Environment.Sandbox,
  })

  // Staff token refresh
  if (staffId) {
    const { data: staff } = await dataClient.models.StaffSchedule.get({ visibleId: staffId } as any)
    if (!staff?.squareRefreshToken) return false

    try {
      const { result } = await squareClient.oAuthApi.obtainToken({
        clientId: appId,
        clientSecret: appSecret,
        grantType: 'refresh_token',
        refreshToken: staff.squareRefreshToken,
      })
      if (!result.accessToken) return false

      await dataClient.models.StaffSchedule.update({
        visibleId: staffId,
        squareAccessToken: result.accessToken,
        squareRefreshToken: result.refreshToken || staff.squareRefreshToken,
        squareTokenExpiresAt: result.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        squareOAuthStatus: 'connected',
      } as any)
      return true
    } catch (error) {
      console.error(`Token refresh failed for staff ${staffId}:`, error)
      await dataClient.models.StaffSchedule.update({
        visibleId: staffId,
        squareOAuthStatus: 'error',
      } as any)
      return false
    }
  }

  // Vendor token refresh
  const { data: vendor } = await dataClient.models.Vendor.get({ vendorId })
  if (!vendor?.squareRefreshToken) return false

  try {
    const { result } = await squareClient.oAuthApi.obtainToken({
      clientId: appId,
      clientSecret: appSecret,
      grantType: 'refresh_token',
      refreshToken: vendor.squareRefreshToken,
    })
    if (!result.accessToken) return false

    await dataClient.models.Vendor.update({
      vendorId,
      squareAccessToken: result.accessToken,
      squareRefreshToken: result.refreshToken || vendor.squareRefreshToken,
      squareTokenExpiresAt: result.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      squareOAuthStatus: 'connected',
    } as any)
    return true
  } catch (error) {
    console.error(`Token refresh failed for vendor ${vendorId}:`, error)
    await dataClient.models.Vendor.update({
      vendorId,
      squareOAuthStatus: 'error',
    } as any)
    return false
  }
}

export function isTokenExpiringSoon(expiresAt: string | null, thresholdDays = 7): boolean {
  if (!expiresAt) return true
  const expiry = new Date(expiresAt).getTime()
  const threshold = Date.now() + thresholdDays * 24 * 60 * 60 * 1000
  return expiry < threshold
}
