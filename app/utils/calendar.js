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
  const lastDay = new Date(year, month + 1, 0).getDate()
  const dates = []
  for (let day = 1; day <= lastDay; day++) {
    dates.push(new Date(year, month, day))
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
  if (view === 'day' || view === 'everyone') {
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


/**
 * Calculate layout columns for overlapping appointments.
 * Returns an array of { appointment, column, totalColumns } objects.
 *
 * Algorithm: greedy column assignment. For each appointment (sorted by start time),
 * find the first column where it doesn't overlap with any existing appointment in that column.
 * Then compute totalColumns as the max columns used by any overlapping group.
 *
 * @param {Array} appointments - Appointments with rawDateTime and service.duration
 * @param {number} startHour - Grid start hour (for position calculation)
 * @returns {Array<{ appointment, column, totalColumns }>}
 */
export function computeOverlapLayout(appointments, startHour) {
  if (!appointments || appointments.length === 0) return []

  // Parse and sort by start time
  const items = appointments
    .map(apt => {
      const start = parseAppointmentDate(apt.rawDateTime)
      if (!start) return null
      const customer = apt.customer || {}
      const duration = (customer.isBlockedTime && customer.duration) ? customer.duration : (apt.service?.duration || 30)
      const end = new Date(start.getTime() + duration * 60 * 1000)
      return { appointment: apt, start, end }
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)

  if (items.length === 0) return []

  // Assign columns greedily
  const columns = [] // columns[col] = array of items in that column
  const assignments = [] // { item, column }

  for (const item of items) {
    let placed = false
    for (let col = 0; col < columns.length; col++) {
      // Check if this item overlaps with the last item in this column
      const lastInCol = columns[col][columns[col].length - 1]
      if (item.start >= lastInCol.end) {
        // No overlap — place here
        columns[col].push(item)
        assignments.push({ item, column: col })
        placed = true
        break
      }
    }
    if (!placed) {
      // Need a new column
      columns.push([item])
      assignments.push({ item, column: columns.length - 1 })
    }
  }

  // Now determine totalColumns for each overlapping group.
  // Two items are in the same group if they overlap transitively.
  // For simplicity, we compute the max concurrent overlaps for each item.
  const result = assignments.map(({ item, column }) => {
    // Find all items that overlap with this one
    const overlapping = assignments.filter(({ item: other }) =>
      item.start < other.end && other.start < item.end
    )
    const totalColumns = Math.max(...overlapping.map(o => o.column)) + 1
    return { appointment: item.appointment, column, totalColumns }
  })

  return result
}


/**
 * Group appointments by staffId, returning a Map<staffId, Appointment[]>.
 * Cancelled appointments are excluded from all buckets.
 * Appointments with no staffId or whose staffId doesn't match any active staff
 * are placed in an '__unassigned__' bucket so they remain visible.
 *
 * @param {Array} appointments - All appointments for the day
 * @param {Array} staffList - Active staff members with visibleId
 * @returns {Map<string, Array>} Map of staffId to their appointments (includes '__unassigned__' key if any)
 */
export function groupAppointmentsByStaff(appointments, staffList) {
  const staffIds = new Set(staffList.map(s => s.visibleId))
  const grouped = new Map()
  for (const staff of staffList) {
    grouped.set(staff.visibleId, [])
  }
  const unassigned = []
  for (const apt of appointments) {
    if (apt.status === 'cancelled') continue
    if (apt.staffId && staffIds.has(apt.staffId)) {
      grouped.get(apt.staffId).push(apt)
    } else {
      unassigned.push(apt)
    }
  }
  if (unassigned.length > 0) {
    grouped.set('__unassigned__', unassigned)
  }
  return grouped
}


/**
 * Group appointments by date (YYYY-MM-DD) and then by staffId.
 * Cancelled appointments are excluded. Appointments with no staffId or
 * whose staffId doesn't match any active staff are placed under '__unassigned__'.
 * Appointments whose dateTime doesn't parse or doesn't fall on a weekDate are excluded.
 *
 * @param {Array} appointments - All appointments for the week
 * @param {Array} weekDates - Array of 7 Date objects (Sun-Sat)
 * @param {Array} staffList - Active staff members with visibleId
 * @returns {Map<string, Map<string, Array>>} dateKey → (staffId → appointments[])
 */
export function groupAppointmentsByDateAndStaff(appointments, weekDates, staffList) {
  const staffIds = new Set(staffList.map(s => s.visibleId))

  // Build the outer map with date keys, each containing a staffId map
  const grouped = new Map()
  const dateKeys = new Set()
  for (const d of weekDates) {
    const key = formatDateKey(d)
    dateKeys.add(key)
    const staffMap = new Map()
    for (const staff of staffList) {
      staffMap.set(staff.visibleId, [])
    }
    staffMap.set('__unassigned__', [])
    grouped.set(key, staffMap)
  }

  for (const apt of appointments) {
    if (apt.status === 'cancelled') continue

    const aptDate = parseAppointmentDate(apt.rawDateTime || apt.dateTime)
    if (!aptDate) continue

    const key = formatDateKey(aptDate)
    if (!dateKeys.has(key)) continue

    if (apt.staffId && staffIds.has(apt.staffId)) {
      grouped.get(key).get(apt.staffId).push(apt)
    } else {
      grouped.get(key).get('__unassigned__').push(apt)
    }
  }

  return grouped
}

/**
 * Format a Date as YYYY-MM-DD string.
 * @param {Date} date
 * @returns {string}
 */
function formatDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}


/**
 * Orders staff for multi-staff view: staff grouped by vendor (vendor order),
 * then resource columns at the end.
 *
 * @param {Array} allStaff - All active staff members (StaffSchedule[])
 * @param {Array} vendors - Vendor list in display order
 * @returns {Array} Ordered staff: non-resource members sorted by vendor then name, followed by resources
 */
export function orderStaffColumns(allStaff, vendors) {
  const isResource = (s) => s.visibleId.startsWith('resource-')
  const staffMembers = allStaff.filter(s => !isResource(s))
  const resources = allStaff.filter(isResource)

  const vendorOrder = vendors.map(v => v.vendorId)
  staffMembers.sort((a, b) => {
    const aIdx = vendorOrder.indexOf(a.vendorId)
    const bIdx = vendorOrder.indexOf(b.vendorId)
    if (aIdx !== bIdx) return aIdx - bIdx
    return (a.staffName || '').localeCompare(b.staffName || '')
  })

  return [...staffMembers, ...resources]
}


/**
 * Color palette for multi-staff views (10 distinct colors).
 * Colors cycle for teams with more than 10 staff members.
 */
export const STAFF_COLORS = [
  '#4A90D9', '#E67E22', '#27AE60', '#8E44AD', '#E74C3C',
  '#16A085', '#F39C12', '#2980B9', '#D35400', '#1ABC9C'
]

/**
 * Assign a deterministic color to each staff member based on their position
 * in the ordered staff list. Colors cycle through STAFF_COLORS for teams > 10.
 *
 * @param {Array} orderedStaff - Staff ordered by vendor then name (each has visibleId)
 * @returns {Map<string, string>} staffId → CSS color string
 */
export function assignStaffColors(orderedStaff) {
  const colorMap = new Map()
  if (!orderedStaff || orderedStaff.length === 0) return colorMap

  for (let i = 0; i < orderedStaff.length; i++) {
    const staff = orderedStaff[i]
    const color = STAFF_COLORS[i % STAFF_COLORS.length]
    colorMap.set(staff.visibleId, color)
  }
  return colorMap
}


/**
 * Format week header label in "Month Day – Month Day, Year" format.
 * Uses abbreviated month names (Jan, Feb, Mar, etc.).
 * The year shown is from the end date (Saturday).
 *
 * @param {Array} weekDates - Array of 7 Date objects (Sun-Sat)
 * @returns {string} Formatted header label (e.g., "Jan 12 – Jan 18, 2025")
 */
export function formatWeekHeaderLabel(weekDates) {
  if (!weekDates || weekDates.length < 7) return ''

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const first = weekDates[0]
  const last = weekDates[6]

  const firstMonth = months[first.getMonth()]
  const firstDay = first.getDate()
  const lastMonth = months[last.getMonth()]
  const lastDay = last.getDate()
  const year = last.getFullYear()

  return `${firstMonth} ${firstDay} \u2013 ${lastMonth} ${lastDay}, ${year}`
}


/**
 * Get working hours for a staff member on a given date.
 * Looks up the day-of-week in the staff's schedule JSON and returns
 * start/end times converted to minutes from midnight.
 *
 * @param {Object} schedule - Staff schedule JSON mapping day names to { start, end } or null
 * @param {Date} date - The date to check
 * @returns {{ start: number|null, end: number|null }} Minutes from midnight, or nulls for day off
 */
export function getWorkingHoursForStaff(schedule, date) {
  if (!schedule || !date) return { start: null, end: null }

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const dayName = days[date.getDay()]
  const entry = schedule[dayName]

  if (!entry || !entry.start || !entry.end) return { start: null, end: null }

  const parseTime = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number)
    return hours * 60 + minutes
  }

  return {
    start: parseTime(entry.start),
    end: parseTime(entry.end)
  }
}


