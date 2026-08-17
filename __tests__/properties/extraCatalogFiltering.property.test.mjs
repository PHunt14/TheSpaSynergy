/**
 * Property-Based Tests for Extra Catalog Active Filtering
 *
 * Uses fast-check to validate that when querying available extras for a given bundle,
 * only extras where `isActive === true` AND `assignedBundleIds` includes the queried
 * bundle ID appear in the result set. No inactive extras ever appear in customer-facing selection.
 *
 * Feature: booking-enhancements, Property 6: Extra catalog active filtering
 *
 * **Validates: Requirements 3.10, 4.6**
 */

import fc from 'fast-check'
import { filterAvailableExtras } from '../../app/utils/extrasCalculator.js'

// ── Filtering Logic (mirrors API route behavior) ──────────────

/**
 * Filters extras for a given bundle by combining:
 * 1. Bundle assignment check (assignedBundleIds includes bundleId)
 * 2. Active/group filtering via filterAvailableExtras
 *
 * This replicates the logic used in the GET /api/extras?bundleId={id} route.
 */
function filterExtrasForBundle(catalog, bundleId, groupSize) {
  // Step 1: Filter to only extras assigned to this bundle
  const bundleExtras = (catalog || []).filter(
    (extra) => Array.isArray(extra.assignedBundleIds) && extra.assignedBundleIds.includes(bundleId)
  )
  // Step 2: Apply active/groupOnly filtering
  return filterAvailableExtras(bundleExtras, groupSize)
}

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a bundle ID.
 */
function arbBundleId() {
  return fc.uuid()
}

/**
 * Generates a group size (1 to 20).
 */
function arbGroupSize() {
  return fc.integer({ min: 1, max: 20 })
}

/**
 * Generates an extra with controlled isActive and assignedBundleIds fields.
 */
function arbExtra({ isActive, assignedBundleIds, groupOnly }) {
  return fc.record({
    extraId: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    price: fc.integer({ min: 1, max: 999999 }).map((v) => v / 100),
    perPerson: fc.boolean(),
    groupOnly: fc.constant(groupOnly ?? false),
    isActive: fc.constant(isActive),
    assignedBundleIds: fc.constant(assignedBundleIds),
  })
}

/**
 * Generates a catalog with a mix of:
 * - Active extras assigned to the target bundle
 * - Active extras NOT assigned to the target bundle
 * - Inactive extras assigned to the target bundle
 * - Inactive extras NOT assigned to the target bundle
 */
function arbMixedCatalog(bundleId) {
  const otherBundleId = `other-${bundleId}`

  const activeAssigned = arbExtra({ isActive: true, assignedBundleIds: [bundleId], groupOnly: false })
  const activeNotAssigned = arbExtra({ isActive: true, assignedBundleIds: [otherBundleId], groupOnly: false })
  const inactiveAssigned = arbExtra({ isActive: false, assignedBundleIds: [bundleId], groupOnly: false })
  const inactiveNotAssigned = arbExtra({ isActive: false, assignedBundleIds: [otherBundleId], groupOnly: false })

  return fc.array(
    fc.oneof(activeAssigned, activeNotAssigned, inactiveAssigned, inactiveNotAssigned),
    { minLength: 1, maxLength: 15 }
  )
}

/**
 * Generates a catalog with mixed active/inactive and various bundle assignments
 * including extras assigned to multiple bundles.
 */
function arbCatalogWithMultiBundleAssignments() {
  return arbBundleId().chain((bundleId) => {
    const otherBundleId1 = `other1-${bundleId}`
    const otherBundleId2 = `other2-${bundleId}`

    const activeAssignedSingle = arbExtra({ isActive: true, assignedBundleIds: [bundleId], groupOnly: false })
    const activeAssignedMulti = arbExtra({ isActive: true, assignedBundleIds: [bundleId, otherBundleId1], groupOnly: false })
    const activeOtherOnly = arbExtra({ isActive: true, assignedBundleIds: [otherBundleId1, otherBundleId2], groupOnly: false })
    const inactiveAssigned = arbExtra({ isActive: false, assignedBundleIds: [bundleId], groupOnly: false })
    const activeEmptyAssignment = arbExtra({ isActive: true, assignedBundleIds: [], groupOnly: false })

    return fc.tuple(
      fc.constant(bundleId),
      fc.array(
        fc.oneof(activeAssignedSingle, activeAssignedMulti, activeOtherOnly, inactiveAssigned, activeEmptyAssignment),
        { minLength: 1, maxLength: 15 }
      ),
      arbGroupSize()
    )
  })
}

// ── Property 6: Extra catalog active filtering ────────────────

