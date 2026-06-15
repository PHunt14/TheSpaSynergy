/**
 * Staff Eligibility Resolver
 *
 * Determines which staff members are eligible for a given service
 * based on the service's allowedStaff configuration and staff active status.
 *
 * Requirements: 3.3, 3.4, 3.7, 5.1
 */

/**
 * Returns all active staff eligible to perform the given service.
 *
 * - If allowedStaff is null or empty, all active staff are eligible.
 * - If allowedStaff has specific IDs, only active staff with matching IDs are eligible.
 *
 * @param {{ serviceId: string, name: string, allowedStaff: string[] | null }} service
 * @param {{ visibleId: string, staffName: string, vendorId: string, isActive: boolean }[]} allStaff
 * @returns {{ visibleId: string, staffName: string, vendorId: string, isActive: boolean }[]}
 */
export function getEligibleStaff(service, allStaff) {
  const activeStaff = allStaff.filter(s => s.isActive)

  if (!service.allowedStaff || service.allowedStaff.length === 0) {
    return activeStaff
  }

  return activeStaff.filter(s => service.allowedStaff.includes(s.visibleId))
}

/**
 * Returns true if at least one active staff member is eligible for the service.
 *
 * @param {{ serviceId: string, name: string, allowedStaff: string[] | null }} service
 * @param {{ visibleId: string, staffName: string, vendorId: string, isActive: boolean }[]} allStaff
 * @returns {boolean}
 */
export function isServiceBookable(service, allStaff) {
  return getEligibleStaff(service, allStaff).length > 0
}
