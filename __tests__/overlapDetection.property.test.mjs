/**
 * Property-Based Tests for Overlap Detection Module
 *
 * Uses fast-check to validate correctness properties for the overlap
 * detection algorithm in app/utils/overlapDetection.ts.
 *
 * Feature: prevent-double-booking
 *
 * Properties tested:
 * - Property 1: Mathematical Overlap Correctness
 * - Property 2: Overlap Commutativity
 * - Property 3: Time Parsing Round-Trip
 * - Property 6: Self-Exclusion
 * - Property 13: Strict Duration Resolution
 *
 * **Validates: Requirements 6.1, 6.2, 6.5, 7.1, 5.3, 10.1, 10.2, 10.6**
 */

import fc from 'fast-check'
import {
  intervalsOverlap,
  extractTimeFromDateTime,
  timeToMinutes,
  getEffectiveAppointmentDuration,
  detectConflict,
} from '../app/utils/overlapDetection.ts'

// ── Generators ────────────────────────────────────────────────

/** Generates a valid start time in minutes from midnight [0, 1440). */
function arbStart() {
  return fc.integer({ min: 0, max: 1439 })
}

/** Generates a positive duration in minutes [1, 480]. */
function arbDuration() {
  return fc.integer({ min: 1, max: 480 })
}

/** Generates buffer time in minutes [0, 60]. */
function arbBuffer() {
  return fc.integer({ min: 0, max: 60 })
}

/** Generates a valid hour [0, 23]. */
function arbHour() {
  return fc.integer({ min: 0, max: 23 })
}

/** Generates a valid minute [0, 59]. */
function arbMinute() {
  return fc.integer({ min: 0, max: 59 })
}

/** Generates a valid date portion in YYYY-MM-DD format. */
function arbDate() {
  return fc.tuple(
    fc.integer({ min: 2020, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 })
  ).map(([year, month, day]) => {
    const m = String(month).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    return `${year}-${m}-${d}`
  })
}

/** Generates a valid dateTime string in YYYY-MM-DDTHH:MM format. */
function arbDateTime() {
  return fc.tuple(arbDate(), arbHour(), arbMinute()).map(([date, h, m]) => {
    const hh = String(h).padStart(2, '0')
    const mm = String(m).padStart(2, '0')
    return `${date}T${hh}:${mm}`
  })
}

/** Generates a unique appointment ID. */
function arbAppointmentId() {
  return fc.uuid()
}

// ── Property 1: Mathematical Overlap Correctness ──────────────────

