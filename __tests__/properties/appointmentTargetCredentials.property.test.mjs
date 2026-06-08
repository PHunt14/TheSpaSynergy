/**
 * Property-Based Tests for Appointment Target Credentials
 *
 * Uses fast-check to validate correctness properties for appointment target
 * resolution — ensuring appointments are recorded under the target staff's
 * schedule with the target staff's Square credentials, regardless of who created them.
 * Feature: unified-business-model
 *
 * Properties tested:
 * - Property 6: Appointment records target staff credentials
 *
 * **Validates: Requirements 4.4**
 */

import fc from 'fast-check'
import { resolveAppointmentTarget } from '../../app/utils/appointmentTarget.ts'

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a non-empty credential string suitable for Square tokens/IDs.
 */
function arbCredentialString() {
  return fc.string({ minLength: 3, maxLength: 30 }).filter((s) => s.trim().length > 0)
}

/**
 * Generates a staff record with valid Square credentials.
 */
function arbStaffWithCredentials(id) {
  return fc.record({
    visibleId: fc.constant(id),
    staffName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    vendorId: fc.string({ minLength: 1, maxLength: 15 }),
    isActive: fc.constant(true),
    squareAccessToken: arbCredentialString(),
    squareLocationId: arbCredentialString(),
    squareOAuthStatus: fc.constant('connected'),
  })
}

/**
 * Generates a unique staff ID.
 */
function arbStaffId(prefix) {
  return fc.string({ minLength: 1, maxLength: 10 }).map((s) => `${prefix}-${s}`)
}

/**
 * Generates an array of staff records with unique IDs, guaranteeing both
 * the creator and target IDs are present.
 */
function arbStaffRecordsWithCreatorAndTarget(creatorId, targetId) {
  return fc
    .integer({ min: 0, max: 5 })
    .chain((extraCount) => {
      const extraIds = Array.from({ length: extraCount }, (_, i) => `extra-${i}`)
      const extras = extraIds.map((id) => arbStaffWithCredentials(id))
      return fc.tuple(
        arbStaffWithCredentials(creatorId),
        arbStaffWithCredentials(targetId),
        extras.length > 0 ? fc.tuple(...extras) : fc.constant([])
      )
    })
    .map(([creator, target, extras]) => [creator, target, ...extras])
}

// ── Property 6: Appointment records target staff credentials ──

describe('Feature: unified-business-model, Property 6: Appointment records target staff credentials', () => {
  test('Appointment is recorded under the target staff ID (not creator)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 15 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 15 }).filter((s) => s.trim().length > 0),
        fc.integer({ min: 0, max: 5 }).chain((extraCount) => {
          const extraIds = Array.from({ length: extraCount }, (_, i) => `extra-${i}`)
          const extras = extraIds.map((id) => arbStaffWithCredentials(id))
          return extras.length > 0 ? fc.tuple(...extras) : fc.constant([])
        }),
        (creatorId, targetId, extraStaff) => {
          // Build staff records that include the target
          const targetRecord = {
            visibleId: targetId,
            staffName: 'Target Staff',
            vendorId: 'vendor-target',
            isActive: true,
            squareAccessToken: 'target-token-123',
            squareLocationId: 'target-loc-456',
            squareOAuthStatus: 'connected',
          }
          const creatorRecord = {
            visibleId: creatorId,
            staffName: 'Creator Staff',
            vendorId: 'vendor-creator',
            isActive: true,
            squareAccessToken: 'creator-token-789',
            squareLocationId: 'creator-loc-012',
            squareOAuthStatus: 'connected',
          }
          const staffRecords = [creatorRecord, targetRecord, ...extraStaff]

          const result = resolveAppointmentTarget(creatorId, targetId, staffRecords)

          // The appointment must be recorded under the TARGET staff's ID
          return result.recordedUnder === targetId
        }
      ),
      { numRuns: 100 }
    )
  })

  test('Square credentials come from the target staff (not creator)', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          arbCredentialString(),
          arbCredentialString(),
          arbCredentialString(),
          arbCredentialString()
        ),
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
        ([creatorToken, creatorLoc, targetToken, targetLoc], creatorId, targetId) => {
          const staffRecords = [
            {
              visibleId: creatorId,
              staffName: 'Creator',
              vendorId: 'vendor-A',
              isActive: true,
              squareAccessToken: creatorToken,
              squareLocationId: creatorLoc,
              squareOAuthStatus: 'connected',
            },
            {
              visibleId: targetId,
              staffName: 'Target',
              vendorId: 'vendor-B',
              isActive: true,
              squareAccessToken: targetToken,
              squareLocationId: targetLoc,
              squareOAuthStatus: 'connected',
            },
          ]

          const result = resolveAppointmentTarget(creatorId, targetId, staffRecords)

          // Square credentials must come from the TARGET staff
          return (
            result.squareCredentials !== null &&
            result.squareCredentials.accessToken === targetToken &&
            result.squareCredentials.locationId === targetLoc
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  test('vendorId comes from the target staff record', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 15 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 15 }).filter((s) => s.trim().length > 0),
        (creatorId, targetId, creatorVendorId, targetVendorId) => {
          const staffRecords = [
            {
              visibleId: creatorId,
              staffName: 'Creator',
              vendorId: creatorVendorId,
              isActive: true,
              squareAccessToken: 'tok-c',
              squareLocationId: 'loc-c',
              squareOAuthStatus: 'connected',
            },
            {
              visibleId: targetId,
              staffName: 'Target',
              vendorId: targetVendorId,
              isActive: true,
              squareAccessToken: 'tok-t',
              squareLocationId: 'loc-t',
              squareOAuthStatus: 'connected',
            },
          ]

          const result = resolveAppointmentTarget(creatorId, targetId, staffRecords)

          // vendorId must come from the TARGET staff's record
          return result.vendorId === targetVendorId
        }
      ),
      { numRuns: 100 }
    )
  })

  test("Creator's identity does not affect which credentials are used", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
        (creatorA, creatorB, targetId) => {
          // Same target, same staff records, but different creators
          const targetRecord = {
            visibleId: targetId,
            staffName: 'Target',
            vendorId: 'vendor-T',
            isActive: true,
            squareAccessToken: 'target-token-fixed',
            squareLocationId: 'target-loc-fixed',
            squareOAuthStatus: 'connected',
          }
          const staffRecords = [
            {
              visibleId: creatorA,
              staffName: 'Creator A',
              vendorId: 'vendor-A',
              isActive: true,
              squareAccessToken: 'tok-a',
              squareLocationId: 'loc-a',
              squareOAuthStatus: 'connected',
            },
            {
              visibleId: creatorB,
              staffName: 'Creator B',
              vendorId: 'vendor-B',
              isActive: true,
              squareAccessToken: 'tok-b',
              squareLocationId: 'loc-b',
              squareOAuthStatus: 'connected',
            },
            targetRecord,
          ]

          const resultA = resolveAppointmentTarget(creatorA, targetId, staffRecords)
          const resultB = resolveAppointmentTarget(creatorB, targetId, staffRecords)

          // Both results must be identical — the creator doesn't matter
          return (
            resultA.recordedUnder === resultB.recordedUnder &&
            resultA.vendorId === resultB.vendorId &&
            resultA.squareCredentials?.accessToken === resultB.squareCredentials?.accessToken &&
            resultA.squareCredentials?.locationId === resultB.squareCredentials?.locationId
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})
