const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

export { DAY_NAMES }

export function getRecurrenceHours(daySchedule, requestedDate) {
  if (daySchedule.recurrence === 'every-other') {
    if (daySchedule.anchorDate) {
      const anchor = new Date(daySchedule.anchorDate + 'T00:00:00')
      const diffMs = requestedDate.getTime() - anchor.getTime()
      const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000))
      if (diffWeeks % 2 === 0) {
        return { start: daySchedule.start, end: daySchedule.end }
      }
    } else {
      const weekNum = Math.floor(requestedDate.getTime() / (7 * 24 * 60 * 60 * 1000))
      if (weekNum % 2 === 0) {
        return { start: daySchedule.start, end: daySchedule.end }
      }
    }
    return null
  }

  if (daySchedule.recurrence === '2nd-of-month') {
    const dayOfMonth = requestedDate.getDate()
    if (dayOfMonth >= 8 && dayOfMonth <= 14) {
      return { start: daySchedule.recurrenceStart, end: daySchedule.recurrenceEnd }
    }
    return null
  }

  return daySchedule.start ? { start: daySchedule.start, end: daySchedule.end } : null
}

export function resolveStaffSync(staffList, dayOfWeek, requestedDate, allowedStaffIds) {
  const isAllowed = (staff) => !allowedStaffIds || allowedStaffIds.length === 0 || allowedStaffIds.includes(staff.visibleId)
  const eligible = staffList.filter(s => s.isActive && isAllowed(s))

  // Helper: check if a staff member actually works on this specific day (respects recurrence)
  const isWorkingThisDay = (staff) => {
    if (!staff.schedule) return false
    const schedule = JSON.parse(staff.schedule)
    const daySchedule = schedule[dayOfWeek]
    if (!daySchedule || !daySchedule.start) return false
    if (daySchedule.recurrence) return !!getRecurrenceHours(daySchedule, requestedDate)?.start
    return true
  }

  // Auto-assign only if the staff member is actually working this day
  const autoAssigned = eligible.find(staff => {
    if (!staff.autoAssignRules) return false
    const rules = JSON.parse(staff.autoAssignRules)
    const hasAutoAssign = rules.some(r => r.action === 'auto-assign' && r.days?.includes(dayOfWeek))
    if (!hasAutoAssign) return false
    // If staff has a schedule defined, verify they work this day; otherwise trust the auto-assign rule
    if (staff.schedule) return isWorkingThisDay(staff)
    return true
  })
  if (autoAssigned) return autoAssigned

  return eligible.find(staff => isWorkingThisDay(staff)) || null
}

export function getDayHoursSync(vendor, service, dayOfWeek, date, ctx) {
  const { staffList, workingHours, saunaHours, spaRoomHours, allowedStaffIds } = ctx
  const isSauna = (service.resourceType || 'staff') === 'sauna'
  const isRoom = (service.resourceType || 'staff') === 'room'

  if (isSauna && saunaHours) {
    return saunaHours[dayOfWeek] || null
  }

  if (isRoom && spaRoomHours) {
    return spaRoomHours[dayOfWeek] || null
  }

  if (!isSauna && !isRoom) {
    const staff = resolveStaffSync(staffList, dayOfWeek, date, allowedStaffIds)
    if (staff) {
      const schedule = JSON.parse(staff.schedule)
      const daySchedule = schedule[dayOfWeek]
      if (daySchedule?.recurrence) {
        return getRecurrenceHours(daySchedule, date)
      }
      return daySchedule || null
    }
    // If staff schedules exist but no one is working this day, don't fall back to vendor hours
    if (staffList && staffList.length > 0) {
      return null
    }
  }

  return workingHours[dayOfWeek] || null
}

export function hasAnySlot(startTime, endTime, duration, buffer, ctx) {
  const { appointments, dateStr, staff } = ctx
  const [startHour, startMin] = startTime.split(':').map(Number)
  const [endHour, endMin] = endTime.split(':').map(Number)

  let current = startHour * 60 + startMin
  const end = endHour * 60 + endMin

  const now = new Date()
  const isToday = dateStr === now.toISOString().split('T')[0]
  const currentTimeMin = isToday ? now.getHours() * 60 + now.getMinutes() : 0

  while (current + duration <= end) {
    if (isToday && current <= currentTimeMin) { current += 30; continue }

    const booked = appointments.some(apt => {
      if (staff && apt.staffId && apt.staffId !== staff.visibleId) return false
      const aptTime = apt.dateTime.includes('T') ? apt.dateTime.split('T')[1].substring(0, 5) : apt.dateTime.split(' ')[1]
      const [aH, aM] = aptTime.split(':').map(Number)
      const aStart = aH * 60 + aM
      // Use blocked time's actual duration if available, otherwise use new service duration
      const customer = typeof apt.customer === 'string' ? JSON.parse(apt.customer) : apt.customer
      const aptDuration = (customer?.isBlockedTime && customer?.duration) ? customer.duration : duration
      const aEnd = aStart + aptDuration + buffer
      const nStart = current
      const nEnd = nStart + duration + buffer
      return nStart < aEnd && nEnd > aStart
    })

    if (!booked) return true
    current += 30
  }

  return false
}

