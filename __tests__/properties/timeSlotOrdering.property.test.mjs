/**
 * Property-Based Tests for Time Slot Ordering
 *
 * Uses fast-check to validate correctness properties for time slot
 * deduplication and chronological sorting logic.
 * Feature: unified-business-model
 *
 * Properties tested:
 * - Property 8: Time slots are chronologically sorted and deduplicated
 *
 * **Validates: Requirements 5.3, 5.4**
 */

import fc from 'fast-check'

// ── Function Under Test ───────────────────────────────────────
// Replicating the deduplicateAndSort logic from app/api/availability/route.ts
// This function takes an array of { time, display } objects, sorts them
// in ascending chronological order, and removes duplicates by time value.

function deduplicateAndSort(slots) {
  const sorted = [...slots].sort((a, b) => a.time.localeCompare(b.time))
  const seen = new Set()
  const unique = []
  for (const slot of sorted) {
    if (!seen.has(slot.time)) {
      seen.add(slot.time)
      unique.push(slot)
    }
  }
  return unique
}

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a valid HH:MM time string (00:00 to 23:59).
 */
function arbTimeString() {
  return fc.tuple(
    fc.integer({ min: 0, max: 23 }),
    fc.integer({ min: 0, max: 59 })
  ).map(([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
}

/**
 * Generates a display string for a time slot (e.g., "9:00 AM", "2:30 PM").
 */
function arbDisplayString() {
  return fc.tuple(
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 0, max: 59 }),
    fc.constantFrom('AM', 'PM')
  ).map(([h, m, period]) => `${h}:${String(m).padStart(2, '0')} ${period}`)
}

/**
 * Generates a single time slot object { time, display }.
 */
function arbSlot() {
  return fc.tuple(arbTimeString(), arbDisplayString()).map(([time, display]) => ({
    time,
    display,
  }))
}

/**
 * Generates an array of time slots with possible duplicates.
 */
function arbSlots() {
  return fc.array(arbSlot(), { minLength: 0, maxLength: 50 })
}

/**
 * Generates an array of time slots that includes guaranteed duplicates.
 */
function arbSlotsWithDuplicates() {
  return fc.tuple(
    fc.array(arbSlot(), { minLength: 1, maxLength: 20 }),
    fc.integer({ min: 1, max: 5 })
  ).chain(([baseSlots, dupCount]) => {
    // Pick random slots to duplicate
    return fc.tuple(
      fc.constant(baseSlots),
      fc.array(
        fc.integer({ min: 0, max: baseSlots.length - 1 }),
        { minLength: dupCount, maxLength: dupCount }
      ),
      fc.array(arbDisplayString(), { minLength: dupCount, maxLength: dupCount })
    )
  }).map(([baseSlots, indices, displays]) => {
    const duplicates = indices.map((idx, i) => ({
      time: baseSlots[idx].time,
      display: displays[i], // Different display, same time
    }))
    return [...baseSlots, ...duplicates]
  })
}

// ── Property 8: Time slots are chronologically sorted and deduplicated ──

describe('Feature: unified-business-model, Property 8: Time slots are chronologically sorted and deduplicated', () => {
  test('result is sorted: for any adjacent pair, earlier slot time < later slot time', () => {
    fc.assert(
      fc.property(arbSlots(), (slots) => {
        const result = deduplicateAndSort(slots)
        for (let i = 0; i < result.length - 1; i++) {
          if (result[i].time >= result[i + 1].time) {
            return false
          }
        }
        return true
      }),
      { numRuns: 100 }
    )
  })

  test('no duplicates: all time values in the result are unique', () => {
    fc.assert(
      fc.property(arbSlots(), (slots) => {
        const result = deduplicateAndSort(slots)
        const times = result.map((s) => s.time)
        const uniqueTimes = new Set(times)
        return times.length === uniqueTimes.size
      }),
      { numRuns: 100 }
    )
  })

  test('no time is lost: every time value from input appears in the result', () => {
    fc.assert(
      fc.property(arbSlots(), (slots) => {
        const result = deduplicateAndSort(slots)
        const resultTimes = new Set(result.map((s) => s.time))
        for (const slot of slots) {
          if (!resultTimes.has(slot.time)) {
            return false
          }
        }
        return true
      }),
      { numRuns: 100 }
    )
  })

  test('length: result length is <= input length (duplicates removed)', () => {
    fc.assert(
      fc.property(arbSlots(), (slots) => {
        const result = deduplicateAndSort(slots)
        return result.length <= slots.length
      }),
      { numRuns: 100 }
    )
  })

  test('stability: applying the function twice produces the same result (idempotent)', () => {
    fc.assert(
      fc.property(arbSlots(), (slots) => {
        const firstPass = deduplicateAndSort(slots)
        const secondPass = deduplicateAndSort(firstPass)
        if (firstPass.length !== secondPass.length) return false
        for (let i = 0; i < firstPass.length; i++) {
          if (firstPass[i].time !== secondPass[i].time) return false
          if (firstPass[i].display !== secondPass[i].display) return false
        }
        return true
      }),
      { numRuns: 100 }
    )
  })

  test('strictly ascending with duplicates: guaranteed duplicate inputs still produce sorted unique output', () => {
    fc.assert(
      fc.property(arbSlotsWithDuplicates(), (slots) => {
        const result = deduplicateAndSort(slots)
        // Check sorted
        for (let i = 0; i < result.length - 1; i++) {
          if (result[i].time >= result[i + 1].time) return false
        }
        // Check no duplicates
        const times = result.map((s) => s.time)
        return times.length === new Set(times).size
      }),
      { numRuns: 100 }
    )
  })
})
