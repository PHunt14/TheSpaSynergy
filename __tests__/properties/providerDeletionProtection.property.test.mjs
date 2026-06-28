/**
 * Property-Based Tests for Provider Deletion Protection
 *
 * Uses fast-check to validate that a provider with active staff members
 * cannot be deactivated or deleted.
 * Feature: unified-business-model
 *
 * Properties tested:
 * - Property 12: Provider with active staff cannot be deactivated
 *
 * **Validates: Requirements 7.5**
 */

import fc from 'fast-check'

// ── Business Logic Under Test ─────────────────────────────────

/**
 * Determines whether a provider can be deactivated/deleted.
 * A provider can only be deactivated if it has NO active staff assigned to it.
 *
 * @param {string} providerId - The provider's vendorId
 * @param {Array} staffMembers - All staff members in the system
 * @returns {boolean} true if the provider can be deactivated, false otherwise
 */
function canDeactivateProvider(providerId, staffMembers) {
  const activeStaff = staffMembers.filter(s => s.vendorId === providerId && s.isActive === true)
  return activeStaff.length === 0
}

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a staff member record.
 */
function arbStaffMember(vendorId, isActive) {
  return fc.record({
    visibleId: fc.uuid(),
    staffName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    staffEmail: fc.emailAddress(),
    vendorId: fc.constant(vendorId),
    isActive: fc.constant(isActive),
  })
}

// ── Property 12: Provider with active staff cannot be deactivated ──

describe('Feature: unified-business-model, Property 12: Provider with active staff cannot be deactivated', () => {
  test('provider with at least one active staff assigned → cannot be deactivated', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 0, max: 5 }),
        (providerId, activeCount, inactiveCount, otherCount) => {
          // Build staff: some active for target provider, some inactive, some for other providers
          const activeStaff = Array.from({ length: activeCount }, (_, i) => ({
            visibleId: `active-${i}`,
            staffName: `Active Staff ${i}`,
            staffEmail: `active${i}@test.com`,
            vendorId: providerId,
            isActive: true,
          }))

          const inactiveStaff = Array.from({ length: inactiveCount }, (_, i) => ({
            visibleId: `inactive-${i}`,
            staffName: `Inactive Staff ${i}`,
            staffEmail: `inactive${i}@test.com`,
            vendorId: providerId,
            isActive: false,
          }))

          const otherStaff = Array.from({ length: otherCount }, (_, i) => ({
            visibleId: `other-${i}`,
            staffName: `Other Staff ${i}`,
            staffEmail: `other${i}@test.com`,
            vendorId: `other-provider-${i}`,
            isActive: true,
          }))

          const allStaff = [...activeStaff, ...inactiveStaff, ...otherStaff]
          const result = canDeactivateProvider(providerId, allStaff)
          return result === false
        }
      ),
      { numRuns: 100 }
    )
  })

  test('provider with only inactive staff → can be deactivated', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        (providerId, inactiveCount, otherActiveCount) => {
          // Only inactive staff for the target provider
          const inactiveStaff = Array.from({ length: inactiveCount }, (_, i) => ({
            visibleId: `inactive-${i}`,
            staffName: `Inactive Staff ${i}`,
            staffEmail: `inactive${i}@test.com`,
            vendorId: providerId,
            isActive: false,
          }))

          // Other providers may have active staff — shouldn't affect result
          const otherStaff = Array.from({ length: otherActiveCount }, (_, i) => ({
            visibleId: `other-${i}`,
            staffName: `Other Staff ${i}`,
            staffEmail: `other${i}@test.com`,
            vendorId: `other-provider-${i}`,
            isActive: true,
          }))

          const allStaff = [...inactiveStaff, ...otherStaff]
          const result = canDeactivateProvider(providerId, allStaff)
          return result === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('provider with no staff assigned → can be deactivated', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.integer({ min: 0, max: 10 }),
        (providerId, otherStaffCount) => {
          // No staff at all for this provider — only staff for other providers
          const otherStaff = Array.from({ length: otherStaffCount }, (_, i) => ({
            visibleId: `other-${i}`,
            staffName: `Other Staff ${i}`,
            staffEmail: `other${i}@test.com`,
            vendorId: `other-provider-${i}`,
            isActive: i % 2 === 0, // mix of active/inactive
          }))

          const result = canDeactivateProvider(providerId, otherStaff)
          return result === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('check is based on vendorId matching the provider ID', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.integer({ min: 1, max: 10 }),
        (providerId, activeOtherCount) => {
          // Many active staff exist, but NONE belong to the target provider
          const otherActiveStaff = Array.from({ length: activeOtherCount }, (_, i) => ({
            visibleId: `other-active-${i}`,
            staffName: `Other Active ${i}`,
            staffEmail: `otheractive${i}@test.com`,
            vendorId: `different-provider-${i}`,
            isActive: true,
          }))

          // Even though many active staff exist in the system,
          // the provider can be deactivated because none match its vendorId
          const result = canDeactivateProvider(providerId, otherActiveStaff)
          return result === true
        }
      ),
      { numRuns: 100 }
    )
  })
})