export function timeOverlaps(newTime, bookedTime, duration, buffer, bookedDuration) {
  const [newHour, newMin] = newTime.split(':').map(Number)
  const newStart = newHour * 60 + newMin
  const newEnd = newStart + duration + buffer

  const [bookedHour, bookedMin] = bookedTime.split(':').map(Number)
  const bookedStart = bookedHour * 60 + bookedMin
  const bookedEnd = bookedStart + (bookedDuration || duration) + buffer

  return (newStart < bookedEnd && newEnd > bookedStart)
}

export function generateTimeSlots(startTime, endTime, serviceDuration, bufferMinutes, bookedSlots, date) {
  const slots = []
  const [startHour, startMin] = startTime.split(':').map(Number)
  const [endHour, endMin] = endTime.split(':').map(Number)

  let currentMinutes = startHour * 60 + startMin
  const endMinutes = endHour * 60 + endMin

  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const isToday = date === today
  const currentTimeMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : 0

  while (currentMinutes + serviceDuration <= endMinutes) {
    const hour = Math.floor(currentMinutes / 60)
    const min = currentMinutes % 60
    const timeString = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`

    if (isToday && currentMinutes <= currentTimeMinutes) {
      currentMinutes += 30
      continue
    }

    const isBooked = bookedSlots.some(appointment => {
      const appointmentDateTime = appointment.dateTime
      const appointmentTime = appointmentDateTime.includes('T')
        ? appointmentDateTime.split('T')[1].substring(0, 5)
        : appointmentDateTime.split(' ')[1]
      const customer = typeof appointment.customer === 'string' ? JSON.parse(appointment.customer) : appointment.customer
      const aptDuration = (customer?.isBlockedTime && customer?.duration) ? customer.duration : serviceDuration
      return timeOverlaps(timeString, appointmentTime, serviceDuration, bufferMinutes, aptDuration)
    })

    if (!isBooked) {
      slots.push({
        time: timeString,
        display: formatTime(hour, min)
      })
    }

    currentMinutes += 30
  }

  return slots
}

export function formatTime(hour, min) {
  const period = hour >= 12 ? 'PM' : 'AM'
  let displayHour = hour
  if (hour > 12) displayHour = hour - 12
  else if (hour === 0) displayHour = 12
  return `${displayHour}:${min.toString().padStart(2, '0')} ${period}`
}

/**
 * Computes available time slots for a multi-provider service where at least
 * `providersRequired` staff must be simultaneously free for the full service duration.
 *
 * Pure function — no I/O, no side effects.
 *
 * @param {Object} params
 * @param {Object} params.service - Service with duration, providersRequired, allowedStaff
 * @param {Array} params.staffSchedules - Staff schedule records (visibleId, isActive, schedule, autoAssignRules, vendorId)
 * @param {Array} params.appointments - Existing appointments for the date (dateTime, staffId, customer, status)
 * @param {string} params.date - Date string in YYYY-MM-DD format
 * @param {number} params.bufferMinutes - Buffer minutes between appointments
 * @returns {Array} Array of available time slot objects { time, display }
 */
export function getMultiProviderSlots({ service, staffSchedules, appointments, date, bufferMinutes }) {
  const providersRequired = service.providersRequired || 1
  const allowedStaff = service.allowedStaff || []
  const duration = service.duration

  // 1. Filter staff to those in allowedStaff and active
  const eligibleStaff = staffSchedules.filter(staff =>
    staff.isActive && (allowedStaff.length === 0 || allowedStaff.includes(staff.visibleId))
  )

  if (eligibleStaff.length < providersRequired) {
    return []
  }

  const requestedDate = new Date(date + 'T00:00:00')
  const dayOfWeek = DAY_NAMES[requestedDate.getDay()]

  // 2. Compute per-staff available time ranges
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

  if (staffAvailability.length < providersRequired) {
    return []
  }

  // 3. Find 30-minute-aligned slots where at least providersRequired staff are free
  const slots = []
  // Determine the overall time range to scan (earliest start to latest end across all staff)
  let earliestStart = Infinity
  let latestEnd = 0
  for (const sa of staffAvailability) {
    const startMin = timeToMinutes(sa.hours.start)
    const endMin = timeToMinutes(sa.hours.end)
    if (startMin < earliestStart) earliestStart = startMin
    if (endMin > latestEnd) latestEnd = endMin
  }

  let currentMinutes = earliestStart
  // Align to 30-minute boundary
  if (currentMinutes % 30 !== 0) {
    currentMinutes = Math.ceil(currentMinutes / 30) * 30
  }

  while (currentMinutes + duration <= latestEnd) {
    // Count how many staff are free for the full service duration at this slot
    let freeCount = 0
    for (const sa of staffAvailability) {
      const staffStart = timeToMinutes(sa.hours.start)
      const staffEnd = timeToMinutes(sa.hours.end)

      // Check if slot fits within this staff's working hours
      if (currentMinutes < staffStart || currentMinutes + duration > staffEnd) {
        continue
      }

      // Check if slot conflicts with any of this staff's appointments
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

    if (freeCount >= providersRequired) {
      const hour = Math.floor(currentMinutes / 60)
      const min = currentMinutes % 60
      const timeString = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`
      slots.push({
        time: timeString,
        display: formatTime(hour, min)
      })
    }

    currentMinutes += 30
  }

  return slots
}

/**
 * Gets working hours for a staff member on a specific day, handling recurrence rules.
 */
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
