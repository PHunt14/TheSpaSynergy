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

  const autoAssigned = eligible.find(staff => {
    if (!staff.autoAssignRules) return false
    const rules = JSON.parse(staff.autoAssignRules)
    return rules.some(r => r.action === 'auto-assign' && r.days?.includes(dayOfWeek))
  })
  if (autoAssigned) return autoAssigned

  return eligible.find(staff => {
    if (!staff.schedule) return false
    const schedule = JSON.parse(staff.schedule)
    const daySchedule = schedule[dayOfWeek]
    if (!daySchedule) return false
    if (daySchedule.recurrence) return !!getRecurrenceHours(daySchedule, requestedDate)?.start
    return !!daySchedule.start
  }) || null
}

export function getDayHoursSync(vendor, service, dayOfWeek, date, ctx) {
  const { staffList, workingHours, saunaHours, allowedStaffIds } = ctx
  const isSauna = (service.resourceType || 'staff') === 'sauna'

  if (isSauna && saunaHours) {
    return saunaHours[dayOfWeek] || null
  }

  if (!isSauna) {
    const staff = resolveStaffSync(staffList, dayOfWeek, date, allowedStaffIds)
    if (staff) {
      const schedule = JSON.parse(staff.schedule)
      const daySchedule = schedule[dayOfWeek]
      if (daySchedule?.recurrence) {
        return getRecurrenceHours(daySchedule, date)
      }
      return daySchedule || null
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
