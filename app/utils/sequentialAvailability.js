import { DAY_NAMES, getRecurrenceHours } from './availability.js'
import { canAssignBundleStaff } from './bundleStaffAssigner.js'

/**
 * Calculates the total duration of a sequential bundle including buffers.
 *
 * @param {Array} services - Array of service objects with duration
 * @param {number} bufferMinutes - Buffer between services
 * @returns {number} Total minutes
 */
export function calculateTotalBundleDuration(services, bufferMinutes) {
  if (!services || services.length === 0) return 0
  return services.reduce((sum, s) => sum + s.duration, 0) + bufferMinutes * (services.length - 1)
}

/**
 * Calculates start/end times for each service in a sequence given a start time.
 *
 * @param {Array} orderedServices - Services in sequence order
 * @param {string} startTime - HH:MM start of first service
 * @param {number} bufferMinutes - Buffer between services
 * @returns {Array<{ serviceId, startTime: string, endTime: string }>}
 */
export function calculateServiceSchedule(orderedServices, startTime, bufferMinutes) {
  const schedule = []
  let currentMinutes = timeToMinutes(startTime)

  for (let i = 0; i < orderedServices.length; i++) {
    const service = orderedServices[i]
    const serviceStart = currentMinutes
    const serviceEnd = serviceStart + service.duration

    schedule.push({
      serviceId: service.serviceId,
      startTime: minutesToTime(serviceStart),
      endTime: minutesToTime(serviceEnd)
    })

    // Add buffer after this service (but not after the last one)
    if (i < orderedServices.length - 1) {
      currentMinutes = serviceEnd + bufferMinutes
    }
  }

  return schedule
}

/**
 * For a given service order, finds all valid start times on a single day.
 *
 * @param {Object} params
 * @param {Array} params.orderedServices - Services in the desired sequence
 * @param {Object} params.staffSchedulesByService - Map of serviceId → eligible StaffSchedule[]
 * @param {Array} params.appointments - Existing appointments
 * @param {string} params.date - YYYY-MM-DD
 * @param {number} params.bufferMinutes - Buffer between services
 * @returns {Array<{ startTime: string, schedule: Array<{ serviceId, startTime, endTime, staffId }> }>}
 */
export function findSlotsForOrder({ orderedServices, staffSchedulesByService, appointments, date, bufferMinutes }) {
  if (!orderedServices || orderedServices.length === 0) return []

  const requestedDate = new Date(date + 'T00:00:00')
  const dayOfWeek = DAY_NAMES[requestedDate.getDay()]

  const { earliestStart, latestEnd } = getScanRange(orderedServices, staffSchedulesByService, dayOfWeek, requestedDate)
  if (earliestStart === null || latestEnd === null) return []

  const totalDuration = calculateTotalBundleDuration(orderedServices, bufferMinutes)
  if (earliestStart + totalDuration > latestEnd) return []

  const startMinutes = earliestStart % 30 === 0 ? earliestStart : Math.ceil(earliestStart / 30) * 30
  return scanForValidSlots(startMinutes, latestEnd, totalDuration, orderedServices, staffSchedulesByService, appointments, date, bufferMinutes)
}

/**
 * Computes available start times for a sequential bundle of services.
 * Tries all permutations of service ordering (up to 10 services) and returns
 * the union of valid start times with the suggested optimal order.
 *
 * Pure function — no I/O, no side effects.
 *
 * @param {Object} params
 * @param {Array} params.services - Array of service objects with serviceId, duration, allowedStaff, providersRequired, vendorId
 * @param {Object} params.staffSchedulesByService - Map of serviceId → eligible StaffSchedule[]
 * @param {Array} params.appointments - All existing appointments for the date(s) across relevant staff
 * @param {string} params.startDate - Date string YYYY-MM-DD for the first day
 * @param {number} params.bufferMinutes - Buffer between sequential services
 * @param {Array} params.serviceOrder - Optional customer-specified order (array of serviceIds). If null, system finds optimal.
 * @param {boolean} params.multiDay - Whether to consider multi-day scheduling
 * @param {number} params.maxDays - Maximum consecutive days to span (default 1)
 * @returns {{ slots: Array<{ startTime: string, schedule: Array<{ serviceId, startTime, endTime, day }> }>, suggestedOrder: string[] }}
 */
