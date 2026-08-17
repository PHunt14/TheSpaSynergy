/**
 * Booking Status Determination
 *
 * Pure utility function for determining appointment booking status based on
 * client history and service resource type.
 */

/**
 * Determines the booking status based on new client flag and resource type.
 * Pure function — no I/O.
 *
 * Rules (evaluated in order):
 *   1. If isNewClient is true → "pending-confirmation" (consultation required)
 *   2. If resourceType is "sauna" or "room" → "confirmed"
 *   3. Otherwise → "pending-confirmation"
 *
 * @param {Object} params
 * @param {boolean} params.isNewClient - Whether the customer is a first-time client
 * @param {string} params.resourceType - The service resource type (e.g. "sauna", "room", "staff")
 * @param {boolean} params.requiresConsultation - Whether the service requires a consultation
 * @returns {"confirmed" | "pending-confirmation"}
 */
export function determineBookingStatus({ isNewClient, resourceType, requiresConsultation }) {
  if (isNewClient === true) {
    return "pending-confirmation"
  }

  if (resourceType === "sauna" || resourceType === "room") {
    return "confirmed"
  }

  return "pending-confirmation"
}
