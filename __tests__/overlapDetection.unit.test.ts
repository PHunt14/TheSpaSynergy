/**
 * Unit tests for overlap detection edge cases.
 *
 * Validates: Requirements 6.3, 6.4, 10.4, 5.3
 *
 * Tests:
 * - Boundary non-overlap: newStart === existingEnd (no conflict)
 * - Boundary overlap: newStart === existingEnd - 1 (conflict)
 * - Zero-minute buffer edge case
 * - Appointments spanning midnight
 * - Maximum-duration appointments (480 min)
 * - Adjacent appointments with zero gap
 * - Strict duration enforcement: error thrown for blocked/manual with missing/null/zero/negative duration
 */

import { describe, test, expect } from '@jest/globals'
import {
  intervalsOverlap,
  getEffectiveAppointmentDuration,
  type OverlapCheckParams,
} from '../app/utils/overlapDetection'

describe('Overlap Detection - Boundary Edge Cases', () => {
  describe('Boundary non-overlap: newStart === existingEnd (no conflict)', () => {
    test('newStart equals existingStart + existingDuration + existingBuffer → NO overlap', () => {
      // Existing: start=100, duration=60, buffer=15 → existingEnd = 175
      // New starts at exactly 175 → boundary non-overlap
      const params: OverlapCheckParams = {
        newStart: 175,
        newDuration: 60,
        newBuffer: 15,
        existingStart: 100,
        existingDuration: 60,
        existingBuffer: 15,
      }
      expect(intervalsOverlap(params)).toBe(false)
    })

    test('boundary non-overlap with zero buffer', () => {
      // Existing: start=540, duration=60, buffer=0 → existingEnd = 600
      // New starts at exactly 600
      const params: OverlapCheckParams = {
        newStart: 600,
        newDuration: 60,
        newBuffer: 0,
        existingStart: 540,
        existingDuration: 60,
        existingBuffer: 0,
      }
      expect(intervalsOverlap(params)).toBe(false)
    })

    test('boundary non-overlap with large buffer', () => {
      // Existing: start=480, duration=120, buffer=60 → existingEnd = 660
      // New starts at exactly 660
      const params: OverlapCheckParams = {
        newStart: 660,
        newDuration: 30,
        newBuffer: 60,
        existingStart: 480,
        existingDuration: 120,
        existingBuffer: 60,
      }
      expect(intervalsOverlap(params)).toBe(false)
    })
  })

  describe('Boundary overlap: newStart === existingEnd - 1 (conflict)', () => {
    test('newStart equals existingStart + existingDuration + existingBuffer - 1 → OVERLAP', () => {
      // Existing: start=100, duration=60, buffer=15 → existingEnd = 175
      // New starts at 174 → one minute before boundary → overlap
      const params: OverlapCheckParams = {
        newStart: 174,
        newDuration: 60,
        newBuffer: 15,
        existingStart: 100,
        existingDuration: 60,
        existingBuffer: 15,
      }
      expect(intervalsOverlap(params)).toBe(true)
    })

    test('boundary overlap with zero buffer', () => {
      // Existing: start=540, duration=60, buffer=0 → existingEnd = 600
      // New starts at 599 → one minute before boundary → overlap
      const params: OverlapCheckParams = {
        newStart: 599,
        newDuration: 60,
        newBuffer: 0,
        existingStart: 540,
        existingDuration: 60,
        existingBuffer: 0,
      }
      expect(intervalsOverlap(params)).toBe(true)
    })

    test('boundary overlap with large buffer', () => {
      // Existing: start=480, duration=120, buffer=60 → existingEnd = 660
      // New starts at 659 → one minute before boundary → overlap
      const params: OverlapCheckParams = {
        newStart: 659,
        newDuration: 30,
        newBuffer: 60,
        existingStart: 480,
        existingDuration: 120,
        existingBuffer: 60,
      }
      expect(intervalsOverlap(params)).toBe(true)
    })
  })

  describe('Zero-minute buffer edge case', () => {
    test('zero buffer on both sides: back-to-back appointments do NOT overlap', () => {
      // Existing: 9:00-10:00 (buffer=0), New: 10:00-11:00 (buffer=0)
      const params: OverlapCheckParams = {
        newStart: 600,
        newDuration: 60,
        newBuffer: 0,
        existingStart: 540,
        existingDuration: 60,
        existingBuffer: 0,
      }
      expect(intervalsOverlap(params)).toBe(false)
    })

    test('zero buffer on both sides: one-minute overlap detected', () => {
      // Existing: 9:00-10:00 (buffer=0), New: 9:59-10:59 (buffer=0)
      const params: OverlapCheckParams = {
        newStart: 599,
        newDuration: 60,
        newBuffer: 0,
        existingStart: 540,
        existingDuration: 60,
        existingBuffer: 0,
      }
      expect(intervalsOverlap(params)).toBe(true)
    })

    test('zero buffer: new ends exactly at existing start → no overlap', () => {
      // New: 8:00-9:00 (buffer=0), Existing starts at 9:00
      const params: OverlapCheckParams = {
        newStart: 480,
        newDuration: 60,
        newBuffer: 0,
        existingStart: 540,
        existingDuration: 60,
        existingBuffer: 0,
      }
      expect(intervalsOverlap(params)).toBe(false)
    })

    test('zero buffer only on new side: existing buffer still protects', () => {
      // Existing: start=540, duration=60, buffer=15 → end=615
      // New: start=610, duration=60, buffer=0
      // newStart(610) < existingEnd(615) = true → overlap
      const params: OverlapCheckParams = {
        newStart: 610,
        newDuration: 60,
        newBuffer: 0,
        existingStart: 540,
        existingDuration: 60,
        existingBuffer: 15,
      }
      expect(intervalsOverlap(params)).toBe(true)
    })

    test('zero buffer only on existing side: new buffer still extends', () => {
      // Existing: start=600, duration=60, buffer=0 → end=660
      // New: start=540, duration=60, buffer=15 → newEnd=615
      // newStart(540) < existingEnd(660) = true, newEnd(615) > existingStart(600) = true → overlap
      const params: OverlapCheckParams = {
        newStart: 540,
        newDuration: 60,
        newBuffer: 15,
        existingStart: 600,
        existingDuration: 60,
        existingBuffer: 0,
      }
      expect(intervalsOverlap(params)).toBe(true)
    })
  })

  describe('Appointments spanning midnight', () => {
    test('late-night appointment near end of day (23:00, 60 min) does not overlap early morning (0 min start)', () => {
      // Note: minutes-from-midnight model. 23:00 = 1380 min.
      // Existing: start=1380, duration=60, buffer=15 → end=1455 (goes past 1440/midnight)
      // New: start=0, duration=60, buffer=15 → newEnd=75
      // newStart(0) < existingEnd(1455) = true, newEnd(75) > existingStart(1380) = false → NO overlap
      // The model treats minutes as plain integers; wraparound is not handled
      const params: OverlapCheckParams = {
        newStart: 0,
        newDuration: 60,
        newBuffer: 15,
        existingStart: 1380,
        existingDuration: 60,
        existingBuffer: 15,
      }
      expect(intervalsOverlap(params)).toBe(false)
    })

    test('appointment at 23:30 with 60-min duration extends to 1470 (past midnight in minutes)', () => {
      // Existing: start=1410 (23:30), duration=60, buffer=15 → end=1485
      // New: start=1440 (midnight boundary), duration=60, buffer=0
      // newStart(1440) < existingEnd(1485) = true, newEnd(1500) > existingStart(1410) = true → OVERLAP
      const params: OverlapCheckParams = {
        newStart: 1440,
        newDuration: 60,
        newBuffer: 0,
        existingStart: 1410,
        existingDuration: 60,
        existingBuffer: 15,
      }
      expect(intervalsOverlap(params)).toBe(true)
    })

    test('two appointments at end of day that do not overlap', () => {
      // Existing: start=1320 (22:00), duration=60, buffer=15 → end=1395
      // New: start=1395 (23:15), duration=45, buffer=0
      const params: OverlapCheckParams = {
        newStart: 1395,
        newDuration: 45,
        newBuffer: 0,
        existingStart: 1320,
        existingDuration: 60,
        existingBuffer: 15,
      }
      expect(intervalsOverlap(params)).toBe(false)
    })
  })

  describe('Maximum-duration appointments (480 min)', () => {
    test('480-minute appointment blocks the entire 8-hour range', () => {
      // Existing: start=480 (8:00 AM), duration=480, buffer=0 → end=960 (4:00 PM)
      // New at 12:00 (720 min) within the range → overlap
      const params: OverlapCheckParams = {
        newStart: 720,
        newDuration: 60,
        newBuffer: 0,
        existingStart: 480,
        existingDuration: 480,
        existingBuffer: 0,
      }
      expect(intervalsOverlap(params)).toBe(true)
    })

    test('480-minute appointment: booking after it ends is allowed', () => {
      // Existing: start=480, duration=480, buffer=15 → end=975
      // New starts at 975
      const params: OverlapCheckParams = {
        newStart: 975,
        newDuration: 60,
        newBuffer: 15,
        existingStart: 480,
        existingDuration: 480,
        existingBuffer: 15,
      }
      expect(intervalsOverlap(params)).toBe(false)
    })

    test('480-minute appointment: booking one minute before end → overlap', () => {
      // Existing: start=480, duration=480, buffer=15 → end=975
      // New starts at 974
      const params: OverlapCheckParams = {
        newStart: 974,
        newDuration: 60,
        newBuffer: 15,
        existingStart: 480,
        existingDuration: 480,
        existingBuffer: 15,
      }
      expect(intervalsOverlap(params)).toBe(true)
    })

    test('new appointment is 480 minutes: blocks a wide window', () => {
      // New: start=480, duration=480, buffer=15 → newEnd=975
      // Existing: start=960, duration=30, buffer=0
      // newStart(480) < existingEnd(990) = true, newEnd(975) > existingStart(960) = true → overlap
      const params: OverlapCheckParams = {
        newStart: 480,
        newDuration: 480,
        newBuffer: 15,
        existingStart: 960,
        existingDuration: 30,
        existingBuffer: 0,
      }
      expect(intervalsOverlap(params)).toBe(true)
    })

    test('two maximum-duration appointments that do not overlap', () => {
      // Existing: start=0, duration=480, buffer=0 → end=480
      // New: start=480, duration=480, buffer=0
      const params: OverlapCheckParams = {
        newStart: 480,
        newDuration: 480,
        newBuffer: 0,
        existingStart: 0,
        existingDuration: 480,
        existingBuffer: 0,
      }
      expect(intervalsOverlap(params)).toBe(false)
    })
  })

  describe('Adjacent appointments with zero gap', () => {
    test('back-to-back with zero buffer: no overlap', () => {
      // Existing ends exactly where new starts (no gap, no buffer)
      const params: OverlapCheckParams = {
        newStart: 600,
        newDuration: 60,
        newBuffer: 0,
        existingStart: 540,
        existingDuration: 60,
        existingBuffer: 0,
      }
      expect(intervalsOverlap(params)).toBe(false)
    })

    test('back-to-back with buffer: overlap because buffer creates gap requirement', () => {
      // Existing: start=540, duration=60, buffer=15 → end=615
      // New starts at 600 → before existingEnd → overlap
      const params: OverlapCheckParams = {
        newStart: 600,
        newDuration: 60,
        newBuffer: 0,
        existingStart: 540,
        existingDuration: 60,
        existingBuffer: 15,
      }
      expect(intervalsOverlap(params)).toBe(true)
    })

    test('adjacent with new buffer extending into existing: overlap', () => {
      // New: start=480, duration=60, buffer=15 → newEnd=555
      // Existing starts at 540. newEnd(555) > existingStart(540) → overlap
      const params: OverlapCheckParams = {
        newStart: 480,
        newDuration: 60,
        newBuffer: 15,
        existingStart: 540,
        existingDuration: 60,
        existingBuffer: 0,
      }
      expect(intervalsOverlap(params)).toBe(true)
    })

    test('adjacent with zero gap and zero buffer on both sides: no overlap', () => {
      // Mirror test — existing ends at 540, new starts at 540
      const params: OverlapCheckParams = {
        newStart: 540,
        newDuration: 60,
        newBuffer: 0,
        existingStart: 480,
        existingDuration: 60,
        existingBuffer: 0,
      }
      expect(intervalsOverlap(params)).toBe(false)
    })

    test('three adjacent zero-gap appointments: middle does not overlap with first or last', () => {
      // First: 480-540, Middle: 540-600, Last: 600-660 (all buffer=0)
      // Middle vs First:
      expect(intervalsOverlap({
        newStart: 540, newDuration: 60, newBuffer: 0,
        existingStart: 480, existingDuration: 60, existingBuffer: 0,
      })).toBe(false)
      // Middle vs Last:
      expect(intervalsOverlap({
        newStart: 540, newDuration: 60, newBuffer: 0,
        existingStart: 600, existingDuration: 60, existingBuffer: 0,
      })).toBe(false)
    })
  })
})

