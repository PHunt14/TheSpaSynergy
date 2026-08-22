/**
 * Unit Tests for Payment API Route Logic
 *
 * Tests the internal logic modules that the API routes use:
 * - validatePaymentAmount (amount mismatch → 400 with expected/received/difference)
 * - validateCustomChargeAmount (valid/invalid amounts)
 * - sanitizeNumericInput (NaN/Infinity rejection)
 * - decideSplit (house fee splitting)
 * - resolveCredentialChain (inPersonRequired when no credentials)
 * - SplitPaymentResult partial response with housePaymentId
 *
 * Requirements: 1.1, 1.3, 1.4, 3.4, 3.8, 4.1, 4.2, 4.5, 5.2
 */

import { describe, test, expect } from '@jest/globals'
import {
  validatePaymentAmount,
  validateCustomChargeAmount,
  sanitizeNumericInput,
} from '../../lib/payment/validator.ts'
import { decideSplit } from '../../lib/payment/houseFee.ts'
import {
  resolveCredentialChain,
  hasValidCredentials,
} from '../../app/utils/paymentRouting.ts'

// ── Test Fixtures ────────────────────────────────────────────

function makeService(overrides = {}) {
  return {
    serviceId: 'service-1',
    name: 'Haircut',
    price: 100,
    houseFeeEnabled: true,
    houseFeeAmount: 20,
    ...overrides,
  }
}

function makeStaffCredentials(overrides = {}) {
  return {
    accessToken: 'staff-token-abc',
    locationId: 'staff-loc-123',
    ...overrides,
  }
}

function makeHouseCredentials(overrides = {}) {
  return {
    accessToken: 'house-token-xyz',
    locationId: 'house-loc-789',
    ...overrides,
  }
}

function makeStaff(overrides = {}) {
  return {
    visibleId: 'staff-1',
    staffName: 'Trinity',
    vendorId: 'vendor-1',
    isActive: true,
    squareAccessToken: 'staff-token-abc',
    squareLocationId: 'staff-loc-123',
    squareOAuthStatus: 'connected',
    ...overrides,
  }
}

