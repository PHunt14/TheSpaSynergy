/**
 * Property-Based Tests for Sequential Schedule Calculation
 *
 * Uses fast-check to validate correctness properties for sequential
 * service schedule calculation in multi-vendor bundle bookings.
 * Feature: multi-vendor-bundle-booking
 *
 * Properties tested:
 * - Property 1: Sequential Schedule Calculation Correctness
 *
 * **Validates: Requirements 1.2, 4.2, 11.1, 11.2, 11.3**
 */

import fc from 'fast-check'
import {
  calculateServiceSchedule,
  calculateTotalBundleDuration,
} from '../../app/utils/sequentialAvailability.js'

// ── Helpers ───────────────────────────────────────────────────

/**
 * Converts a time string "HH:MM" to minutes since midnight.
 */
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a service object with a positive duration (15-180 minutes).
 */
function arbService() {
  return fc.record({
    serviceId: fc.uuid(),
    duration: fc.integer({ min: 15, max: 180 }),
  })
}

/**
 * Generates an array of 1-10 services.
 */
function arbServices() {
  return fc.array(arbService(), { minLength: 1, maxLength: 10 })
}

/**
 * Generates a valid start time within business hours (07:00 - 18:00)
 * as HH:MM string.
 */
function arbStartTime() {
  return fc.integer({ min: 7 * 60, max: 18 * 60 }).map(minutes => {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
  })
}

/**
 * Generates a positive buffer value in minutes (0-30).
 */
function arbBuffer() {
  return fc.integer({ min: 0, max: 30 })
}

// ── Property 1: Sequential Schedule Calculation Correctness ───

describe('Feature: multi-vendor-bundle-booking, Property 1: Sequential Schedule Calculation Correctness', () => {
  test('the first service starts at the given start time', () => {
    fc.assert(
      fc.property(
        arbServices(),
        arbStartTime(),
        arbBuffer(),
        (services, startTime, bufferMinutes) => {
          const schedule = calculateServiceSchedule(services, startTime, bufferMinutes)

          // First service starts at the given start time
          return schedule[0].startTime === startTime
        }
      ),
      { numRuns: 100 }
    )
  })

  test('each subsequent service starts exactly at the previous service end time plus bufferMinutes', () => {
    fc.assert(
      fc.property(
        fc.array(arbService(), { minLength: 2, maxLength: 10 }),
        arbStartTime(),
        arbBuffer(),
        (services, startTime, bufferMinutes) => {
          const schedule = calculateServiceSchedule(services, startTime, bufferMinutes)

          for (let i = 1; i < schedule.length; i++) {
            const prevEndMinutes = timeToMinutes(schedule[i - 1].endTime)
            const currentStartMinutes = timeToMinutes(schedule[i].startTime)
            if (currentStartMinutes !== prevEndMinutes + bufferMinutes) {
              return false
            }
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('each service end time equals its start time plus its duration', () => {
    fc.assert(
      fc.property(
        arbServices(),
        arbStartTime(),
        arbBuffer(),
        (services, startTime, bufferMinutes) => {
          const schedule = calculateServiceSchedule(services, startTime, bufferMinutes)

          for (let i = 0; i < schedule.length; i++) {
            const startMinutes = timeToMinutes(schedule[i].startTime)
            const endMinutes = timeToMinutes(schedule[i].endTime)
            if (endMinutes - startMinutes !== services[i].duration) {
              return false
            }
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('total span equals sum of all durations plus buffer × (serviceCount - 1)', () => {
    fc.assert(
      fc.property(
        arbServices(),
        arbStartTime(),
        arbBuffer(),
        (services, startTime, bufferMinutes) => {
          const schedule = calculateServiceSchedule(services, startTime, bufferMinutes)

          const firstStartMinutes = timeToMinutes(schedule[0].startTime)
          const lastEndMinutes = timeToMinutes(schedule[schedule.length - 1].endTime)
          const actualSpan = lastEndMinutes - firstStartMinutes

          const expectedSpan = calculateTotalBundleDuration(services, bufferMinutes)

          return actualSpan === expectedSpan
        }
      ),
      { numRuns: 100 }
    )
  })
})
