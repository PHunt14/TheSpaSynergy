/**
 * Calendar utility functions for the time-block calendar view.
 * Pure functions extracted for testability.
 */

export const SLOT_MINUTES = 30
export const DEFAULT_START_HOUR = 6
export const DEFAULT_END_HOUR = 18

/**
 * Get the Sunday start of the week containing the given date.
 */
export function getWeekStart(date) {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Get all 7 dates for the week containing the given date.
 */
export function getWeekDates(date) {
  const start = getWeekStart(date)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

/**
 * Get all dates in the month of the given date.
 */
export function getMonthDates(date) {
  const year = date.getFullYear()
  const month = date.getMonth()
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const dates = []
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d))
  }
  return dates
}

/**
 * Check if two dates are the same calendar day.
 */
export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

/**
 * Parse a raw dateTime string into a Date object, returning null on failure.
 */
export function parseAppointmentDate(rawDateTime) {
  if (!rawDateTime) return null
  try {
    const d = new Date(rawDateTime)
    return isNaN(d.getTime()) ? null : d
  } catch { return null }
}

/**
 * Generate time slot markers for the grid.
 * Each slot is { hour, minute } representing the start of a 30-min block.
 */
export function generateTimeSlots(startHour, endHour) {
  const slots = []
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      slots.push({ hour: h, minute: m })
    }
  }
  return slots
}

/**
 * Calculate the CSS position (top, height in px) for an appointment block.
 * Each 30-min slot = 40px.
 *
 * @param {Date} appointmentDate - The appointment start time
 * @param {number} duration - Duration in minutes
 * @param {number} startHour - The first hour displayed on the grid
 * @returns {{ top: number, height: number }}
 */
export function getBlockPosition(appointmentDate, duration, startHour) {
  const hours = appointmentDate.getHours()
  const minutes = appointmentDate.getMinutes()
  const totalMinutesFromStart = (hours - startHour) * 60 + minutes
  const pxPerSlot = 40
  const top = (totalMinutesFromStart / SLOT_MINUTES) * pxPerSlot
  const height = (duration / SLOT_MINUTES) * pxPerSlot
  return { top, height: Math.max(height, 20) }
}

/**
 * Get the ISO date range for a given view and current date.
 */
export function getDateRangeForView(view, currentDate) {
  if (view === 'day') {
    const start = new Date(currentDate)
    start.setHours(0, 0, 0, 0)
    const end = new Date(currentDate)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }
  if (view === 'week') {
    const start = getWeekStart(currentDate)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    return { start, end }
  }
  // month
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  return { start: new Date(year, month, 1), end: new Date(year, month + 1, 0, 23, 59, 59) }
}
