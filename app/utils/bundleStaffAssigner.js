import { DAY_NAMES, getRecurrenceHours } from './availability.js'
import { calculateServiceSchedule } from './sequentialAvailability.js'

/**
 * Assigns staff for each service in a sequential bundle.
 * Implements same-staff preference for same-vendor services.
 *
 * Pure function — no I/O.
 *
 * @param {Object} params
 * @param {Array} params.orderedServices - Services in sequence order with serviceId, vendorId, allowedStaff, duration, providersRequired
 * @param {Object} params.staffSchedulesByService - Map of serviceId → eligible StaffSchedule[]
 * @param {Array} params.appointments - Existing appointments for the date
 * @param {string} params.date - YYYY-MM-DD
 * @param {string} params.startTime - HH:MM start of first service
 * @param {number} params.bufferMinutes - Buffer between services
 * @returns {Array<{ serviceId: string, staffId: string, vendorId: string, staffName: string, startTime: string, endTime: string }>}
 * @throws {Error} If staff cannot be assigned for any service
 */
export function assignBundleStaff({
  orderedServices,
  staffSchedulesByService,
  appointments,
  date,
  startTime,
  bufferMinutes
}) {
  // 1. Calculate the schedule (start/end times) for each service
  const schedule = calculateServiceSchedule(orderedServices, startTime, bufferMinutes)

  const requestedDate = new Date(date + 'T00:00:00')
  const dayOfWeek = DAY_NAMES[requestedDate.getDay()]

  // 2. Find eligible staff for each service at its scheduled time
  const eligibleByService = []
  for (let i = 0; i < orderedServices.length; i++) {
    const service = orderedServices[i]
    const serviceSchedule = schedule[i]
    const staffSchedules = staffSchedulesByService[service.serviceId] || []

    const eligible = getEligibleStaff(
      staffSchedules,
      service,
      dayOfWeek,
      requestedDate,
      serviceSchedule.startTime,
      appointments,
      bufferMinutes
    )

    if (eligible.length < (service.providersRequired || 1)) {
      throw new Error(
        `Cannot assign staff for service ${service.serviceId}: need ${service.providersRequired || 1}, found ${eligible.length} eligible`
      )
    }

    eligibleByService.push(eligible)
  }

  // 3. Same-staff preference: group services by vendor and try to assign same staff
  const assignments = new Array(orderedServices.length).fill(null)
  const assignedSlots = [] // Track { staffId, startTime, endTime } for intra-bundle conflict checks

  // Group service indices by vendor
  const vendorGroups = {}
  for (let i = 0; i < orderedServices.length; i++) {
    const vendorId = orderedServices[i].vendorId
    if (!vendorGroups[vendorId]) vendorGroups[vendorId] = []
    vendorGroups[vendorId].push(i)
  }

  // For each vendor group with multiple services, try same-staff assignment
  for (const vendorId of Object.keys(vendorGroups)) {
    const indices = vendorGroups[vendorId]
    if (indices.length < 2) continue

    // Find staff members eligible for ALL services in this vendor group
    const commonStaff = findCommonStaff(indices, eligibleByService, schedule, bufferMinutes)

    if (commonStaff.length > 0) {
      // Prefer auto-assign staff among common staff
      const sorted = sortByAutoAssign(commonStaff, dayOfWeek)
      const chosenStaff = sorted[0]

      // Assign this staff to all services in the vendor group
      for (const idx of indices) {
        assignments[idx] = {
          serviceId: orderedServices[idx].serviceId,
          staffId: chosenStaff.visibleId,
          vendorId: orderedServices[idx].vendorId,
          staffName: chosenStaff.name || '',
          startTime: schedule[idx].startTime,
          endTime: schedule[idx].endTime
        }
        assignedSlots.push({
          staffId: chosenStaff.visibleId,
          startTime: schedule[idx].startTime,
          endTime: schedule[idx].endTime
        })
      }
    }
  }

  // 4. Assign remaining services (those not assigned via same-staff preference)
  for (let i = 0; i < orderedServices.length; i++) {
    if (assignments[i] !== null) continue

    const service = orderedServices[i]
    const serviceSchedule = schedule[i]
    const eligible = eligibleByService[i]
    const providersNeeded = service.providersRequired || 1

    // Filter out staff that would cause intra-bundle conflicts
    const nonConflicting = eligible.filter(staff =>
      !hasIntraBundleConflict(staff.visibleId, serviceSchedule.startTime, serviceSchedule.endTime, assignedSlots, bufferMinutes)
    )

    if (nonConflicting.length < providersNeeded) {
      throw new Error(
        `Cannot assign staff for service ${service.serviceId}: need ${providersNeeded}, found ${nonConflicting.length} without intra-bundle conflicts`
      )
    }

    // Prefer auto-assign staff
    const sorted = sortByAutoAssign(nonConflicting, dayOfWeek)

    if (providersNeeded === 1) {
      const chosenStaff = sorted[0]
      assignments[i] = {
        serviceId: service.serviceId,
        staffId: chosenStaff.visibleId,
        vendorId: service.vendorId,
        staffName: chosenStaff.name || '',
        startTime: serviceSchedule.startTime,
        endTime: serviceSchedule.endTime
      }
      assignedSlots.push({
        staffId: chosenStaff.visibleId,
        startTime: serviceSchedule.startTime,
        endTime: serviceSchedule.endTime
      })
    } else {
      // Multi-provider: assign multiple staff to the same time slot
      const multiAssignment = []
      for (let p = 0; p < providersNeeded; p++) {
        const chosenStaff = sorted[p]
        multiAssignment.push({
          serviceId: service.serviceId,
          staffId: chosenStaff.visibleId,
          vendorId: chosenStaff.vendorId || service.vendorId,
          staffName: chosenStaff.name || '',
          startTime: serviceSchedule.startTime,
          endTime: serviceSchedule.endTime
        })
        assignedSlots.push({
          staffId: chosenStaff.visibleId,
          startTime: serviceSchedule.startTime,
          endTime: serviceSchedule.endTime
        })
      }
      // Store as array — will be flattened later
      assignments[i] = multiAssignment
    }
  }

  // 5. Flatten multi-provider assignments and verify no intra-bundle conflicts
  const flatAssignments = assignments.flat()

  verifyNoIntraBundleConflicts(flatAssignments, bufferMinutes)

  return flatAssignments
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Gets eligible staff for a service at a specific time.
 * Reuses the same eligibility logic as assignStaff in staffAssigner.js:
 * - Must be in allowedStaff
 * - Must be active
 * - Must be within working hours
 * - Must have no conflicting appointments
 */
function getEligibleStaff(staffSchedules, service, dayOfWeek, requestedDate, time, appointments, bufferMinutes) {
  const allowedStaff = service.allowedStaff || []
  const duration = service.duration

  return staffSchedules.filter(staff => {
    if (!staff.isActive) return false
    if (allowedStaff.length > 0 && !allowedStaff.includes(staff.visibleId)) return false
    if (!isWorkingAtTime(staff, dayOfWeek, requestedDate, time, duration)) return false
    if (hasConflict(staff.visibleId, appointments, time, duration, bufferMinutes)) return false
    return true
  })
}

/**
 * Finds staff members eligible for ALL services in a vendor group,
 * also checking that they don't conflict with themselves across the sequential slots.
 */
function findCommonStaff(indices, eligibleByService, schedule, bufferMinutes) {
  if (indices.length === 0) return []

  // Start with eligible staff for the first service in the group
  let common = [...eligibleByService[indices[0]]]

  // Intersect with eligible staff for each subsequent service
  for (let i = 1; i < indices.length; i++) {
    const idx = indices[i]
    const eligibleIds = new Set(eligibleByService[idx].map(s => s.visibleId))
    common = common.filter(s => eligibleIds.has(s.visibleId))
  }

  // Additionally verify no self-conflicts across the sequential time slots
  // Since services are sequential with buffer, a staff member assigned to service A
  // should not conflict with service B if they are properly sequenced
  common = common.filter(staff => {
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        const slotA = schedule[indices[i]]
        const slotB = schedule[indices[j]]
        if (timeSlotsOverlap(slotA.startTime, slotA.endTime, slotB.startTime, slotB.endTime, bufferMinutes)) {
          return false
        }
      }
    }
    return true
  })

  return common
}