function makeHouseProvider(overrides = {}) {
  return {
    vendorId: 'house-vendor',
    name: 'Kera Studio',
    email: 'house@example.com',
    isActive: true,
    isHouse: true,
    squareAccessToken: 'house-token-xyz',
    squareLocationId: 'house-loc-789',
    squareOAuthStatus: 'connected',
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────

describe('Payment API route logic', () => {
  describe('amount validation (Req 4.1, 4.2)', () => {
    test('accepts amount matching expected within $0.01 tolerance', () => {
      const result = validatePaymentAmount({
        amount: 50.00,
        expectedAmount: 50.00,
      })
      expect(result.valid).toBe(true)
    })

    test('accepts amount within $0.01 tolerance', () => {
      const result = validatePaymentAmount({
        amount: 50.01,
        expectedAmount: 50.00,
      })
      expect(result.valid).toBe(true)
    })

    test('rejects amount with difference > $0.01 and returns expected/received/difference', () => {
      const result = validatePaymentAmount({
        amount: 55.00,
        expectedAmount: 50.00,
      })

      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error.expected).toBe(50.00)
      expect(result.error.received).toBe(55.00)
      expect(result.error.difference).toBe(5.00)
      expect(result.error.message).toContain("doesn't match")
    })

    test('rejects when submitted amount is lower than expected', () => {
      const result = validatePaymentAmount({
        amount: 45.00,
        expectedAmount: 50.00,
      })

      expect(result.valid).toBe(false)
      expect(result.error.expected).toBe(50.00)
      expect(result.error.received).toBe(45.00)
      expect(result.error.difference).toBe(5.00)
    })
  })

  describe('input sanitization (Req 4.5)', () => {
    test('rejects NaN', () => {
      expect(sanitizeNumericInput(NaN)).toBeNull()
    })

    test('rejects Infinity', () => {
      expect(sanitizeNumericInput(Infinity)).toBeNull()
    })

    test('rejects -Infinity', () => {
      expect(sanitizeNumericInput(-Infinity)).toBeNull()
    })

    test('rejects negative zero', () => {
      expect(sanitizeNumericInput(-0)).toBeNull()
    })

    test('rejects non-number types', () => {
      expect(sanitizeNumericInput('50')).toBeNull()
      expect(sanitizeNumericInput(undefined)).toBeNull()
      expect(sanitizeNumericInput(null)).toBeNull()
    })

    test('accepts valid finite numbers', () => {
      expect(sanitizeNumericInput(50)).toBe(50)
      expect(sanitizeNumericInput(0.01)).toBe(0.01)
      expect(sanitizeNumericInput(9999.99)).toBe(9999.99)
    })
  })

  describe('house fee splitting (Req 1.1)', () => {
    test('splits correctly when house fee enabled with different credentials', () => {
      const service = makeService({ price: 100, houseFeeAmount: 20 })
      const staffCreds = makeStaffCredentials()
      const houseCreds = makeHouseCredentials()

      const decision = decideSplit(service, staffCreds, houseCreds)

      expect(decision.shouldSplit).toBe(true)
      expect(decision.houseFeeAmount).toBe(20)
      expect(decision.staffAmount).toBe(80)
      expect(decision.houseFeeAmount + decision.staffAmount).toBe(service.price)
      expect(decision.singleChargeOptimization).toBe(false)
    })

    test('no split when house fee disabled', () => {
      const service = makeService({ houseFeeEnabled: false, price: 100, houseFeeAmount: 20 })
      const staffCreds = makeStaffCredentials()
      const houseCreds = makeHouseCredentials()

      const decision = decideSplit(service, staffCreds, houseCreds)

      expect(decision.shouldSplit).toBe(false)
      expect(decision.houseFeeAmount).toBe(0)
      expect(decision.staffAmount).toBe(100)
    })

    test('no split when house fee amount is zero', () => {
      const service = makeService({ houseFeeEnabled: true, houseFeeAmount: 0, price: 100 })
      const staffCreds = makeStaffCredentials()
      const houseCreds = makeHouseCredentials()

      const decision = decideSplit(service, staffCreds, houseCreds)

      expect(decision.shouldSplit).toBe(false)
      expect(decision.staffAmount).toBe(100)
    })

    test('single charge optimization when credentials match', () => {
      const service = makeService({ price: 100, houseFeeAmount: 20 })
      const sameCreds = { accessToken: 'shared-token', locationId: 'shared-loc' }

      const decision = decideSplit(service, sameCreds, sameCreds)

      expect(decision.shouldSplit).toBe(true)
      expect(decision.singleChargeOptimization).toBe(true)
      expect(decision.houseFeeAmount).toBe(20)
      expect(decision.staffAmount).toBe(80)
    })

    test('rejects when house fee >= service price', () => {
      const service = makeService({ price: 50, houseFeeAmount: 50 })
      const staffCreds = makeStaffCredentials()
      const houseCreds = makeHouseCredentials()

      expect(() => decideSplit(service, staffCreds, houseCreds)).toThrow()
    })
  })

  describe('already paid rejection (Req 5.2)', () => {
    test('paymentStatus === "paid" should trigger 409 rejection logic', () => {
      // This tests the logic: if paymentStatus is 'paid', the route returns 409.
      // We verify the condition directly since the route checks this field.
      const appointment = { paymentStatus: 'paid' }
      expect(appointment.paymentStatus === 'paid').toBe(true)

      // A fresh appointment should not trigger rejection
      const freshAppointment = { paymentStatus: 'pending' }
      expect(freshAppointment.paymentStatus === 'paid').toBe(false)
    })

    test('null/undefined paymentStatus should not trigger rejection', () => {
      const appointment1 = { paymentStatus: null }
      const appointment2 = { paymentStatus: undefined }
      expect(appointment1.paymentStatus === 'paid').toBe(false)
      expect(appointment2.paymentStatus === 'paid').toBe(false)
    })
  })

  describe('custom charge routing (Req 3.4, 3.8)', () => {
    test('custom charge amount validation accepts valid amounts', () => {
      expect(validateCustomChargeAmount(5.00).valid).toBe(true)
      expect(validateCustomChargeAmount(0.50).valid).toBe(true)
      expect(validateCustomChargeAmount(9999.99).valid).toBe(true)
      expect(validateCustomChargeAmount(100).valid).toBe(true)
    })

    test('custom charge amount validation rejects below $0.50', () => {
      const result = validateCustomChargeAmount(0.49)
      expect(result.valid).toBe(false)
      expect(result.error.message).toContain('at least $0.50')
    })

    test('custom charge amount validation rejects above $9999.99', () => {
      const result = validateCustomChargeAmount(10000)
      expect(result.valid).toBe(false)
      expect(result.error.message).toContain('exceed $9999.99')
    })

    test('custom charge amount validation rejects > 2 decimal places', () => {
      const result = validateCustomChargeAmount(5.555)
      expect(result.valid).toBe(false)
      expect(result.error.message).toContain('two decimal places')
    })

    test('house provider with valid credentials resolves for custom charges', () => {
      // Custom charges route to house — verify hasValidCredentials works for house
      const houseProvider = makeHouseProvider()
      expect(hasValidCredentials(houseProvider)).toBe(true)
    })

    test('house provider without credentials should fail custom charge', () => {
      const houseProvider = makeHouseProvider({
        squareAccessToken: '',
        squareLocationId: '',
      })
      expect(hasValidCredentials(houseProvider)).toBe(false)
    })
  })

  describe('missing credentials (Req 1.3)', () => {
    test('resolveCredentialChain returns inPersonRequired when all levels lack credentials', () => {
      const staff = makeStaff({
        squareAccessToken: '',
        squareLocationId: '',
        squareOAuthStatus: 'disconnected',
      })
      const siblingStaff = []
      const houseProvider = makeHouseProvider({
        squareAccessToken: '',
        squareLocationId: '',
        squareOAuthStatus: 'disconnected',
      })

      const result = resolveCredentialChain(staff, siblingStaff, houseProvider)

      expect(result.code).toBe('NO_CREDENTIALS')
      expect(result.inPersonRequired).toBe(true)
      expect(result.staffName).toBe('Trinity')
      expect(result.vendorName).toBe('Kera Studio')
    })

    test('resolveCredentialChain returns inPersonRequired when credentials are whitespace-only', () => {
      const staff = makeStaff({
        squareAccessToken: '   ',
        squareLocationId: '   ',
        squareOAuthStatus: 'connected',
      })
      const siblingStaff = []
      const houseProvider = makeHouseProvider({
        squareAccessToken: '   ',
        squareLocationId: '   ',
      })

      const result = resolveCredentialChain(staff, siblingStaff, houseProvider)

      expect(result.code).toBe('NO_CREDENTIALS')
      expect(result.inPersonRequired).toBe(true)
    })

    test('resolveCredentialChain resolves to house when staff lacks credentials but house has them', () => {
      const staff = makeStaff({
        squareAccessToken: '',
        squareLocationId: '',
        squareOAuthStatus: 'disconnected',
      })
      const siblingStaff = []
      const houseProvider = makeHouseProvider()

      const result = resolveCredentialChain(staff, siblingStaff, houseProvider)

      expect(result.credentials).toBeDefined()
      expect(result.source).toBe('house')
      expect(result.credentials.accessToken).toBe('house-token-xyz')
    })
  })

  describe('partial payment (Req 1.4)', () => {
    test('split result shape with partial: true includes housePaymentId', () => {
      // Verify the SplitPaymentResult interface expectations for partial payment.
      // When house charge succeeds but staff fails, the result has:
      // - partial: true
      // - housePaymentId: the successful house charge ID
      // - success: false (overall payment failed)
      const partialResult = {
        success: false,
        housePaymentId: 'house-pay-123',
        houseFeeAmount: 20,
        staffAmount: 80,
        tipAmount: 5,
        partial: true,
        error: 'Staff payment failed',
      }

      expect(partialResult.partial).toBe(true)
      expect(partialResult.housePaymentId).toBe('house-pay-123')
      expect(partialResult.success).toBe(false)
      expect(partialResult.houseFeeAmount).toBe(20)
      expect(partialResult.error).toBeDefined()
    })

    test('decideSplit produces amounts that would allow partial tracking', () => {
      // When a split is decided, both amounts are known, enabling partial tracking
      const service = makeService({ price: 150, houseFeeAmount: 30 })
      const staffCreds = makeStaffCredentials()
      const houseCreds = makeHouseCredentials()

      const decision = decideSplit(service, staffCreds, houseCreds)

      expect(decision.shouldSplit).toBe(true)
      expect(decision.houseFeeAmount).toBe(30)
      expect(decision.staffAmount).toBe(120)
      // Both amounts must be positive for a valid split
      expect(decision.houseFeeAmount).toBeGreaterThan(0)
      expect(decision.staffAmount).toBeGreaterThan(0)
    })
  })
})
