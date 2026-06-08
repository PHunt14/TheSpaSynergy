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
  houseFeeCredentials: SquareCredentials;
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

  // Calculate house fee
  let houseFeeAmount = 0;
  if (service.houseFeeEnabled && service.houseFeeAmount > 0) {
    houseFeeAmount = service.houseFeeAmount;
  }

  // Staff gets the remainder after house fee
  const staffAmount = service.price - houseFeeAmount;

  // House fee credentials come from the house provider
  const houseFeeCredentials = extractCredentials(houseProvider);
  if (!houseFeeCredentials) {
    throw new PaymentRouteError(
      `Cannot process house fee: house provider "${houseProvider.name}" does not have valid Square credentials.`
    );
  }

  return {
    staffSquareCredentials,
    providerSquareCredentials,
    effectiveCredentials,
    houseFeeAmount,
    houseFeeCredentials,
    staffAmount,
  };
}
