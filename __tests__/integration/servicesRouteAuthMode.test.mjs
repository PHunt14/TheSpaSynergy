/**
 * Regression tests for GET /api/services auth mode.
 *
 * Background:
 *   The `Service` and `ServiceCategory` models are authorized with
 *   `allow.publicApiKey()` only, and the schema's `defaultAuthorizationMode`
 *   is `apiKey`. The route previously built its Amplify client with
 *   `generateServerClientUsingCookies`, which authorizes using the Cognito
 *   user pool (cookie session). Public booking-page visitors have no session,
 *   and even authenticated providers are not authorized to read `Service`
 *   under user-pool auth, so every `Service.list()` call was rejected and the
 *   route returned HTTP 500 ({"error":"Failed to fetch services"}).
 *
 *   This surfaced as an empty service list on BOTH the customer-facing
 *   booking page and the provider dashboard.
 *
 * The fix routes all Service/ServiceCategory operations through the shared
 * `client` from `@/lib/auth` (`generateClient()`), which uses the public API
 * key by default — matching the working `/api/providers` route.
 *
 * These tests import the REAL route handler and assert it queries through the
 * shared apiKey client and returns services. They would fail if the route
 * regressed back to a client whose `Service.list()` is unauthorized.
 */

import { jest } from '@jest/globals'

// ── Shared mock state ─────────────────────────────────────────

const mockServiceDb = {}

const mockServiceList = jest.fn(async ({ filter } = {}) => {
  const all = Object.values(mockServiceDb)
  // Mirror the route's default filter: isActive !== false
  if (filter?.isActive?.ne === false) {
    return { data: all.filter((s) => s.isActive !== false), errors: undefined }
  }
  return { data: all, errors: undefined }
})

// Field the route must NOT request in its selection set. `Service.vendorId` is
// declared non-nullable in the schema, but many records store null, so
// selecting it makes AppSync fail the whole list query. See route.ts.
const VENDOR_ID_FIELD = 'vendorId'

// The shared apiKey client from `@/lib/auth`.
const apiKeyClient = {
  models: {
    Service: { list: mockServiceList },
    ServiceCategory: { list: jest.fn(async () => ({ data: [] })) },
  },
}

const mockGetCurrentUser = jest.fn(async () => null)

// ── Module mocks ──────────────────────────────────────────────

// The critical mock: the route must consume the shared apiKey client.
jest.unstable_mockModule('@/lib/auth', () => ({
  client: apiKeyClient,
  getCurrentUser: mockGetCurrentUser,
}))

// Error-logging middleware is a pass-through in tests, so a thrown error
// would surface rather than being masked.
jest.unstable_mockModule('@/lib/logger/middleware', () => ({
  withErrorLogging: (handler) => handler,
}))

// Peripheral imports the route pulls in at module load — stub them so the
// module can be imported in a Node test environment.
jest.unstable_mockModule('next/headers', () => ({
  cookies: jest.fn(async () => ({ get: jest.fn(), set: jest.fn(), delete: jest.fn() })),
}))
jest.unstable_mockModule('aws-amplify', () => ({ Amplify: { configure: jest.fn() } }))
jest.unstable_mockModule('aws-amplify/auth/server', () => ({ fetchAuthSession: jest.fn(async () => ({})) }))
jest.unstable_mockModule('@aws-amplify/adapter-nextjs', () => ({
  createServerRunner: jest.fn(() => ({ runWithAmplifyServerContext: jest.fn(async () => null) })),
}))
// Guard: if the route ever re-imports the cookie client, this mock throws so
// the regression is caught immediately instead of silently 500-ing.
jest.unstable_mockModule('@aws-amplify/adapter-nextjs/data', () => ({
  generateServerClientUsingCookies: jest.fn(() => {
    throw new Error('Service route must not use the cookie/user-pool client')
  }),
}))
jest.unstable_mockModule('../../amplify_outputs.json', () => ({ default: {} }), { virtual: true })
jest.unstable_mockModule('../../app/utils/accessControl', () => ({
  isAuthorized: jest.fn(() => true),
  getServiceAuthorization: jest.fn(() => ({ allowed: true })),
}))
jest.unstable_mockModule('../../app/utils/categoryValidator', () => ({
  validateCategoryName: jest.fn(() => ({ valid: true })),
}))
jest.unstable_mockModule('../../app/utils/squareCatalogSync', () => ({
  syncAllowedStaffChanges: jest.fn(async () => []),
}))

// ── Helpers ───────────────────────────────────────────────────

