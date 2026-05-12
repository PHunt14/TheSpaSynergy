/**
 * Bundle Payment Split Calculator
 *
 * Pure utility function for calculating multi-vendor payment splits
 * with proportional discount distribution. Output is compatible with
 * the existing `processBundlePayment` infrastructure.
 */

/**
 * Calculates the payment split for a multi-vendor bundle with discount distribution.
 * Pure function — no I/O.
 *
 * @param {Object} params
 * @param {Array} params.services - Array of service objects with price, vendorId, houseFeeEnabled, houseFeeAmount
 * @param {number} params.discountAmount - Total discount applied to the bundle
 * @param {string} params.houseVendorId - House vendor ID
 * @returns {{ total: number, houseFee: number, vendorShares: Array<{ vendorId: string, amount: number }>, bundlePayments: Array<{ vendorId: string, amount: number, isHouseFee: boolean }> }}
 */
export function calculateBundlePaymentSplit({ services, discountAmount, houseVendorId }) {
  const subtotal = services.reduce((sum, s) => sum + (s.price || 0), 0)
  const total = roundCents(subtotal - discountAmount)

  // Handle edge case: if subtotal is 0, no split to calculate
  if (subtotal === 0) {
    return { total: 0, houseFee: 0, vendorShares: [], bundlePayments: [] }
  }

  // Group services by vendor
  const vendorServices = groupServicesByVendor(services)
  const vendorEntries = Array.from(vendorServices.entries())

  // Calculate per-vendor discounted totals and house fees
  const vendorBreakdowns = calculateVendorBreakdowns(vendorEntries, subtotal, discountAmount, houseVendorId)

  const totalHouseFee = roundCents(vendorBreakdowns.reduce((sum, b) => sum + b.houseFee, 0))

  // Build vendorShares array
  const vendorShares = vendorBreakdowns.map(({ vendorId, netAmount }) => ({
    vendorId,
    amount: netAmount
  }))

  // Build bundlePayments array compatible with processBundlePayment
  const bundlePayments = buildBundlePayments(vendorShares, totalHouseFee, houseVendorId)

  return { total, houseFee: totalHouseFee, vendorShares, bundlePayments }
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Groups services by vendorId.
 */
function groupServicesByVendor(services) {
  const vendorServices = new Map()
  for (const service of services) {
    const vid = service.vendorId
    if (!vendorServices.has(vid)) {
      vendorServices.set(vid, [])
    }
    vendorServices.get(vid).push(service)
  }
  return vendorServices
}

/**
 * Calculates per-vendor discount, house fees, and net amounts.
 */
function calculateVendorBreakdowns(vendorEntries, subtotal, discountAmount, houseVendorId) {
  const breakdowns = []
  let distributedDiscount = 0

  for (let i = 0; i < vendorEntries.length; i++) {
    const [vendorId, vendorServiceList] = vendorEntries[i]
    const vendorUndiscountedTotal = vendorServiceList.reduce((sum, s) => sum + (s.price || 0), 0)

    // Proportional discount: last vendor gets remainder to avoid rounding drift
    const isLast = i === vendorEntries.length - 1
    const vendorDiscount = isLast
      ? roundCents(discountAmount - distributedDiscount)
      : roundCents((vendorUndiscountedTotal / subtotal) * discountAmount)

    if (!isLast) {
      distributedDiscount += vendorDiscount
    }

    const vendorDiscountedTotal = roundCents(vendorUndiscountedTotal - vendorDiscount)
    const houseFee = calculateVendorHouseFee(vendorServiceList, vendorId, houseVendorId)
    const netAmount = roundCents(vendorDiscountedTotal - houseFee)

    breakdowns.push({ vendorId, houseFee, netAmount })
  }

  return breakdowns
}

/**
 * Calculates house fees for a vendor's services.
 * House vendor does not pay house fees to itself.
 */
function calculateVendorHouseFee(vendorServiceList, vendorId, houseVendorId) {
  if (vendorId === houseVendorId) {
    return 0
  }
  const fee = vendorServiceList.reduce((sum, s) => {
    return s.houseFeeEnabled ? sum + (s.houseFeeAmount || 0) : sum
  }, 0)
  return roundCents(fee)
}

/**
 * Builds the bundlePayments array compatible with processBundlePayment.
 */
function buildBundlePayments(vendorShares, totalHouseFee, houseVendorId) {
  const bundlePayments = []

  // Add house fee payment to house vendor (if any)
  if (totalHouseFee > 0) {
    bundlePayments.push({
      vendorId: houseVendorId,
      amount: totalHouseFee,
      isHouseFee: true
    })
  }

  // Add each vendor's net share
  for (const { vendorId, amount } of vendorShares) {
    if (amount > 0) {
      bundlePayments.push({
        vendorId,
        amount,
        isHouseFee: false
      })
    }
  }

  return bundlePayments
}

/**
 * Rounds a number to 2 decimal places (cents).
 */
function roundCents(value) {
  return Math.round(value * 100) / 100
}
