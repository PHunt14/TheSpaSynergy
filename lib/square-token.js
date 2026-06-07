import { Client, Environment } from 'square'
import { generateClient } from 'aws-amplify/data'
import { isTokenExpiringSoon } from './square/core.js'

const dataClient = generateClient()

export { isTokenExpiringSoon }

export async function refreshSquareToken(staffId) {
  const appId = process.env.SQUARE_APPLICATION_ID || process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
  const appSecret = process.env.SQUARE_APPLICATION_SECRET
  if (!appId || !appSecret || !staffId) return false

  const env = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT || 'sandbox'
  const squareClient = new Client({
    environment: env === 'production' ? Environment.Production : Environment.Sandbox,
  })

  const { data: staff } = await dataClient.models.StaffSchedule.get({ visibleId: staffId })
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
    })
    return true
  } catch (error) {
    console.error(`Token refresh failed for staff ${staffId}:`, error)
    await dataClient.models.StaffSchedule.update({
      visibleId: staffId,
      squareOAuthStatus: 'error',
    })
    return false
  }
}
