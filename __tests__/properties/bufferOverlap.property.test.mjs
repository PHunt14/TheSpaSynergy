/**
 * Property-Based Tests for Buffer-Aware Overlap Detection
 *
 * Uses fast-check to validate correctness properties for the
 * buffer-inclusive overlap detection logic.
 *
 * Properties tested:
 * - Buffer time is always respected (no booking can touch the buffer zone)
 * - Overlap detection is symmetric when buffers are equal
 * - Separated intervals never report false positives
 * - Contained intervals always report conflicts
 * - Exact boundary cases are handled correctly (exclusive end)
 *
 * Validates: Double-booking prevention with buffer enforcement
 */

import fc from 'fast-check'
import { intervalsOverlap } from '../../app/utils/overlapDetection.ts'

// ── Generators ────────────────────────────────────────────────

/** Generates a valid start time in minutes from midnight (0–1380, leaving room for duration). */
function arbStartTime() {
  return fc.integer({ min: 0, max: 1380 })
}

/** Generates a positive duration in minutes (1–480, i.e., up to 8 hours). */
function arbDuration() {
  return fc.integer({ min: 1, max: 480 })
}

/** Generates buffer time in minutes (0–60). */
function arbBuffer() {
  return fc.integer({ min: 0, max: 60 })
}

// ── Properties ────────────────────────────────────────────────

describe('Property: Buffer-Aware Overlap Detection', () => {
  test('same start time always overlaps when both have positive duration', () => {
    fc.assert(
      fc.property(
        arbStartTime(),
        arbDuration(),
        arbDuration(),
        arbBuffer(),
        (start, dur1, dur2, buffer) => {
          return intervalsOverlap({
            newStart: start, newDuration: dur1, newBuffer: buffer,
            existingStart: start, existingDuration: dur2, existingBuffer: buffer,
          }) === true
        }
      ),
      { numRuns: 200 }
    )
  })

  test('symmetry: overlap(A,B) === overlap(B,A) when buffers are equal', () => {
    fc.assert(
      fc.property(
        arbStartTime(),
        arbDuration(),
        arbStartTime(),
        arbDuration(),
        arbBuffer(),
        (start1, dur1, start2, dur2, buffer) => {
          const ab = intervalsOverlap({
            newStart: start1, newDuration: dur1, newBuffer: buffer,
            existingStart: start2, existingDuration: dur2, existingBuffer: buffer,
          })
          const ba = intervalsOverlap({
            newStart: start2, newDuration: dur2, newBuffer: buffer,
            existingStart: start1, existingDuration: dur1, existingBuffer: buffer,
          })
          return ab === ba
        }
      ),
      { numRuns: 200 }
    )
  })

  test('non-overlapping: if new ends (with buffer) at or before existing starts, no overlap', () => {
    fc.assert(
      fc.property(
        arbStartTime(),
        arbDuration(),
        arbDuration(),
        arbBuffer(),
        (start1, dur1, dur2, buffer) => {
          // Place start2 so that new interval ends exactly at or before it
          const newEnd = start1 + dur1 + buffer
          const start2 = newEnd // exactly at the boundary

          // Guard: skip if start2 goes beyond reasonable range
          if (start2 > 2000) return true

          return intervalsOverlap({
            newStart: start1, newDuration: dur1, newBuffer: buffer,
            existingStart: start2, existingDuration: dur2, existingBuffer: buffer,
          }) === false
        }
      ),
      { numRuns: 200 }
    )
  })

  test('overlap: if new starts within existing effective range, always overlaps', () => {
    fc.assert(
      fc.property(
        arbStartTime(),
        fc.integer({ min: 30, max: 480 }),
        arbDuration(),
        arbBuffer(),
        (existStart, existDur, newDur, buffer) => {
          // Place new start strictly within existing effective range
          const existEnd = existStart + existDur + buffer
          if (existEnd <= existStart + 1) return true // skip degenerate

          // New starts 1 minute after existing start (guaranteed within range)
          const newStart = existStart + 1

          return intervalsOverlap({
            newStart, newDuration: newDur, newBuffer: buffer,
            existingStart: existStart, existingDuration: existDur, existingBuffer: buffer,
          }) === true
        }
      ),
      { numRuns: 200 }
    )
  })

  test('buffer creates exclusive gap: booking at exactly (existEnd + existBuffer) is OK', () => {
    fc.assert(
      fc.property(
        arbStartTime(),
        arbDuration(),
        arbDuration(),
        arbBuffer(),
        (existStart, existDur, newDur, buffer) => {
          // New starts exactly where existing + buffer ends
          const newStart = existStart + existDur + buffer

          if (newStart > 2000) return true // skip unreasonable

          // The new interval starts exactly at the boundary — should NOT overlap
          // (the boundary is exclusive: newStart < existingEnd is the condition)
          return intervalsOverlap({
            newStart, newDuration: newDur, newBuffer: buffer,
            existingStart: existStart, existingDuration: existDur, existingBuffer: buffer,
          }) === false
        }
      ),
      { numRuns: 200 }
    )
  })

  test('one minute before boundary still overlaps', () => {
    fc.assert(
      fc.property(
        arbStartTime(),
        arbDuration(),
        arbDuration(),
        fc.integer({ min: 1, max: 60 }), // buffer must be at least 1
        (existStart, existDur, newDur, buffer) => {
          // New starts one minute before the boundary
          const boundary = existStart + existDur + buffer
          const newStart = boundary - 1

          if (newStart < 0) return true // skip invalid

          return intervalsOverlap({
            newStart, newDuration: newDur, newBuffer: buffer,
            existingStart: existStart, existingDuration: existDur, existingBuffer: buffer,
          }) === true
        }
      ),
      { numRuns: 200 }
    )
  })

  test('zero buffer allows back-to-back (adjacent) booking', () => {
    fc.assert(
      fc.property(
        arbStartTime(),
        arbDuration(),
        arbDuration(),
        (start, dur1, dur2) => {
          // New starts exactly at the end of existing (no buffer)
          const newStart = start + dur1

          if (newStart > 2000) return true

          return intervalsOverlap({
            newStart, newDuration: dur2, newBuffer: 0,
            existingStart: start, existingDuration: dur1, existingBuffer: 0,
          }) === false
        }
      ),
      { numRuns: 200 }
    )
  })

  test('with buffer, back-to-back at duration boundary always overlaps', () => {
    fc.assert(
      fc.property(
        arbStartTime(),
        arbDuration(),
        arbDuration(),
        fc.integer({ min: 1, max: 60 }),
        (start, dur1, dur2, buffer) => {
          // New starts exactly at duration end (ignoring buffer)
          const newStart = start + dur1

          if (newStart > 2000) return true

          // Existing end with buffer = start + dur1 + buffer
          // newStart(start + dur1) < existingEnd(start + dur1 + buffer) = true (since buffer >= 1)
          // newEnd(start + dur1 + dur2 + buffer) > existingStart(start) = true (since dur1, dur2 >= 1)
          return intervalsOverlap({
            newStart, newDuration: dur2, newBuffer: buffer,
            existingStart: start, existingDuration: dur1, existingBuffer: buffer,
          }) === true
        }
      ),
      { numRuns: 200 }
    )
  })
})
