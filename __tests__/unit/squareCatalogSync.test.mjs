/**
 * Unit Tests for Square Catalog Sync
 *
 * Tests the triggerSquareSync function and supporting utilities:
 * - computeAllowedStaffDiff: correct diff calculation
 * - syncAllowedStaffChanges: orchestrates syncs for all affected staff
 * - triggerSquareSync: handles add/remove actions, error cases gracefully
 *
 * Requirements: 3.5, 3.6, 3.8
 */

import { describe, test, expect } from '@jest/globals'
import {
  triggerSquareSync,
  computeAllowedStaffDiff,
  syncAllowedStaffChanges,
} from '../../app/utils/squareCatalogSync.ts'

const mockService = {
  serviceId: 'svc-001',
  name: 'Deep Tissue Massage',
  description: 'A 60-minute deep tissue session',
  categories: ['Massage'],
  duration: 60,
  price: 120,
  allowedStaff: ['staff-1', 'staff-2'],
}

describe('computeAllowedStaffDiff', () => {
  test('detects added staff members', () => {
    const { added, removed } = computeAllowedStaffDiff(
      ['staff-1'],
      ['staff-1', 'staff-2', 'staff-3']
    )
    expect(added).toEqual(['staff-2', 'staff-3'])
    expect(removed).toEqual([])
  })

  test('detects removed staff members', () => {
    const { added, removed } = computeAllowedStaffDiff(
      ['staff-1', 'staff-2', 'staff-3'],
      ['staff-1']
    )
    expect(added).toEqual([])
    expect(removed).toEqual(['staff-2', 'staff-3'])
  })

  test('detects both added and removed staff', () => {
    const { added, removed } = computeAllowedStaffDiff(
      ['staff-1', 'staff-2'],
      ['staff-2', 'staff-3']
    )
    expect(added).toEqual(['staff-3'])
    expect(removed).toEqual(['staff-1'])
  })

  test('returns empty arrays when no changes', () => {
    const { added, removed } = computeAllowedStaffDiff(
      ['staff-1', 'staff-2'],
      ['staff-1', 'staff-2']
    )
    expect(added).toEqual([])
    expect(removed).toEqual([])
  })

  test('handles null old staff (all were allowed, now specific)', () => {
    const { added, removed } = computeAllowedStaffDiff(
      null,
      ['staff-1', 'staff-2']
    )
    expect(added).toEqual(['staff-1', 'staff-2'])
    expect(removed).toEqual([])
  })

  test('handles null new staff (specific → all)', () => {
    const { added, removed } = computeAllowedStaffDiff(
      ['staff-1', 'staff-2'],
      null
    )
    expect(added).toEqual([])
    expect(removed).toEqual(['staff-1', 'staff-2'])
  })

  test('handles both null (no change)', () => {
    const { added, removed } = computeAllowedStaffDiff(null, null)
    expect(added).toEqual([])
    expect(removed).toEqual([])
  })

  test('handles empty arrays (no change)', () => {
    const { added, removed } = computeAllowedStaffDiff([], [])
    expect(added).toEqual([])
    expect(removed).toEqual([])
  })

  test('handles undefined values as empty', () => {
    const { added, removed } = computeAllowedStaffDiff(undefined, undefined)
    expect(added).toEqual([])
    expect(removed).toEqual([])
  })
})

