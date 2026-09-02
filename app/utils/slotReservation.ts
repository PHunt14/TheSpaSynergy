/**
 * Atomic slot-reservation layer — the definitive double-booking guard.
 *
 * WHY THIS EXISTS
 * ---------------
 * Overlap detection (overlapDetection.ts) is a check-then-write pattern: it
 * reads existing appointments, does interval math, then writes. Two concurrent
 * requests can both pass that check against the same snapshot and both write —
 * a classic time-of-check-to-time-of-use race. Post-write re-checks shrink the
 * window but cannot close it.
 *
 * This layer closes it at the database level. Each staff member's day is
 * divided into fixed-grid "cells" (CELL_MINUTES apart). A reservation record's
 * primary key IS the cell (`staffId#date#cellIndex`). DynamoDB's auto-generated
 * create mutation is a PutItem with an implicit `attribute_not_exists` condition
 * on the key, so two concurrent creates of the SAME cell can never both succeed
 * — exactly one wins, atomically, with no application-level locking.
 *
 * A booking reserves every cell its occupied interval [start, start+duration+
 * buffer) touches. If ANY cell is already held, the slot overlaps and the
 * booking is rejected. Because overlapping intervals always share at least one
 * cell (see computeCellIndices), this is a complete guard: no two overlapping
 * appointments for the same staff can both hold their cells.
 *
 * Overlap detection is still used first (it produces friendly "pick another
 * time" UX and honors blocked-time / vendor-override semantics). This layer is
 * the atomic backstop that runs at write time.
 */

/** Grid granularity in minutes. 5 min is fine enough for any real spa slot. */
export const CELL_MINUTES = 5;

/**
 * Computes the set of grid cell indices that an occupied interval touches.
 *
 * The interval is [startMinute, startMinute + occupiedMinutes) — a half-open
 * range measured in minutes since midnight, where occupiedMinutes already
 * includes service duration PLUS buffer.
 *
 * A cell `c` spans [c*CELL_MINUTES, (c+1)*CELL_MINUTES). We include every cell
 * that the interval intersects: from floor(start / CELL) up to
 * ceil(end / CELL) - 1.
 *
 * COMPLETENESS: if two intervals overlap (share any positive-length sub-range),
 * that shared range contains a point p. p falls in cell floor(p / CELL), which
 * both intervals' cell sets include. Therefore overlapping intervals ALWAYS
 * share at least one cell — so reserving these cells atomically is a sound and
 * complete conflict guard. Zero-length intervals reserve one cell (the start
 * cell) so even a degenerate booking still claims its start.
 *
 * @param startMinute - interval start, minutes since midnight (>= 0)
 * @param occupiedMinutes - duration + buffer, in minutes (>= 0)
 * @returns sorted array of unique cell indices
 */
export function computeCellIndices(startMinute: number, occupiedMinutes: number): number[] {
  const start = Math.max(0, Math.floor(startMinute));
  const occupied = Math.max(0, Math.floor(occupiedMinutes));
  const endExclusive = start + occupied;

  const firstCell = Math.floor(start / CELL_MINUTES);
  // For a positive-length interval, the last cell is the one containing the last
  // occupied minute (endExclusive - 1). For a zero-length interval, just the
  // start cell.
  const lastCell = occupied > 0
    ? Math.floor((endExclusive - 1) / CELL_MINUTES)
    : firstCell;

  const cells: number[] = [];
  for (let c = firstCell; c <= lastCell; c++) cells.push(c);
  return cells;
}

/** Parses "HH:MM" (or "HH:MM:SS") to minutes since midnight. */
export function timeStringToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Extracts the date (YYYY-MM-DD) portion of a dateTime string. */
export function dateOf(dateTime: string): string {
  if (dateTime.includes('T')) return dateTime.split('T')[0];
  return dateTime.split(' ')[0];
}

/** Extracts the time (HH:MM) portion of a dateTime string. */
export function timeOf(dateTime: string): string {
  if (dateTime.includes('T')) return dateTime.split('T')[1].substring(0, 5);
  return dateTime.split(' ')[1]?.substring(0, 5) || '00:00';
}

/** Builds the reservation primary key for one cell. */
export function slotKey(staffId: string, date: string, cellIndex: number): string {
  return `${staffId}#${date}#${cellIndex}`;
}

export interface ReserveParams {
  staffId: string;
  dateTime: string;        // "YYYY-MM-DDTHH:MM"
  durationMinutes: number; // service duration
  bufferMinutes: number;   // buffer applied AFTER the service
  appointmentId: string;   // owner of these reservations
  vendorId?: string;
  groupId?: string;
}

export interface ReserveResult {
  ok: boolean;
  /** Keys successfully reserved by THIS call (present whether ok or not). */
  reservedKeys: string[];
  /** Set only when ok === false: the cell key that was already taken. */
  conflictingKey?: string;
}

