import { Client, Environment } from 'square'
import { generateClient } from 'aws-amplify/data'

/**
 * Result of a token refresh attempt.
 */
export interface TokenRefreshResult {
  success: boolean
  newAccessToken?: string
  newRefreshToken?: string
  newExpiresAt?: string
  error?: string
}

const dataClient = generateClient()

/**
 * Returns true when the token is expiring soon or already expired.
 * Treats null, undefined, or empty string as already expired.
 *
 * @param expiresAt - ISO 8601 expiration timestamp, or null/undefined/empty
 * @param hoursThreshold - Number of hours before expiry to consider "soon" (default 24)
 */
export function isTokenExpiringSoon(
  expiresAt: string | null | undefined,
  hoursThreshold: number = 24
): boolean {
  if (expiresAt === null || expiresAt === undefined || expiresAt.trim() === '') {
    return true
  }

  const expiryTime = new Date(expiresAt).getTime()
  if (isNaN(expiryTime)) {
    return true
  }

  const threshold = Date.now() + hoursThreshold * 60 * 60 * 1000
  return expiryTime < threshold
}

/**
 * Attempts a single token refresh for the given staff member.
 *
 * - If squareRefreshToken is missing/null → skip refresh, return error
 * - On success → update DB with new token/refresh/expiry, return success
 * - On failure + token already expired → return error instructing reconnect
 * - On failure + token still valid → return success with existing token
 *
 * @param staffId - The staff visibleId to refresh the token for
 */
export async function refreshSquareToken(staffId: string): Promise<TokenRefreshResult> {
  const appId = process.env.SQUARE_APPLICATION_ID || process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
  const appSecret = process.env.SQUARE_APPLICATION_SECRET

  if (!appId || !appSecret || !staffId) {
    return {
      success: false,
      error: 'No refresh token available. Please reconnect Square in Dashboard Settings.',
    }
  }

  const env = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT || 'sandbox'
  const squareClient = new Client({
    environment: env === 'production' ? Environment.Production : Environment.Sandbox,
  })

  // Fetch the staff record
  const { data: staff } = await (dataClient.models as any).StaffSchedule.get({ visibleId: staffId })

  // If no refresh token available, skip refresh and return error
  if (!staff?.squareRefreshToken) {
    return {
      success: false,
      error: 'No refresh token available. Please reconnect Square in Dashboard Settings.',
    }
  }

  try {
    // Attempt refresh exactly once
    const { result } = await squareClient.oAuthApi.obtainToken({
      clientId: appId,
      clientSecret: appSecret,
      grantType: 'refresh_token',
      refreshToken: staff.squareRefreshToken,
    })

    if (!result.accessToken) {
      // Refresh returned no access token — treat as failure
      return handleRefreshFailure(staff)
    }

    // Success: update DB with new token data
    const newExpiresAt =
      result.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const newRefreshToken = result.refreshToken || staff.squareRefreshToken

    await (dataClient.models as any).StaffSchedule.update({
      visibleId: staffId,
      squareAccessToken: result.accessToken,
      squareRefreshToken: newRefreshToken,
      squareTokenExpiresAt: newExpiresAt,
      squareOAuthStatus: 'connected',
    })

    return {
      success: true,
      newAccessToken: result.accessToken,
      newRefreshToken: newRefreshToken,
      newExpiresAt: newExpiresAt,
    }
  } catch (error) {
    console.error(`Token refresh failed for staff ${staffId}:`, error)
    return handleRefreshFailure(staff)
  }
}

/**
 * Determines the appropriate response when a token refresh fails.
 * - If token already expired → error instructing reconnect
 * - If token still valid → success with existing token (proceed with current)
 */
function handleRefreshFailure(staff: {
  squareAccessToken?: string
  squareTokenExpiresAt?: string | null
}): TokenRefreshResult {
  const tokenAlreadyExpired = isTokenAlreadyExpired(staff.squareTokenExpiresAt)

  if (tokenAlreadyExpired) {
    return {
      success: false,
      error: 'Token expired. Please reconnect Square in Dashboard Settings.',
    }
  }

  // Token is still valid — proceed with the current access token
  return {
    success: true,
    newAccessToken: staff.squareAccessToken,
  }
}

/**
 * Returns true if the token expiration is already in the past (or null/undefined/empty).
 */
function isTokenAlreadyExpired(expiresAt: string | null | undefined): boolean {
  if (expiresAt === null || expiresAt === undefined || expiresAt.trim() === '') {
    return true
  }

  const expiryTime = new Date(expiresAt).getTime()
  if (isNaN(expiryTime)) {
    return true
  }

  return expiryTime < Date.now()
}
