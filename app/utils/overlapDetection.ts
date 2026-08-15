/**
 * Shared overlap detection utilities for appointment scheduling.
 *
 * Enforces strict no-double-booking rules for customer bookings:
 * - Includes buffer time in overlap calculations
 * - Treats blocked time as unavailable (cannot be booked over)
 * - Prevents any overlap including edge-adjacent buffer violations
 *
 * Vendor/provider self-booking may override via confirmOverlap flag,
 * but this module provides the detection logic only.
 */

export interface OverlapCheckParams {
  /** Start time in minutes from midnight for the new appointment */
  newStart: number;
  /** Duration in minutes for the new appointment */
  newDuration: number;
  /** Buffer minutes to apply after the new appointment */
  newBuffer: number;
  /** Start time in minutes from midnight for the existing appointment */
  existingStart: number;
  /** Duration in minutes for the existing appointment */
  existingDuration: number;
  /** Buffer minutes to apply after the existing appointment */
  existingBuffer: number;
}

export interface ConflictResult {
  appointmentId: string;
  dateTime: string;
  staffId: string;
}

/**
 * Pure overlap detection between two time intervals WITH buffer time.
 *
 * Two intervals conflict if:
 *   newStart < (existingStart + existingDuration + existingBuffer)
 *   AND
 *   (newStart + newDuration + newBuffer) > existingStart
 *
 * This ensures that buffer time is respected on BOTH sides:
 * - The new appointment cannot start during the existing appointment's buffer
 * - The new appointment's buffer cannot extend into the existing appointment
 *
 * @returns true if the intervals overlap (conflict exists)
 */
export function intervalsOverlap(params: OverlapCheckParams): boolean {
  const { newStart, newDuration, newBuffer, existingStart, existingDuration, existingBuffer } = params;

  const newEnd = newStart + newDuration + newBuffer;
  const existingEnd = existingStart + existingDuration + existingBuffer;

  return newStart < existingEnd && newEnd > existingStart;
}

/**
 * Extracts the time portion (HH:MM) from a dateTime string.
 * Handles "2024-01-15T09:00", "2024-01-15T09:00:00", and "2024-01-15 09:00" formats.
 */
export function extractTimeFromDateTime(dateTime: string): string {
  if (dateTime.includes('T')) {
    return dateTime.split('T')[1].substring(0, 5);
  }
  return dateTime.split(' ')[1]?.substring(0, 5) || '00:00';
}

/**
 * Converts a time string "HH:MM" to minutes since midnight.
 */
export function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Extracts date portion (YYYY-MM-DD) from a dateTime string.
 */
export function extractDateFromDateTime(dateTime: string): string {
  if (dateTime.includes('T')) {
    return dateTime.split('T')[0];
  }
  return dateTime.split(' ')[0];
}

/**
 * Determines the effective duration of an existing appointment.
 *
 * For blocked/manual appointments (serviceId = "blocked" or "manual"):
 * - Duration MUST come from the customer JSON field
 * - If the stored duration is missing, null, zero, or negative, an error is thrown immediately
 * - No fallback to a default value or service lookup is allowed
 *
 * For regular appointments:
 * 1. If a service duration is provided (from DB lookup), use that
 * 2. Fall back to defaultDuration
 */
export function getEffectiveAppointmentDuration(
  appointment: { serviceId?: string; customer?: any; status?: string; appointmentId?: string },
  serviceDurationMap: Record<string, number>,
  defaultDuration: number = 60
): number {
  // Parse customer JSON to check for duration
  let customer: Record<string, any> = {};
  if (typeof appointment.customer === 'string') {
    try { customer = JSON.parse(appointment.customer); } catch { customer = {}; }
  } else if (appointment.customer) {
    customer = appointment.customer;
  }

  // Strict enforcement for blocked/manual appointments:
  // Duration must come from customer JSON — no fallback allowed
  if (appointment.serviceId === 'blocked' || appointment.serviceId === 'manual') {
    const duration = customer.duration;
    if (duration == null || duration <= 0) {
      const id = appointment.appointmentId || 'unknown';
      throw new Error(`Blocked/manual appointment ${id} has invalid duration`);
    }
    return duration;
  }

  // Use service duration from the lookup map
  if (appointment.serviceId && serviceDurationMap[appointment.serviceId]) {
    return serviceDurationMap[appointment.serviceId];
  }

  // Regular appointments may store duration in customer JSON
  if (customer.duration) {
    return customer.duration;
  }

  return defaultDuration;
}

/**
 * Checks whether a proposed appointment conflicts with any existing appointments
 * for the same staff member on the same date.
 *
 * This function respects:
 * - Buffer time on both the new and existing appointments
 * - Blocked time (treated as unavailable — cannot be overlapped by customer bookings)
 * - Cancelled appointments are excluded
 * - An optional excludeAppointmentId for edit scenarios
 *
 * @param staffId - The staff member to check conflicts for
 * @param dateTime - The proposed appointment dateTime
 * @param durationMinutes - The proposed appointment duration
 * @param bufferMinutes - Buffer time to enforce (typically from service or vendor)
 * @param existingAppointments - All appointments for the staff's vendor on the date
 * @param serviceDurationMap - Map of serviceId → duration for existing appointments
 * @param excludeAppointmentId - Optional appointment ID to exclude (for edits)
 * @param isVendorBooking - If true, skips blocked-time-as-blocker logic (vendors can book over their own blocks)
 */
