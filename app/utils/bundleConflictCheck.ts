/**
 * Pre-write conflict check for bundle bookings.
 *
 * Before persisting ANY appointments in a bundle, this module verifies:
 * 1. Each staff member has no conflicts with EXISTING appointments (across all relevant vendors)
 * 2. No intra-bundle conflicts: two services in the same bundle assigned to the same staff
 *    at overlapping times (including buffer)
 * 3. Sequential bundles to the same staff enforce buffer between services
 *
 * Uses the shared `intervalsOverlap` and `detectConflict` from overlapDetection.ts
 * as the single source of truth for overlap logic.
 *
 * Requirements: 9.1, 9.3, 9.4, 9.5
 */

import {
  intervalsOverlap,
  detectConflict,
  extractTimeFromDateTime,
  timeToMinutes,
  extractDateFromDateTime,
  type ConflictResult,
} from './overlapDetection';

export interface BundleServiceAssignment {
  serviceId: string;
  staffId: string;
  vendorId: string;
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  duration: number;  // minutes
}

export interface BundleConflictCheckResult {
  hasConflict: boolean;
  conflictType?: 'external' | 'intra-bundle' | 'sequential-buffer';
  conflict?: ConflictResult;
  message?: string;
  /** Which service in the bundle triggered the conflict */
  serviceId?: string;
  /** Which staff member has the conflict */
  staffId?: string;
}

/**
 * Runs a comprehensive pre-write conflict check for all staff members in a bundle booking.
 *
 * This function:
 * 1. Checks each staff member independently against existing appointments for their vendor(s)
 * 2. Detects intra-bundle conflicts (same staff, overlapping times within the bundle)
 * 3. Enforces buffer between sequential services assigned to the same staff
 *
 * @param assignments - The staff assignments for each service in the bundle (with startTime, endTime, duration)
 * @param existingAppointments - All existing non-cancelled appointments across relevant vendors
 * @param serviceDurationMap - Map of serviceId → duration for existing appointments
 * @param bufferMinutes - Buffer minutes to enforce between appointments
 * @param date - The booking date (YYYY-MM-DD) for context
 * @returns BundleConflictCheckResult indicating whether a conflict was found
 */
export function checkBundleConflicts(
  assignments: BundleServiceAssignment[],
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
  bufferMinutes: number,
  date: string
): BundleConflictCheckResult {
  // --- Step 1: Check each staff member against existing external appointments ---
  // Group assignments by staffId to check each independently
  const staffAssignments = new Map<string, BundleServiceAssignment[]>();
  for (const assignment of assignments) {
    if (!staffAssignments.has(assignment.staffId)) {
      staffAssignments.set(assignment.staffId, []);
    }
    staffAssignments.get(assignment.staffId)!.push(assignment);
  }

  for (const [staffId, staffServices] of staffAssignments) {
    for (const service of staffServices) {
      const dateTime = `${date}T${service.startTime}`;

      // Use shared detectConflict to check against existing appointments
      const conflict = detectConflict(
        staffId,
        dateTime,
        service.duration,
        bufferMinutes,
        existingAppointments,
        serviceDurationMap,
        undefined, // no excludeAppointmentId for new bookings
        false // bundle bookings are customer path — not vendor override
      );

      if (conflict) {
        return {
          hasConflict: true,
          conflictType: 'external',
          conflict,
          message: `Staff member ${staffId} has a conflict with an existing appointment at ${conflict.dateTime}`,
          serviceId: service.serviceId,
          staffId,
        };
      }
    }
  }

  // --- Step 2: Detect intra-bundle conflicts ---
  // If the same staff member is assigned to multiple services in the bundle,
  // verify their time slots don't overlap (including buffer)
  const intraBundleResult = checkIntraBundleConflicts(assignments, bufferMinutes);
  if (intraBundleResult.hasConflict) {
    return intraBundleResult;
  }

  // --- Step 3: Enforce sequential buffer for same-staff services ---
  const sequentialResult = checkSequentialBufferEnforcement(assignments, bufferMinutes);
  if (sequentialResult.hasConflict) {
    return sequentialResult;
  }

  return { hasConflict: false };
}

/**
 * Detects intra-bundle conflicts: two services in the same bundle assigned to the same
 * staff member at overlapping times (including buffer).
 *
 * Requirements: 9.3
 */
