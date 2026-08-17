/**
 * Booking Validation Utilities
 *
 * Pure validation functions for booking enhancement inputs:
 * - Time frame validation (case-sensitive)
 * - Text input sanitization (HTML stripping, length enforcement)
 * - Extra IDs validation (existence, active status, bundle assignment, max count)
 */

const VALID_TIME_FRAMES = ['morning', 'afternoon', 'evening']
const MAX_EXTRAS_PER_BOOKING = 20

/**
 * Validates the isNewClient field to ensure it is a literal boolean value.
 * String representations ("true", "false", "yes", "no"), numbers, null, and
 * other types are rejected.
 *
 * @param {*} value - The value to validate
 * @returns {{ valid: boolean, error: string | null }}
 */
export function validateIsNewClient(value) {
  if (value === true || value === false) {
    return { valid: true, error: null }
  }

  return {
    valid: false,
    error: 'isNewClient must be a boolean (true or false)'
  }
}

/**
 * Validates a time frame value using case-sensitive comparison.
 *
 * @param {string} value - The time frame value to validate
 * @returns {{ valid: boolean, error: string | null }}
 */
export function validateTimeFrame(value) {
  if (VALID_TIME_FRAMES.includes(value)) {
    return { valid: true, error: null }
  }

  return {
    valid: false,
    error: `Invalid timeFrame. Must be one of: ${VALID_TIME_FRAMES.join(', ')}`
  }
}

/**
 * Sanitizes customer-provided text input by stripping HTML tags and script content,
 * then enforcing a maximum character length.
 *
 * @param {string} text - The raw text input to sanitize
 * @param {number} [maxLength=500] - Maximum allowed length for the output
 * @returns {string} Sanitized string with HTML stripped and length enforced
 */
export function sanitizeTextInput(text, maxLength = 500) {
  if (text == null) {
    return ''
  }

  let sanitized = String(text)

  // Remove script tags and their content first
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')

  // Remove all remaining HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, '')

  // Trim whitespace
  sanitized = sanitized.trim()

  // Enforce max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength)
  }

  return sanitized
}

/**
 * Validates an array of Extra IDs against the catalog for a given bundle.
 * Checks: existence in catalog, active status, assignment to the bundle, and max count.
 *
 * @param {string[]} extraIds - Array of Extra IDs to validate
 * @param {string} bundleId - The bundle ID for the current booking
 * @param {Array<{ extraId: string, isActive: boolean, assignedBundleIds: string[] }>} catalog - The full Extra catalog
 * @returns {{ valid: boolean, errors: string[], validExtras: object[] }}
 */
export function validateExtras(extraIds, bundleId, catalog) {
  const errors = []
  const validExtras = []

  // Check max count
  if (!extraIds || !Array.isArray(extraIds)) {
    return { valid: true, errors: [], validExtras: [] }
  }

  if (extraIds.length > MAX_EXTRAS_PER_BOOKING) {
    return {
      valid: false,
      errors: [`Maximum ${MAX_EXTRAS_PER_BOOKING} extras per booking`],
      validExtras: []
    }
  }

  // Empty array is valid
  if (extraIds.length === 0) {
    return { valid: true, errors: [], validExtras: [] }
  }

  // Build a lookup map from catalog for efficient access
  const catalogMap = new Map()
  if (Array.isArray(catalog)) {
    for (const extra of catalog) {
      catalogMap.set(extra.extraId, extra)
    }
  }

  for (const extraId of extraIds) {
    const extra = catalogMap.get(extraId)

    if (!extra) {
      errors.push(`Extra not found: ${extraId}`)
      continue
    }

    if (!extra.isActive) {
      errors.push(`Extra is not active: ${extraId}`)
      continue
    }

    const assignedBundles = extra.assignedBundleIds || []
    if (!assignedBundles.includes(bundleId)) {
      errors.push(`Extra ${extraId} is not available for this bundle`)
      continue
    }

    validExtras.push(extra)
  }

  return {
    valid: errors.length === 0,
    errors,
    validExtras
  }
}