/**
 * Atomically reserves all cells for one staff interval.
 *
 * Creates one SlotReservation per cell via the auto-generated create mutation
 * (conditional PutItem). If any create fails (cell already held by a live
 * appointment, or a concurrent booking won the race), we stop, roll back the
 * cells THIS call already created, and return ok:false. On full success the
 * caller may safely create the appointment — the interval is now exclusively
 * held.
 *
 * @param amplifyClient - Amplify data client (has models.SlotReservation)
 */
export async function reserveSlots(amplifyClient: any, params: ReserveParams): Promise<ReserveResult> {
  const { staffId, dateTime, durationMinutes, bufferMinutes, appointmentId, vendorId, groupId } = params;

  const date = dateOf(dateTime);
  const startMinute = timeStringToMinutes(timeOf(dateTime));
  const occupied = Math.max(0, durationMinutes) + Math.max(0, bufferMinutes);
  const cells = computeCellIndices(startMinute, occupied);

  const reservedKeys: string[] = [];

  for (const cellIndex of cells) {
    const key = slotKey(staffId, date, cellIndex);
    try {
      const { errors } = await amplifyClient.models.SlotReservation.create({
        slotKey: key,
        appointmentId,
        staffId,
        vendorId: vendorId || undefined,
        date,
        cellIndex,
        groupId: groupId || undefined,
        createdAt: new Date().toISOString(),
      });

      if (errors && errors.length > 0) {
        // The conditional PutItem failed — the cell is already held.
        await releaseKeys(amplifyClient, reservedKeys);
        return { ok: false, reservedKeys: [], conflictingKey: key };
      }
      reservedKeys.push(key);
    } catch {
      // Network / conditional-check exception is treated as "cell taken".
      await releaseKeys(amplifyClient, reservedKeys);
      return { ok: false, reservedKeys: [], conflictingKey: key };
    }
  }

  return { ok: true, reservedKeys };
}

/**
 * Reserves the SAME interval for several staff at once (multi-provider, parallel
 * quantity). All-or-nothing: if any staff's reservation fails, every staff's
 * cells reserved so far are released and ok:false is returned.
 */
export async function reserveSlotsForMany(
  amplifyClient: any,
  items: ReserveParams[]
): Promise<{ ok: boolean; reservedKeys: string[]; conflictingKey?: string }> {
  const allKeys: string[] = [];
  for (const item of items) {
    const res = await reserveSlots(amplifyClient, item);
    if (!res.ok) {
      await releaseKeys(amplifyClient, allKeys);
      return { ok: false, reservedKeys: [], conflictingKey: res.conflictingKey };
    }
    allKeys.push(...res.reservedKeys);
  }
  return { ok: true, reservedKeys: allKeys };
}

/** Deletes a specific set of reservation keys (used for rollback). */
export async function releaseKeys(amplifyClient: any, keys: string[]): Promise<void> {
  await Promise.all(
    keys.map((slotKeyValue) =>
      amplifyClient.models.SlotReservation.delete({ slotKey: slotKeyValue }).catch(() => {})
    )
  );
}

/**
 * Releases every reservation owned by an appointment (used on cancel / before a
 * move). Looks up cells via the appointmentId secondary index and deletes them.
 */
export async function releaseByAppointmentId(amplifyClient: any, appointmentId: string): Promise<void> {
  try {
    const { data } = await amplifyClient.models.SlotReservation.listSlotReservationByAppointmentId({
      appointmentId,
    });
    const keys = (data || []).map((r: any) => r.slotKey);
    await releaseKeys(amplifyClient, keys);
  } catch {
    // Best-effort: a failed release only risks a stale hold, never a double-book.
  }
}

/**
 * Moves an appointment's reservations to a new staff/time atomically:
 * reserve the new interval first, and only if that succeeds release the old
 * cells. If the new interval is taken, the old reservation stays intact and
 * ok:false is returned (the move is rejected, nothing is lost).
 */
export async function moveReservation(
  amplifyClient: any,
  appointmentId: string,
  next: ReserveParams
): Promise<ReserveResult> {
  const res = await reserveSlots(amplifyClient, { ...next, appointmentId });
  if (!res.ok) return res;
  // New interval secured — now drop the old cells that aren't part of the new set.
  const newKeySet = new Set(res.reservedKeys);
  try {
    const { data } = await amplifyClient.models.SlotReservation.listSlotReservationByAppointmentId({
      appointmentId,
    });
    const stale = (data || [])
      .map((r: any) => r.slotKey)
      .filter((k: string) => !newKeySet.has(k));
    await releaseKeys(amplifyClient, stale);
  } catch {
    // Non-fatal — worst case a few stale holds linger.
  }
  return res;
}
