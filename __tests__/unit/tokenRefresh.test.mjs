/**
 * Unit Tests for Token Refresh Logic (square-token-enhanced.ts)
 *
 * Tests the isTokenExpiringSoon pure function and the refreshSquareToken
 * async function with mocked external dependencies (Square SDK, Amplify data client).
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

import { jest } from '@jest/globals'

// ── Env ──────────────────────────────────────────────────────

process.env.SQUARE_APPLICATION_ID = 'sandbox-sq0idb-TEST'
process.env.SQUARE_APPLICATION_SECRET = 'sandbox-sq0csb-SECRET'
process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT = 'sandbox'

// ── Mock Setup ───────────────────────────────────────────────

const mockObtainToken = jest.fn()
const mockStaffGet = jest.fn()
const mockStaffUpdate = jest.fn()

jest.unstable_mockModule('square', () => ({
  Client: jest.fn().mockImplementation(() => ({
    oAuthApi: { obtainToken: mockObtainToken },
  })),
  Environment: { Sandbox: 'sandbox', Production: 'production' },
}))

jest.unstable_mockModule('aws-amplify/data', () => ({
  generateClient: jest.fn(() => ({
    models: {
      StaffSchedule: {
        get: mockStaffGet,
        update: mockStaffUpdate,
      },
    },
  })),
}))

// ── Dynamic Import (after mocks registered) ──────────────────

const { isTokenExpiringSoon, refreshSquareToken } = await import(
  '../../lib/square-token-enhanced.ts'
)

// ── Test Helpers ─────────────────────────────────────────────

function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

function makeStaffRecord(overrides = {}) {
  return {
    visibleId: 'staff-1',
    squareAccessToken: 'existing-access-token',
    squareRefreshToken: 'existing-refresh-token',
    squareTokenExpiresAt: hoursFromNow(48),
    squareOAuthStatus: 'connected',
    ...overrides,
  }
}

// ═══════════════════════════════════════════════════════════════
// isTokenExpiringSoon — Pure Function Tests
// ═══════════════════════════════════════════════════════════════

describe('isTokenExpiringSoon', () => {
  describe('null/undefined/empty treated as expired (Requirement 6.5)', () => {
    test('returns true for null', () => {
      expect(isTokenExpiringSoon(null)).toBe(true)
    })

    test('returns true for undefined', () => {
      expect(isTokenExpiringSoon(undefined)).toBe(true)
    })

    test('returns true for empty string', () => {
      expect(isTokenExpiringSoon('')).toBe(true)
    })

    test('returns true for whitespace-only string', () => {
      expect(isTokenExpiringSoon('   ')).toBe(true)
    })
  })

  describe('invalid date strings treated as expired', () => {
    test('returns true for "not-a-date"', () => {
      expect(isTokenExpiringSoon('not-a-date')).toBe(true)
    })

    test('returns true for "invalid"', () => {
      expect(isTokenExpiringSoon('invalid')).toBe(true)
    })
  })

  describe('token within 24 hours triggers refresh (Requirement 6.1)', () => {
    test('returns true when token expires in 1 hour', () => {
      expect(isTokenExpiringSoon(hoursFromNow(1))).toBe(true)
    })

    test('returns true when token expires in 23 hours', () => {
      expect(isTokenExpiringSoon(hoursFromNow(23))).toBe(true)
    })

    test('returns true when token expires in exactly 24 hours (boundary)', () => {
      // At the boundary, expiryTime < threshold (now + 24h), so it's true
      const almostExactly24h = new Date(Date.now() + 24 * 60 * 60 * 1000 - 1000).toISOString()
      expect(isTokenExpiringSoon(almostExactly24h)).toBe(true)
    })

    test('returns true when token already expired (past date)', () => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      expect(isTokenExpiringSoon(pastDate)).toBe(true)
    })
  })

  describe('token beyond threshold is not expiring soon', () => {
    test('returns false when token expires in 48 hours', () => {
      expect(isTokenExpiringSoon(hoursFromNow(48))).toBe(false)
    })

    test('returns false when token expires in 25 hours', () => {
      expect(isTokenExpiringSoon(hoursFromNow(25))).toBe(false)
    })
  })

  describe('custom hoursThreshold parameter', () => {
    test('returns true when token within custom threshold of 1 hour', () => {
      expect(isTokenExpiringSoon(hoursFromNow(0.5), 1)).toBe(true)
    })

    test('returns false when token beyond custom threshold of 1 hour', () => {
      expect(isTokenExpiringSoon(hoursFromNow(2), 1)).toBe(false)
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// refreshSquareToken — Async Function Tests (Mocked Dependencies)
// ═══════════════════════════════════════════════════════════════

describe('refreshSquareToken', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockStaffUpdate.mockResolvedValue({ data: {} })
  })

  describe('missing required config → skip refresh (Requirement 6.6)', () => {
    test('returns error when staffId is missing/empty', async () => {
      const result = await refreshSquareToken('')
      expect(result.success).toBe(false)
      expect(result.error).toContain('reconnect Square')
    })

    test('returns error when SQUARE_APPLICATION_ID is missing', async () => {
      const origId = process.env.SQUARE_APPLICATION_ID
      delete process.env.SQUARE_APPLICATION_ID
      delete process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID

      const result = await refreshSquareToken('staff-1')
      expect(result.success).toBe(false)
      expect(result.error).toContain('reconnect Square')

      process.env.SQUARE_APPLICATION_ID = origId
      process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID = origId
    })

    test('returns error when SQUARE_APPLICATION_SECRET is missing', async () => {
      const origSecret = process.env.SQUARE_APPLICATION_SECRET
      delete process.env.SQUARE_APPLICATION_SECRET

      const result = await refreshSquareToken('staff-1')
      expect(result.success).toBe(false)
      expect(result.error).toContain('reconnect Square')

      process.env.SQUARE_APPLICATION_SECRET = origSecret
    })
  })

  describe('missing refreshToken → skip refresh + reconnect error (Requirement 6.6)', () => {
    test('returns error when staff has no squareRefreshToken', async () => {
      mockStaffGet.mockResolvedValue({
        data: makeStaffRecord({ squareRefreshToken: null }),
      })

      const result = await refreshSquareToken('staff-1')
      expect(result.success).toBe(false)
      expect(result.error).toContain('reconnect Square')
      expect(mockObtainToken).not.toHaveBeenCalled()
    })

    test('returns error when staff has undefined squareRefreshToken', async () => {
      mockStaffGet.mockResolvedValue({
        data: makeStaffRecord({ squareRefreshToken: undefined }),
      })

      const result = await refreshSquareToken('staff-1')
      expect(result.success).toBe(false)
      expect(result.error).toContain('reconnect Square')
      expect(mockObtainToken).not.toHaveBeenCalled()
    })

    test('returns error when staff has empty squareRefreshToken', async () => {
      mockStaffGet.mockResolvedValue({
        data: makeStaffRecord({ squareRefreshToken: '' }),
      })

      const result = await refreshSquareToken('staff-1')
      expect(result.success).toBe(false)
      expect(result.error).toContain('reconnect Square')
      expect(mockObtainToken).not.toHaveBeenCalled()
    })
  })

  describe('successful refresh updates database record (Requirement 6.4)', () => {
    test('returns success with new token data and updates DB', async () => {
      const newExpiresAt = hoursFromNow(720) // 30 days
      mockStaffGet.mockResolvedValue({
        data: makeStaffRecord(),
      })
      mockObtainToken.mockResolvedValue({
        result: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          expiresAt: newExpiresAt,
        },
      })

      const result = await refreshSquareToken('staff-1')

      expect(result.success).toBe(true)
      expect(result.newAccessToken).toBe('new-access-token')
      expect(result.newRefreshToken).toBe('new-refresh-token')
      expect(result.newExpiresAt).toBe(newExpiresAt)

      // Verify DB was updated
      expect(mockStaffUpdate).toHaveBeenCalledWith({
        visibleId: 'staff-1',
        squareAccessToken: 'new-access-token',
        squareRefreshToken: 'new-refresh-token',
        squareTokenExpiresAt: newExpiresAt,
        squareOAuthStatus: 'connected',
      })
    })

    test('preserves existing refreshToken when API does not return new one', async () => {
      mockStaffGet.mockResolvedValue({
        data: makeStaffRecord({ squareRefreshToken: 'keep-this-token' }),
      })
      mockObtainToken.mockResolvedValue({
        result: {
          accessToken: 'new-access-token',
          refreshToken: undefined, // Not returned
          expiresAt: hoursFromNow(720),
        },
      })

      const result = await refreshSquareToken('staff-1')

      expect(result.success).toBe(true)
      expect(result.newRefreshToken).toBe('keep-this-token')
      expect(mockStaffUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          squareRefreshToken: 'keep-this-token',
        })
      )
    })

    test('generates a default expiresAt (30 days) when API does not return one', async () => {
      mockStaffGet.mockResolvedValue({
        data: makeStaffRecord(),
      })
      mockObtainToken.mockResolvedValue({
        result: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          expiresAt: undefined, // Not returned
        },
      })

      const result = await refreshSquareToken('staff-1')

      expect(result.success).toBe(true)
      expect(result.newExpiresAt).toBeDefined()
      // The generated expiry should be approximately 30 days from now
      const expiry = new Date(result.newExpiresAt).getTime()
      const expected30Days = Date.now() + 30 * 24 * 60 * 60 * 1000
      expect(Math.abs(expiry - expected30Days)).toBeLessThan(5000) // within 5 seconds tolerance
    })
  })

  describe('refresh fails + expired → reconnect error (Requirement 6.2)', () => {
    test('returns error when refresh throws and token is already expired', async () => {
      const expiredTime = new Date(Date.now() - 60 * 60 * 1000).toISOString() // 1 hour ago
      mockStaffGet.mockResolvedValue({
        data: makeStaffRecord({ squareTokenExpiresAt: expiredTime }),
      })
      mockObtainToken.mockRejectedValue(new Error('Square API error'))

      const result = await refreshSquareToken('staff-1')

      expect(result.success).toBe(false)
      expect(result.error).toContain('expired')
      expect(result.error).toContain('reconnect Square')
    })

    test('returns error when refresh returns no accessToken and token is expired', async () => {
      const expiredTime = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      mockStaffGet.mockResolvedValue({
        data: makeStaffRecord({ squareTokenExpiresAt: expiredTime }),
      })
      mockObtainToken.mockResolvedValue({
        result: { accessToken: undefined },
      })

      const result = await refreshSquareToken('staff-1')

      expect(result.success).toBe(false)
      expect(result.error).toContain('expired')
    })

    test('returns error when token expiresAt is null and refresh fails', async () => {
      mockStaffGet.mockResolvedValue({
        data: makeStaffRecord({ squareTokenExpiresAt: null }),
      })
      mockObtainToken.mockRejectedValue(new Error('Network error'))

      const result = await refreshSquareToken('staff-1')

      expect(result.success).toBe(false)
      expect(result.error).toContain('expired')
    })
  })

  describe('refresh fails + valid → proceed with current token (Requirement 6.3)', () => {
    test('returns success with existing token when refresh throws but token is still valid', async () => {
      const validFutureTime = hoursFromNow(48) // 48 hours from now - well beyond expiry
      mockStaffGet.mockResolvedValue({
        data: makeStaffRecord({
          squareAccessToken: 'still-valid-token',
          squareTokenExpiresAt: validFutureTime,
        }),
      })
      mockObtainToken.mockRejectedValue(new Error('Temporary Square outage'))

      const result = await refreshSquareToken('staff-1')

      expect(result.success).toBe(true)
      expect(result.newAccessToken).toBe('still-valid-token')
    })

    test('returns success with existing token when API returns no accessToken but token still valid', async () => {
      const validFutureTime = hoursFromNow(48)
      mockStaffGet.mockResolvedValue({
        data: makeStaffRecord({
          squareAccessToken: 'current-token',
          squareTokenExpiresAt: validFutureTime,
        }),
      })
      mockObtainToken.mockResolvedValue({
        result: { accessToken: undefined },
      })

      const result = await refreshSquareToken('staff-1')

      expect(result.success).toBe(true)
      expect(result.newAccessToken).toBe('current-token')
    })
  })

  describe('single refresh attempt per request (Requirement 6.7)', () => {
    test('calls obtainToken exactly once even if it fails', async () => {
      mockStaffGet.mockResolvedValue({
        data: makeStaffRecord({ squareTokenExpiresAt: hoursFromNow(-1) }),
      })
      mockObtainToken.mockRejectedValue(new Error('API failure'))

      await refreshSquareToken('staff-1')

      expect(mockObtainToken).toHaveBeenCalledTimes(1)
    })
  })
})
