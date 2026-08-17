/**
 * Property-Based Tests for Booking Status Determination
 *
 * Uses fast-check to validate correctness properties for booking status
 * determination based on new client flag and service resource type.
 * Feature: booking-enhancements
 *
 * Properties tested:
 * - Property 2: Booking status determination
 *
 * **Validates: Requirements 2.3, 2.4, 2.5, 2.7, 2.8**
 */

import fc from 'fast-check'
import { determineBookingStatus } from '../../app/utils/bookingStatus.js'

// ── Generators ────────────────────────────────────────────────

/**
 * Generates an arbitrary resource type string (any non-empty string).
 */
function arbResourceType() {
  return fc.string({ minLength: 1, maxLength: 30 })
}

/**
 * Generates a resource type that is specifically "sauna" or "room".
 */
function arbConfirmableResourceType() {
  return fc.constantFrom('sauna', 'room')
}

/**
 * Generates a resource type that is NOT "sauna" or "room".
 */
function arbNonConfirmableResourceType() {
  return fc.string({ minLength: 1, maxLength: 30 }).filter(
    (s) => s !== 'sauna' && s !== 'room'
  )
}

// ── Property 2: Booking status determination ──────────────────

describe('Feature: booking-enhancements, Property 2: Booking status determination', () => {
  test('new client always gets "pending-confirmation" regardless of resourceType', () => {
    fc.assert(
      fc.property(
        arbResourceType(),
        fc.boolean(),
        (resourceType, requiresConsultation) => {
          const result = determineBookingStatus({
            isNewClient: true,
            resourceType,
            requiresConsultation,
          })
          return result === 'pending-confirmation'
        }
      ),
      { numRuns: 100 }
    )
  })

  test('returning client with resourceType "sauna" or "room" gets "confirmed"', () => {
    fc.assert(
      fc.property(
        arbConfirmableResourceType(),
        fc.boolean(),
        (resourceType, requiresConsultation) => {
          const result = determineBookingStatus({
            isNewClient: false,
            resourceType,
            requiresConsultation,
          })
          return result === 'confirmed'
        }
      ),
      { numRuns: 100 }
    )
  })

  test('returning client with resourceType other than "sauna" or "room" gets "pending-confirmation"', () => {
    fc.assert(
      fc.property(
        arbNonConfirmableResourceType(),
        fc.boolean(),
        (resourceType, requiresConsultation) => {
          const result = determineBookingStatus({
            isNewClient: false,
            resourceType,
            requiresConsultation,
          })
          return result === 'pending-confirmation'
        }
      ),
      { numRuns: 100 }
    )
  })
})
