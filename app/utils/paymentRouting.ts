/**
 * Payment Routing Service
 *
 * Routes payments to the correct Square account based on staff assignment.
 * Handles house fee splitting and credential resolution with fallback logic.
 *
 * Resolution chain:
 * 1. Use staff's own Square credentials if squareOAuthStatus !== "error"
 *    and access token exists and locationId exists
 * 2. Fall back to provider's Square credentials if staff lacks them
 * 3. If neither available, block online payment (throw PaymentRouteError)
 *
 * House fee calculation:
 * - If service.houseFeeEnabled === true, houseFeeAmount = service.houseFeeAmount (fixed dollar)
 * - staffAmount = service.price - houseFeeAmount
 * - houseFeeCredentials = houseProvider's Square credentials
 *
 * Requirements: 6.1, 6.2, 6.4, 10.2, 10.3
 */

export interface SquareCredentials {
  accessToken: string;
  locationId: string;
}

export interface PaymentRouteResult {
  staffSquareCredentials: SquareCredentials | null;
  providerSquareCredentials: SquareCredentials | null;
  effectiveCredentials: SquareCredentials;
  houseFeeAmount: number;
  houseFeeCredentials: SquareCredentials | null;
  staffAmount: number;
}

export interface StaffSchedule {
  visibleId: string;
  staffName?: string;
  vendorId: string;
  isActive: boolean;
  squareAccessToken?: string;
  squareRefreshToken?: string;
  squareLocationId?: string;
  squareMerchantId?: string;
  squareOAuthStatus: string;
  [key: string]: unknown;
}

export interface Vendor {
  vendorId: string;
  name: string;
  email: string;
  isActive: boolean;
  isHouse: boolean;
  squareAccessToken?: string;
  squareRefreshToken?: string;
  squareLocationId?: string;
  squareMerchantId?: string;
  squareOAuthStatus: string;
  [key: string]: unknown;
}

export interface Service {
  serviceId: string;
  name: string;
  price: number;
  houseFeeEnabled: boolean;
  houseFeeAmount: number;
  [key: string]: unknown;
}

export interface Appointment {
  appointmentId: string;
  vendorId: string;
  serviceId: string;
  staffId?: string;
  [key: string]: unknown;
}

/**
 * Custom error class for payment routing failures.
 * Thrown when neither the staff member nor their provider have valid
 * Square credentials, meaning online payment must be blocked.
 */
export class PaymentRouteError extends Error {
  public code: string;

  constructor(message: string) {
    super(message);
    this.name = 'PaymentRouteError';
    this.code = 'NO_SQUARE_CREDENTIALS';
  }
}

/**
 * Determines whether a staff member has valid Square credentials.
 * A staff member has valid credentials if:
 * - squareOAuthStatus is NOT "error"
 * - squareAccessToken exists and is non-empty
 * - squareLocationId exists and is non-empty
 */
function hasValidSquareCredentials(
  entity: { squareAccessToken?: string; squareLocationId?: string; squareOAuthStatus: string }
): boolean {
  return (
    entity.squareOAuthStatus !== 'error' &&
    !!entity.squareAccessToken &&
    entity.squareAccessToken.trim() !== '' &&
    !!entity.squareLocationId &&
    entity.squareLocationId.trim() !== ''
  );
}

/**
 * Extracts Square credentials from a staff member or provider entity.
 * Returns null if the entity does not have valid credentials.
 */
function extractCredentials(
  entity: { squareAccessToken?: string; squareLocationId?: string; squareOAuthStatus: string }
): SquareCredentials | null {
  if (!hasValidSquareCredentials(entity)) {
    return null;
  }
  return {
    accessToken: entity.squareAccessToken!,
    locationId: entity.squareLocationId!,
  };
}

// --- New credential resolution types and functions (Requirement 2.1–2.4, 2.7) ---

export interface CredentialResolutionResult {
  credentials: SquareCredentials;
  source: 'staff' | 'sibling_staff' | 'house';
  staffId?: string;
  vendorId?: string;
  resolutionPath: string[]; // e.g., ['staff:invalid', 'sibling:none', 'house:resolved']
}

export interface CredentialResolutionError {
  code: 'NO_CREDENTIALS';
  message: string;
  inPersonRequired: true;
  staffName: string;
  vendorName: string;
}

/**
 * Checks whether an entity has valid Square credentials.
 * Valid means:
 * - squareAccessToken is non-empty and non-whitespace
 * - squareLocationId is non-empty and non-whitespace
 * - squareOAuthStatus is NOT 'error'
 */
export function hasValidCredentials(entity: {
  squareAccessToken?: string;
  squareLocationId?: string;
  squareOAuthStatus?: string;
}): boolean {
  const tokenValid = !!entity.squareAccessToken && entity.squareAccessToken.trim() !== '';
  const locationValid = !!entity.squareLocationId && entity.squareLocationId.trim() !== '';
  const statusValid = entity.squareOAuthStatus !== 'error';
  return tokenValid && locationValid && statusValid;
}

/**
 * Checks whether two credential sets are identical (same accessToken and locationId).
 */
export function credentialsMatch(a: SquareCredentials, b: SquareCredentials): boolean {
  return a.accessToken === b.accessToken && a.locationId === b.locationId;
}

/**
 * Resolves Square credentials via the three-level fallback chain:
 * 1. Staff's own credentials (if valid: non-error status, non-empty token+locationId)
 * 2. Sibling staff on same vendor (first with squareOAuthStatus === 'connected' and valid token+locationId)
 * 3. House provider's credentials (just needs non-empty token+locationId, regardless of status)
 *
 * Special case: if staff.vendorId === houseProvider.vendorId (house-is-vendor),
 * skip sibling check and resolve directly to house.
 *
 * Returns CredentialResolutionResult on success or CredentialResolutionError when
 * no valid credentials exist at any level.
 */
