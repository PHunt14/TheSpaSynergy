/**
 * Property-Based Tests for Extra ID Validation
 *
 * Uses fast-check to validate that the validateExtras function correctly
 * accepts arrays of Extra IDs where all conditions are met (exists in catalog,
 * isActive, assigned to bundle, at most 20 IDs) and rejects any array that
 * violates one or more conditions.
 *
 * Feature: booking-enhancements, Property 10: Extra ID validation
 *
 * **Validates: Requirements 5.3, 5.5**
 */

import fc from 'fast-check'
import { validateExtras } from '../../app/utils/bookingValidation.js'

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a unique Extra ID string.
 */
function arbExtraId() {
  return fc.uuid()
}

/**
 * Generates a bundle ID string.
 */
function arbBundleId() {
  return fc.uuid()
}

/**
 * Generates a valid catalog entry that is active and assigned to the given bundleId.
 */
function arbValidCatalogEntry(extraId, bundleId) {
  return fc.record({
    extraId: fc.constant(extraId),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    isActive: fc.constant(true),
    assignedBundleIds: fc.constant([bundleId]),
    price: fc.double({ min: 0.01, max: 99999.99, noNaN: true }),
    perPerson: fc.boolean()
  })
}

/**
 * Generates a valid catalog and selection scenario:
 * - A bundle ID
 * - A catalog of extras (all active, all assigned to the bundle)
 * - A subset of IDs from that catalog (at most 20)
 */
function arbValidScenario() {
  return arbBundleId().chain((bundleId) =>
    fc.integer({ min: 1, max: 20 }).chain((catalogSize) =>
      fc.array(arbExtraId(), { minLength: catalogSize, maxLength: catalogSize }).chain((ids) => {
        // Ensure unique IDs
        const uniqueIds = [...new Set(ids)]
        if (uniqueIds.length === 0) {
          return fc.constant(null)
        }
        const catalogEntries = uniqueIds.map((id) => ({
          extraId: id,
          name: `Extra ${id.slice(0, 8)}`,
          isActive: true,
          assignedBundleIds: [bundleId],
          price: 10.0,
          perPerson: false
        }))
        // Select a subset of IDs (1 to min(20, uniqueIds.length))
        const maxSelect = Math.min(20, uniqueIds.length)
        return fc.subarray(uniqueIds, { minLength: 1, maxLength: maxSelect }).map((selectedIds) => ({
          bundleId,
          catalog: catalogEntries,
          selectedIds
        }))
      })
    )
  ).filter((v) => v !== null)
}

/**
 * Generates a scenario where an Extra ID does not exist in the catalog.
 */
function arbMissingIdScenario() {
  return arbBundleId().chain((bundleId) =>
    fc.tuple(
      arbExtraId(), // ID that will be in catalog
      arbExtraId()  // ID that will NOT be in catalog
    ).filter(([inCatalog, notInCatalog]) => inCatalog !== notInCatalog)
      .map(([inCatalogId, missingId]) => ({
        bundleId,
        catalog: [{
          extraId: inCatalogId,
          name: 'Valid Extra',
          isActive: true,
          assignedBundleIds: [bundleId],
          price: 10.0,
          perPerson: false
        }],
        selectedIds: [missingId]
      }))
  )
}

/**
 * Generates a scenario where an Extra ID exists but is inactive.
 */
function arbInactiveScenario() {
  return fc.tuple(arbExtraId(), arbBundleId()).map(([extraId, bundleId]) => ({
    bundleId,
    catalog: [{
      extraId,
      name: 'Inactive Extra',
      isActive: false,
      assignedBundleIds: [bundleId],
      price: 10.0,
      perPerson: false
    }],
    selectedIds: [extraId]
  }))
}

/**
 * Generates a scenario where an Extra ID exists and is active but NOT assigned to the bundle.
 */
function arbNotAssignedScenario() {
  return fc.tuple(arbExtraId(), arbBundleId(), arbBundleId())
    .filter(([, bundleId, otherBundleId]) => bundleId !== otherBundleId)
    .map(([extraId, bundleId, otherBundleId]) => ({
      bundleId,
      catalog: [{
        extraId,
        name: 'Unassigned Extra',
        isActive: true,
        assignedBundleIds: [otherBundleId], // Assigned to different bundle
        price: 10.0,
        perPerson: false
      }],
      selectedIds: [extraId]
    }))
}

/**
 * Generates a scenario with more than 20 Extra IDs (exceeds maximum).
 */
