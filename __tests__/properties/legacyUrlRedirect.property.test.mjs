/**
 * Property-Based Tests for Legacy URL Redirect Mapping
 *
 * Uses fast-check to validate that legacy vendor URL paths are correctly
 * redirected to corresponding provider URLs with HTTP 301 status codes.
 * Feature: unified-business-model
 *
 * Properties tested:
 * - Property 17: Legacy URL redirect mapping
 *
 * **Validates: Requirements 11.5**
 */

import fc from 'fast-check'
import { resolveRedirect } from '../../middleware.ts'

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a valid URL path segment (alphanumeric with hyphens, no leading/trailing hyphens).
 */
function arbPathSegment() {
  return fc.stringMatching(/^[a-z0-9][a-z0-9\-]{0,15}[a-z0-9]$/)
}

/**
 * Generates an optional sub-path like /some-id or /some-id/nested.
 */
function arbSubPath() {
  return fc.oneof(
    fc.constant(''),
    arbPathSegment().map(seg => `/${seg}`),
    fc.tuple(arbPathSegment(), arbPathSegment()).map(([a, b]) => `/${a}/${b}`)
  )
}

/**
 * Generates paths matching /vendors/* pattern.
 */
function arbVendorsPath() {
  return arbSubPath().map(sub => `/vendors${sub}`)
}

/**
 * Generates paths matching /dashboard/vendors/* pattern.
 */
function arbDashboardVendorsPath() {
  return arbSubPath().map(sub => `/dashboard/vendors${sub}`)
}

/**
 * Generates paths matching /api/vendors/* pattern.
 */
function arbApiVendorsPath() {
  return arbSubPath().map(sub => `/api/vendors${sub}`)
}

/**
 * Generates a vendor query parameter value.
 */
function arbVendorParam() {
  return arbPathSegment()
}

/**
 * Generates paths that should NOT trigger any redirect.
 */
function arbNonVendorPath() {
  return fc.oneof(
    fc.constant('/'),
    fc.constant('/providers'),
    fc.constant('/dashboard/providers'),
    fc.constant('/api/providers'),
    fc.constant('/booking'),
    fc.constant('/services'),
    arbPathSegment().map(seg => `/${seg}`),
    arbPathSegment().map(seg => `/dashboard/${seg}`)
  ).filter(path =>
    !path.startsWith('/vendors') &&
    !path.startsWith('/dashboard/vendors') &&
    !path.startsWith('/api/vendors') &&
    path !== '/booking/service' &&
    !path.startsWith('/booking/multi-vendor')
  )
}

// ── Property 17: Legacy URL redirect mapping ──

describe('Feature: unified-business-model, Property 17: Legacy URL redirect mapping', () => {
  test('Any path matching /vendors/* gets redirected with status 301', () => {
    fc.assert(
      fc.property(
        arbVendorsPath(),
        (path) => {
          const result = resolveRedirect(path)
          return result !== null && result.statusCode === 301
        }
      ),
      { numRuns: 100 }
    )
  })

  test('Any path matching /dashboard/vendors/* gets redirected with status 301', () => {
    fc.assert(
      fc.property(
        arbDashboardVendorsPath(),
        (path) => {
          const result = resolveRedirect(path)
          return result !== null && result.statusCode === 301
        }
      ),
      { numRuns: 100 }
    )
  })

  test('Any path matching /api/vendors/* gets redirected with status 301', () => {
    fc.assert(
      fc.property(
        arbApiVendorsPath(),
        (path) => {
          const result = resolveRedirect(path)
          return result !== null && result.statusCode === 301
        }
      ),
      { numRuns: 100 }
    )
  })

  test('/booking/multi-vendor/* gets redirected to /booking/bundle/* with status 301', () => {
    fc.assert(
      fc.property(
        arbSubPath(),
        (sub) => {
          const path = `/booking/multi-vendor${sub}`
          const result = resolveRedirect(path)
          if (result === null) return false
          if (result.statusCode !== 301) return false
          return result.redirectTo === `/booking/bundle${sub}`
        }
      ),
      { numRuns: 100 }
    )
  })

  test('The redirect target replaces "vendors" with "providers" in the path', () => {
    fc.assert(
      fc.property(
        fc.oneof(arbVendorsPath(), arbDashboardVendorsPath(), arbApiVendorsPath()),
        (path) => {
          const result = resolveRedirect(path)
          if (result === null) return false
          // The redirect target should have "providers" where "vendors" was
          const expected = path.replace('/vendors', '/providers')
          return result.redirectTo === expected
        }
      ),
      { numRuns: 100 }
    )
  })

  test('Non-vendor paths return null (no redirect)', () => {
    fc.assert(
      fc.property(
        arbNonVendorPath(),
        (path) => {
          const result = resolveRedirect(path)
          return result === null
        }
      ),
      { numRuns: 100 }
    )
  })

  test('/booking/service with vendor query param gets redirected to /booking with status 301', () => {
    fc.assert(
      fc.property(
        arbVendorParam(),
        (vendorValue) => {
          const url = new URL(`http://localhost/booking/service?vendor=${vendorValue}`)
          const result = resolveRedirect('/booking/service', url)
          return result !== null && result.statusCode === 301 && result.redirectTo === '/booking'
        }
      ),
      { numRuns: 100 }
    )
  })
})
