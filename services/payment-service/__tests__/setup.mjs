import { jest } from '@jest/globals'

// ── DB mocks ──────────────────────────────────────────────────
export const dbMocks = {
  getVendor: jest.fn(),
  getStaff: jest.fn(),
  listVendors: jest.fn(),
  updateVendor: jest.fn(),
  updateStaff: jest.fn(),
  findAppointmentByPaymentId: jest.fn(),
  updateAppointment: jest.fn(),
}

// ── Square SDK mocks ──────────────────────────────────────────
export const mockCreatePayment = jest.fn()
export const mockObtainToken = jest.fn()
export const mockRevokeToken = jest.fn()
export const mockListLocations = jest.fn()

export const squareCoreMocks = {
  verifyWebhookSignature: jest.fn(),
  squareEnv: jest.fn(() => 'Sandbox'),
}

/**
 * Call before importing ../src/index.js in each test file.
 * Returns the imported app.
 */
export async function setupMocks() {
  jest.unstable_mockModule('../src/db.js', () => dbMocks)
  jest.unstable_mockModule('../src/square-core.js', () => squareCoreMocks)
  jest.unstable_mockModule('square', () => ({
    Client: jest.fn(() => ({
      paymentsApi: { createPayment: mockCreatePayment },
      oAuthApi: { obtainToken: mockObtainToken, revokeToken: mockRevokeToken },
      locationsApi: { listLocations: mockListLocations },
    })),
    Environment: { Production: 'Production', Sandbox: 'Sandbox' },
  }))

  const { app } = await import('../src/index.js')
  return app
}

export function resetAllMocks() {
  Object.values(dbMocks).forEach(m => m.mockReset())
  Object.values(squareCoreMocks).forEach(m => m.mockReset())
  squareCoreMocks.squareEnv.mockReturnValue('Sandbox')
  mockCreatePayment.mockReset()
  mockObtainToken.mockReset()
  mockRevokeToken.mockReset()
  mockListLocations.mockReset()
}
