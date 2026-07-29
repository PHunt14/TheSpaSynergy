import { DAY_NAMES, getRecurrenceHours } from './availability.js'

/**
 * Automatically assigns the required number of staff members for a multi-provider service.
 *
 * Algorithm:
 * 1. Filter to eligible staff: in allowedStaff (or all if empty), active, working at time, no conflicts
 * 2. Count non-cancelled bookings on the date for each eligible staff member
 * 3. Select staff with fewest bookings; ties broken randomly
 * 4. Return exactly providersRequired staff members
 *
 * Pure function — no I/O, no side effects (except random tie-breaking).
 *
 * @param {Object} params
 * @param {Object} params.service - Service with providersRequired, allowedStaff, duration
 * @param {Array} params.staffSchedules - Staff schedule records (visibleId, vendorId, isActive, schedule, name)
 * @param {Array} params.appointments - Existing appointments for the date (dateTime, staffId, customer, status)
 * @param {string} params.date - Date string in YYYY-MM-DD format
 * @param {string} params.time - Time string in HH:MM format
 * @param {number} params.bufferMinutes - Buffer minutes between appointments
 * @returns {Array} Array of StaffAssignment objects { staffId, vendorId, staffName }
 * @throws {Error} If fewer than providersRequired staff are available
 */
export function assignStaff({ service, staffSchedules, appointments, date, time, bufferMinutes }) {
  const providersRequired = service.providersRequired || 1
  const allowedStaff = service.allowedStaff || []
  const duration = service.duration

  const requestedDate = new Date(date + 'T00:00:00')
  const dayOfWeek = DAY_NAMES[requestedDate.getDay()]

  // 1. Filter to eligible staff: in allowedStaff, active, and available at the specific time
  const eligible = staffSchedules.filter(staff => {
    if (!staff.isActive) return false
    if (allowedStaff.length > 0 && !allowedStaff.includes(staff.visibleId)) return false
    if (!isWorkingAtTime(staff, dayOfWeek, requestedDate, time, duration)) return false
    if (hasConflict(staff.visibleId, appointments, time, duration, bufferMinutes)) return false
    return true
  })

  if (eligible.length < providersRequired) {
    throw new Error(
      `Insufficient staff available: need ${providersRequired}, found ${eligible.length}`
    )
  }

  // 2. Count non-cancelled bookings on the date for each eligible staff member
  const bookingCounts = new Map()
  for (const staff of eligible) {
    const count = appointments.filter(
      apt => apt.staffId === staff.visibleId && apt.status !== 'cancelled'
    ).length
    bookingCounts.set(staff.visibleId, count)
  }

  // Sort by fewest bookings; break ties randomly
  const sorted = [...eligible].sort((a, b) => {
    const countA = bookingCounts.get(a.visibleId)
    const countB = bookingCounts.get(b.visibleId)
    if (countA !== countB) return countA - countB
    // Break ties with crypto-safe random to satisfy security scanners
    const arr = new Uint32Array(1)
    crypto.getRandomValues(arr)
    return arr[0] % 2 === 0 ? -1 : 1
  })

  // 3. Return exactly providersRequired staff members
  const assigned = sorted.slice(0, providersRequired)

  return assigned.map(staff => ({
    staffId: staff.visibleId,
    vendorId: staff.vendorId,
    staffName: staff.name || ''
  }))
}

/**
 * Checks if a staff member is working at the given time on the given day.
 */
function isWorkingAtTime(staff, dayOfWeek, requestedDate, time, duration) {
  if (!staff.schedule) return false
  const schedule = typeof staff.schedule === 'string' ? JSON.parse(staff.schedule) : staff.schedule
  const daySchedule = schedule[dayOfWeek]
  if (!daySchedule) return false

  let hours = null
  if (daySchedule.recurrence) {
    hours = getRecurrenceHours(daySchedule, requestedDate)
  } else if (daySchedule.start) {
    hours = { start: daySchedule.start, end: daySchedule.end }
  }

  if (!hours) return false

  const slotStart = timeToMinutes(time)
  const slotEnd = slotStart + duration
  const workStart = timeToMinutes(hours.start)
  const workEnd = timeToMinutes(hours.end)

  return slotStart >= workStart && slotEnd <= workEnd
}

/**
 * Checks if a staff member has a conflicting appointment at the given time.
 */
function hasConflict(staffId, appointments, time, duration, bufferMinutes) {
  const slotStart = timeToMinutes(time)
  const slotEnd = slotStart + duration + bufferMinutes

  return appointments.some(apt => {
    if (apt.status === 'cancelled') return false
    if (apt.staffId !== staffId) return false

    const aptTime = extractTimeFromDateTime(apt.dateTime)
    const aptStart = timeToMinutes(aptTime)
    const customer = typeof apt.customer === 'string' ? JSON.parse(apt.customer) : apt.customer
    // Use the existing appointment's actual duration: blocked time duration, customer-stored
    // duration (from enriched/manual/bundle appointments), or fall back to new service duration
    const aptDuration = (customer?.isBlockedTime && customer?.duration)
      ? customer.duration
      : (customer?.duration || duration)
    const aptEnd = aptStart + aptDuration + bufferMinutes

    return slotStart < aptEnd && slotEnd > aptStart
  })
}

/**
 * Converts a time string "HH:MM" to minutes since midnight.
 */
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

/**
 * Extracts the time portion (HH:MM) from a dateTime string.
 * Handles both "2024-01-15T09:00" and "2024-01-15 09:00" formats.
 */
function extractTimeFromDateTime(dateTime) {
  if (dateTime.includes('T')) {
    return dateTime.split('T')[1].substring(0, 5)
  }
  return dateTime.split(' ')[1]
}
