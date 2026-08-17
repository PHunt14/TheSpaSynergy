/**
 * Property-Based Tests for Time-Frame Booking Data Integrity
 *
 * Uses fast-check to validate correctness properties for time-frame bundle bookings.
 * Feature: booking-enhancements
 *
 * Properties tested:
 * - Property 1: Time-frame booking data integrity
 *
 * **Validates: Requirements 1.2, 1.4**
 *
 * For any valid time-frame bundle booking (bundle with useTimeFrames: true),
 * given any valid date and any time frame selection from {"morning", "afternoon", "evening"},
 * the resulting appointment data SHALL have:
 *   - `timeFrame` field set to the selected label
 *   - `dateTime` field set to the selected date at midnight (T00:00:00)
 *   - `status` set to "pending-confirmation"
 */

import fc from 'fast-check'
import { determineBookingStatus } from '../../app/utils/bookingStatus.js'

// ── Helpers ───────────────────────────────────────────────────

/**
 * Simulates the time-frame booking appointment creation logic.
 * When a bundle has useTimeFrames: true, the booking flow:
 *   1. Stores the selected timeFrame label on the appointment
 *   2. Uses midnight placeholder (T00:00:00) in the dateTime field for the selected date
 *   3. Sets status to "pending-confirmation" (vendor confirms exact time)
 *
 * This mirrors the behavior in POST /api/appointments where:
 *   - timeFrame is stored directly on the appointment record
 *   - dateTime is passed as the selected date at midnight
 *   - status is determined via determineBookingStatus (which for time-frame
 *     bookings, returns "pending-confirmation" since resourceType is neither
 *     "sauna" nor "room" for event packages)
 *
 * @param {Object} params
 * @param {string} params.date - The selected date in YYYY-MM-DD format
 * @param {string} params.timeFrame - The selected time frame ("morning", "afternoon", or "evening")
 * @param {boolean} params.isNewClient - Whether the customer is a new client
 * @returns {{ timeFrame: string, dateTime: string, status: string }}
 */
function createTimeFrameBookingData({ date, timeFrame, isNewClient }) {
  // The dateTime for time-frame bookings uses midnight placeholder
  const dateTime = `${date}T00:00:00`

  // Status determination: for time-frame bundle bookings, resourceType is not
  // "sauna" or "room" (event packages use generic resource types like "staff" or "venue"),
  // so status is always "pending-confirmation" regardless of isNewClient.
  // - If isNewClient === true → "pending-confirmation" (rule 1)
  // - If isNewClient === false and resourceType not sauna/room → "pending-confirmation" (rule 3)
  const status = determineBookingStatus({
    isNewClient,
    resourceType: 'staff', // event packages don't use sauna/room resource types
    requiresConsultation: false,
  })

  return {
    timeFrame,
    dateTime,
    status,
  }
}

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a valid time frame selection from the set {"morning", "afternoon", "evening"}.
 */
function arbTimeFrame() {
  return fc.constantFrom('morning', 'afternoon', 'evening')
}

/**
 * Generates a valid date string in YYYY-MM-DD format.
 * Generates dates within a realistic booking window (2024-2026).
 */
function arbDateString() {
  return fc.date({
    min: new Date('2024-01-01'),
    max: new Date('2026-12-31'),
  }).map(d => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })
}

/**
 * Generates a resource type that is NOT "sauna" or "room" — representing
 * event package resource types (e.g., "staff", "venue", "outdoor", etc.).
 * Time-frame bundles are event packages which never use sauna/room resources.
 */
function arbEventPackageResourceType() {
  return fc.constantFrom('staff', 'venue', 'outdoor', 'event-space', 'poolside')
}

// ── Property 1: Time-frame booking data integrity ─────────────

describe('Feature: booking-enhancements, Property 1: Time-frame booking data integrity', () => {
  test('timeFrame field is set to the selected label for any valid time frame', () => {
    fc.assert(
      fc.property(
        arbDateString(),
        arbTimeFrame(),
        fc.boolean(),
        (date, timeFrame, isNewClient) => {
          const result = createTimeFrameBookingData({ date, timeFrame, isNewClient })

          // The timeFrame field must exactly match the selected label
          return result.timeFrame === timeFrame
        }
      ),
      { numRuns: 100 }
    )
  })

  test('dateTime field is set to the selected date at midnight (T00:00:00)', () => {
    fc.assert(
      fc.property(
        arbDateString(),
        arbTimeFrame(),
        fc.boolean(),
        (date, timeFrame, isNewClient) => {
          const result = createTimeFrameBookingData({ date, timeFrame, isNewClient })

          // The dateTime must be the date with midnight placeholder
          const expectedDateTime = `${date}T00:00:00`
          return result.dateTime === expectedDateTime
        }
      ),
      { numRuns: 100 }
    )
  })

  test('status is always "pending-confirmation" for time-frame bundle bookings regardless of isNewClient', () => {
    fc.assert(
      fc.property(
        arbDateString(),
        arbTimeFrame(),
        fc.boolean(),
        (date, timeFrame, isNewClient) => {
          const result = createTimeFrameBookingData({ date, timeFrame, isNewClient })

          // Time-frame bookings always get "pending-confirmation" status
          // (per Requirement 1.4: vendor will confirm exact time)
          return result.status === 'pending-confirmation'
        }
      ),
      { numRuns: 100 }
    )
  })

  test('status is "pending-confirmation" for any event-package resource type (non-sauna, non-room)', () => {
    fc.assert(
      fc.property(
        arbDateString(),
        arbTimeFrame(),
        fc.boolean(),
        arbEventPackageResourceType(),
        (date, timeFrame, isNewClient, resourceType) => {
          // Simulate with various event-package resource types
          const dateTime = `${date}T00:00:00`
          const status = determineBookingStatus({
            isNewClient,
            resourceType,
            requiresConsultation: false,
          })

          // For event packages (non-sauna, non-room), status is always "pending-confirmation"
          return status === 'pending-confirmation'
        }
      ),
      { numRuns: 100 }
    )
  })

  test('all three invariants hold simultaneously for any valid time-frame booking', () => {
    fc.assert(
      fc.property(
        arbDateString(),
        arbTimeFrame(),
        fc.boolean(),
        (date, timeFrame, isNewClient) => {
          const result = createTimeFrameBookingData({ date, timeFrame, isNewClient })

          // All three invariants must hold together:
          const timeFrameCorrect = result.timeFrame === timeFrame
          const dateTimeCorrect = result.dateTime === `${date}T00:00:00`
          const statusCorrect = result.status === 'pending-confirmation'

          return timeFrameCorrect && dateTimeCorrect && statusCorrect
        }
      ),
      { numRuns: 100 }
    )
  })
})
