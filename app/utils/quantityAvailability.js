import { DAY_NAMES, getRecurrenceHours, formatTime } from './availability.js'

/**
 * Multi-Quantity Availability Calculator
 *
 * Finds available time slots when a customer wants to book multiple units
 * of the same service (e.g., 3 men's haircuts).
 *
 * Supports two scheduling modes:
 * - **Parallel**: All units happen at the same time (requires N staff simultaneously free)
 * - **Sequential**: Units happen back-to-back with the same staff member
 *
 * Pure functions — no I/O, no side effects.
 */

/**
 * Finds available time slots for a quantity booking in parallel mode.
 * Each unit requires a separate staff member, all working at the same time.
 *
 * This is essentially the same as multi-provider slots where providersRequired = quantity.
 *
 * @param {Object} params
 * @param {Object} params.service - Service with duration, allowedStaff
 * @param {number} params.quantity - Number of units to book simultaneously
 * @param {Array} params.staffSchedules - Staff schedule records
 * @param {Array} params.appointments - Existing appointments for the date
 * @param {string} params.date - YYYY-MM-DD
 * @param {number} params.bufferMinutes - Buffer between appointments
 * @returns {Array<{ time: string, display: string }>}
 */
export function getParallelQuantitySlots({ service, quantity, staffSchedules, appointments, date, bufferMinutes }) {
  const allowedStaff = service.allowedStaff || []
  const duration = service.duration

  // Filter to eligible staff
  const eligibleStaff = staffSchedules.filter(staff =>
    staff.isActive && allowedStaff.includes(staff.visibleId)
  )

  if (eligibleStaff.length < quantity) {
    return []
  }

  const requestedDate = new Date(date + 'T00:00:00')
  const dayOfWeek = DAY_NAMES[requestedDate.getDay()]

  // Compute per-staff availability
  const staffAvailability = []
  for (const staff of eligibleStaff) {
    const hours = getStaffWorkingHours(staff, dayOfWeek, requestedDate)
    if (!hours) continue

    const staffAppointments = appointments.filter(apt =>
      apt.status !== 'cancelled' && apt.staffId === staff.visibleId
    )

    staffAvailability.push({
      staffId: staff.visibleId,
      hours,
      appointments: staffAppointments
    })
  }

  if (staffAvailability.length < quantity) {
    return []
  }

  // Find slots where at least `quantity` staff are free
  const slots = []
  let earliestStart = Infinity
  let latestEnd = 0
  for (const sa of staffAvailability) {
    const startMin = timeToMinutes(sa.hours.start)
    const endMin = timeToMinutes(sa.hours.end)
    if (startMin < earliestStart) earliestStart = startMin
    if (endMin > latestEnd) latestEnd = endMin
  }

  let currentMinutes = earliestStart
  if (currentMinutes % 30 !== 0) {
    currentMinutes = Math.ceil(currentMinutes / 30) * 30
  }

  // Filter out past times if today
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const isToday = date === today
  const currentTimeMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : 0

  while (currentMinutes + duration <= latestEnd) {
    if (isToday && currentMinutes <= currentTimeMinutes) {
      currentMinutes += 30
      continue
    }

    let freeCount = 0
    for (const sa of staffAvailability) {
      const staffStart = timeToMinutes(sa.hours.start)
      const staffEnd = timeToMinutes(sa.hours.end)

      if (currentMinutes < staffStart || currentMinutes + duration > staffEnd) {
        continue
      }

      const hasConflict = sa.appointments.some(apt => {
        const aptTime = extractTimeFromDateTime(apt.dateTime)
        const aptStart = timeToMinutes(aptTime)
        const customer = typeof apt.customer === 'string' ? JSON.parse(apt.customer) : apt.customer
        const aptDuration = (customer?.isBlockedTime && customer?.duration) ? customer.duration : duration
        const aptEnd = aptStart + aptDuration + bufferMinutes

        const slotStart = currentMinutes
        const slotEnd = slotStart + duration + bufferMinutes

        return slotStart < aptEnd && slotEnd > aptStart
      })

      if (!hasConflict) {
        freeCount++
      }
    }

    if (freeCount >= quantity) {
      const hour = Math.floor(currentMinutes / 60)
      const min = currentMinutes % 60
      const timeString = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`
      slots.push({ time: timeString, display: formatTime(hour, min) })
    }

    currentMinutes += 30
  }

  return slots
}

/**
 * Finds available time slots for a quantity booking in sequential mode.
 * All units are performed back-to-back by the same staff member.
 *
 * Total block = (quantity × duration) + ((quantity - 1) × buffer)
 *
 * @param {Object} params
 * @param {Object} params.service - Service with duration, allowedStaff
 * @param {number} params.quantity - Number of units to book sequentially
 * @param {Array} params.staffSchedules - Staff schedule records
 * @param {Array} params.appointments - Existing appointments for the date
 * @param {string} params.date - YYYY-MM-DD
 * @param {number} params.bufferMinutes - Buffer between appointments
 * @returns {Array<{ time: string, display: string }>}
 */
export function getSequentialQuantitySlots({ service, quantity, staffSchedules, appointments, date, bufferMinutes }) {
  const allowedStaff = service.allowedStaff || []
  const duration = service.duration
  const totalBlock = (quantity * duration) + ((quantity - 1) * bufferMinutes)

  // Filter to eligible staff
  const eligibleStaff = staffSchedules.filter(staff =>
    staff.isActive && allowedStaff.includes(staff.visibleId)
  )

  if (eligibleStaff.length === 0) {
    return []
  }

  const requestedDate = new Date(date + 'T00:00:00')
  const dayOfWeek = DAY_NAMES[requestedDate.getDay()]

  // Compute per-staff availability
  const staffAvailability = []
  for (const staff of eligibleStaff) {
    const hours = getStaffWorkingHours(staff, dayOfWeek, requestedDate)
    if (!hours) continue

    const staffAppointments = appointments.filter(apt =>
      apt.status !== 'cancelled' && apt.staffId === staff.visibleId
    )

    staffAvailability.push({
      staffId: staff.visibleId,
      hours,
      appointments: staffAppointments
    })
  }

  if (staffAvailability.length === 0) {
    return []
  }

  // Find slots where at least one staff member can accommodate the full sequential block
  const slots = []
  let earliestStart = Infinity
  let latestEnd = 0
  for (const sa of staffAvailability) {
    const startMin = timeToMinutes(sa.hours.start)
    const endMin = timeToMinutes(sa.hours.end)
    if (startMin < earliestStart) earliestStart = startMin
    if (endMin > latestEnd) latestEnd = endMin
  }

  let currentMinutes = earliestStart
  if (currentMinutes % 30 !== 0) {
    currentMinutes = Math.ceil(currentMinutes / 30) * 30
  }

  // Filter out past times if today
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const isToday = date === today
  const currentTimeMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : 0

  while (currentMinutes + totalBlock <= latestEnd) {
    if (isToday && currentMinutes <= currentTimeMinutes) {
      currentMinutes += 30
      continue
    }

    // Check if ANY staff member can handle the full sequential block
    let anyStaffFree = false
    for (const sa of staffAvailability) {
      const staffStart = timeToMinutes(sa.hours.start)
      const staffEnd = timeToMinutes(sa.hours.end)

      // Check if the full block fits within this staff's working hours
      if (currentMinutes < staffStart || currentMinutes + totalBlock > staffEnd) {
        continue
      }

      // Check each sub-slot for conflicts
      let blockClear = true
      for (let i = 0; i < quantity; i++) {
        const subSlotStart = currentMinutes + i * (duration + bufferMinutes)
        const subSlotEnd = subSlotStart + duration + bufferMinutes

        const hasConflict = sa.appointments.some(apt => {
          const aptTime = extractTimeFromDateTime(apt.dateTime)
          const aptStart = timeToMinutes(aptTime)
          const customer = typeof apt.customer === 'string' ? JSON.parse(apt.customer) : apt.customer
          const aptDuration = (customer?.isBlockedTime && customer?.duration) ? customer.duration : duration
          const aptEnd = aptStart + aptDuration + bufferMinutes

          return subSlotStart < aptEnd && subSlotEnd > aptStart
        })

        if (hasConflict) {
          blockClear = false
          break
        }
      }

      if (blockClear) {
        anyStaffFree = true
        break
      }
    }

    if (anyStaffFree) {
      const hour = Math.floor(currentMinutes / 60)
      const min = currentMinutes % 60
      const timeString = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`
      slots.push({ time: timeString, display: formatTime(hour, min) })
    }

    currentMinutes += 30
  }

  return slots
}

