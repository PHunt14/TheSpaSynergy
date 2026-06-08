/**
 * Staff Eligibility Resolver
 *
 * Determines which staff members can perform a given service based on the
 * service's `allowedStaff` configuration. Used in booking flow, availability
 * calculations, and service display logic.
 *
 * Rules:
 * - If `allowedStaff` is null or empty → all active staff are eligible (dynamic "All")
 * - If `allowedStaff` has specific IDs → only active staff with matching IDs are eligible
 * - A service is bookable only if it has at least one active eligible staff member
 */

export interface Service {
  serviceId: string;
  name: string;
  allowedStaff: string[] | null;
  [key: string]: unknown;
}

export interface StaffSchedule {
  visibleId: string;
  staffName?: string;
  vendorId: string;
  isActive: boolean;
  [key: string]: unknown;
}

/**
 * Returns the list of staff members eligible to perform a given service.
 *
 * - If the service's `allowedStaff` is null, undefined, or an empty array,
 *   all active staff members are eligible (dynamic "All" semantics).
 * - If `allowedStaff` contains specific staff IDs, only active staff whose
 *   `visibleId` matches one of those IDs are eligible.
 *
 * @param service - The service to check eligibility for
 * @param allStaff - The full list of staff members in the system
 * @returns Array of eligible staff members (active and matching allowedStaff criteria)
 */
export function getEligibleStaff(
  service: Service,
  allStaff: StaffSchedule[]
): StaffSchedule[] {
  const allowedStaff = service.allowedStaff;

  // If allowedStaff is null, undefined, or empty → all active staff are eligible
  if (!allowedStaff || allowedStaff.length === 0) {
    return allStaff.filter((staff) => staff.isActive);
  }

  // If allowedStaff has specific IDs → only active staff with matching IDs
  return allStaff.filter(
    (staff) => staff.isActive && allowedStaff.includes(staff.visibleId)
  );
}

/**
 * Determines whether a service is bookable.
 *
 * A service is bookable only if at least one active staff member is eligible
 * to perform it. This prevents services with no available staff from appearing
 * in the client booking flow.
 *
 * @param service - The service to check
 * @param allStaff - The full list of staff members in the system
 * @returns true if the service has at least one active eligible staff member
 */
export function isServiceBookable(
  service: Service,
  allStaff: StaffSchedule[]
): boolean {
  return getEligibleStaff(service, allStaff).length > 0;
}
