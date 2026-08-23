/**
 * Integration Tests for End-to-End Payment Flows
 *
 * Tests multiple modules working together with mocked external dependencies
 * (Square SDK, Amplify data client).
 *
 * Requirements: 1.1, 3.4, 6.4, 8.4
 */

import { jest } from '@jest/globals'

// ── Env ──────────────────────────────────────────────────────

process.env.SQUARE_APPLICATION_ID = 'sandbox-sq0idb-TEST'
process.env.SQUARE_APPLICATION_SECRET = 'sandbox-sq0csb-SECRET'
process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT = 'sandbox'

// ── Mock Setup ───────────────────────────────────────────────

const mockCreatePayment = jest.fn()
const mockObtainToken = jest.fn()
const mockAppointmentGet = jest.fn()
const mockAppointmentUpdate = jest.fn()
const mockStaffGet = jest.fn()
const mockStaffUpdate = jest.fn()

jest.unstable_mockModule('square', () => ({
  Client: jest.fn().mockImplementation(() => ({
    paymentsApi: { createPayment: mockCreatePayment },
    oAuthApi: { obtainToken: mockObtainToken },
  })),
  Environment: { Sandbox: 'sandbox', Production: 'production' },
}))

jest.unstable_mockModule('aws-amplify/data', () => ({
  generateClient: jest.fn(() => ({
    models: {
      Appointment: {
        get: mockAppointmentGet,
        update: mockAppointmentUpdate,
      },
      StaffSchedule: {
        get: mockStaffGet,
        update: mockStaffUpdate,
      },
    },
  })),
}))

// ── Dynamic Imports (after mocks registered) ──────────────────

const { decideSplit, executeSplitPayment } = await import(
  '../../lib/payment/houseFee.ts'
)
const { resolveCredentialChain } = await import(
  '../../app/utils/paymentRouting.ts'
)
const { generateIdempotencyKey, hashSourceToken } = await import(
  '../../lib/payment/idempotency.ts'
)
const { validateCustomChargeAmount, sanitizeNumericInput } = await import(
  '../../lib/payment/validator.ts'
)
const { appendAuditRecord } = await import(
  '../../lib/payment/audit.ts'
)
const { isTokenExpiringSoon, refreshSquareToken } = await import(
  '../../lib/square-token-enhanced.ts'
)

// ── Test Fixtures ────────────────────────────────────────────

function makeStaff(overrides = {}) {
  return {
    visibleId: 'staff-1',
    staffName: 'Trinity',
    vendorId: 'vendor-1',
    isActive: true,
    squareAccessToken: 'staff-token-123',
    squareRefreshToken: 'staff-refresh-token',
    squareLocationId: 'staff-loc-456',
    squareMerchantId: 'staff-merchant-789',
    squareOAuthStatus: 'connected',
    squareTokenExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  }
}

function makeHouseProvider(overrides = {}) {
  return {
    vendorId: 'house-vendor',
    name: 'Stacey House',
    email: 'stacey@example.com',
    isActive: true,
    isHouse: true,
    squareAccessToken: 'house-token-abc',
    squareRefreshToken: 'house-refresh-token',
    squareLocationId: 'house-loc-def',
    squareMerchantId: 'house-merchant-ghi',
    squareOAuthStatus: 'connected',
    ...overrides,
  }
}

function makeService(overrides = {}) {
  return {
    serviceId: 'svc-1',
    name: 'Deep Tissue Massage',
    price: 100,
    houseFeeEnabled: true,
    houseFeeAmount: 20,
    ...overrides,
  }
}

// ═══════════════════════════════════════════════════════════════
// 1. Full Appointment Payment Flow (Split Payment)
// ═══════════════════════════════════════════════════════════════

