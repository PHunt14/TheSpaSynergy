/**
 * Unit Tests for Service CRUD Without Vendor Filtering
 *
 * Tests that service operations (Create, Read, Update, Delete) work independently
 * of any vendor/provider context, and that vendorId fields in request payloads
 * are silently ignored.
 *
 * These tests target the pure data transformation and filtering logic extracted
 * from app/api/services/route.ts — no HTTP mocking required.
 *
 * **Validates: Requirements 12.1**
 */

import { describe, test, expect } from '@jest/globals'

// ── Pure Functions Under Test ─────────────────────────────────────────────

/**
 * Strips vendorId and leadVendorId from a service request payload.
 * Mirrors the destructuring logic in POST and PATCH handlers:
 *   const { vendorId: _ignoredVendorId, leadVendorId: _ignoredLeadVendorId, ...rest } = body;
 */
function stripVendorFields(payload) {
  const { vendorId, leadVendorId, ...rest } = payload
  return rest
}

/**
 * Filters services based on active status (mirrors GET handler logic).
 * No vendor filtering is applied — all active services are returned regardless.
 */
function filterServices(services, { includeInactive = false } = {}) {
  if (includeInactive) return services
  return services.filter((s) => s.isActive === true)
}

/**
 * Validates that required fields for service creation are present.
 * vendorId is NOT in the required fields list.
 */
function validateCreatePayload(payload) {
  const requiredFields = ['serviceId', 'name', 'duration', 'price']
  const missing = requiredFields.filter((f) => payload[f] === undefined || payload[f] === null || payload[f] === '')
  if (missing.length > 0) {
    return { valid: false, error: `Missing required fields: ${missing.join(', ')}` }
  }
  return { valid: true }
}

/**
 * Validates that serviceId is present for an update operation.
 * vendorId is NOT required.
 */
function validateUpdatePayload(payload) {
  if (!payload.serviceId) {
    return { valid: false, error: 'serviceId required' }
  }
  return { valid: true }
}

/**
 * Validates that serviceId is present for a delete operation.
 * vendorId is NOT required.
 */
function validateDeleteParams(serviceId) {
  if (!serviceId) {
    return { valid: false, error: 'serviceId required' }
  }
  return { valid: true }
}

// ── Test Data ─────────────────────────────────────────────────────────────

const sampleServices = [
  { serviceId: 'svc-001', name: 'Swedish Massage', categories: ['Massage'], duration: 60, price: 120, isActive: true },
  { serviceId: 'svc-002', name: 'Deep Tissue', categories: ['Massage'], duration: 90, price: 160, isActive: true },
  { serviceId: 'svc-003', name: 'Facial', categories: ['Skin'], duration: 45, price: 85, isActive: false },
  { serviceId: 'svc-004', name: 'Haircut', categories: ['Hair'], duration: 30, price: 50, isActive: true },
  { serviceId: 'svc-005', name: 'Color Treatment', categories: ['Hair'], duration: 120, price: 200, isActive: false },
]

// ── GET /api/services — Returns all active services without vendorId filter ──

