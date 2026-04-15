/**
 * Payment Utility Tests
 *
 * Unit tests for:
 * - calculatePaymentSplits (multi-vendor payment splitting with house fees)
 * - calculateVendorNet (vendor net after house fee)
 * - formatPaymentSplits (display formatting)
 */

import { jest } from '@jest/globals'
import {
  calculatePaymentSplits,
  calculateVendorNet,
  formatPaymentSplits,
} from '../../app/utils/payment.js'

// ── calculatePaymentSplits ────────────────────────────────────

describe('calculatePaymentSplits', () => {
  const houseVendorId = 'vendor-house'

  test('single service, no house fee — vendor gets full amount', () => {
    const services = [{ price: 100, houseFeeEnabled: false, houseFeeAmount: 0, vendorId: 'vendor-a' }]
    const result = calculatePaymentSplits(services, houseVendorId)

    expect(result.total).toBe(100)
    expect(result.splits).toHaveLength(1)
    expect(result.splits[0]).toMatchObject({ vendorId: 'vendor-a', amount: 100, isHouseFee: false })
  })

  test('single service with house fee — splits between vendor and house', () => {
    const services = [{ price: 100, houseFeeEnabled: true, houseFeeAmount: 20, vendorId: 'vendor-a' }]
    const result = calculatePaymentSplits(services, houseVendorId)

    expect(result.total).toBe(100)
    expect(result.splits).toHaveLength(2)

    const houseSplit = result.splits.find(s => s.vendorId === houseVendorId)
    const vendorSplit = result.splits.find(s => s.vendorId === 'vendor-a')
    expect(houseSplit.amount).toBe(20)
    expect(houseSplit.isHouseFee).toBe(true)
    expect(vendorSplit.amount).toBe(80)
  })

  test('multiple services from same vendor — amounts aggregate', () => {
    const services = [
      { price: 50, houseFeeEnabled: false, houseFeeAmount: 0, vendorId: 'vendor-a' },
      { price: 75, houseFeeEnabled: false, houseFeeAmount: 0, vendorId: 'vendor-a' },
    ]
    const result = calculatePaymentSplits(services, houseVendorId)

    expect(result.total).toBe(125)
    expect(result.splits).toHaveLength(1)
    expect(result.splits[0].amount).toBe(125)
  })

  test('multiple services from different vendors with house fees', () => {
    const services = [
      { price: 100, houseFeeEnabled: true, houseFeeAmount: 15, vendorId: 'vendor-a' },
      { price: 80, houseFeeEnabled: true, houseFeeAmount: 10, vendorId: 'vendor-b' },
    ]
    const result = calculatePaymentSplits(services, houseVendorId)

    expect(result.total).toBe(180)

    const houseSplit = result.splits.find(s => s.vendorId === houseVendorId)
    expect(houseSplit.amount).toBe(25) // 15 + 10

    const vendorA = result.splits.find(s => s.vendorId === 'vendor-a')
    const vendorB = result.splits.find(s => s.vendorId === 'vendor-b')
    expect(vendorA.amount).toBe(85)
    expect(vendorB.amount).toBe(70)
  })

  test('mixed — some services with house fee, some without', () => {
    const services = [
      { price: 100, houseFeeEnabled: true, houseFeeAmount: 20, vendorId: 'vendor-a' },
      { price: 60, houseFeeEnabled: false, houseFeeAmount: 0, vendorId: 'vendor-a' },
    ]
    const result = calculatePaymentSplits(services, houseVendorId)

    expect(result.total).toBe(160)

    const houseSplit = result.splits.find(s => s.vendorId === houseVendorId)
    expect(houseSplit.amount).toBe(20)

    // vendor-a gets 80 (from fee service) + 60 (from no-fee service) = 140
    const vendorSplit = result.splits.find(s => s.vendorId === 'vendor-a' && !s.isHouseFee)
    expect(vendorSplit.amount).toBe(140)
  })

  test('house fee of 0 with houseFeeEnabled — no house split created', () => {
    const services = [{ price: 50, houseFeeEnabled: true, houseFeeAmount: 0, vendorId: 'vendor-a' }]
    const result = calculatePaymentSplits(services, houseVendorId)

    expect(result.splits).toHaveLength(1)
    expect(result.splits[0].vendorId).toBe('vendor-a')
    expect(result.splits[0].amount).toBe(50)
  })

  test('empty services array', () => {
    const result = calculatePaymentSplits([], houseVendorId)
    expect(result.total).toBe(0)
    expect(result.splits).toHaveLength(0)
  })

  test('house vendor is also the service vendor — both splits exist', () => {
    const services = [{ price: 100, houseFeeEnabled: true, houseFeeAmount: 10, vendorId: houseVendorId }]
    const result = calculatePaymentSplits(services, houseVendorId)

    expect(result.total).toBe(100)
    const houseFee = result.splits.find(s => s.isHouseFee)
    const servicePayment = result.splits.find(s => !s.isHouseFee)
    expect(houseFee.amount).toBe(10)
    expect(servicePayment.amount).toBe(90)
  })
})

// ── calculateVendorNet ────────────────────────────────────────

describe('calculateVendorNet', () => {
  test('returns full price when house fee disabled', () => {
    expect(calculateVendorNet(100, false, 0)).toBe(100)
  })

  test('subtracts house fee when enabled', () => {
    expect(calculateVendorNet(100, true, 20)).toBe(80)
  })

  test('returns full price when fee enabled but amount is 0', () => {
    expect(calculateVendorNet(100, true, 0)).toBe(100)
  })

  test('handles negative result (fee > price)', () => {
    expect(calculateVendorNet(10, true, 20)).toBe(-10)
  })
})

// ── formatPaymentSplits ───────────────────────────────────────

describe('formatPaymentSplits', () => {
  test('formats splits with vendor names', () => {
    const splits = [
      { vendorId: 'v1', amount: 80 },
      { vendorId: 'v2', amount: 20 },
    ]
    const vendors = [
      { vendorId: 'v1', name: 'Kera Studio' },
      { vendorId: 'v2', name: 'Winsome Woods' },
    ]
    expect(formatPaymentSplits(splits, vendors)).toBe('Kera Studio: $80.00, Winsome Woods: $20.00')
  })

  test('falls back to vendorId when vendor not found', () => {
    const splits = [{ vendorId: 'unknown-vendor', amount: 50 }]
    expect(formatPaymentSplits(splits, [])).toBe('unknown-vendor: $50.00')
  })

  test('handles empty splits', () => {
    expect(formatPaymentSplits([], [])).toBe('')
  })
})