export function detectConflict(
  staffId: string,
  dateTime: string,
  durationMinutes: number,
  bufferMinutes: number,
  existingAppointments: Array<{
    appointmentId: string;
    staffId?: string;
    dateTime: string;
    status?: string;
    serviceId?: string;
    customer?: any;
    createdBy?: string;
  }>,
  serviceDurationMap: Record<string, number>,
  excludeAppointmentId?: string,
  isVendorBooking: boolean = false
): ConflictResult | null {
  const timeStr = extractTimeFromDateTime(dateTime);
  const newStart = timeToMinutes(timeStr);

  for (const apt of existingAppointments) {
    // Skip cancelled appointments
    if (apt.status === 'cancelled') continue;

    // Skip the appointment being edited
    if (excludeAppointmentId && apt.appointmentId === excludeAppointmentId) continue;

    // Only check appointments for the same staff member
    if (apt.staffId !== staffId) continue;

    // For customer bookings: blocked time is ALWAYS a conflict (this is the key fix)
    // For vendor bookings: blocked time is still checked for overlap but can be overridden via confirmOverlap
    // We do NOT skip blocked time — it participates in overlap detection.

    const aptTimeStr = extractTimeFromDateTime(apt.dateTime);
    const existingStart = timeToMinutes(aptTimeStr);
    const existingDuration = getEffectiveAppointmentDuration(apt, serviceDurationMap);

    // Apply buffer to both sides for strict no-overlap enforcement
    // The existing appointment's buffer protects time after it
    // The new appointment's buffer protects time after it
    const overlap = intervalsOverlap({
      newStart,
      newDuration: durationMinutes,
      newBuffer: bufferMinutes,
      existingStart,
      existingDuration,
      existingBuffer: bufferMinutes,
    });

    if (overlap) {
      return {
        appointmentId: apt.appointmentId,
        dateTime: apt.dateTime,
        staffId: apt.staffId || staffId,
      };
    }
  }

  return null;
}

/**
 * High-level overlap check that queries appointments from the DB client and runs detectConflict.
 * Used by confirm, reschedule, and other routes that need to verify a staff member's slot is free.
 *
 * @param amplifyClient - Amplify data client
 * @param staffId - Staff visibleId to check
 * @param dateTime - Proposed dateTime for the appointment
 * @param durationMinutes - Duration of the appointment in minutes
 * @param excludeAppointmentId - Optional appointment to exclude (e.g. the one being rescheduled)
 * @param options.onlyConfirmed - If true, only check against confirmed appointments (used by confirm route)
 * @param options.isVendorBooking - If true, treats as vendor booking (can be overridden)
 * @returns ConflictResult or null
 */
export async function checkStaffConflict(
  amplifyClient: any,
  staffId: string,
  dateTime: string,
  durationMinutes: number,
  excludeAppointmentId?: string,
  options: { onlyConfirmed?: boolean; isVendorBooking?: boolean } = {}
): Promise<ConflictResult | null> {
  const date = extractDateFromDateTime(dateTime);

  const { data: staffSchedule } = await amplifyClient.models.StaffSchedule.get({ visibleId: staffId });
  if (!staffSchedule?.vendorId) return null;

  const { data: vendor } = await amplifyClient.models.Vendor.get({ vendorId: staffSchedule.vendorId });
  const bufferMinutes = (vendor?.bufferMinutes as number) ?? 15;

  const { data: existingApts } = await amplifyClient.models.Appointment.listAppointmentByVendorIdAndDateTime({
    vendorId: staffSchedule.vendorId,
    dateTime: { beginsWith: date },
  } as any);

  if (!existingApts || existingApts.length === 0) return null;

  // Optionally filter to only confirmed appointments
  const appointments = options.onlyConfirmed
    ? existingApts.filter((a: any) => a.status === 'confirmed')
    : existingApts;

  if (appointments.length === 0) return null;

  // Build service duration map
  const serviceIds = [...new Set(appointments.map((a: any) => a.serviceId).filter(Boolean))];
  const serviceDurationMap: Record<string, number> = {};
  await Promise.all(serviceIds.map(async (sid: string) => {
    if (sid === 'blocked' || sid === 'manual') return;
    const { data: svc } = await amplifyClient.models.Service.get({ serviceId: sid });
    if (svc?.duration) serviceDurationMap[sid] = svc.duration as number;
  }));

  return detectConflict(
    staffId,
    dateTime,
    durationMinutes,
    bufferMinutes,
    appointments,
    serviceDurationMap,
    excludeAppointmentId,
    options.isVendorBooking || false
  );
}

/**
 * Resolves the effective duration of an appointment from its stored data.
 * Checks customer JSON first, then falls back to service lookup.
 */
export async function resolveAppointmentDuration(
  amplifyClient: any,
  appointment: { serviceId?: string; customer?: any }
): Promise<number> {
  const customer = typeof appointment.customer === 'string'
    ? (() => { try { return JSON.parse(appointment.customer); } catch { return {}; } })()
    : (appointment.customer || {});

  if (customer.duration) return customer.duration;

  if (appointment.serviceId && appointment.serviceId !== 'blocked' && appointment.serviceId !== 'manual') {
    const { data: svc } = await amplifyClient.models.Service.get({ serviceId: appointment.serviceId });
    if (svc?.duration) return svc.duration as number;
  }

  return 60;
}