export function checkIntraBundleConflicts(
  assignments: BundleServiceAssignment[],
  bufferMinutes: number
): BundleConflictCheckResult {
  for (let i = 0; i < assignments.length; i++) {
    for (let j = i + 1; j < assignments.length; j++) {
      const a = assignments[i];
      const b = assignments[j];

      // Only check same-staff assignments
      if (a.staffId !== b.staffId) continue;

      const aStart = timeToMinutes(a.startTime);
      const bStart = timeToMinutes(b.startTime);

      // Use shared intervalsOverlap for consistent overlap detection
      const overlap = intervalsOverlap({
        newStart: aStart,
        newDuration: a.duration,
        newBuffer: bufferMinutes,
        existingStart: bStart,
        existingDuration: b.duration,
        existingBuffer: bufferMinutes,
      });

      if (overlap) {
        return {
          hasConflict: true,
          conflictType: 'intra-bundle',
          message: `Intra-bundle conflict: staff ${a.staffId} is assigned to overlapping services ${a.serviceId} (${a.startTime}) and ${b.serviceId} (${b.startTime})`,
          serviceId: a.serviceId,
          staffId: a.staffId,
        };
      }
    }
  }

  return { hasConflict: false };
}

/**
 * Enforces buffer between sequential services assigned to the same staff member.
 * For sequential bundles, the next service must start AFTER the previous
 * service's duration + buffer has elapsed.
 *
 * Requirements: 9.4
 */
export function checkSequentialBufferEnforcement(
  assignments: BundleServiceAssignment[],
  bufferMinutes: number
): BundleConflictCheckResult {
  // Group by staffId and sort by start time
  const staffAssignments = new Map<string, BundleServiceAssignment[]>();
  for (const assignment of assignments) {
    if (!staffAssignments.has(assignment.staffId)) {
      staffAssignments.set(assignment.staffId, []);
    }
    staffAssignments.get(assignment.staffId)!.push(assignment);
  }

  for (const [staffId, services] of staffAssignments) {
    if (services.length < 2) continue;

    // Sort by start time
    const sorted = [...services].sort(
      (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    );

    // Check that each subsequent service starts after previous duration + buffer
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];

      const currentStart = timeToMinutes(current.startTime);
      const nextStart = timeToMinutes(next.startTime);
      const requiredNextStart = currentStart + current.duration + bufferMinutes;

      if (nextStart < requiredNextStart) {
        return {
          hasConflict: true,
          conflictType: 'sequential-buffer',
          message: `Sequential buffer violation: staff ${staffId} needs ${bufferMinutes}min buffer between ${current.serviceId} (ends at ${current.endTime}) and ${next.serviceId} (starts at ${next.startTime})`,
          serviceId: next.serviceId,
          staffId,
        };
      }
    }
  }

  return { hasConflict: false };
}

/**
 * Queries existing appointments across ALL relevant vendors for a set of staff members.
 * Used for multi-vendor bundle bookings to ensure conflict detection spans all vendors.
 *
 * Requirements: 9.5
 *
 * @param amplifyClient - Amplify data client
 * @param vendorIds - All vendor IDs relevant to the bundle (from staff schedules)
 * @param date - The booking date (YYYY-MM-DD)
 * @returns All non-cancelled appointments across all vendors for that date
 */
export async function queryAppointmentsAcrossVendors(
  amplifyClient: any,
  vendorIds: string[],
  date: string
): Promise<any[]> {
  const appointmentPromises = vendorIds.map(vendorId =>
    amplifyClient.models.Appointment.listAppointmentByVendorIdAndDateTime({
      vendorId,
      dateTime: { beginsWith: date },
    } as any)
  );

  const results = await Promise.all(appointmentPromises);
  return results
    .flatMap((result: any) => (result as any).data || [])
    .filter((apt: any) => apt.status !== 'cancelled');
}

/**
 * Builds a service duration map for existing appointments by resolving service durations in parallel.
 * Skips "blocked" and "manual" service IDs (their duration comes from customer JSON).
 *
 * Requirements: 5.2
 */
export async function buildServiceDurationMap(
  amplifyClient: any,
  appointments: Array<{ serviceId?: string }>
): Promise<Record<string, number>> {
  const serviceIds = [...new Set(appointments.map(a => a.serviceId).filter(Boolean))] as string[];
  const serviceDurationMap: Record<string, number> = {};

  await Promise.all(
    serviceIds.map(async (sid: string) => {
      if (sid === 'blocked' || sid === 'manual') return;
      const { data: svc } = await amplifyClient.models.Service.get({ serviceId: sid });
      if (svc?.duration) serviceDurationMap[sid] = svc.duration as number;
    })
  );

  return serviceDurationMap;
}