describe('triggerSquareSync', () => {
  test('returns success on successful add sync', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ success: true, synced: 3 }),
    })

    const result = await triggerSquareSync('staff-1', 'add', mockService, {
      baseUrl: 'http://localhost:3000',
      fetchFn: mockFetch,
    })

    expect(result.success).toBe(true)
    expect(result.itemsSynced).toBe(3)
    expect(result.error).toBeUndefined()
  })

  test('returns success on successful remove sync', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ success: true, synced: 2 }),
    })

    const result = await triggerSquareSync('staff-1', 'remove', mockService, {
      baseUrl: 'http://localhost:3000',
      fetchFn: mockFetch,
    })

    expect(result.success).toBe(true)
    expect(result.itemsSynced).toBe(2)
  })

  test('returns failure with error message when API responds with error', async () => {
    const mockFetch = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Square not connected' }),
    })

    const result = await triggerSquareSync('staff-1', 'add', mockService, {
      baseUrl: 'http://localhost:3000',
      fetchFn: mockFetch,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Square not connected')
    expect(result.itemsSynced).toBeUndefined()
  })

  test('returns failure when fetch throws a network error', async () => {
    const mockFetch = async () => {
      throw new Error('Network timeout')
    }

    const result = await triggerSquareSync('staff-1', 'add', mockService, {
      baseUrl: 'http://localhost:3000',
      fetchFn: mockFetch,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Network timeout')
  })

  test('returns failure when staffId is empty', async () => {
    const result = await triggerSquareSync('', 'add', mockService)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Staff ID is required')
  })

  test('returns failure when service has no serviceId', async () => {
    const badService = { ...mockService, serviceId: '' }
    const result = await triggerSquareSync('staff-1', 'add', badService)

    expect(result.success).toBe(false)
    expect(result.error).toContain('serviceId is required')
  })

  test('does not throw even on unexpected error types', async () => {
    const mockFetch = async () => {
      throw 'unexpected string error'
    }

    const result = await triggerSquareSync('staff-1', 'add', mockService, {
      baseUrl: 'http://localhost:3000',
      fetchFn: mockFetch,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unknown sync error')
  })

  test('handles non-JSON error response gracefully', async () => {
    const mockFetch = async () => ({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json') },
    })

    const result = await triggerSquareSync('staff-1', 'remove', mockService, {
      baseUrl: 'http://localhost:3000',
      fetchFn: mockFetch,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('failed with status 500')
  })
})

describe('syncAllowedStaffChanges', () => {
  test('triggers add sync for newly added staff', async () => {
    const calls = []
    const mockFetch = async (url, options) => {
      const body = JSON.parse(options.body)
      calls.push(body)
      return { ok: true, json: async () => ({ success: true, synced: 1 }) }
    }

    const results = await syncAllowedStaffChanges(
      ['staff-1'],
      ['staff-1', 'staff-2', 'staff-3'],
      mockService,
      { baseUrl: 'http://localhost:3000', fetchFn: mockFetch }
    )

    expect(results).toHaveLength(2)
    expect(results.every(r => r.action === 'add')).toBe(true)
    expect(results.every(r => r.result.success)).toBe(true)
    expect(calls).toHaveLength(2)
    expect(calls.map(c => c.staffId).sort()).toEqual(['staff-2', 'staff-3'])
  })

  test('triggers remove sync for removed staff', async () => {
    const calls = []
    const mockFetch = async (url, options) => {
      const body = JSON.parse(options.body)
      calls.push(body)
      return { ok: true, json: async () => ({ success: true, synced: 1 }) }
    }

    const results = await syncAllowedStaffChanges(
      ['staff-1', 'staff-2', 'staff-3'],
      ['staff-1'],
      mockService,
      { baseUrl: 'http://localhost:3000', fetchFn: mockFetch }
    )

    expect(results).toHaveLength(2)
    expect(results.every(r => r.action === 'remove')).toBe(true)
    expect(calls.map(c => c.staffId).sort()).toEqual(['staff-2', 'staff-3'])
  })

  test('triggers both add and remove syncs', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ success: true, synced: 1 }),
    })

    const results = await syncAllowedStaffChanges(
      ['staff-1', 'staff-2'],
      ['staff-2', 'staff-3'],
      mockService,
      { baseUrl: 'http://localhost:3000', fetchFn: mockFetch }
    )

    expect(results).toHaveLength(2)
    const addResult = results.find(r => r.action === 'add')
    const removeResult = results.find(r => r.action === 'remove')
    expect(addResult.staffId).toBe('staff-3')
    expect(removeResult.staffId).toBe('staff-1')
  })

  test('returns empty array when no changes', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ success: true, synced: 1 }),
    })

    const results = await syncAllowedStaffChanges(
      ['staff-1', 'staff-2'],
      ['staff-1', 'staff-2'],
      mockService,
      { baseUrl: 'http://localhost:3000', fetchFn: mockFetch }
    )

    expect(results).toEqual([])
  })

  test('collects failures without blocking other syncs', async () => {
    let callCount = 0
    const mockFetch = async (url, options) => {
      callCount++
      const body = JSON.parse(options.body)
      if (body.staffId === 'staff-2') {
        return { ok: false, status: 400, json: async () => ({ error: 'Square not connected' }) }
      }
      return { ok: true, json: async () => ({ success: true, synced: 1 }) }
    }

    const results = await syncAllowedStaffChanges(
      [],
      ['staff-1', 'staff-2', 'staff-3'],
      mockService,
      { baseUrl: 'http://localhost:3000', fetchFn: mockFetch }
    )

    expect(results).toHaveLength(3)
    expect(callCount).toBe(3) // all 3 staff called
    const failed = results.filter(r => !r.result.success)
    const succeeded = results.filter(r => r.result.success)
    expect(failed).toHaveLength(1)
    expect(failed[0].staffId).toBe('staff-2')
    expect(failed[0].result.error).toBe('Square not connected')
    expect(succeeded).toHaveLength(2)
  })
})