/**
 * Sorts staff by auto-assign preference: staff with auto-assign rules for the day come first.
 */
function sortByAutoAssign(staffList, dayOfWeek) {
  const withAutoAssign = []
  const withoutAutoAssign = []

  for (const staff of staffList) {
    if (hasAutoAssignRule(staff, dayOfWeek)) {
      withAutoAssign.push(staff)
    } else {
      withoutAutoAssign.push(staff)
    }
  }

  return [...withAutoAssign, ...withoutAutoAssign]
}

/**
 * Checks if a staff member has an auto-assign rule for the given day.
 */
function hasAutoAssignRule(staff, dayOfWeek) {
  if (!staff.autoAssignRules) return false
  const rules = typeof staff.autoAssignRules === 'string'
    ? JSON.parse(staff.autoAssignRules)
    : staff.autoAssignRules
  return rules.some(r => r.action === 'auto-assign' && r.days?.includes(dayOfWeek))
}

/**
 * Checks if assigning a staff member to a time slot would conflict with existing intra-bundle assignments.
 */
function hasIntraBundleConflict(staffId, startTime, endTime, assignedSlots, bufferMinutes) {
  for (const slot of assignedSlots) {
    if (slot.staffId !== staffId) continue
    if (timeSlotsOverlap(startTime, endTime, slot.startTime, slot.endTime, bufferMinutes)) {
      return true
    }
  }
  return false
}

/**
 * Checks if two time slots overlap (considering buffer).
 */
function timeSlotsOverlap(startA, endA, startB, endB, bufferMinutes) {
  const startAMin = timeToMinutes(startA)
  const endAMin = timeToMinutes(endA) + bufferMinutes
  const startBMin = timeToMinutes(startB)
  const endBMin = timeToMinutes(endB) + bufferMinutes

  return startAMin < endBMin && startBMin < endAMin
}

/**
 * Verifies that no staff member is assigned to overlapping time slots within the bundle.
 * Throws if a conflict is found.
 */
function verifyNoIntraBundleConflicts(assignments, bufferMinutes) {
  for (let i = 0; i < assignments.length; i++) {
    for (let j = i + 1; j < assignments.length; j++) {
      if (assignments[i].staffId !== assignments[j].staffId) continue
      if (timeSlotsOverlap(
        assignments[i].startTime,
        assignments[i].endTime,
        assignments[j].startTime,
        assignments[j].endTime,
        bufferMinutes
      )) {
        throw new Error(
          `Intra-bundle staff conflict: staff ${assignments[i].staffId} assigned to overlapping services ${assignments[i].serviceId} and ${assignments[j].serviceId}`
        )
      }
    }
  }
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
    // Use blocked time duration, or customer-stored duration (from enriched appointments), or fall back to service duration
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
