import { jest } from '@jest/globals'

// Mock DynamoDB before importing db.js
const mockSend = jest.fn()
jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({})),
}))
jest.unstable_mockModule('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockSend })) },
  GetCommand: jest.fn((params) => ({ _type: 'Get', ...params })),
  UpdateCommand: jest.fn((params) => ({ _type: 'Update', ...params })),
  ScanCommand: jest.fn((params) => ({ _type: 'Scan', ...params })),
  QueryCommand: jest.fn((params) => ({ _type: 'Query', ...params })),
}))

process.env.DYNAMO_TABLE_VENDOR = 'Vendor-test'
process.env.DYNAMO_TABLE_STAFF = 'Staff-test'
process.env.DYNAMO_TABLE_APPOINTMENT = 'Appointment-test'

const { getVendor, listVendors, updateVendor, getStaff, updateStaff, findAppointmentByPaymentId, updateAppointment } = await import('../src/db.js')

beforeEach(() => mockSend.mockReset())

// ── getVendor ─────────────────────────────────────────────────

describe('getVendor', () => {
  test('returns item when found', async () => {
    mockSend.mockResolvedValue({ Item: { vendorId: 'v1', name: 'Spa' } })
    expect(await getVendor('v1')).toEqual({ vendorId: 'v1', name: 'Spa' })
  })

  test('returns null when not found', async () => {
    mockSend.mockResolvedValue({})
    expect(await getVendor('missing')).toBeNull()
  })
})

// ── listVendors ───────────────────────────────────────────────

describe('listVendors', () => {
  test('returns items', async () => {
    mockSend.mockResolvedValue({ Items: [{ vendorId: 'v1' }] })
    expect(await listVendors()).toEqual([{ vendorId: 'v1' }])
  })

  test('returns empty array when no items', async () => {
    mockSend.mockResolvedValue({})
    expect(await listVendors()).toEqual([])
  })
})

// ── updateVendor ──────────────────────────────────────────────

describe('updateVendor', () => {
  test('sends update with fields', async () => {
    mockSend.mockResolvedValue({})
    await updateVendor('v1', { name: 'New Name' })
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  test('skips update when fields are empty', async () => {
    await updateVendor('v1', {})
    expect(mockSend).not.toHaveBeenCalled()
  })
})

// ── getStaff ──────────────────────────────────────────────────

describe('getStaff', () => {
  test('returns item when found', async () => {
    mockSend.mockResolvedValue({ Item: { visibleId: 's1' } })
    expect(await getStaff('s1')).toEqual({ visibleId: 's1' })
  })

  test('returns null when not found', async () => {
    mockSend.mockResolvedValue({})
    expect(await getStaff('missing')).toBeNull()
  })
})

// ── updateStaff ───────────────────────────────────────────────

describe('updateStaff', () => {
  test('sends update with fields', async () => {
    mockSend.mockResolvedValue({})
    await updateStaff('s1', { squareAccessToken: 'tok' })
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  test('skips update when fields are empty', async () => {
    await updateStaff('s1', {})
    expect(mockSend).not.toHaveBeenCalled()
  })
})

// ── findAppointmentByPaymentId ────────────────────────────────

describe('findAppointmentByPaymentId', () => {
  test('returns first matching item', async () => {
    mockSend.mockResolvedValue({ Items: [{ appointmentId: 'a1', paymentId: 'p1' }] })
    expect(await findAppointmentByPaymentId('p1')).toEqual({ appointmentId: 'a1', paymentId: 'p1' })
  })

  test('returns null when no match', async () => {
    mockSend.mockResolvedValue({ Items: [] })
    expect(await findAppointmentByPaymentId('missing')).toBeNull()
  })

  test('returns null when Items is undefined', async () => {
    mockSend.mockResolvedValue({})
    expect(await findAppointmentByPaymentId('missing')).toBeNull()
  })
})

// ── updateAppointment ─────────────────────────────────────────

describe('updateAppointment', () => {
  test('sends update with fields', async () => {
    mockSend.mockResolvedValue({})
    await updateAppointment('a1', { status: 'confirmed' })
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  test('skips update when fields are empty', async () => {
    await updateAppointment('a1', {})
    expect(mockSend).not.toHaveBeenCalled()
  })
})