describe('Feature: prevent-double-booking, Property 1: Mathematical Overlap Correctness', () => {
  test('intervalsOverlap returns true iff newStart < (existingStart + existingDuration + existingBuffer) AND (newStart + newDuration + newBuffer) > existingStart', () => {
    fc.assert(
      fc.property(
        arbStart(),
        arbDuration(),
        arbBuffer(),
        arbStart(),
        arbDuration(),
        arbBuffer(),
        (newStart, newDuration, newBuffer, existingStart, existingDuration, existingBuffer) => {
          const result = intervalsOverlap({
            newStart,
            newDuration,
            newBuffer,
            existingStart,
            existingDuration,
            existingBuffer,
          })

          // The mathematical condition for overlap:
          const expectedOverlap =
            newStart < (existingStart + existingDuration + existingBuffer) &&
            (newStart + newDuration + newBuffer) > existingStart

          return result === expectedOverlap
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 2: Overlap Commutativity ─────────────────────────────

describe('Feature: prevent-double-booking, Property 2: Overlap Commutativity', () => {
  test('swapping new/existing params with symmetric buffers yields same result', () => {
    fc.assert(
      fc.property(
        arbStart(),
        arbDuration(),
        arbStart(),
        arbDuration(),
        arbBuffer(),
        (startA, durationA, startB, durationB, buffer) => {
          const forward = intervalsOverlap({
            newStart: startA,
            newDuration: durationA,
            newBuffer: buffer,
            existingStart: startB,
            existingDuration: durationB,
            existingBuffer: buffer,
          })

          const swapped = intervalsOverlap({
            newStart: startB,
            newDuration: durationB,
            newBuffer: buffer,
            existingStart: startA,
            existingDuration: durationA,
            existingBuffer: buffer,
          })

          return forward === swapped
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 3: Time Parsing Round-Trip ───────────────────────────

describe('Feature: prevent-double-booking, Property 3: Time Parsing Round-Trip', () => {
  test('timeToMinutes(extractTimeFromDateTime(dt)) equals hours*60 + minutes', () => {
    fc.assert(
      fc.property(
        arbDateTime(),
        (dt) => {
          const timeStr = extractTimeFromDateTime(dt)
          const minutes = timeToMinutes(timeStr)

          // Extract expected hours and minutes from the original dateTime
          const timePart = dt.split('T')[1]
          const [h, m] = timePart.split(':').map(Number)
          const expected = h * 60 + m

          return minutes === expected
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 6: Self-Exclusion ────────────────────────────────────

describe('Feature: prevent-double-booking, Property 6: Self-Exclusion', () => {
  test('editing an appointment with unchanged time/staff produces no self-conflict', () => {
    fc.assert(
      fc.property(
        arbAppointmentId(),
        fc.string({ minLength: 5, maxLength: 20 }),
        arbDateTime(),
        arbDuration(),
        arbBuffer(),
        (appointmentId, staffId, dateTime, duration, buffer) => {
          // Create an existing appointment
          const existingAppointments = [
            {
              appointmentId,
              staffId,
              dateTime,
              status: 'confirmed',
              serviceId: 'service-1',
              customer: JSON.stringify({ duration }),
            },
          ]

          const serviceDurationMap = { 'service-1': duration }

          // Detect conflict excluding self (simulating an edit with unchanged time/staff)
          const conflict = detectConflict(
            staffId,
            dateTime,
            duration,
            buffer,
            existingAppointments,
            serviceDurationMap,
            appointmentId // excludeAppointmentId — the one being edited
          )

          // Should never find a conflict with itself
          return conflict === null
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 13: Strict Duration Resolution ───────────────────────

describe('Feature: prevent-double-booking, Property 13: Strict Duration Resolution', () => {
  test('blocked appointments with missing duration throw an error', () => {
    fc.assert(
      fc.property(
        arbAppointmentId(),
        (appointmentId) => {
          const appointment = {
            serviceId: 'blocked',
            appointmentId,
            customer: JSON.stringify({}), // no duration
          }

          try {
            getEffectiveAppointmentDuration(appointment, {})
            return false // should have thrown
          } catch (e) {
            return e.message.includes('invalid duration')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  test('blocked appointments with null duration throw an error', () => {
    fc.assert(
      fc.property(
        arbAppointmentId(),
        (appointmentId) => {
          const appointment = {
            serviceId: 'blocked',
            appointmentId,
            customer: JSON.stringify({ duration: null }),
          }

          try {
            getEffectiveAppointmentDuration(appointment, {})
            return false // should have thrown
          } catch (e) {
            return e.message.includes('invalid duration')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  test('blocked appointments with zero duration throw an error', () => {
    fc.assert(
      fc.property(
        arbAppointmentId(),
        (appointmentId) => {
          const appointment = {
            serviceId: 'blocked',
            appointmentId,
            customer: JSON.stringify({ duration: 0 }),
          }

          try {
            getEffectiveAppointmentDuration(appointment, {})
            return false // should have thrown
          } catch (e) {
            return e.message.includes('invalid duration')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  test('blocked appointments with negative duration throw an error', () => {
    fc.assert(
      fc.property(
        arbAppointmentId(),
        fc.integer({ min: -1000, max: -1 }),
        (appointmentId, negativeDuration) => {
          const appointment = {
            serviceId: 'blocked',
            appointmentId,
            customer: JSON.stringify({ duration: negativeDuration }),
          }

          try {
            getEffectiveAppointmentDuration(appointment, {})
            return false // should have thrown
          } catch (e) {
            return e.message.includes('invalid duration')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  test('manual appointments with missing/null/zero/negative duration throw an error', () => {
    fc.assert(
      fc.property(
        arbAppointmentId(),
        fc.oneof(
          fc.constant(undefined),
          fc.constant(null),
          fc.constant(0),
          fc.integer({ min: -1000, max: -1 })
        ),
        (appointmentId, invalidDuration) => {
          const customerObj = invalidDuration === undefined ? {} : { duration: invalidDuration }
          const appointment = {
            serviceId: 'manual',
            appointmentId,
            customer: JSON.stringify(customerObj),
          }

          try {
            getEffectiveAppointmentDuration(appointment, {})
            return false // should have thrown
          } catch (e) {
            return e.message.includes('invalid duration')
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