export function getSequentialBundleSlots({
  services,
  staffSchedulesByService,
  appointments,
  startDate,
  bufferMinutes,
  serviceOrder,
  multiDay,
  maxDays
}) {
  const effectiveMaxDays = maxDays || 1

  // If customer specified an order, use only that order
  if (serviceOrder && serviceOrder.length > 0) {
    const orderedServices = serviceOrder.map(id => services.find(s => s.serviceId === id)).filter(Boolean)

    if (multiDay && effectiveMaxDays > 1) {
      const slots = findMultiDaySlots(orderedServices, staffSchedulesByService, appointments, startDate, bufferMinutes, effectiveMaxDays)
      return { slots, suggestedOrder: serviceOrder }
    }

    const slots = findSlotsForOrder({
      orderedServices,
      staffSchedulesByService,
      appointments,
      date: startDate,
      bufferMinutes
    })

    return { slots, suggestedOrder: serviceOrder }
  }

  // Try permutations to find the ordering that yields the most valid slots.
  //
  // We return the slots for that SINGLE best ordering (not a union across all
  // orderings). This is deliberate: the confirm/booking step books the
  // reported `suggestedOrder`, so every slot we show must be valid for exactly
  // that order. Returning a union could surface a start time that is only
  // bookable under a different permutation — the exact "shows available then
  // rejected" bug we're eliminating.
  const permutations = getPermutations(services)
  let bestOrder = services.map(s => s.serviceId)
  let bestSlots = []

  for (const perm of permutations) {
    let slots

    if (multiDay && effectiveMaxDays > 1) {
      slots = findMultiDaySlots(perm, staffSchedulesByService, appointments, startDate, bufferMinutes, effectiveMaxDays)
    } else {
      slots = findSlotsForOrder({
        orderedServices: perm,
        staffSchedulesByService,
        appointments,
        date: startDate,
        bufferMinutes
      })
    }

    if (slots.length > bestSlots.length) {
      bestSlots = slots
      bestOrder = perm.map(s => s.serviceId)
    }
  }

  // Sort slots by startTime
  bestSlots.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))

  return { slots: bestSlots, suggestedOrder: bestOrder }
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Scans time slots in 30-minute increments and collects valid ones.
 */
function scanForValidSlots(startMinutes, latestEnd, totalDuration, orderedServices, staffSchedulesByService, appointments, date, bufferMinutes) {
  const validSlots = []
  let currentMinutes = startMinutes

  while (currentMinutes + totalDuration <= latestEnd) {
    const startTime = minutesToTime(currentMinutes)
    const schedule = calculateServiceSchedule(orderedServices, startTime, bufferMinutes)

    // Gate the slot on the SAME assignment logic the booking route runs. A slot
    // is only "available" if a complete, conflict-free staff assignment exists
    // for this exact ordering — not merely if each service has some free staff
    // (which double-counts a stylist shared across same-vendor services and
    // caused slots to show as available but fail at booking).
    const isValid = canAssignBundleStaff({
      orderedServices,
      staffSchedulesByService,
      appointments,
      date,
      startTime,
      bufferMinutes,
    })

    if (isValid) {
      validSlots.push({
        startTime,
        schedule: schedule.map((entry) => ({ ...entry, staffId: null }))
      })
    }

    currentMinutes += 30
  }

  return validSlots
}

/**
 * Finds multi-day slots by distributing services across consecutive days.
 */
function findMultiDaySlots(orderedServices, staffSchedulesByService, appointments, startDate, bufferMinutes, maxDays) {
  const slots = []
  const distributions = getMultiDayDistributions(orderedServices, maxDays)

  for (const distribution of distributions) {
    const daySlots = findDaySlotsForDistribution(distribution, staffSchedulesByService, appointments, startDate, bufferMinutes)
    if (daySlots) {
      slots.push(buildMultiDaySlot(daySlots))
    }
  }

  return slots
}

/**
 * Attempts to find valid slots for each day in a distribution.
 * Returns null if any day has no available slots.
 */
function findDaySlotsForDistribution(distribution, staffSchedulesByService, appointments, startDate, bufferMinutes) {
  const daySlots = []

  for (let dayOffset = 0; dayOffset < distribution.length; dayOffset++) {
    const dayServices = distribution[dayOffset]
    if (dayServices.length === 0) continue

    const dayDate = addDays(startDate, dayOffset)
    const slotsForDay = findSlotsForOrder({
      orderedServices: dayServices,
      staffSchedulesByService,
      appointments,
      date: dayDate,
      bufferMinutes
    })

    if (slotsForDay.length === 0) return null
    daySlots.push({ dayOffset, date: dayDate, slots: slotsForDay })
  }

  return daySlots.length > 0 ? daySlots : null
}

/**
 * Builds a combined multi-day slot from per-day slot results.
 */
function buildMultiDaySlot(daySlots) {
  const firstSlotPerDay = daySlots.map(ds => ds.slots[0])
  const combinedSchedule = []

  for (let i = 0; i < daySlots.length; i++) {
    for (const entry of firstSlotPerDay[i].schedule) {
      combinedSchedule.push({ ...entry, day: daySlots[i].dayOffset })
    }
  }

  return { startTime: firstSlotPerDay[0].startTime, schedule: combinedSchedule }
}