describe('Feature: booking-enhancements, Property 6: Extra catalog active filtering', () => {
  test('result set contains only extras where isActive === true AND assignedBundleIds includes queried bundleId', () => {
    fc.assert(
      fc.property(
        arbCatalogWithMultiBundleAssignments(),
        ([bundleId, catalog, groupSize]) => {
          const result = filterExtrasForBundle(catalog, bundleId, groupSize)

          // Every item in result must be active AND assigned to this bundle
          return result.every(
            (extra) =>
              extra.isActive === true &&
              Array.isArray(extra.assignedBundleIds) &&
              extra.assignedBundleIds.includes(bundleId)
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  test('no inactive extras ever appear in the filtered result', () => {
    fc.assert(
      fc.property(
        arbBundleId(),
        fc.array(
          fc.oneof(
            arbExtra({ isActive: true, assignedBundleIds: ['some-bundle'], groupOnly: false }),
            arbExtra({ isActive: false, assignedBundleIds: ['some-bundle'], groupOnly: false })
          ),
          { minLength: 1, maxLength: 15 }
        ),
        arbGroupSize(),
        (bundleId, catalog, groupSize) => {
          // Assign all extras to the target bundle for this test
          const catalogWithBundle = catalog.map((e) => ({
            ...e,
            assignedBundleIds: [bundleId],
          }))

          const result = filterExtrasForBundle(catalogWithBundle, bundleId, groupSize)

          // No inactive extras in the result
          return result.every((extra) => extra.isActive === true)
        }
      ),
      { numRuns: 100 }
    )
  })

  test('extras not assigned to the queried bundle are excluded', () => {
    fc.assert(
      fc.property(
        arbBundleId(),
        arbBundleId(),
        arbGroupSize(),
        fc.array(
          arbExtra({ isActive: true, assignedBundleIds: ['placeholder'], groupOnly: false }),
          { minLength: 1, maxLength: 10 }
        ),
        (targetBundleId, otherBundleId, groupSize, extras) => {
          // Assign all extras to a different bundle only
          const catalog = extras.map((e) => ({
            ...e,
            assignedBundleIds: [otherBundleId],
          }))

          const result = filterExtrasForBundle(catalog, targetBundleId, groupSize)

          // If targetBundleId !== otherBundleId, no extras should appear
          if (targetBundleId !== otherBundleId) {
            return result.length === 0
          }
          return true // If they happen to be the same UUID, skip assertion
        }
      ),
      { numRuns: 100 }
    )
  })

  test('all active extras assigned to bundle are included in result (completeness)', () => {
    fc.assert(
      fc.property(
        arbBundleId(),
        arbGroupSize().filter((gs) => gs >= 3), // Use group size >= 3 to avoid groupOnly filtering
        fc.array(
          arbExtra({ isActive: true, assignedBundleIds: ['placeholder'], groupOnly: false }),
          { minLength: 1, maxLength: 10 }
        ),
        (bundleId, groupSize, extras) => {
          // Make all extras active and assigned to the bundle, not group-only
          const catalog = extras.map((e) => ({
            ...e,
            isActive: true,
            assignedBundleIds: [bundleId],
            groupOnly: false,
          }))

          const result = filterExtrasForBundle(catalog, bundleId, groupSize)

          // All extras should be present since they are all active, assigned, and non-group-only
          return result.length === catalog.length
        }
      ),
      { numRuns: 100 }
    )
  })

  test('biconditional: extra appears in result if and only if isActive AND assigned to bundle (ignoring groupOnly for large groups)', () => {
    fc.assert(
      fc.property(
        arbCatalogWithMultiBundleAssignments().map(([bundleId, catalog, _]) => [bundleId, catalog, 5]),
        ([bundleId, catalog, groupSize]) => {
          const result = filterExtrasForBundle(catalog, bundleId, groupSize)
          const resultIds = new Set(result.map((e) => e.extraId))

          // For each extra in catalog, check the biconditional
          return catalog.every((extra) => {
            const shouldBeIncluded =
              extra.isActive === true &&
              Array.isArray(extra.assignedBundleIds) &&
              extra.assignedBundleIds.includes(bundleId)

            const isIncluded = resultIds.has(extra.extraId)
            return isIncluded === shouldBeIncluded
          })
        }
      ),
      { numRuns: 100 }
    )
  })

  test('deactivating an extra removes it from customer-facing selection', () => {
    fc.assert(
      fc.property(
        arbBundleId(),
        arbGroupSize(),
        fc.array(
          arbExtra({ isActive: true, assignedBundleIds: ['placeholder'], groupOnly: false }),
          { minLength: 2, maxLength: 10 }
        ),
        fc.nat(),
        (bundleId, groupSize, extras, deactivateIndexSeed) => {
          // Build catalog with all extras assigned to bundle
          const catalog = extras.map((e) => ({
            ...e,
            assignedBundleIds: [bundleId],
          }))

          // First, all active extras assigned to bundle should be included
          const resultBefore = filterExtrasForBundle(catalog, bundleId, groupSize)
          const countBefore = resultBefore.length

          // Deactivate one extra
          const deactivateIdx = deactivateIndexSeed % catalog.length
          const updatedCatalog = catalog.map((e, idx) =>
            idx === deactivateIdx ? { ...e, isActive: false } : e
          )

          const resultAfter = filterExtrasForBundle(updatedCatalog, bundleId, groupSize)

          // The deactivated extra should not be in the result
          const deactivatedId = updatedCatalog[deactivateIdx].extraId
          return (
            resultAfter.length === countBefore - 1 &&
            !resultAfter.some((e) => e.extraId === deactivatedId)
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  test('extras with empty assignedBundleIds array are excluded from all bundle queries', () => {
    fc.assert(
      fc.property(
        arbBundleId(),
        arbGroupSize(),
        fc.array(
          arbExtra({ isActive: true, assignedBundleIds: [], groupOnly: false }),
          { minLength: 1, maxLength: 10 }
        ),
        (bundleId, groupSize, extras) => {
          const result = filterExtrasForBundle(extras, bundleId, groupSize)
          return result.length === 0
        }
      ),
      { numRuns: 100 }
    )
  })
})