function seedService(s) {
  mockServiceDb[s.serviceId] = { isActive: true, ...s }
}
function resetDb() {
  Object.keys(mockServiceDb).forEach((k) => delete mockServiceDb[k])
}
function makeRequest(url = 'https://thespasynergy.com/api/services') {
  return { url, method: 'GET' }
}

// ── Tests ─────────────────────────────────────────────────────

describe('GET /api/services — uses public apiKey client (regression: empty service list)', () => {
  let route

  beforeAll(async () => {
    route = await import('../../app/api/services/route.ts')
  })

  beforeEach(() => {
    resetDb()
    jest.clearAllMocks()
  })

  test('returns active services fetched through the shared apiKey client', async () => {
    seedService({ serviceId: 'svc-1', name: 'Sauna - 25 min', price: 40, duration: 25, isActive: true })
    seedService({ serviceId: 'svc-2', name: 'Foot Soak', price: 20, duration: 15, isActive: true })

    const res = await route.GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(mockServiceList).toHaveBeenCalledTimes(1)
    expect(body.services).toHaveLength(2)
    expect(body.services.map((s) => s.serviceId).sort()).toEqual(['svc-1', 'svc-2'])
  })

  test('applies the default active-only filter (isActive !== false)', async () => {
    seedService({ serviceId: 'svc-active', name: 'Active', price: 10, duration: 10, isActive: true })
    seedService({ serviceId: 'svc-inactive', name: 'Inactive', price: 10, duration: 10, isActive: false })

    const res = await route.GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    // The route passes { isActive: { ne: false } } to the client by default.
    expect(mockServiceList).toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.objectContaining({ isActive: { ne: false } }) })
    )
    expect(body.services.map((s) => s.serviceId)).toEqual(['svc-active'])
  })

  test('includeInactive=true returns all services with no filter', async () => {
    seedService({ serviceId: 'svc-active', name: 'Active', price: 10, duration: 10, isActive: true })
    seedService({ serviceId: 'svc-inactive', name: 'Inactive', price: 10, duration: 10, isActive: false })

    const res = await route.GET(makeRequest('https://thespasynergy.com/api/services?includeInactive=true'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(mockServiceList).toHaveBeenCalledWith(expect.not.objectContaining({ filter: expect.anything() }))
    expect(body.services).toHaveLength(2)
  })

  test('normalizes categories to an array for the frontend', async () => {
    seedService({ serviceId: 'svc-cat', name: 'Legacy Category', price: 10, duration: 10, category: 'Massage' })

    const res = await route.GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.services[0].categories).toEqual(['Massage'])
  })

  test('requests an explicit selection set that OMITS the non-nullable vendorId field', async () => {
    // Regression guard for the "Cannot return null for non-nullable type:
    // 'String' ... vendorId" AppSync error that blanked the whole catalog.
    seedService({ serviceId: 'svc-1', name: 'Sauna', price: 40, duration: 25 })

    await route.GET(makeRequest())

    expect(mockServiceList).toHaveBeenCalledTimes(1)
    const listArgs = mockServiceList.mock.calls[0][0]
    expect(listArgs).toHaveProperty('selectionSet')
    expect(Array.isArray(listArgs.selectionSet)).toBe(true)
    expect(listArgs.selectionSet).not.toContain(VENDOR_ID_FIELD)
    // Sanity: it still selects the fields the frontend relies on.
    expect(listArgs.selectionSet).toEqual(
      expect.arrayContaining(['serviceId', 'name', 'price', 'duration', 'isActive', 'categories'])
    )
  })

  test('serves partial data when the client reports NON-fatal field errors (does not 500)', async () => {
    // AppSync can return the valid records alongside field-level errors for a
    // few bad rows. The route must still serve what came back.
    mockServiceList.mockResolvedValueOnce({
      data: [
        { serviceId: 'svc-ok-1', name: 'Good One', price: 10, duration: 10, isActive: true },
        { serviceId: 'svc-ok-2', name: 'Good Two', price: 20, duration: 20, isActive: true },
      ],
      errors: [{ message: "Cannot return null for non-nullable type: 'String' ... vendorId" }],
    })

    const res = await route.GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.services).toHaveLength(2)
  })

  test('returns 500 only when the client reports errors AND no data came back', async () => {
    // e.g. a true authorization failure or total query rejection.
    mockServiceList.mockResolvedValueOnce({ data: null, errors: [{ message: 'Not Authorized to access list on type Service' }] })

    const res = await route.GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toBe('Failed to fetch services')
  })
})
