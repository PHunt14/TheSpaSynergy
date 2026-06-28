/**
 * Appointment Target Resolution
 *
 * Resolves which staff member's schedule and Square credentials should be used
 * when creating an appointment. In the unified calendar model, any staff can
 * create appointments on any other staff member's calendar. The appointment is
 * always recorded under the TARGET staff's schedule with THEIR credentials.
 */

export interface StaffRecord {
  visibleId: string
  staffName?: string
  vendorId: string
  isActive: boolean
  squareAccessToken?: string
  squareLocationId?: string
  squareOAuthStatus?: string
}

export interface AppointmentTargetResult {
  recordedUnder: string
  squareCredentials: { accessToken: string; locationId: string } | null
  vendorId: string | undefined
}

/**
 * Resolves which staff member's schedule and Square credentials an appointment
 * should be associated with. The appointment is always recorded under the TARGET
 * staff (the one whose calendar was selected), not the creator.
 *
 * @param creatorStaffId - The staff member creating the appointment
 * @param targetStaffId - The staff member whose calendar the appointment is on
 * @param staffRecords - Array of all staff records to look up credentials
 * @returns The target resolution with recordedUnder, squareCredentials, and vendorId
 */
export function resolveAppointmentTarget(
  creatorStaffId: string,
  targetStaffId: string,
  staffRecords: StaffRecord[]
): AppointmentTargetResult {
  const target = staffRecords.find((s) => s.visibleId === targetStaffId)
  return {
    recordedUnder: targetStaffId,
    squareCredentials: target
      ? { accessToken: target.squareAccessToken!, locationId: target.squareLocationId! }
      : null,
    vendorId: target?.vendorId,
  }
}