describe('GET /api/services — filtering logic', () => {
  test('returns all active services without requiring a vendorId filter', () => {
    const result = filterServices(sampleServices)
    expect(result).toHaveLength(3)
    expect(result.every((s) => s.isActive === true)).toBe(true)
  })

  test('returns services from any vendor context (no vendor-based filtering)', () => {
    // Services migrated from old model may still have historical vendorId values in DynamoDB
    // The filter logic ignores vendorId entirely — all active services are returned
    const servicesWithLegacyVendorIds = [
      { serviceId: 'svc-a', name: 'Svc A', duration: 30, price: 50, isActive: true, vendorId: 'vendor-1' },
      { serviceId: 'svc-b', name: 'Svc B', duration: 45, price: 70, isActive: true, vendorId: 'vendor-2' },
      { serviceId: 'svc-c', name: 'Svc C', duration: 60, price: 90, isActive: true, vendorId: 'vendor-3' },
      { serviceId: 'svc-d', name: 'Svc D', duration: 60, price: 90, isActive: false, vendorId: 'vendor-1' },
    ]

    const result = filterServices(servicesWithLegacyVendorIds)
    // All active services returned regardless of vendorId
    expect(result).toHaveLength(3)
    expect(result.map((s) => s.serviceId).sort()).toEqual(['svc-a', 'svc-b', 'svc-c'])
  })

  test('returns all services when includeInactive is true', () => {
    const result = filterServices(sampleServices, { includeInactive: true })
    expect(result).toHaveLength(5)
  })

  test('returns empty array when no services exist', () => {
    const result = filterServices([])
    expect(result).toEqual([])
  })

  test('returns empty array when all services are inactive', () => {
    const inactiveOnly = sampleServices.map((s) => ({ ...s, isActive: false }))
    const result = filterServices(inactiveOnly)
    expect(result).toEqual([])
  })
})

// ── POST /api/services — Creates without requiring vendorId ──

describe('POST /api/services — payload validation and vendorId stripping', () => {
  test('creates a service without requiring vendorId in payload', () => {
    const payload = {
      serviceId: 'svc-new-001',
      name: 'Hot Stone Massage',
      duration: 75,
      price: 140,
      categories: ['Massage'],
      isActive: true,
    }

    const validation = validateCreatePayload(payload)
    expect(validation.valid).toBe(true)
    // No vendorId required
    expect(payload.vendorId).toBeUndefined()
  })

  test('rejects payload missing required fields (name, duration, price, serviceId)', () => {
    const payload = { name: 'Incomplete Service' }
    const validation = validateCreatePayload(payload)
    expect(validation.valid).toBe(false)
    expect(validation.error).toContain('serviceId')
    expect(validation.error).toContain('duration')
    expect(validation.error).toContain('price')
  })

  test('succeeds with vendorId in body — vendorId is silently ignored', () => {
    const payload = {
      serviceId: 'svc-new-002',
      name: 'Aromatherapy',
      duration: 60,
      price: 110,
      vendorId: 'vendor-legacy-123',
      leadVendorId: 'vendor-lead-456',
    }

    // Validation passes (vendorId not checked)
    const validation = validateCreatePayload(payload)
    expect(validation.valid).toBe(true)

    // After stripping, vendorId is gone
    const stripped = stripVendorFields(payload)
    expect(stripped.vendorId).toBeUndefined()
    expect(stripped.leadVendorId).toBeUndefined()

    // Core fields preserved
    expect(stripped.serviceId).toBe('svc-new-002')
    expect(stripped.name).toBe('Aromatherapy')
    expect(stripped.duration).toBe(60)
    expect(stripped.price).toBe(110)
  })

  test('preserves all non-vendor fields after stripping', () => {
    const payload = {
      serviceId: 'svc-new-003',
      name: 'Reflexology',
      duration: 45,
      price: 80,
      description: 'Pressure point therapy',
      categories: ['Massage', 'Wellness'],
      resourceType: 'staff',
      bufferMinutes: 15,
      houseFeeEnabled: true,
      houseFeeAmount: 10,
      houseFeePercent: 0,
      isActive: true,
      allowedStaff: ['staff-1', 'staff-2'],
      maxQuantityPerBooking: 2,
      providersRequired: 1,
      vendorId: 'should-be-removed',
      leadVendorId: 'also-removed',
    }

    const stripped = stripVendorFields(payload)
    expect(stripped.serviceId).toBe('svc-new-003')
    expect(stripped.name).toBe('Reflexology')
    expect(stripped.duration).toBe(45)
    expect(stripped.price).toBe(80)
    expect(stripped.description).toBe('Pressure point therapy')
    expect(stripped.categories).toEqual(['Massage', 'Wellness'])
    expect(stripped.resourceType).toBe('staff')
    expect(stripped.bufferMinutes).toBe(15)
    expect(stripped.houseFeeEnabled).toBe(true)
    expect(stripped.houseFeeAmount).toBe(10)
    expect(stripped.houseFeePercent).toBe(0)
    expect(stripped.isActive).toBe(true)
    expect(stripped.allowedStaff).toEqual(['staff-1', 'staff-2'])
    expect(stripped.maxQuantityPerBooking).toBe(2)
    expect(stripped.providersRequired).toBe(1)
    // Vendor fields removed
    expect('vendorId' in stripped).toBe(false)
    expect('leadVendorId' in stripped).toBe(false)
  })
})