describe('Overlap Detection - Strict Duration Enforcement', () => {
  describe('getEffectiveAppointmentDuration throws for blocked appointments with invalid duration', () => {
    test('throws when blocked appointment has missing duration', () => {
      const apt = {
        appointmentId: 'blocked-1',
        serviceId: 'blocked',
        customer: JSON.stringify({ isBlockedTime: true }),
      }
      expect(() => getEffectiveAppointmentDuration(apt, {})).toThrow(
        'Blocked/manual appointment blocked-1 has invalid duration'
      )
    })

    test('throws when blocked appointment has null duration', () => {
      const apt = {
        appointmentId: 'blocked-2',
        serviceId: 'blocked',
        customer: JSON.stringify({ isBlockedTime: true, duration: null }),
      }
      expect(() => getEffectiveAppointmentDuration(apt, {})).toThrow(
        'Blocked/manual appointment blocked-2 has invalid duration'
      )
    })

    test('throws when blocked appointment has zero duration', () => {
      const apt = {
        appointmentId: 'blocked-3',
        serviceId: 'blocked',
        customer: JSON.stringify({ isBlockedTime: true, duration: 0 }),
      }
      expect(() => getEffectiveAppointmentDuration(apt, {})).toThrow(
        'Blocked/manual appointment blocked-3 has invalid duration'
      )
    })

    test('throws when blocked appointment has negative duration', () => {
      const apt = {
        appointmentId: 'blocked-4',
        serviceId: 'blocked',
        customer: JSON.stringify({ isBlockedTime: true, duration: -30 }),
      }
      expect(() => getEffectiveAppointmentDuration(apt, {})).toThrow(
        'Blocked/manual appointment blocked-4 has invalid duration'
      )
    })
  })

  describe('getEffectiveAppointmentDuration throws for manual appointments with invalid duration', () => {
    test('throws when manual appointment has missing duration', () => {
      const apt = {
        appointmentId: 'manual-1',
        serviceId: 'manual',
        customer: JSON.stringify({ name: 'Manual Entry' }),
      }
      expect(() => getEffectiveAppointmentDuration(apt, {})).toThrow(
        'Blocked/manual appointment manual-1 has invalid duration'
      )
    })

    test('throws when manual appointment has null duration', () => {
      const apt = {
        appointmentId: 'manual-2',
        serviceId: 'manual',
        customer: JSON.stringify({ name: 'Manual Entry', duration: null }),
      }
      expect(() => getEffectiveAppointmentDuration(apt, {})).toThrow(
        'Blocked/manual appointment manual-2 has invalid duration'
      )
    })

    test('throws when manual appointment has zero duration', () => {
      const apt = {
        appointmentId: 'manual-3',
        serviceId: 'manual',
        customer: JSON.stringify({ name: 'Manual Entry', duration: 0 }),
      }
      expect(() => getEffectiveAppointmentDuration(apt, {})).toThrow(
        'Blocked/manual appointment manual-3 has invalid duration'
      )
    })

    test('throws when manual appointment has negative duration', () => {
      const apt = {
        appointmentId: 'manual-4',
        serviceId: 'manual',
        customer: JSON.stringify({ name: 'Manual Entry', duration: -15 }),
      }
      expect(() => getEffectiveAppointmentDuration(apt, {})).toThrow(
        'Blocked/manual appointment manual-4 has invalid duration'
      )
    })
  })

  describe('getEffectiveAppointmentDuration throws with unknown appointmentId', () => {
    test('throws with "unknown" when appointmentId is not provided', () => {
      const apt = {
        serviceId: 'blocked',
        customer: JSON.stringify({ isBlockedTime: true }),
      }
      expect(() => getEffectiveAppointmentDuration(apt, {})).toThrow(
        'Blocked/manual appointment unknown has invalid duration'
      )
    })
  })

  describe('getEffectiveAppointmentDuration returns valid duration for blocked/manual', () => {
    test('returns duration for blocked appointment with valid duration', () => {
      const apt = {
        appointmentId: 'blocked-ok',
        serviceId: 'blocked',
        customer: JSON.stringify({ isBlockedTime: true, duration: 120 }),
      }
      expect(getEffectiveAppointmentDuration(apt, {})).toBe(120)
    })

    test('returns duration for manual appointment with valid duration', () => {
      const apt = {
        appointmentId: 'manual-ok',
        serviceId: 'manual',
        customer: JSON.stringify({ name: 'Valid Manual', duration: 90 }),
      }
      expect(getEffectiveAppointmentDuration(apt, {})).toBe(90)
    })

    test('returns duration from customer object (not string) for blocked', () => {
      const apt = {
        appointmentId: 'blocked-obj',
        serviceId: 'blocked',
        customer: { isBlockedTime: true, duration: 45 },
      }
      expect(getEffectiveAppointmentDuration(apt, {})).toBe(45)
    })
  })
})