export function resolveCredentialChain(
  staff: StaffSchedule,
  siblingStaff: StaffSchedule[],
  houseProvider: Vendor
): CredentialResolutionResult | CredentialResolutionError {
  const resolutionPath: string[] = [];

  // House-is-vendor case: skip sibling check, go straight to house if staff invalid
  const houseIsVendor = staff.vendorId === houseProvider.vendorId;

  // Step (a): Check staff's own credentials
  if (hasValidCredentials(staff)) {
    resolutionPath.push('staff:resolved');
    return {
      credentials: {
        accessToken: staff.squareAccessToken!,
        locationId: staff.squareLocationId!,
      },
      source: 'staff',
      staffId: staff.visibleId,
      vendorId: staff.vendorId,
      resolutionPath,
    };
  }

  resolutionPath.push('staff:invalid');

  // Step (b): Check sibling staff on same vendor (skip if house-is-vendor)
  if (!houseIsVendor) {
    const sibling = siblingStaff.find((s) => hasValidCredentials(s));

    if (sibling) {
      resolutionPath.push('sibling:resolved');
      return {
        credentials: {
          accessToken: sibling.squareAccessToken!,
          locationId: sibling.squareLocationId!,
        },
        source: 'sibling_staff',
        staffId: sibling.visibleId,
        vendorId: sibling.vendorId,
        resolutionPath,
      };
    }

    resolutionPath.push('sibling:none');
  } else {
    resolutionPath.push('sibling:skipped_house_is_vendor');
  }

  // Step (c): Check house provider credentials
  // For house provider, we do NOT require squareOAuthStatus !== 'error' —
  // just check that token and locationId are non-empty.
  const houseTokenValid = !!houseProvider.squareAccessToken && houseProvider.squareAccessToken.trim() !== '';
  const houseLocationValid = !!houseProvider.squareLocationId && houseProvider.squareLocationId.trim() !== '';

  if (houseTokenValid && houseLocationValid) {
    resolutionPath.push('house:resolved');
    return {
      credentials: {
        accessToken: houseProvider.squareAccessToken!,
        locationId: houseProvider.squareLocationId!,
      },
      source: 'house',
      vendorId: houseProvider.vendorId,
      resolutionPath,
    };
  }

  resolutionPath.push('house:invalid');

  // No valid credentials found at any level
  return {
    code: 'NO_CREDENTIALS',
    message: `Cannot process online payment: no valid Square credentials found for staff "${staff.staffName || staff.visibleId}" (vendor "${houseProvider.name}") at any level. In-person payment is required.`,
    inPersonRequired: true,
    staffName: staff.staffName || staff.visibleId,
    vendorName: houseProvider.name,
  };
}

// --- Existing payment route resolution (kept for backward compatibility) ---

/**
 * Resolves the payment route for a booking.
 *
 * Routes house fee to house provider's Square account and the remainder
 * to the staff member's Square credentials (with fallback to provider).
 *
 * @param appointment - The appointment being paid for
 * @param staff - The staff member assigned to the appointment
 * @param provider - The provider (vendor) the staff member belongs to
 * @param service - The service being performed
 * @param houseProvider - The house provider (Stacey's account) for house fee routing
 * @returns PaymentRouteResult with credentials and amounts
 * @throws PaymentRouteError if no valid Square credentials are available
 */
export function resolvePaymentRoute(
  appointment: Appointment,
  staff: StaffSchedule,
  provider: Vendor,
  service: Service,
  houseProvider: Vendor
): PaymentRouteResult {
  // Extract staff and provider credentials
  const staffSquareCredentials = extractCredentials(staff);
  const providerSquareCredentials = extractCredentials(provider);

  // Resolve effective credentials using the resolution chain:
  // 1. Staff's own credentials if valid
  // 2. Fall back to provider's credentials
  // 3. If neither available, block online payment
  const effectiveCredentials = staffSquareCredentials ?? providerSquareCredentials;

  if (!effectiveCredentials) {
    throw new PaymentRouteError(
      `Cannot process online payment: neither staff member "${staff.staffName || staff.visibleId}" nor provider "${provider.name}" have valid Square credentials. In-person payment is required.`
    );
  }

  // Calculate house fee only when enabled and configured.
  let houseFeeAmount = 0;
  let houseFeeCredentials: SquareCredentials | null = null;

  if (service.houseFeeEnabled && service.houseFeeAmount > 0) {
    houseFeeAmount = service.houseFeeAmount;

    // House fee credentials come from the house provider.
    // The house vendor uses vendor-level credentials (not staff OAuth), so we only
    // require a token and locationId — squareOAuthStatus may be 'disconnected' even
    // when credentials are valid (vendor-level tokens are set directly, not via OAuth flow).
    houseFeeCredentials =
      houseProvider.squareAccessToken && houseProvider.squareAccessToken.trim() !== '' &&
      houseProvider.squareLocationId && houseProvider.squareLocationId.trim() !== ''
        ? { accessToken: houseProvider.squareAccessToken!, locationId: houseProvider.squareLocationId! }
        : extractCredentials(houseProvider);

    if (!houseFeeCredentials) {
      throw new PaymentRouteError(
        `Cannot process house fee: house provider "${houseProvider.name}" does not have valid Square credentials.`
      );
    }
  }

  // Staff gets the remainder after house fee
  const staffAmount = service.price - houseFeeAmount;

  return {
    staffSquareCredentials,
    providerSquareCredentials,
    effectiveCredentials,
    houseFeeAmount,
    houseFeeCredentials,
    staffAmount,
  };
}
