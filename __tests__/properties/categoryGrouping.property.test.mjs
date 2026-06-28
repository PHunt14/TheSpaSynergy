/**
 * Property-Based Tests for Category Grouping Correctness
 *
 * Uses fast-check to validate correctness properties for category grouping
 * and filtering logic used on the public services page.
 * Feature: unified-business-model
 *
 * Properties tested:
 * - Property 2: Category grouping correctness
 *
 * **Validates: Requirements 1.2, 1.6**
 */

import fc from 'fast-check'

// ── Functions Under Test (pure logic extracted from app/services/page.jsx) ──

function groupServicesByCategory(services) {
  const groups = {}
  for (const service of services) {
    const cats = service.categories && Array.isArray(service.categories) && service.categories.length > 0
      ? service.categories
      : ['Other']
    for (const cat of cats) {
      const categoryName = cat || 'Other'
      if (!groups[categoryName]) groups[categoryName] = []
      groups[categoryName].push(service)
    }
  }
  return groups
}

function filterByCategory(services, category) {
  if (category === 'All') return services
  return services.filter(s => {
    const cats = s.categories && Array.isArray(s.categories) && s.categories.length > 0
      ? s.categories : ['Other']
    return cats.includes(category)
  })
}

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a non-empty category name (avoids empty/null which maps to "Other").
 */
function arbCategoryName() {
  return fc.stringOf(
    fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
      '1', '2', '3', '-', '_', ' '),
    { minLength: 2, maxLength: 20 }
  ).filter(s => s.trim().length > 0 && s !== 'Other' && s !== 'All')
}

/**
 * Generates a service with valid non-empty categories array.
 */
function arbServiceWithCategories() {
  return fc.record({
    serviceId: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    categories: fc.array(arbCategoryName(), { minLength: 1, maxLength: 5 }),
    isActive: fc.constant(true),
    duration: fc.integer({ min: 15, max: 180 }),
    price: fc.integer({ min: 10, max: 500 })
  })
}

/**
 * Generates a service with no/empty categories (should end up in "Other").
 */
function arbServiceWithoutCategories() {
  return fc.record({
    serviceId: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    categories: fc.oneof(
      fc.constant([]),
      fc.constant(null),
      fc.constant(undefined)
    ),
    isActive: fc.constant(true),
    duration: fc.integer({ min: 15, max: 180 }),
    price: fc.integer({ min: 10, max: 500 })
  })
}

/**
 * Generates a service with multiple categories.
 */
function arbServiceWithMultipleCategories() {
  return fc.record({
    serviceId: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    categories: fc.uniqueArray(arbCategoryName(), { minLength: 2, maxLength: 5 }),
    isActive: fc.constant(true),
    duration: fc.integer({ min: 15, max: 180 }),
    price: fc.integer({ min: 10, max: 500 })
  })
}

/**
 * Generates a mixed list of services (some with categories, some without).
 */
function arbMixedServices() {
  return fc.array(
    fc.oneof(arbServiceWithCategories(), arbServiceWithoutCategories()),
    { minLength: 1, maxLength: 20 }
  )
}

// ── Property 2: Category Grouping Correctness ─────────────────

describe('Feature: unified-business-model, Property 2: Category grouping correctness', () => {

  test('services with categories appear in all matching category groups', () => {
    fc.assert(
      fc.property(
        fc.array(arbServiceWithCategories(), { minLength: 1, maxLength: 15 }),
        (services) => {
          const groups = groupServicesByCategory(services)

          for (const service of services) {
            for (const cat of service.categories) {
              const categoryName = cat || 'Other'
              // The service must appear in this category group
              if (!groups[categoryName]) return false
              const found = groups[categoryName].some(s => s.serviceId === service.serviceId)
              if (!found) return false
            }
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('services with no/empty categories appear in "Other" group', () => {
    fc.assert(
      fc.property(
        fc.array(arbServiceWithoutCategories(), { minLength: 1, maxLength: 15 }),
        (services) => {
          const groups = groupServicesByCategory(services)

          // All services without categories must be in the "Other" group
          if (!groups['Other']) return false

          for (const service of services) {
            const found = groups['Other'].some(s => s.serviceId === service.serviceId)
            if (!found) return false
          }

          // "Other" should be the only group (since none have valid categories)
          return Object.keys(groups).length === 1 && Object.keys(groups)[0] === 'Other'
        }
      ),
      { numRuns: 100 }
    )
  })

  test('filtering by a specific category returns only services belonging to that category', () => {
    fc.assert(
      fc.property(
        arbMixedServices(),
        arbCategoryName(),
        (services, targetCategory) => {
          const filtered = filterByCategory(services, targetCategory)

          // Every returned service must belong to the target category
          for (const service of filtered) {
            const cats = service.categories && Array.isArray(service.categories) && service.categories.length > 0
              ? service.categories
              : ['Other']
            if (!cats.includes(targetCategory)) return false
          }

          // Every service from the original list that has this category must be in the result
          for (const service of services) {
            const cats = service.categories && Array.isArray(service.categories) && service.categories.length > 0
              ? service.categories
              : ['Other']
            if (cats.includes(targetCategory)) {
              const found = filtered.some(s => s.serviceId === service.serviceId)
              if (!found) return false
            }
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('filtering by "All" returns all services', () => {
    fc.assert(
      fc.property(
        arbMixedServices(),
        (services) => {
          const filtered = filterByCategory(services, 'All')
          // Should return the exact same array
          return filtered.length === services.length &&
            filtered.every((s, i) => s === services[i])
        }
      ),
      { numRuns: 100 }
    )
  })

  test('a service with multiple categories appears in each of those category groups', () => {
    fc.assert(
      fc.property(
        fc.array(arbServiceWithMultipleCategories(), { minLength: 1, maxLength: 10 }),
        (services) => {
          const groups = groupServicesByCategory(services)

          for (const service of services) {
            // Each category the service belongs to must have it in the group
            for (const cat of service.categories) {
              const categoryName = cat || 'Other'
              if (!groups[categoryName]) return false
              const found = groups[categoryName].some(s => s.serviceId === service.serviceId)
              if (!found) return false
            }

            // Service should NOT appear in groups it doesn't belong to
            for (const [groupName, groupServices] of Object.entries(groups)) {
              const isInGroup = groupServices.some(s => s.serviceId === service.serviceId)
              if (isInGroup) {
                const cats = service.categories.map(c => c || 'Other')
                if (!cats.includes(groupName)) return false
              }
            }
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