/**
 * Compute aggregate working hours for a day across all staff.
 * Returns the earliest start and latest end among all staff scheduled for that day.
 * Parses each staff member's schedule JSON and uses getWorkingHoursForStaff internally.
 * Staff with invalid/unparseable schedule JSON are treated as having no working hours.
 *
 * @param {Array} staffList - Active staff with schedule JSON (each has a `schedule` field)
 * @param {Date} date - The date to check
 * @returns {{ start: number|null, end: number|null }} Minutes from midnight
 */
export function getAggregateWorkingHours(staffList, date) {
  if (!staffList || staffList.length === 0 || !date) {
    return { start: null, end: null }
  }

  let minStart = null
  let maxEnd = null

  for (const staff of staffList) {
    let schedule = staff.schedule

    // Parse schedule JSON if it's a string
    if (typeof schedule === 'string') {
      try {
        schedule = JSON.parse(schedule)
      } catch {
        // Invalid JSON — treat as no working hours for this staff
        continue
      }
    }

    const hours = getWorkingHoursForStaff(schedule, date)

    if (hours.start !== null && hours.end !== null) {
      if (minStart === null || hours.start < minStart) {
        minStart = hours.start
      }
      if (maxEnd === null || hours.end > maxEnd) {
        maxEnd = hours.end
      }
    }
  }

  return { start: minStart, end: maxEnd }
}
