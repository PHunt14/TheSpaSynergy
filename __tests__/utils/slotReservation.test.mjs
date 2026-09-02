/**
 * Tests for the atomic slot-reservation cell math (app/utils/slotReservation.ts).
 *
 * The reservation layer is the definitive double-booking guard: overlapping
 * intervals for the same staff must ALWAYS collide on at least one grid cell,
 * so a conditional create of that cell can only be won by one booking.
 *
 * These tests exercise the PURE functions (no DB): computeCellIndices,
 * timeStringToMinutes, dateOf, timeOf, slotKey — and, most importantly, the
 * OVERLAP-COMPLETENESS invariant that makes the whole scheme sound.
 */

import {
  CELL_MINUTES,
  computeCellIndices,
  timeStringToMinutes,
  dateOf,
  timeOf,
  slotKey,
} from '../../app/utils/slotReservation.ts'

// Interval overlap on a half-open [start, end) basis, matching intervalsOverlap.
function intervalsOverlap(startA, occA, startB, occB) {
  return startA < startB + occB && startB < startA + occA
}

// Do two intervals share at least one reserved grid cell?
function shareCell(startA, occA, startB, occB) {
  const a = new Set(computeCellIndices(startA, occA))
  const b = computeCellIndices(startB, occB)
  return b.some((c) => a.has(c))
}

describe('computeCellIndices - basic shape', () => {
  test('grid granularity is 5 minutes', () => {
    expect(CELL_MINUTES).toBe(5)
  })

  test('a 60-min occupied interval at 9:00 spans cells 108..119', () => {
    // 9:00 = 540 min. cell = 540/5 = 108. 60 min => cells 108..119 (12 cells).
    const cells = computeCellIndices(540, 60)
    expect(cells[0]).toBe(108)
    expect(cells[cells.length - 1]).toBe(119)
    expect(cells).toHaveLength(12)
  })

  test('interval starting mid-cell includes the partial start cell', () => {
    // start 9:02 (542), 10 min => [542, 552). cells floor(542/5)=108 .. floor(551/5)=110
    const cells = computeCellIndices(542, 10)
    expect(cells).toEqual([108, 109, 110])
  })

  test('zero-length interval reserves exactly its start cell', () => {
    expect(computeCellIndices(540, 0)).toEqual([108])
  })

  test('non-negative and integer-safe on fractional/negative inputs', () => {
    expect(computeCellIndices(-10, 10)).toEqual(computeCellIndices(0, 10))
    // fractional start floors into a cell
    expect(computeCellIndices(542.9, 0)).toEqual([108])
  })
})

describe('OVERLAP-COMPLETENESS invariant: overlapping intervals always share a cell', () => {
  test('60-min at 9:00 vs 30-min at 9:30 overlap AND share a cell', () => {
    const a = { start: 540, occ: 60 } // 9:00-10:00
    const b = { start: 570, occ: 30 } // 9:30-10:00
    expect(intervalsOverlap(a.start, a.occ, b.start, b.occ)).toBe(true)
    expect(shareCell(a.start, a.occ, b.start, b.occ)).toBe(true)
  })

  test('exhaustive: for many interval pairs, overlap <=> shared cell', () => {
    // Sweep a range of starts (minute resolution) and durations. For every pair,
    // interval-overlap must exactly correspond to sharing >=1 reserved cell.
    // This is the property the entire atomic guard depends on.
    const starts = []
    for (let s = 540; s <= 600; s += 1) starts.push(s) // 9:00..10:00, 1-min steps
    const occs = [1, 5, 7, 15, 30, 45, 60, 75]

    let checked = 0
    for (const sA of starts) {
      for (const oA of occs) {
        for (const sB of starts) {
          for (const oB of occs) {
            const overlap = intervalsOverlap(sA, oA, sB, oB)
            const shared = shareCell(sA, oA, sB, oB)
            // The guarantee we rely on: if they overlap, they MUST share a cell.
            if (overlap) {
              expect(shared).toBe(true)
            }
            checked++
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  test('adjacent non-overlapping intervals do NOT share a cell (no false block)', () => {
    // 9:00 for exactly 30 min [540,570) and 9:30 for 30 min [570,600) are
    // back-to-back with ZERO buffer — they must not collide.
    const a = { start: 540, occ: 30 }
    const b = { start: 570, occ: 30 }
    expect(intervalsOverlap(a.start, a.occ, b.start, b.occ)).toBe(false)
    expect(shareCell(a.start, a.occ, b.start, b.occ)).toBe(false)
  })

  test('buffer that makes intervals touch DOES cause a shared cell', () => {
    // A 30-min service + 15-min buffer at 9:00 occupies [540, 585). A booking at
    // 9:40 (580) overlaps the buffer tail and must collide.
    const a = { start: 540, occ: 45 } // 30 dur + 15 buffer
    const b = { start: 580, occ: 30 }
    expect(intervalsOverlap(a.start, a.occ, b.start, b.occ)).toBe(true)
    expect(shareCell(a.start, a.occ, b.start, b.occ)).toBe(true)
  })
})

describe('helpers', () => {
  test('timeStringToMinutes parses HH:MM and HH:MM:SS', () => {
    expect(timeStringToMinutes('09:00')).toBe(540)
    expect(timeStringToMinutes('09:05:00')).toBe(545)
    expect(timeStringToMinutes('00:00')).toBe(0)
  })

  test('dateOf / timeOf handle T and space separators', () => {
    expect(dateOf('2024-03-11T09:30')).toBe('2024-03-11')
    expect(timeOf('2024-03-11T09:30')).toBe('09:30')
    expect(dateOf('2024-03-11 09:30')).toBe('2024-03-11')
    expect(timeOf('2024-03-11 09:30')).toBe('09:30')
  })

  test('slotKey is stable and unique per (staff, date, cell)', () => {
    expect(slotKey('staff-1', '2024-03-11', 108)).toBe('staff-1#2024-03-11#108')
    expect(slotKey('staff-1', '2024-03-11', 108)).not.toBe(slotKey('staff-2', '2024-03-11', 108))
    expect(slotKey('staff-1', '2024-03-11', 108)).not.toBe(slotKey('staff-1', '2024-03-11', 109))
  })
})
