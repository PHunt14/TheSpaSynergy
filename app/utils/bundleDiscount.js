/**
 * Bundle Discount Calculator
 *
 * Pure utility functions for calculating bundle pricing, distributing discounts
 * across vendors, and validating bundle service selections.
 */

/**
 * Calculates the discount for a bundle based on BundleSettings tier or pre-defined bundle discount.
 * Pure function — no I/O.
 *
 * For custom bundles (predefinedBundle is null): uses BundleSettings tier discounts
 *   - 2 services → discount2Services
 *   - 3 services → discount3Services
 *   - 4+ services → discount4PlusServices
 * For pre-defined bundles: uses the bundle's discountPercent
 *
 * @param {Object} params
 * @param {Array} params.services - Array of service objects with price
 * @param {Object|null} params.predefinedBundle - Pre-defined bundle with discountPercent, or null for custom
 * @param {Object} params.bundleSettings - BundleSettings record with tier discounts
 * @returns {{ subtotal: number, discountPercent: number, discountAmount: number, total: number }}
 */
export function calculateBundlePrice({ services, predefinedBundle, bundleSettings }) {
  const subtotal = services.reduce((sum, s) => sum + (s.price || 0), 0)

  let discountPercent = 0

  if (predefinedBundle) {
    // Pre-defined bundle: use the bundle's discount percentage
    discountPercent = predefinedBundle.discountPercent || 0
  } else if (bundleSettings) {
    // Custom bundle: use tier-based discount from BundleSettings
    const serviceCount = services.length
    if (serviceCount >= 4) {
      discountPercent = bundleSettings.discount4PlusServices || 0
    } else if (serviceCount === 3) {
      discountPercent = bundleSettings.discount3Services || 0
    } else if (serviceCount === 2) {
      discountPercent = bundleSettings.discount2Services || 0
    }
  }

  const discountAmount = roundCents(subtotal * discountPercent / 100)
  const total = roundCents(subtotal - discountAmount)

  return { subtotal, discountPercent, discountAmount, total }
}

/**
 * Distributes a bundle discount proportionally across vendors based on their share of the undiscounted total.
 * Each vendor's discount share = (vendor undiscounted total / overall undiscounted total) × discountAmount
 *
 * @param {Array} services - Array of service objects with price, vendorId, serviceId, houseFeeEnabled, houseFeeAmount
 * @param {number} discountAmount - Total discount to distribute
 * @param {string} houseVendorId - House vendor ID
 * @returns {Array<{ vendorId: string, serviceId: string, originalPrice: number, discountedPrice: number, houseFee: number, vendorNet: number }>}
 */
export function distributeDiscountAcrossVendors(services, discountAmount, houseVendorId) {
  const subtotal = services.reduce((sum, s) => sum + (s.price || 0), 0)

  // Handle edge case: if subtotal is 0, no discount to distribute
  if (subtotal === 0) {
    return services.map(s => ({
      vendorId: s.vendorId,
      serviceId: s.serviceId,
      originalPrice: s.price || 0,
      discountedPrice: 0,
      houseFee: 0,
      vendorNet: 0
    }))
  }

  const breakdown = []
  let distributedDiscount = 0

  for (let i = 0; i < services.length; i++) {
    const service = services[i]
    const originalPrice = service.price || 0

    // Proportional discount for this service
    let serviceDiscount
    if (i === services.length - 1) {
      // Last service gets the remainder to avoid rounding drift
      serviceDiscount = roundCents(discountAmount - distributedDiscount)
    } else {
      serviceDiscount = roundCents((originalPrice / subtotal) * discountAmount)
      distributedDiscount += serviceDiscount
    }

    const discountedPrice = roundCents(originalPrice - serviceDiscount)

    // House fee: deducted from the discounted price if enabled
    let houseFee = 0
    if (service.houseFeeEnabled && service.vendorId !== houseVendorId) {
      houseFee = roundCents(service.houseFeeAmount || 0)
    }

    const vendorNet = roundCents(discountedPrice - houseFee)

    breakdown.push({
      vendorId: service.vendorId,
      serviceId: service.serviceId,
      originalPrice,
      discountedPrice,
      houseFee,
      vendorNet
    })
  }

  return breakdown
}

/**
 * Validates that a set of services meets bundle requirements:
 * - At least 2 distinct vendors
 * - Between 2 and 10 services (inclusive)
 * - All services are active
 *
 * @param {Array} services - Array of service objects with vendorId, isActive
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateBundleServices(services) {
  if (!services || !Array.isArray(services)) {
    return { valid: false, error: 'Services must be a non-empty array' }
  }

  // Check service count: 2-10 inclusive
  if (services.length < 2) {
    return { valid: false, error: 'Bundle requires at least 2 services' }
  }

  if (services.length > 10) {
    return { valid: false, error: 'Maximum 10 services per bundle' }
  }

  // Check all services are active
  const inactiveService = services.find(s => s.isActive === false)
  if (inactiveService) {
    const name = inactiveService.name || inactiveService.serviceId || 'Unknown'
    return { valid: false, error: `Service ${name} is no longer available` }
  }

  // Check at least 2 distinct vendors (skip check if services are global/vendor-less)
  const uniqueVendors = new Set(services.map(s => s.vendorId).filter(Boolean))
  if (uniqueVendors.size >= 1 && uniqueVendors.size < 2 && services.every(s => s.vendorId)) {
    return { valid: false, error: 'Bundle requires services from at least 2 vendors' }
  }

  return { valid: true, error: null }
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Rounds a number to 2 decimal places (cents).
 */
function roundCents(value) {
  return Math.round(value * 100) / 100
}