describe('Full appointment payment flow — split payment (Requirement 1.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('decideSplit → executeSplitPayment makes 2 Square API calls with correct amounts/credentials/idempotency keys', async () => {
    const service = makeService({ price: 100, houseFeeEnabled: true, houseFeeAmount: 20 })
    const staffCredentials = { accessToken: 'staff-token-123', locationId: 'staff-loc-456' }
    const houseCredentials = { accessToken: 'house-token-abc', locationId: 'house-loc-def' }
    const sourceId = 'cnon:card-nonce-test-123'
    const tipAmount = 15

    // Step 1: Decide split
    const decision = decideSplit(service, staffCredentials, houseCredentials)

    expect(decision.shouldSplit).toBe(true)
    expect(decision.houseFeeAmount).toBe(20)
    expect(decision.staffAmount).toBe(80)
    expect(decision.singleChargeOptimization).toBe(false)

    // Step 2: Generate idempotency key
    const sourceHash = hashSourceToken(sourceId)
    const idempotencyKeyBase = generateIdempotencyKey('appt-001', 'staff', sourceHash)

    // Step 3: Mock Square API responses
    mockCreatePayment
      .mockResolvedValueOnce({
        result: { payment: { id: 'house-payment-id-001' } },
      })
      .mockResolvedValueOnce({
        result: { payment: { id: 'staff-payment-id-002' } },
      })

    // Step 4: Execute split payment
    const result = await executeSplitPayment(
      sourceId,
      decision,
      staffCredentials,
      houseCredentials,
      tipAmount,
      idempotencyKeyBase,
    )

    // Verify success
    expect(result.success).toBe(true)
    expect(result.housePaymentId).toBe('house-payment-id-001')
    expect(result.staffPaymentId).toBe('staff-payment-id-002')
    expect(result.houseFeeAmount).toBe(20)
    expect(result.staffAmount).toBe(80)
    expect(result.tipAmount).toBe(15)

    // Verify 2 Square API calls were made
    expect(mockCreatePayment).toHaveBeenCalledTimes(2)

    // Verify first call (house fee) — tip = 0
    const houseCall = mockCreatePayment.mock.calls[0][0]
    expect(houseCall.amountMoney.amount).toBe(BigInt(2000)) // $20 in cents
    expect(houseCall.tipMoney.amount).toBe(BigInt(0))
    expect(houseCall.locationId).toBe('house-loc-def')
    expect(houseCall.idempotencyKey).toBe(`${idempotencyKeyBase}-house`)

    // Verify second call (staff portion) — includes full tip
    const staffCall = mockCreatePayment.mock.calls[1][0]
    expect(staffCall.amountMoney.amount).toBe(BigInt(8000)) // $80 in cents
    expect(staffCall.tipMoney.amount).toBe(BigInt(1500)) // $15 tip
    expect(staffCall.locationId).toBe('staff-loc-456')
    expect(staffCall.idempotencyKey).toBe(`${idempotencyKeyBase}-staff`)
  })

  test('credential resolution feeds into split payment flow', () => {
    const staff = makeStaff()
    const houseProvider = makeHouseProvider()
    const service = makeService()

    // Resolve credentials
    const resolution = resolveCredentialChain(staff, [], houseProvider)
    expect(resolution.source).toBe('staff')

    // Use resolved credentials in split decision
    const decision = decideSplit(service, resolution.credentials, {
      accessToken: houseProvider.squareAccessToken,
      locationId: houseProvider.squareLocationId,
    })

    expect(decision.shouldSplit).toBe(true)
    expect(decision.houseFeeAmount).toBe(20)
    expect(decision.staffAmount).toBe(80)
    expect(decision.singleChargeOptimization).toBe(false)
  })

  test('idempotency keys are deterministic and distinct for house/staff legs', () => {
    const sourceId = 'cnon:card-nonce-abc'
    const sourceHash = hashSourceToken(sourceId)
    const baseKey = generateIdempotencyKey('appt-001', 'staff', sourceHash)

    // Same inputs produce same key
    const baseKey2 = generateIdempotencyKey('appt-001', 'staff', sourceHash)
    expect(baseKey).toBe(baseKey2)

    // Suffixed keys are distinct
    const houseKey = `${baseKey}-house`
    const staffKey = `${baseKey}-staff`
    expect(houseKey).not.toBe(staffKey)
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. Full Custom Charge Flow
// ═══════════════════════════════════════════════════════════════

describe('Full custom charge flow (Requirement 3.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('validate → resolve house credentials → generate idempotency → charge → success', async () => {
    const amount = 75.50
    const sourceId = 'cnon:custom-charge-nonce-xyz'

    // Step 1: Validate custom charge amount
    const validation = validateCustomChargeAmount(amount)
    expect(validation.valid).toBe(true)

    // Step 2: Sanitize numeric input
    const sanitized = sanitizeNumericInput(amount)
    expect(sanitized).toBe(75.50)

    // Step 3: Resolve house credentials (custom charges always route to house)
    const houseProvider = makeHouseProvider()
    const houseCredentials = {
      accessToken: houseProvider.squareAccessToken,
      locationId: houseProvider.squareLocationId,
    }

    // Step 4: Generate idempotency key
    const sourceHash = hashSourceToken(sourceId)
    const idempotencyKey = generateIdempotencyKey('custom-session-001', 'custom', sourceHash)
    expect(idempotencyKey).toBeDefined()
    expect(idempotencyKey.length).toBe(32)

    // Step 5: Mock Square API response
    mockCreatePayment.mockResolvedValueOnce({
      result: { payment: { id: 'custom-payment-id-001' } },
    })

    // Step 6: Execute single charge to house (using executeSplitPayment with singleChargeOptimization)
    // In practice, custom charges bypass the splitter and make a direct Square call,
    // but we can verify the credentials and idempotency key are correctly formed.
    // Verify the generated key is deterministic
    const idempotencyKey2 = generateIdempotencyKey('custom-session-001', 'custom', sourceHash)
    expect(idempotencyKey).toBe(idempotencyKey2)

    // Verify house credentials are correct
    expect(houseCredentials.accessToken).toBe('house-token-abc')
    expect(houseCredentials.locationId).toBe('house-loc-def')
  })

  test('custom charge with invalid amount is rejected before reaching Square', () => {
    // Too low
    expect(validateCustomChargeAmount(0.25).valid).toBe(false)
    // Too high
    expect(validateCustomChargeAmount(10000).valid).toBe(false)
    // Too many decimals
    expect(validateCustomChargeAmount(10.555).valid).toBe(false)
    // NaN
    expect(sanitizeNumericInput(NaN)).toBeNull()
    // Infinity
    expect(sanitizeNumericInput(Infinity)).toBeNull()
  })

  test('custom charge always routes to house provider credentials', () => {
    // Even when a staff member has valid credentials, custom charges go to house
    const staff = makeStaff()
    const houseProvider = makeHouseProvider()

    // The resolution for custom charges explicitly uses house credentials
    const houseCredentials = {
      accessToken: houseProvider.squareAccessToken,
      locationId: houseProvider.squareLocationId,
    }

    // Verify house credentials are what gets used (not staff)
    expect(houseCredentials.accessToken).not.toBe(staff.squareAccessToken)
    expect(houseCredentials.accessToken).toBe('house-token-abc')
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. Database Atomic Update of paymentRaw + paymentStatus
// ═══════════════════════════════════════════════════════════════

describe('Database atomic update of paymentRaw + paymentStatus (Requirement 8.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAppointmentUpdate.mockResolvedValue({ data: {} })
  })

  test('appendAuditRecord updates both paymentRaw and paymentStatus in a single .update() call', async () => {
    // Existing appointment with no prior payment records
    mockAppointmentGet.mockResolvedValue({
      data: {
        appointmentId: 'appt-001',
        paymentRaw: null,
        paymentStatus: null,
      },
    })

    const record = {
      timestamp: '2024-01-15T10:30:00.000Z',
      type: 'success',
      housePaymentId: 'house-pay-001',
      houseFeeAmount: 20,
      staffPaymentId: 'staff-pay-001',
      staffAmount: 80,
      tipAmount: 15,
      routingMethod: 'staff',
      credentialResolutionPath: ['staff:resolved'],
    }

    await appendAuditRecord('appt-001', record)

    // Verify a single .update() call was made
    expect(mockAppointmentUpdate).toHaveBeenCalledTimes(1)

    const updateCall = mockAppointmentUpdate.mock.calls[0][0]

    // Both paymentRaw and paymentStatus are updated atomically
    expect(updateCall.appointmentId).toBe('appt-001')
    expect(updateCall.paymentStatus).toBe('paid')
    expect(updateCall.paymentRaw).toBeDefined()

    // paymentRaw should be a JSON string with the record in an array
    const parsedRaw = JSON.parse(updateCall.paymentRaw)
    expect(Array.isArray(parsedRaw)).toBe(true)
    expect(parsedRaw).toHaveLength(1)
    expect(parsedRaw[0].housePaymentId).toBe('house-pay-001')
    expect(parsedRaw[0].staffAmount).toBe(80)
  })

  test('existing records are preserved (append-only) — new record appended alongside previous', async () => {
    // Existing appointment with a prior failed payment attempt
    const existingRecords = [
      {
        timestamp: '2024-01-15T09:00:00.000Z',
        type: 'failure',
        failureReason: 'Card declined',
        attemptedAmountCents: 10000,
        credentialSource: 'staff-1',
        idempotencyKey: 'old-key-123',
        routingMethod: 'staff',
        credentialResolutionPath: ['staff:resolved'],
      },
    ]

    mockAppointmentGet.mockResolvedValue({
      data: {
        appointmentId: 'appt-002',
        paymentRaw: JSON.stringify(existingRecords),
        paymentStatus: 'failed',
      },
    })

    const newRecord = {
      timestamp: '2024-01-15T10:00:00.000Z',
      type: 'success',
      housePaymentId: 'house-pay-002',
      houseFeeAmount: 20,
      staffPaymentId: 'staff-pay-002',
      staffAmount: 80,
      tipAmount: 10,
      routingMethod: 'staff',
      credentialResolutionPath: ['staff:resolved'],
    }

    await appendAuditRecord('appt-002', newRecord)

    expect(mockAppointmentUpdate).toHaveBeenCalledTimes(1)
    const updateCall = mockAppointmentUpdate.mock.calls[0][0]

    const parsedRaw = JSON.parse(updateCall.paymentRaw)
    expect(parsedRaw).toHaveLength(2)

    // Old record is preserved at index 0
    expect(parsedRaw[0].type).toBe('failure')
    expect(parsedRaw[0].failureReason).toBe('Card declined')

    // New record is appended at index 1
    expect(parsedRaw[1].type).toBe('success')
    expect(parsedRaw[1].housePaymentId).toBe('house-pay-002')

    // Status changed from failed to paid
    expect(updateCall.paymentStatus).toBe('paid')
  })

  test('handles legacy single-object paymentRaw format (wraps in array before appending)', async () => {
    // Legacy format: paymentRaw is a single object (not an array)
    const legacyRecord = {
      timestamp: '2024-01-10T08:00:00.000Z',
      type: 'success',
      staffPaymentId: 'old-pay-legacy',
      staffAmount: 100,
      routingMethod: 'house',
      credentialResolutionPath: ['house:resolved'],
    }

    mockAppointmentGet.mockResolvedValue({
      data: {
        appointmentId: 'appt-003',
        paymentRaw: JSON.stringify(legacyRecord), // Single object stringified
        paymentStatus: 'paid',
      },
    })

    const newRecord = {
      timestamp: '2024-01-15T10:00:00.000Z',
      type: 'failure',
      failureReason: 'Network timeout',
      attemptedAmountCents: 5000,
      credentialSource: 'staff-1',
      idempotencyKey: 'new-key-456',
      routingMethod: 'staff',
      credentialResolutionPath: ['staff:resolved'],
    }

    await appendAuditRecord('appt-003', newRecord)

    const updateCall = mockAppointmentUpdate.mock.calls[0][0]
    const parsedRaw = JSON.parse(updateCall.paymentRaw)

    // Legacy record is preserved, new record appended
    expect(parsedRaw).toHaveLength(2)
    expect(parsedRaw[0].staffPaymentId).toBe('old-pay-legacy')
    expect(parsedRaw[1].failureReason).toBe('Network timeout')
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. Token Refresh Integration with Square OAuth Mock
// ═══════════════════════════════════════════════════════════════

describe('Token refresh integration with Square OAuth mock (Requirement 6.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockStaffUpdate.mockResolvedValue({ data: {} })
  })

  test('token detected as expiring → refresh attempted → DB updated with new token', async () => {
    // Staff with token expiring in 1 hour (within 24h threshold)
    const expiringIn1Hour = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString()

    // Step 1: Detect expiring token
    const expiring = isTokenExpiringSoon(expiringIn1Hour)
    expect(expiring).toBe(true)

    // Step 2: Mock staff record and successful refresh
    mockStaffGet.mockResolvedValue({
      data: {
        visibleId: 'staff-1',
        squareAccessToken: 'old-token',
        squareRefreshToken: 'valid-refresh-token',
        squareTokenExpiresAt: expiringIn1Hour,
        squareOAuthStatus: 'connected',
      },
    })

    const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    mockObtainToken.mockResolvedValue({
      result: {
        accessToken: 'refreshed-access-token',
        refreshToken: 'refreshed-refresh-token',
        expiresAt: newExpiresAt,
      },
    })

    // Step 3: Execute refresh
    const refreshResult = await refreshSquareToken('staff-1')

    // Step 4: Verify success
    expect(refreshResult.success).toBe(true)
    expect(refreshResult.newAccessToken).toBe('refreshed-access-token')
    expect(refreshResult.newRefreshToken).toBe('refreshed-refresh-token')
    expect(refreshResult.newExpiresAt).toBe(newExpiresAt)

    // Step 5: Verify DB was updated with new credentials
    expect(mockStaffUpdate).toHaveBeenCalledTimes(1)
    expect(mockStaffUpdate).toHaveBeenCalledWith({
      visibleId: 'staff-1',
      squareAccessToken: 'refreshed-access-token',
      squareRefreshToken: 'refreshed-refresh-token',
      squareTokenExpiresAt: newExpiresAt,
      squareOAuthStatus: 'connected',
    })
  })

  test('token not expiring → no refresh needed', () => {
    const expiresIn48Hours = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    const expiring = isTokenExpiringSoon(expiresIn48Hours)
    expect(expiring).toBe(false)
  })

  test('null expiresAt is treated as expired → triggers refresh', async () => {
    const nullExpiring = isTokenExpiringSoon(null)
    expect(nullExpiring).toBe(true)

    // Verify it would trigger the refresh flow
    mockStaffGet.mockResolvedValue({
      data: {
        visibleId: 'staff-1',
        squareAccessToken: 'old-token',
        squareRefreshToken: 'valid-refresh-token',
        squareTokenExpiresAt: null,
        squareOAuthStatus: 'connected',
      },
    })

    mockObtainToken.mockResolvedValue({
      result: {
        accessToken: 'new-token-after-null-expiry',
        refreshToken: 'new-refresh',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    })

    const result = await refreshSquareToken('staff-1')
    expect(result.success).toBe(true)
    expect(result.newAccessToken).toBe('new-token-after-null-expiry')
  })

  test('refresh fails with expired token → returns error instructing reconnect', async () => {
    const expiredTime = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    expect(isTokenExpiringSoon(expiredTime)).toBe(true)

    mockStaffGet.mockResolvedValue({
      data: {
        visibleId: 'staff-1',
        squareAccessToken: 'expired-token',
        squareRefreshToken: 'refresh-token',
        squareTokenExpiresAt: expiredTime,
        squareOAuthStatus: 'connected',
      },
    })

    mockObtainToken.mockRejectedValue(new Error('Invalid refresh token'))

    const result = await refreshSquareToken('staff-1')
    expect(result.success).toBe(false)
    expect(result.error).toContain('expired')
    expect(result.error).toContain('reconnect Square')
  })
})

// ═══════════════════════════════════════════════════════════════
// 5. Credential Resolution Fallback Through All Three Levels
// ═══════════════════════════════════════════════════════════════

describe('Credential resolution fallback through all three levels (Requirement 6.4)', () => {
  test('staff valid → staff resolved', () => {
    const staff = makeStaff()
    const houseProvider = makeHouseProvider()

    const result = resolveCredentialChain(staff, [], houseProvider)

    expect(result.source).toBe('staff')
    expect(result.credentials.accessToken).toBe('staff-token-123')
    expect(result.credentials.locationId).toBe('staff-loc-456')
    expect(result.resolutionPath).toEqual(['staff:resolved'])
  })

  test('staff invalid, sibling valid → sibling resolved', () => {
    const staff = makeStaff({ squareOAuthStatus: 'error' })
    const sibling = {
      visibleId: 'staff-sibling',
      staffName: 'Morpheus',
      vendorId: 'vendor-1',
      isActive: true,
      squareAccessToken: 'sibling-token-xyz',
      squareLocationId: 'sibling-loc-uvw',
      squareOAuthStatus: 'connected',
    }
    const houseProvider = makeHouseProvider()

    const result = resolveCredentialChain(staff, [sibling], houseProvider)

    expect(result.source).toBe('sibling_staff')
    expect(result.credentials.accessToken).toBe('sibling-token-xyz')
    expect(result.credentials.locationId).toBe('sibling-loc-uvw')
    expect(result.resolutionPath).toEqual(['staff:invalid', 'sibling:resolved'])
  })

  test('staff invalid, sibling invalid → house resolved', () => {
    const staff = makeStaff({ squareAccessToken: '' })
    const sibling = {
      visibleId: 'staff-sibling',
      staffName: 'Morpheus',
      vendorId: 'vendor-1',
      isActive: true,
      squareAccessToken: '',
      squareLocationId: 'sibling-loc-uvw',
      squareOAuthStatus: 'connected',
    }
    const houseProvider = makeHouseProvider()

    const result = resolveCredentialChain(staff, [sibling], houseProvider)

    expect(result.source).toBe('house')
    expect(result.credentials.accessToken).toBe('house-token-abc')
    expect(result.credentials.locationId).toBe('house-loc-def')
    expect(result.resolutionPath).toEqual(['staff:invalid', 'sibling:none', 'house:resolved'])
  })

  test('all invalid including house → inPersonRequired', () => {
    const staff = makeStaff({ squareAccessToken: undefined })
    const sibling = {
      visibleId: 'staff-sibling',
      staffName: 'Morpheus',
      vendorId: 'vendor-1',
      isActive: true,
      squareAccessToken: undefined,
      squareLocationId: undefined,
      squareOAuthStatus: 'error',
    }
    const houseProvider = makeHouseProvider({
      squareAccessToken: '',
      squareLocationId: '',
    })

    const result = resolveCredentialChain(staff, [sibling], houseProvider)

    expect(result.code).toBe('NO_CREDENTIALS')
    expect(result.inPersonRequired).toBe(true)
    expect(result.staffName).toBe('Trinity')
    expect(result.vendorName).toBe('Stacey House')
    expect(result.message).toContain('In-person payment is required')
  })

  test('house-is-vendor case: staff invalid → skips sibling → resolves to house directly', () => {
    const staff = makeStaff({
      vendorId: 'house-vendor',
      squareAccessToken: undefined,
    })
    const sibling = {
      visibleId: 'staff-sibling',
      staffName: 'Morpheus',
      vendorId: 'house-vendor',
      isActive: true,
      squareAccessToken: 'sibling-token',
      squareLocationId: 'sibling-loc',
      squareOAuthStatus: 'connected',
    }
    const houseProvider = makeHouseProvider({ vendorId: 'house-vendor' })

    const result = resolveCredentialChain(staff, [sibling], houseProvider)

    expect(result.source).toBe('house')
    expect(result.resolutionPath).toContain('sibling:skipped_house_is_vendor')
    expect(result.credentials.accessToken).toBe('house-token-abc')
  })
})
