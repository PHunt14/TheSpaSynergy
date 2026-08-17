/**
 * Entity Verification for Booking Endpoints
 *
 * Verifies that requested staffId and vendorId exist and are active
 * before executing conflict checks. Returns HTTP 404 if either entity
 * is invalid or inactive.
 *
 * Requirements: 11.7
 */

export interface EntityVerificationResult {
  valid: boolean;
  error?: string;
  statusCode?: number;
}

/**
 * Verifies that a staff member exists and is active.
 * Queries StaffSchedule by visibleId.
 *
 * Returns { valid: true } if staff exists and is active.
 * Returns { valid: false, error, statusCode: 404 } if staff not found or inactive.
 */
export async function verifyStaffEntity(
  client: any,
  staffId: string
): Promise<EntityVerificationResult> {
  const { data: staff } = await client.models.StaffSchedule.get({ visibleId: staffId });

  if (!staff) {
    return { valid: false, error: 'Staff member not found', statusCode: 404 };
  }

  if (staff.isActive === false) {
    return { valid: false, error: 'Staff member not found', statusCode: 404 };
  }

  return { valid: true };
}

/**
 * Verifies that a vendor exists and is active.
 * Queries Vendor by vendorId.
 *
 * Returns { valid: true } if vendor exists and is active.
 * Returns { valid: false, error, statusCode: 404 } if vendor not found or inactive.
 */
export async function verifyVendorEntity(
  client: any,
  vendorId: string
): Promise<EntityVerificationResult> {
  const { data: vendor } = await client.models.Vendor.get({ vendorId });

  if (!vendor) {
    return { valid: false, error: 'Vendor not found', statusCode: 404 };
  }

  if (vendor.isActive === false) {
    return { valid: false, error: 'Vendor not found', statusCode: 404 };
  }

  return { valid: true };
}

/**
 * Verifies both staff and vendor entities in a single call.
 * Skips verification for any ID that is not provided (undefined/null/empty).
 *
 * Returns { valid: true } if all provided entities are valid and active.
 * Returns the first failing result if any entity is invalid.
 */
export async function verifyBookingEntities(
  client: any,
  staffId?: string | null,
  vendorId?: string | null
): Promise<EntityVerificationResult> {
  // Verify staff if provided
  if (staffId) {
    const staffResult = await verifyStaffEntity(client, staffId);
    if (!staffResult.valid) {
      return staffResult;
    }
  }

  // Verify vendor if provided
  if (vendorId) {
    const vendorResult = await verifyVendorEntity(client, vendorId);
    if (!vendorResult.valid) {
      return vendorResult;
    }
  }

  return { valid: true };
}
