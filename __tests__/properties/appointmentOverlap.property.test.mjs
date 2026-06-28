/**
 * Property-Based Tests for Appointment Overlap Detection
 *
 * Uses fast-check to validate correctness properties for appointment
 * overlap detection logic. Tests the pure overlap detection algorithm
 * that determines whether two time intervals on the same staff member's
 * calendar conflict.
 *
 * Feature: unified-business-model
 *
 * Properties tested:
 * - Property 7: Appointment overlap detection
 *
 * **Validates: Requirements 4.6**
 */

import fc from 'fast-check'

// ── Pure overlap detection function (mirrors implementation in route.ts) ──

/**
 * Two intervals overlap if: start1 < end2 AND end1 > start2
 * Where end = start + duration.
 * start values are in minutes from midnight, duration in minutes.
 */
function detectsOverlap(start1, duration1, start2, duration2) {
  const end1 = start1 + duration1
  const end2 = start2 + duration2
  return start1 < end2 && end1 > start2
}

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a valid start time in minutes from midnight (0–1439).
 */
function arbStartTime() {
  return fc.integer({ min: 0, max: 1439 })
}

/**
 * Generates a positive duration in minutes (1–480, i.e., up to 8 hours).
 */
function arbDuration() {
  return fc.integer({ min: 1, max: 480 })
}

// ── Property 7: Appointment Overlap Detection ──────────────────────

describe('Feature: unified-business-model, Property 7: Appointment overlap detection', () => {
  test('same start time always overlaps if both have positive duration', () => {
    fc.assert(
      fc.property(
        arbStartTime(),
        arbDuration(),
        arbDuration(),
        (start, duration1, duration2) => {
          // Two intervals starting at the same time with positive durations must overlap
          return detectsOverlap(start, duration1, start, duration2) === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('non-overlapping intervals: if end1 <= start2, no overlap', () => {
    fc.assert(
      fc.property(
        arbStartTime(),
        arbDuration(),
        arbDuration(),
        (start1, duration1, duration2) => {
          // Place start2 so that start2 >= end1 (no overlap possible)
          const end1 = start1 + duration1
          const start2 = end1 // adjacent — end1 === start2 means no overlap
          // Only test if start2 is a valid minute value (within reasonable range)
          if (start2 > 10000) return true // skip unreasonable values

          return detectsOverlap(start1, duration1, start2, duration2) === false
        }
      ),
      { numRuns: 100 }
    )
  })

  test('symmetry: overlap(A, B) === overlap(B, A)', () => {
    fc.assert(
      fc.property(
        arbStartTime(),
        arbDuration(),
        arbStartTime(),
        arbDuration(),
        (start1, duration1, start2, duration2) => {
          const overlapAB = detectsOverlap(start1, duration1, start2, duration2)
          const overlapBA = detectsOverlap(start2, duration2, start1, duration1)
          return overlapAB === overlapBA
        }
      ),
      { numRuns: 100 }
    )
  })

  test('contained interval: if interval B is fully within interval A, overlap is detected', () => {
    fc.assert(
      fc.property(
        arbStartTime(),
        fc.integer({ min: 30, max: 480 }),
        fc.integer({ min: 1, max: 29 }),
        fc.integer({ min: 1, max: 29 }),
        (startA, durationA, offsetFromStart, durationB) => {
          // Ensure B starts after A starts and ends before A ends
          const startB = startA + offsetFromStart
          // Ensure durationB fits within A's interval
          const maxDurationB = durationA - offsetFromStart
          if (maxDurationB <= 0) return true // skip invalid cases
          const clampedDurationB = Math.min(durationB, maxDurationB - 1)
          if (clampedDurationB <= 0) return true // skip if no room

          return detectsOverlap(startA, durationA, startB, clampedDurationB) === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('adjacent intervals (end1 === start2): should NOT overlap', () => {
    fc.assert(
      fc.property(
        arbStartTime(),
        arbDuration(),
        arbDuration(),
        (start1, duration1, duration2) => {
          // Place interval 2 exactly at the end of interval 1
          const start2 = start1 + duration1
          // Adjacent means end1 === start2, which should NOT be detected as overlap
          return detectsOverlap(start1, duration1, start2, duration2) === false
        }
      ),
      { numRuns: 100 }
    )
  })
})