/**
 * Calculates the total duration for a quantity booking.
 *
 * @param {number} duration - Single service duration in minutes
 * @param {number} quantity - Number of units
 * @param {number} bufferMinutes - Buffer between sequential units
 * @param {'parallel'|'sequential'} mode - Scheduling mode
 * @returns {number} Total minutes
 */
export function calculateQuantityDuration(duration, quantity, bufferMinutes, mode) {
  if (mode === 'parallel') {
    return duration
  }
  // Sequential: N services + (N-1) buffers
  return (quantity * duration) + ((quantity - 1) * bufferMinutes)
}

/**
 * Determines whether parallel booking is possible for a service.
 * Parallel requires multiple staff members in allowedStaff.
 *
 * @param {Object} service - Service with allowedStaff
 * @param {number} quantity - Desired quantity
 * @returns {boolean}
 */
export function canBookParallel(service, quantity) {
  const allowedStaff = service.allowedStaff || []
  return allowedStaff.length >= quantity
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function getStaffWorkingHours(staff, dayOfWeek, requestedDate) {
  if (!staff.schedule) return null
  const schedule = typeof staff.schedule === 'string' ? JSON.parse(staff.schedule) : staff.schedule
  const daySchedule = schedule[dayOfWeek]
  if (!daySchedule) return null

  if (daySchedule.recurrence) {
    return getRecurrenceHours(daySchedule, requestedDate)
  }

  return daySchedule.start ? { start: daySchedule.start, end: daySchedule.end } : null
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

function extractTimeFromDateTime(dateTime) {
  if (dateTime.includes('T')) {
    return dateTime.split('T')[1].substring(0, 5)
  }
  return dateTime.split(' ')[1]
}
