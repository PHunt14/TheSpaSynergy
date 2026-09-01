/**
 * Tests for house-payee selection (lib/payment/houseAccount.ts).
 *
 * House money (house fees, custom charges, split-payment capture/refunds) must
 * ALWAYS route to the single designated house payee — the house owner (Stacey,
 * whose email matches the house vendor's email) — and NEVER to another staff
 * member on the house vendor (e.g. Trinity). A SiteSettings override takes
 * precedence when present.
 */

import { resolveHousePayeeStaff, resolveHousePayeeCredentials } from '../../lib/payment/houseAccount.ts'

const HOUSE_VENDOR = { vendorId: 'vendor-kera-studio', email: 'thekerastudio@gmail.com', isHouse: true }

const stacey = {
  visibleId: 'staff-kera-stacey',
  staffName: 'Stacey',
  staffEmail: 'thekerastudio@gmail.com',
  vendorId: 'vendor-kera-studio',
  isActive: true,
  squareAccessToken: 'stacey-tok',
  squareLocationId: 'stacey-loc',
  squareRefreshToken: 'stacey-refresh',
  squareOAuthStatus: 'connected',
  squareTokenExpiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
}
const trinity = {
  visibleId: 'staff-kera-trinity',
  staffName: 'Trinity',
  staffEmail: '',
  vendorId: 'vendor-kera-studio',
  isActive: true,
  squareAccessToken: 'trinity-tok',
  squareLocationId: 'trinity-loc',
  squareRefreshToken: 'trinity-refresh',
  squareOAuthStatus: 'connected',
  squareTokenExpiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
}

/** Builds a mock Amplify data client with the given staff list and optional SiteSettings map. */
function makeDataClient({ staff = [], settings = {} } = {}) {
  return {
    models: {
      StaffSchedule: {
        listStaffScheduleByVendorId: async ({ vendorId }) => ({
          data: staff.filter((s) => s.vendorId === vendorId),
        }),
        get: async ({ visibleId }) => ({ data: staff.find((s) => s.visibleId === visibleId) || null }),
      },
      SiteSettings: {
        get: async ({ settingKey }) =>
          settingKey in settings ? { data: { settingKey, settingValue: settings[settingKey] } } : { data: null },
      },
      Vendor: { list: async () => ({ data: [HOUSE_VENDOR] }) },
    },
  }
}

describe('resolveHousePayeeStaff', () => {
  test('selects the owner (email matches house vendor email) — Stacey, not Trinity', async () => {
    const dc = makeDataClient({ staff: [trinity, stacey] })
    const payee = await resolveHousePayeeStaff(dc, HOUSE_VENDOR)
    expect(payee?.visibleId).toBe('staff-kera-stacey')
  })

  test('order does not matter — still selects Stacey when Trinity is first', async () => {
    const dc = makeDataClient({ staff: [trinity, stacey] })
    const payee = await resolveHousePayeeStaff(dc, HOUSE_VENDOR)
    expect(payee?.staffName).toBe('Stacey')
  })

  test('SiteSettings housePayeeStaffId override takes precedence', async () => {
    // Even if an override points at Trinity, it is honored (explicit admin choice).
    const dc = makeDataClient({ staff: [trinity, stacey], settings: { housePayeeStaffId: 'staff-kera-trinity' } })
    const payee = await resolveHousePayeeStaff(dc, HOUSE_VENDOR)
    expect(payee?.visibleId).toBe('staff-kera-trinity')
  })

  test('invalid override id falls back to owner-email match', async () => {
    const dc = makeDataClient({ staff: [trinity, stacey], settings: { housePayeeStaffId: 'does-not-exist' } })
    const payee = await resolveHousePayeeStaff(dc, HOUSE_VENDOR)
    expect(payee?.visibleId).toBe('staff-kera-stacey')
  })

  test('no owner-email match and no override → null (never picks an arbitrary staff)', async () => {
    const noOwner = { ...stacey, visibleId: 'staff-x', staffEmail: 'someoneelse@example.com' }
    const dc = makeDataClient({ staff: [trinity, noOwner] })
    const payee = await resolveHousePayeeStaff(dc, HOUSE_VENDOR)
    expect(payee).toBeNull()
  })
})

describe('resolveHousePayeeCredentials', () => {
  test('returns Stacey credentials, not Trinity', async () => {
    const dc = makeDataClient({ staff: [trinity, stacey] })
    const creds = await resolveHousePayeeCredentials(dc, HOUSE_VENDOR)
    expect(creds?.source).toBe('house_staff')
    expect(creds?.staffId).toBe('staff-kera-stacey')
    expect(creds?.accessToken).toBe('stacey-tok')
    expect(creds?.locationId).toBe('stacey-loc')
  })

  test('falls back to vendor-level creds when no designated payee has credentials', async () => {
    const houseVendorWithCreds = { ...HOUSE_VENDOR, squareAccessToken: 'vendor-tok', squareLocationId: 'vendor-loc' }
    // Stacey present but without Square connection
    const staceyNoSquare = { ...stacey, squareAccessToken: null, squareLocationId: null, squareRefreshToken: null }
    const dc = makeDataClient({ staff: [trinity, staceyNoSquare] })
    const creds = await resolveHousePayeeCredentials(dc, houseVendorWithCreds)
    expect(creds?.source).toBe('house_vendor')
    expect(creds?.accessToken).toBe('vendor-tok')
  })

  test('returns null when neither payee nor vendor has credentials', async () => {
    const staceyNoSquare = { ...stacey, squareAccessToken: null, squareLocationId: null, squareRefreshToken: null }
    const dc = makeDataClient({ staff: [trinity, staceyNoSquare] })
    const creds = await resolveHousePayeeCredentials(dc, HOUSE_VENDOR)
    expect(creds).toBeNull()
  })
})