function arbTooManyIdsScenario() {
  return fc.tuple(
    arbBundleId(),
    fc.integer({ min: 21, max: 50 })
  ).chain(([bundleId, count]) =>
    fc.array(arbExtraId(), { minLength: count, maxLength: count }).map((ids) => {
      const uniqueIds = [...new Set(ids)]
      // Ensure we have more than 20 unique IDs
      if (uniqueIds.length <= 20) {
        // Generate enough by appending suffixes
        while (uniqueIds.length <= 20) {
          uniqueIds.push(`extra-overflow-${uniqueIds.length}-${Math.random()}`)
        }
      }
      const catalog = uniqueIds.map((id) => ({
        extraId: id,
        name: `Extra ${id.slice(0, 8)}`,
        isActive: true,
        assignedBundleIds: [bundleId],
        price: 10.0,
        perPerson: false
      }))
      return {
        bundleId,
        catalog,
        selectedIds: uniqueIds
      }
    })
  )
}

// ── Property 10: Extra ID validation ──────────────────────────

describe('Feature: booking-enhancements, Property 10: Extra ID validation', () => {
  test('valid arrays (at most 20, all exist, all active, all assigned) are accepted', () => {
    fc.assert(
      fc.property(
        arbValidScenario(),
        ({ bundleId, catalog, selectedIds }) => {
          const result = validateExtras(selectedIds, bundleId, catalog)
          return result.valid === true && result.errors.length === 0
        }
      ),
      { numRuns: 100 }
    )
  })

  test('empty array is always accepted', () => {
    fc.assert(
      fc.property(
        arbBundleId(),
        fc.array(fc.record({
          extraId: arbExtraId(),
          name: fc.string({ minLength: 1 }),
          isActive: fc.boolean(),
          assignedBundleIds: fc.array(arbBundleId()),
          price: fc.double({ min: 0.01, max: 100, noNaN: true }),
          perPerson: fc.boolean()
        }), { minLength: 0, maxLength: 10 }),
        (bundleId, catalog) => {
          const result = validateExtras([], bundleId, catalog)
          return result.valid === true && result.errors.length === 0
        }
      ),
      { numRuns: 100 }
    )
  })

  test('Extra ID not found in catalog results in rejection identifying the invalid ID', () => {
    fc.assert(
      fc.property(
        arbMissingIdScenario(),
        ({ bundleId, catalog, selectedIds }) => {
          const result = validateExtras(selectedIds, bundleId, catalog)
          return (
            result.valid === false &&
            result.errors.length > 0 &&
            result.errors.some((err) => err.includes(selectedIds[0]))
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  test('inactive Extra results in rejection identifying the invalid ID', () => {
    fc.assert(
      fc.property(
        arbInactiveScenario(),
        ({ bundleId, catalog, selectedIds }) => {
          const result = validateExtras(selectedIds, bundleId, catalog)
          return (
            result.valid === false &&
            result.errors.length > 0 &&
            result.errors.some((err) => err.includes(selectedIds[0]))
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  test('Extra not assigned to bundle results in rejection identifying the invalid ID', () => {
    fc.assert(
      fc.property(
        arbNotAssignedScenario(),
        ({ bundleId, catalog, selectedIds }) => {
          const result = validateExtras(selectedIds, bundleId, catalog)
          return (
            result.valid === false &&
            result.errors.length > 0 &&
            result.errors.some((err) => err.includes(selectedIds[0]))
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  test('more than 20 Extra IDs results in rejection', () => {
    fc.assert(
      fc.property(
        arbTooManyIdsScenario(),
        ({ bundleId, catalog, selectedIds }) => {
          const result = validateExtras(selectedIds, bundleId, catalog)
          return result.valid === false && result.errors.length > 0
        }
      ),
      { numRuns: 100 }
    )
  })

  test('biconditional: valid if and only if all conditions are met', () => {
    fc.assert(
      fc.property(
        arbBundleId(),
        fc.array(arbExtraId(), { minLength: 1, maxLength: 25 }),
        (bundleId, ids) => {
          const uniqueIds = [...new Set(ids)]
          // Build a catalog where some entries are valid, some are not
          const catalog = uniqueIds.map((id, idx) => ({
            extraId: id,
            name: `Extra ${id.slice(0, 8)}`,
            isActive: idx % 3 !== 1, // every 3rd one (index 1,4,7...) is inactive
            assignedBundleIds: idx % 5 !== 2 ? [bundleId] : ['other-bundle'], // every 5th one (index 2,7,12...) is unassigned
            price: 10.0,
            perPerson: false
          }))

          const result = validateExtras(uniqueIds, bundleId, catalog)

          // Determine expected validity:
          // Valid if: count <= 20 AND all exist AND all active AND all assigned
          const withinLimit = uniqueIds.length <= 20
          const allValid = uniqueIds.every((id) => {
            const entry = catalog.find((e) => e.extraId === id)
            return entry && entry.isActive && entry.assignedBundleIds.includes(bundleId)
          })
          const expectedValid = withinLimit && allValid

          return result.valid === expectedValid
        }
      ),
      { numRuns: 100 }
    )
  })
})
