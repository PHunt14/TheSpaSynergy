import { refreshSquareToken, isTokenExpiringSoon } from '../square-token-enhanced';

/**
 * Single source of truth for WHO receives house money (house fees, custom
 * charges, and any other house-routed payment).
 *
 * House money must always land in ONE specific account — the house owner
 * (Stacey), never any other staff who happen to share the house vendor. Several
 * payment paths previously resolved "any connected staff on the house vendor",
 * which could route money to the wrong person (e.g. Trinity). This module
 * centralizes and constrains that decision.
 *
 * The house payee is chosen deterministically:
 *   1. If SiteSettings has key `housePayeeStaffId`, use that exact staff record
 *      (explicit admin override).
 *   2. Otherwise, the staff on the house vendor whose email matches the house
 *      Vendor's own email — i.e. the owner. (For The Kera Studio this is
 *      thekerastudio@gmail.com = Stacey; other house staff like Trinity have a
 *      different/empty email and are never selected.)
 *
 * We deliberately do NOT fall back to "any connected staff", so house money
 * can never silently route to the wrong person. If the designated payee has no
 * usable credentials, we fall back only to vendor-level credentials on the
 * house Vendor record, and otherwise fail.
 */

export interface HouseCredentials {
  accessToken: string;
  locationId: string;
  /** The resolved payee staff visibleId, when routed via a staff record. */
  staffId?: string;
  /** How the credentials were resolved, for auditing. */
  source: 'house_staff' | 'house_vendor';
}

const HOUSE_PAYEE_SETTING_KEY = 'housePayeeStaffId';

/**
 * Finds the house vendor record (isHouse === true), or null.
 */
export async function getHouseVendor(dataClient: any): Promise<any | null> {
  const { data: vendors } = await dataClient.models.Vendor.list();
  return (vendors || []).find((v: any) => v.isHouse === true) || null;
}

/**
 * Resolves the single designated house payee staff record for the given house
 * vendor. Returns null if no designated payee can be identified.
 */
export async function resolveHousePayeeStaff(dataClient: any, houseVendor: any): Promise<any | null> {
  if (!houseVendor) return null;

  // StaffSchedule access is required to identify the payee staff. If the model
  // isn't available (or errors), there is no staff to resolve — return null so
  // the caller falls back to vendor-level credentials.
  const listByVendor = dataClient?.models?.StaffSchedule?.listStaffScheduleByVendorId;
  if (typeof listByVendor !== 'function') return null;

  let staff: any[] = [];
  try {
    const { data: houseStaffList } = await listByVendor({ vendorId: houseVendor.vendorId });
    staff = houseStaffList || [];
  } catch {
    return null;
  }

  // 1. Explicit admin override via SiteSettings.
  try {
    const getSetting = dataClient?.models?.SiteSettings?.get;
    if (typeof getSetting === 'function') {
      const { data: setting } = await getSetting({ settingKey: HOUSE_PAYEE_SETTING_KEY });
      const overrideId = setting?.settingValue;
      if (overrideId) {
        const match = staff.find((s: any) => s.visibleId === overrideId);
        if (match) return match;
      }
    }
  } catch {
    // SiteSettings lookup is best-effort; fall through to owner-email match.
  }

  // 2. Owner match: the staff member whose email matches the house vendor's email.
  const vendorEmail = (houseVendor.email || '').trim().toLowerCase();
  if (vendorEmail) {
    const owner = staff.find((s: any) => (s.staffEmail || '').trim().toLowerCase() === vendorEmail);
    if (owner) return owner;
  }

  return null;
}

/**
 * Resolves usable Square credentials for the house payee, refreshing an
 * expiring/expired token when possible.
 *
 * Resolution order (never "any connected staff"):
 *   1. The designated house payee staff (owner or SiteSettings override).
 *   2. Vendor-level credentials on the house Vendor record.
 *
 * Returns null when no usable house credentials exist.
 */
export async function resolveHousePayeeCredentials(
  dataClient: any,
  houseVendor: any
): Promise<HouseCredentials | null> {
  if (!houseVendor) return null;

  const payee = await resolveHousePayeeStaff(dataClient, houseVendor);

  if (
    payee &&
    payee.squareAccessToken &&
    payee.squareLocationId &&
    payee.squareOAuthStatus !== 'error' &&
    payee.squareOAuthStatus !== 'disconnected'
  ) {
    let accessToken = payee.squareAccessToken as string;
    const locationId = payee.squareLocationId as string;

    if (isTokenExpiringSoon(payee.squareTokenExpiresAt)) {
      const refresh = await refreshSquareToken(payee.visibleId);
      if (refresh.success && refresh.newAccessToken) {
        accessToken = refresh.newAccessToken;
      }
      // If refresh failed but the token is not hard-expired, proceed with current token.
    }

    return { accessToken, locationId, staffId: payee.visibleId, source: 'house_staff' };
  }

  // Fall back to vendor-level credentials on the house Vendor record.
  if (houseVendor.squareAccessToken && houseVendor.squareLocationId) {
    return {
      accessToken: houseVendor.squareAccessToken,
      locationId: houseVendor.squareLocationId,
      source: 'house_vendor',
    };
  }

  return null;
}
