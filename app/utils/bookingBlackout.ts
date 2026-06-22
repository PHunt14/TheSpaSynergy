/**
 * Shared utility for checking booking blackout status.
 *
 * Used by bundle-availability, availability/sequential, and bundles/book
 * routes to enforce global and vendor-level booking blackouts.
 */

export interface BlackoutResult {
  blocked: boolean;
  globalUntil?: string;
  disabledVendors?: string[];
}

/**
 * Checks global and vendor-level booking blackouts for a set of services.
 *
 * @param client - Amplify data client with models.SiteSettings and models.Vendor
 * @param services - Array of service objects with vendorId
 * @returns BlackoutResult indicating whether booking is blocked and why
 */
export async function checkBookingBlackout(
  client: any,
  services: { vendorId: string }[]
): Promise<BlackoutResult> {
  // Check global booking blackout
  const { data: globalSetting } = await client.models.SiteSettings.get({ settingKey: 'globalBookingDisabledUntil' });
  const globalUntil = globalSetting?.settingValue;
  if (globalUntil && new Date(globalUntil) > new Date()) {
    return { blocked: true, globalUntil };
  }

  // Check vendor-level booking blackouts
  const uniqueVendorIds = [...new Set(services.map(s => s.vendorId))];
  const vendorPromises = uniqueVendorIds.map(vid => client.models.Vendor.get({ vendorId: vid }));
  const vendorResults = await Promise.all(vendorPromises);

  const disabledVendors: string[] = [];
  for (const vr of vendorResults) {
    if (vr.data) {
      const vendorUntil = vr.data.bookingDisabledUntil as string | null;
      if (vendorUntil && new Date(vendorUntil) > new Date()) {
        disabledVendors.push(vr.data.name || vr.data.vendorId);
      }
    }
  }

  if (disabledVendors.length > 0) {
    return { blocked: true, disabledVendors };
  }

  return { blocked: false };
}
