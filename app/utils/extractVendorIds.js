/**
 * Extracts unique vendor IDs from a set of services.
 *
 * Pure function — no I/O.
 *
 * @param {Array} services - Array of service objects with vendorId
 * @returns {string[]} Array of unique vendorId values
 */
export function extractVendorIds(services) {
  return [...new Set(services.map(s => s.vendorId))]
}