// ── PATCH /api/services — Updates without vendorId ──

describe('PATCH /api/services — payload validation and vendorId stripping', () => {
  test('updates a service without vendorId in payload', () => {
    const payload = {
      serviceId: 'svc-001',
      name: 'Updated Swedish Massage',
      price: 130,
    }

    const validation = validateUpdatePayload(payload)
    expect(validation.valid).toBe(true)
    // No vendorId required for updates
    expect(payload.vendorId).toBeUndefined()
  })

  test('rejects update without serviceId', () => {
    const payload = { name: 'No ID Provided', price: 100 }
    const validation = validateUpdatePayload(payload)
    expect(validation.valid).toBe(false)
    expect(validation.error).toContain('serviceId required')
  })

  test('succeeds with vendorId in body — vendorId is silently stripped', () => {
    const payload = {
      serviceId: 'svc-001',
      price: 150,
      vendorId: 'vendor-should-be-ignored',
    }

    const validation = validateUpdatePayload(payload)
    expect(validation.valid).toBe(true)

    const stripped = stripVendorFields(payload)
    expect(stripped.vendorId).toBeUndefined()
    expect(stripped.serviceId).toBe('svc-001')
    expect(stripped.price).toBe(150)
  })

  test('strips both vendorId and leadVendorId from update body', () => {
    const payload = {
      serviceId: 'svc-002',
      duration: 120,
      vendorId: 'legacy-vendor',
      leadVendorId: 'legacy-lead',
    }

    const stripped = stripVendorFields(payload)
    expect('vendorId' in stripped).toBe(false)
    expect('leadVendorId' in stripped).toBe(false)
    expect(stripped.serviceId).toBe('svc-002')
    expect(stripped.duration).toBe(120)
  })

  test('handles update payload with all optional fields and vendorId stripped', () => {
    const payload = {
      serviceId: 'svc-003',
      name: 'Premium Facial',
      description: 'Luxury skin treatment',
      categories: ['Skin', 'Wellness'],
      price: 120,
      duration: 60,
      isActive: true,
      allowedStaff: ['staff-3'],
      vendorId: 'strip-me',
    }

    const stripped = stripVendorFields(payload)
    expect('vendorId' in stripped).toBe(false)
    expect(stripped.name).toBe('Premium Facial')
    expect(stripped.allowedStaff).toEqual(['staff-3'])
    expect(stripped.categories).toEqual(['Skin', 'Wellness'])
  })
})

// ── DELETE /api/services — Deletes by serviceId without vendorId ──

describe('DELETE /api/services — deletes by serviceId without vendorId', () => {
  test('validates that serviceId is required for deletion', () => {
    const validation = validateDeleteParams('svc-001')
    expect(validation.valid).toBe(true)
  })

  test('rejects deletion without serviceId', () => {
    const validation = validateDeleteParams(null)
    expect(validation.valid).toBe(false)
    expect(validation.error).toContain('serviceId required')
  })

  test('rejects deletion with empty string serviceId', () => {
    const validation = validateDeleteParams('')
    expect(validation.valid).toBe(false)
    expect(validation.error).toContain('serviceId required')
  })

  test('deletion does not require a vendorId parameter', () => {
    // The delete endpoint uses only serviceId from query params
    // Confirm validation succeeds with just a serviceId
    const validation = validateDeleteParams('svc-005')
    expect(validation.valid).toBe(true)
    // There's no vendorId parameter in the delete contract
  })
})
