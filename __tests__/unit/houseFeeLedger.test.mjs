/**
 * Tests for the House Fee Ledger (lib/payment/houseFeeLedger.ts).
 *
 * Since a Square card nonce is single-use and merchant-scoped, house-fee-enabled
 * services charge the PROVIDER the full amount in one charge and record the
 * house fee as an obligation here. These tests cover:
 *  - billingMonth() month derivation (UTC)
 *  - recordHouseFeeObligation() happy path, idempotency, never-throws contract
 */

import { jest } from '@jest/globals'
import { billingMonth, recordHouseFeeObligation } from '../../lib/payment/houseFeeLedger.ts'

/** Builds a mock Amplify data client capturing HouseFeeLedger create/list calls. */
function makeDataClient({ existing = [], failCreate = false, failList = false } = {}) {
  const created = []
  return {
    created,
    models: {
      HouseFeeLedger: {
        list: async () => {
          if (failList) throw new Error('list boom')
          return { data: existing }
        },
        create: async (item) => {
          if (failCreate) throw new Error('create boom')
          created.push(item)
          return { data: item }
        },
      },
    },
  }
}

const baseInput = {
  staffId: 'staff-kera-trinity',
  staffName: 'Trinity',
  vendorId: 'vendor-kera-studio',
  appointmentId: 'appt-1',
  serviceId: 'svc-kera-head-bath',
  serviceName: 'Keratin Head Bath',
  customerName: 'Jane Doe',
  houseFeeAmount: 65,
  paymentId: 'sqpay_123',
}

describe('billingMonth', () => {
  test('derives YYYY-MM in UTC', () => {
    expect(billingMonth(new Date('2026-09-25T17:16:00Z'))).toBe('2026-09')
    expect(billingMonth(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01')
    expect(billingMonth(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12')
  })

  test('uses UTC boundaries (late-night UTC does not roll to next month by local tz)', () => {
    // 2026-09-30T23:30Z is still September in UTC regardless of server local tz.
    expect(billingMonth(new Date('2026-09-30T23:30:00Z'))).toBe('2026-09')
  })
})

describe('recordHouseFeeObligation', () => {
  test('records an owed obligation with the correct month and fields', async () => {
    const client = makeDataClient()
    const res = await recordHouseFeeObligation(client, {
      ...baseInput,
      at: new Date('2026-09-25T17:16:00Z'),
    })

    expect(res.recorded).toBe(true)
    expect(res.month).toBe('2026-09')
    expect(res.ledgerId).toBeTruthy()
    expect(client.created).toHaveLength(1)

    const row = client.created[0]
    expect(row.staffId).toBe('staff-kera-trinity')
    expect(row.houseFeeAmount).toBe(65)
    expect(row.status).toBe('owed')
    expect(row.month).toBe('2026-09')
    expect(row.paymentId).toBe('sqpay_123')
    expect(row.createdAt).toBe('2026-09-25T17:16:00.000Z')
  })

  test('is idempotent per appointment — does not create a duplicate', async () => {
    const client = makeDataClient({
      existing: [{ ledgerId: 'existing-1', appointmentId: 'appt-1', month: '2026-09' }],
    })
    const res = await recordHouseFeeObligation(client, baseInput)

    expect(res.recorded).toBe(true)
    expect(res.ledgerId).toBe('existing-1')
    // No new row created because one already exists for this appointment.
    expect(client.created).toHaveLength(0)
  })

  test('rejects invalid input (no staffId or non-positive fee) without creating', async () => {
    const client = makeDataClient()
    const noStaff = await recordHouseFeeObligation(client, { ...baseInput, staffId: '' })
    const zeroFee = await recordHouseFeeObligation(client, { ...baseInput, houseFeeAmount: 0 })

    expect(noStaff.recorded).toBe(false)
    expect(zeroFee.recorded).toBe(false)
    expect(client.created).toHaveLength(0)
  })

  test('never throws when the create call fails — returns recorded:false with error', async () => {
    const client = makeDataClient({ failCreate: true })
    const res = await recordHouseFeeObligation(client, baseInput)

    expect(res.recorded).toBe(false)
    expect(res.error).toBeTruthy()
  })

  test('still records when the idempotency lookup fails (prefers a possible dup over dropping the obligation)', async () => {
    const client = makeDataClient({ failList: true })
    const res = await recordHouseFeeObligation(client, baseInput)

    expect(res.recorded).toBe(true)
    expect(client.created).toHaveLength(1)
  })
})
