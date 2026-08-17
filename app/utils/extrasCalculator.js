/**
 * Extras Calculator
 *
 * Pure utility functions for calculating extras pricing and filtering
 * available extras based on group size and active status.
 */

/**
 * Calculates the cost of selected extras based on group size.
 * Per-person extras multiply the unit price by groupSize; flat-price extras use price as-is.
 *
 * @param {Array} extras - Array of Extra objects with { extraId, name, price, perPerson }
 * @param {number} groupSize - Number of people in the booking (integer >= 1)
 * @returns {{ items: Array<{ extraId: string, name: string, unitPrice: number, quantity: number, total: number }>, grandTotal: number }}
 */
export function calculateExtrasCost(extras, groupSize) {
  const safeGroupSize = Math.max(1, Math.floor(groupSize) || 1)

  const items = (extras || []).map(extra => {
    const unitPrice = extra.price || 0
    const quantity = extra.perPerson ? safeGroupSize : 1
    const total = roundCents(unitPrice * quantity)

    return {
      extraId: extra.extraId,
      name: extra.name,
      unitPrice,
      quantity,
      total
    }
  })

  const grandTotal = roundCents(items.reduce((sum, item) => sum + item.total, 0))

  return { items, grandTotal }
}

/**
 * Filters extras to only those available for the given group size.
 * Excludes inactive extras and group-only extras when groupSize < 3.
 *
 * @param {Array} extras - Array of Extra objects with { isActive, groupOnly, ... }
 * @param {number} groupSize - Number of people in the booking (integer)
 * @returns {Array} Filtered array of available extras
 */
export function filterAvailableExtras(extras, groupSize) {
  if (!extras || !Array.isArray(extras)) {
    return []
  }

  return extras.filter(extra => {
    // Exclude inactive extras
    if (!extra.isActive) {
      return false
    }

    // Exclude group-only extras when group size is less than 3
    if (extra.groupOnly && groupSize < 3) {
      return false
    }

    return true
  })
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Rounds a number to 2 decimal places (cents).
 */
function roundCents(value) {
  return Math.round(value * 100) / 100
}
