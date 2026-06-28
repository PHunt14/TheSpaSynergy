/**
 * Property-Based Tests for Staff Reassignment
 *
 * Uses fast-check to validate that staff reassignment to a different provider
 * changes only the vendorId field while preserving all other attributes.
 * Feature: unified-business-model
 *
 * Properties tested:
 * - Property 13: Staff reassignment preserves all non-provider attributes
 *
 * **Validates: Requirements 7.6**
 */

import fc from 'fast-check'

// ── Pure reassignment function under test ─────────────────────

/**
 * Reassigns a staff member to a different provider.
 * Only the vendorId field should change; all other attributes remain identical.
 */
function reassignStaff(staffRecord, newVendorId) {
  return { ...staffRecord, vendorId: newVendorId }
}

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a day schedule object with open/close times.
 */
function arbDaySchedule() {
  return fc.record({
    isOpen: fc.boolean(),
    openTime: fc.constantFrom('08:00', '09:00', '10:00', '11:00'),
    closeTime: fc.constantFrom('16:00', '17:00', '18:00', '19:00', '20:00'),
  })
}

/**
 * Generates a weekly schedule mapping day names to day schedules.
 */
function arbSchedule() {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  return fc.tuple(...days.map(() => arbDaySchedule())).map((daySchedules) => {
    const schedule = {}
    days.forEach((day, i) => { schedule[day] = daySchedules[i] })
    return schedule
  })
}

/**
 * Generates Square catalog mappings (serviceId -> Square catalog item ID).
 */
function arbSquareCatalogMappings() {
  return fc.oneof(
    fc.constant(undefined),
    fc.constant(null),
    fc.dictionary(
      fc.string({ minLength: 3, maxLength: 12 }).map(s => `svc-${s}`),
      fc.string({ minLength: 5, maxLength: 20 }).map(s => `sq-item-${s}`),
      { minKeys: 0, maxKeys: 5 }
    )
  )
}

/**
 * Generates auto-assign rules array.
 */
function arbAutoAssignRules() {
  return fc.oneof(
    fc.constant(undefined),
    fc.constant(null),
    fc.array(
      fc.record({
        serviceId: fc.string({ minLength: 3, maxLength: 15 }),
        priority: fc.integer({ min: 1, max: 10 }),
      }),
      { minLength: 0, maxLength: 5 }
    )
  )
}

/**
 * Generates a complete staff member record matching the StaffSchedule model.
 */
function arbStaffRecord() {
  return fc.record({
    visibleId: fc.string({ minLength: 5, maxLength: 30 }).map(s => `staff-${s}`),
    staffEmail: fc.emailAddress(),
    staffName: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    vendorId: fc.string({ minLength: 3, maxLength: 20 }).map(s => `vendor-${s}`),
    schedule: arbSchedule(),
    autoAssignRules: arbAutoAssignRules(),
    isActive: fc.boolean(),
    squareAccessToken: fc.option(fc.string({ minLength: 10, maxLength: 50 }), { nil: undefined }),
    squareRefreshToken: fc.option(fc.string({ minLength: 10, maxLength: 50 }), { nil: undefined }),
    squareLocationId: fc.option(fc.string({ minLength: 5, maxLength: 20 }), { nil: undefined }),
    squareMerchantId: fc.option(fc.string({ minLength: 5, maxLength: 20 }), { nil: undefined }),
    squareOAuthStatus: fc.constantFrom('connected', 'disconnected', 'error'),
    squareCatalogMappings: arbSquareCatalogMappings(),
    smsAlertsEnabled: fc.boolean(),
    smsAlertPhone: fc.option(fc.string({ minLength: 10, maxLength: 15 }), { nil: undefined }),
    emailAlertsEnabled: fc.boolean(),
  })
}

/**
 * Generates a new vendorId that is different from the staff record's current vendorId.
 */
function arbNewVendorId(currentVendorId) {
  return fc.string({ minLength: 3, maxLength: 20 })
    .map(s => `vendor-new-${s}`)
    .filter(v => v !== currentVendorId)
}

// ── Property 13: Staff reassignment preserves all non-provider attributes ──

describe('Feature: unified-business-model, Property 13: Staff reassignment preserves all non-provider attributes', () => {
  test('after reassignment, vendorId equals the new value', () => {
    fc.assert(
      fc.property(
        arbStaffRecord().chain((staff) =>
          arbNewVendorId(staff.vendorId).map((newId) => ({ staff, newId }))
        ),
        ({ staff, newId }) => {
          const reassigned = reassignStaff(staff, newId)
          return reassigned.vendorId === newId
        }
      ),
      { numRuns: 100 }
    )
  })

  test('after reassignment, all other attributes remain identical to the original', () => {
    fc.assert(
      fc.property(
        arbStaffRecord().chain((staff) =>
          arbNewVendorId(staff.vendorId).map((newId) => ({ staff, newId }))
        ),
        ({ staff, newId }) => {
          const reassigned = reassignStaff(staff, newId)

          // Compare all fields except vendorId
          const { vendorId: _origVendor, ...originalRest } = staff
          const { vendorId: _newVendor, ...reassignedRest } = reassigned

          return JSON.stringify(originalRest) === JSON.stringify(reassignedRest)
        }
      ),
      { numRuns: 100 }
    )
  })

  test('Square credentials are unchanged: squareAccessToken, squareLocationId, squareMerchantId, squareRefreshToken, squareOAuthStatus', () => {
    fc.assert(
      fc.property(
        arbStaffRecord().chain((staff) =>
          arbNewVendorId(staff.vendorId).map((newId) => ({ staff, newId }))
        ),
        ({ staff, newId }) => {
          const reassigned = reassignStaff(staff, newId)

          return (
            reassigned.squareAccessToken === staff.squareAccessToken &&
            reassigned.squareLocationId === staff.squareLocationId &&
            reassigned.squareMerchantId === staff.squareMerchantId &&
            reassigned.squareRefreshToken === staff.squareRefreshToken &&
            reassigned.squareOAuthStatus === staff.squareOAuthStatus
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  test('schedule, staffName, staffEmail, isActive, smsAlertsEnabled, emailAlertsEnabled are unchanged', () => {
    fc.assert(
      fc.property(
        arbStaffRecord().chain((staff) =>
          arbNewVendorId(staff.vendorId).map((newId) => ({ staff, newId }))
        ),
        ({ staff, newId }) => {
          const reassigned = reassignStaff(staff, newId)

          return (
            JSON.stringify(reassigned.schedule) === JSON.stringify(staff.schedule) &&
            reassigned.staffName === staff.staffName &&
            reassigned.staffEmail === staff.staffEmail &&
            reassigned.isActive === staff.isActive &&
            reassigned.smsAlertsEnabled === staff.smsAlertsEnabled &&
            reassigned.emailAlertsEnabled === staff.emailAlertsEnabled
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  test('squareCatalogMappings and autoAssignRules are unchanged', () => {
    fc.assert(
      fc.property(
        arbStaffRecord().chain((staff) =>
          arbNewVendorId(staff.vendorId).map((newId) => ({ staff, newId }))
        ),
        ({ staff, newId }) => {
          const reassigned = reassignStaff(staff, newId)

          return (
            JSON.stringify(reassigned.squareCatalogMappings) === JSON.stringify(staff.squareCatalogMappings) &&
            JSON.stringify(reassigned.autoAssignRules) === JSON.stringify(staff.autoAssignRules)
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})
