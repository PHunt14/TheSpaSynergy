/**
 * Unit Tests for Legacy URL Redirect Middleware
 *
 * Tests the resolveRedirect function for all vendor → provider URL mappings.
 * Requirements: 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 13.4, 13.5
 */

import { describe, test, expect } from '@jest/globals'
import { resolveRedirect } from '../../middleware.ts'

describe('resolveRedirect', () => {
  describe('/vendors → /providers', () => {
    test('redirects /vendors to /providers', () => {
      const result = resolveRedirect('/vendors')
      expect(result).not.toBeNull()
      expect(result.redirectTo).toBe('/providers')
      expect(result.statusCode).toBe(301)
    })

    test('redirects /vendors/ to /providers/', () => {
      const result = resolveRedirect('/vendors/')
      expect(result).not.toBeNull()
      expect(result.redirectTo).toBe('/providers/')
      expect(result.statusCode).toBe(301)
    })

    test('redirects /vendors/[id] to /providers/[id]', () => {
      const result = resolveRedirect('/vendors/abc123')
      expect(result).not.toBeNull()
      expect(result.redirectTo).toBe('/providers/abc123')
      expect(result.statusCode).toBe(301)
    })

    test('redirects /vendors/some-vendor-id/details to /providers/some-vendor-id/details', () => {
      const result = resolveRedirect('/vendors/some-vendor-id/details')
      expect(result).not.toBeNull()
      expect(result.redirectTo).toBe('/providers/some-vendor-id/details')
      expect(result.statusCode).toBe(301)
    })
  })

  describe('/dashboard/vendors → /dashboard/providers', () => {
    test('redirects /dashboard/vendors to /dashboard/providers', () => {
      const result = resolveRedirect('/dashboard/vendors')
      expect(result).not.toBeNull()
      expect(result.redirectTo).toBe('/dashboard/providers')
      expect(result.statusCode).toBe(301)
    })

    test('redirects /dashboard/vendors/ to /dashboard/providers/', () => {
      const result = resolveRedirect('/dashboard/vendors/')
      expect(result).not.toBeNull()
      expect(result.redirectTo).toBe('/dashboard/providers/')
      expect(result.statusCode).toBe(301)
    })

    test('redirects /dashboard/vendors/[id] to /dashboard/providers/[id]', () => {
      const result = resolveRedirect('/dashboard/vendors/vendor-123')
      expect(result).not.toBeNull()
      expect(result.redirectTo).toBe('/dashboard/providers/vendor-123')
      expect(result.statusCode).toBe(301)
    })
  })

  describe('/api/vendors → /api/providers', () => {
    test('redirects /api/vendors to /api/providers', () => {
      const result = resolveRedirect('/api/vendors')
      expect(result).not.toBeNull()
      expect(result.redirectTo).toBe('/api/providers')
      expect(result.statusCode).toBe(301)
    })

    test('redirects /api/vendors/ to /api/providers/', () => {
      const result = resolveRedirect('/api/vendors/')
      expect(result).not.toBeNull()
      expect(result.redirectTo).toBe('/api/providers/')
      expect(result.statusCode).toBe(301)
    })

    test('redirects /api/vendors/[id] to /api/providers/[id]', () => {
      const result = resolveRedirect('/api/vendors/v-001')
      expect(result).not.toBeNull()
      expect(result.redirectTo).toBe('/api/providers/v-001')
      expect(result.statusCode).toBe(301)
    })
  })

  describe('/booking/service?vendor=X → /booking', () => {
    test('redirects /booking/service with vendor param to /booking', () => {
      const url = new URL('http://localhost/booking/service?vendor=kera-studio')
      const result = resolveRedirect('/booking/service', url)
      expect(result).not.toBeNull()
      expect(result.redirectTo).toBe('/booking')
      expect(result.statusCode).toBe(301)
    })

    test('redirects /booking/service with vendor param and other params to /booking', () => {
      const url = new URL('http://localhost/booking/service?vendor=winsome&date=2024-01-01')
      const result = resolveRedirect('/booking/service', url)
      expect(result).not.toBeNull()
      expect(result.redirectTo).toBe('/booking')
      expect(result.statusCode).toBe(301)
    })

    test('does NOT redirect /booking/service without vendor param', () => {
      const url = new URL('http://localhost/booking/service')
      const result = resolveRedirect('/booking/service', url)
      expect(result).toBeNull()
    })

    test('does NOT redirect /booking/service with empty vendor param', () => {
      const url = new URL('http://localhost/booking/service?vendor=')
      // URL with empty vendor param still has the key
      const result = resolveRedirect('/booking/service', url)
      expect(result).not.toBeNull()
      expect(result.redirectTo).toBe('/booking')
    })
  })

  describe('/booking/multi-vendor → /booking/bundle', () => {
    test('redirects /booking/multi-vendor to /booking/bundle', () => {
      const result = resolveRedirect('/booking/multi-vendor')
      expect(result).not.toBeNull()
      expect(result.redirectTo).toBe('/booking/bundle')
      expect(result.statusCode).toBe(301)
    })

    test('redirects /booking/multi-vendor/ to /booking/bundle/', () => {
      const result = resolveRedirect('/booking/multi-vendor/')
      expect(result).not.toBeNull()
      expect(result.redirectTo).toBe('/booking/bundle/')
      expect(result.statusCode).toBe(301)
    })
  })

  describe('non-matching paths return null', () => {
    test('does not redirect /providers', () => {
      const result = resolveRedirect('/providers')
      expect(result).toBeNull()
    })

    test('does not redirect /booking', () => {
      const result = resolveRedirect('/booking')
      expect(result).toBeNull()
    })

    test('does not redirect /dashboard/providers', () => {
      const result = resolveRedirect('/dashboard/providers')
      expect(result).toBeNull()
    })

    test('does not redirect /api/providers', () => {
      const result = resolveRedirect('/api/providers')
      expect(result).toBeNull()
    })

    test('does not redirect /services', () => {
      const result = resolveRedirect('/services')
      expect(result).toBeNull()
    })

    test('does not redirect /booking/bundle', () => {
      const result = resolveRedirect('/booking/bundle')
      expect(result).toBeNull()
    })
  })

  describe('all redirects use status 301', () => {
    test('all matched redirects return statusCode 301', () => {
      const paths = [
        '/vendors',
        '/vendors/abc',
        '/dashboard/vendors',
        '/api/vendors',
        '/booking/multi-vendor',
      ]

      for (const path of paths) {
        const result = resolveRedirect(path)
        expect(result).not.toBeNull()
        expect(result.statusCode).toBe(301)
      }
    })
  })
})