/**
 * Generates distributions of services across days.
 * For simplicity, tries: all on day 1, split evenly, one per day.
 */
function getMultiDayDistributions(services, maxDays) {
  const distributions = []
  const numServices = services.length
  const daysToUse = Math.min(maxDays, numServices)

  // Distribution 1: all services on day 1
  const allOnOne = [services]
  for (let i = 1; i < daysToUse; i++) allOnOne.push([])
  distributions.push(allOnOne)

  // Distribution 2: split evenly across days
  if (daysToUse > 1) {
    const perDay = Math.ceil(numServices / daysToUse)
    const evenSplit = []
    for (let d = 0; d < daysToUse; d++) {
      evenSplit.push(services.slice(d * perDay, (d + 1) * perDay))
    }
    distributions.push(evenSplit)
  }

  // Distribution 3: one service per day (if enough days)
  if (daysToUse >= numServices) {
    const onePerDay = services.map(s => [s])
    distributions.push(onePerDay)
  }

  return distributions
}

/**
/**
 * Determines the scan range (earliest start, latest end) across all staff for all services.
 */
function getScanRange(orderedServices, staffSchedulesByService, dayOfWeek, requestedDate) {
  let earliestStart = Infinity
  let latestEnd = 0
  let hasAnyHours = false

  for (const service of orderedServices) {
    const staffSchedules = staffSchedulesByService[service.serviceId] || []

    for (const staff of staffSchedules) {
      if (!staff.isActive) continue
      const hours = getStaffHours(staff, dayOfWeek, requestedDate)
      if (!hours) continue

      hasAnyHours = true
      earliestStart = Math.min(earliestStart, timeToMinutes(hours.start))
      latestEnd = Math.max(latestEnd, timeToMinutes(hours.end))
    }
  }

  if (!hasAnyHours) return { earliestStart: null, latestEnd: null }
  return { earliestStart, latestEnd }
}

/**
 * Gets working hours for a staff member on a specific day.
 */
function getStaffHours(staff, dayOfWeek, requestedDate) {
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
 * Generates all permutations of an array.
 * For arrays longer than 5 elements, limits to a subset of permutations
 * to avoid combinatorial explosion (5! = 120, 10! = 3.6M).
 */
function getPermutations(arr) {
  if (arr.length <= 1) return [arr]

  // For larger arrays, use heuristic orderings instead of full permutation
  if (arr.length > 5) {
    return getHeuristicOrderings(arr)
  }

  const result = []
  function permute(current, remaining) {
    if (remaining.length === 0) {
      result.push(current)
      return
    }
    for (let i = 0; i < remaining.length; i++) {
      permute(
        [...current, remaining[i]],
        [...remaining.slice(0, i), ...remaining.slice(i + 1)]
      )
    }
  }
  permute([], arr)
  return result
}

/**
 * For larger service sets, generates a limited set of heuristic orderings:
 * - Original order
 * - Reversed
 * - Sorted by duration (shortest first)
 * - Sorted by duration (longest first)
 * - Random shuffles
 */
function getHeuristicOrderings(arr) {
  const orderings = []

  // Original order
  orderings.push([...arr])

  // Reversed
  orderings.push([...arr].reverse())

  // Shortest duration first
  orderings.push([...arr].sort((a, b) => a.duration - b.duration))

  // Longest duration first
  orderings.push([...arr].sort((a, b) => b.duration - a.duration))

  // Group by vendor (same vendor services together)
  const byVendor = [...arr].sort((a, b) => (a.vendorId || '').localeCompare(b.vendorId || ''))
  orderings.push(byVendor)

  // Interleave vendors (alternate between vendors)
  const interleaved = interleaveByVendor(arr)
  if (interleaved) orderings.push(interleaved)

  return orderings
}

/**
 * Interleaves services by vendor to spread them out.
 */
function interleaveByVendor(services) {
  const vendorGroups = {}
  for (const service of services) {
    const vid = service.vendorId || 'unknown'
    if (!vendorGroups[vid]) vendorGroups[vid] = []
    vendorGroups[vid].push(service)
  }

  const groups = Object.values(vendorGroups)
  if (groups.length < 2) return null

  const result = []
  let maxLen = Math.max(...groups.map(g => g.length))
  for (let i = 0; i < maxLen; i++) {
    for (const group of groups) {
      if (i < group.length) {
        result.push(group[i])
      }
    }
  }

  return result
}

/**
 * Adds days to a date string and returns a new date string.
 */
function addDays(dateStr, days) {
  const date = new Date(dateStr + 'T00:00:00')
  date.setDate(date.getDate() + days)
  return date.toISOString().split('T')[0]
}

/**
 * Converts a time string "HH:MM" to minutes since midnight.
 */
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

/**
 * Converts minutes since midnight to "HH:MM" format.
 */
function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
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
