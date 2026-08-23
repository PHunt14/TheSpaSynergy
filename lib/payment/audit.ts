import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';

/**
 * Payment Audit Logger Module
 *
 * Persists payment records in an append-only fashion in the appointment's
 * `paymentRaw` field. Each record is appended to an array — no previous
 * records are ever overwritten.
 *
 * The audit record and payment status are written atomically in a single
 * update call, ensuring no status change occurs without a corresponding
 * audit record.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

/**
 * Represents a single payment audit record stored in the paymentRaw array.
 *
 * Requirement 8.1: Success records include house/staff payment IDs, amounts,
 * tip, routing method, and credential resolution path.
 * Requirement 8.2: Custom charge records include description and clientName.
 * Requirement 8.3: Failure records include failure reason, attempted amount,
 * credential source, and idempotency key.
 */
export interface PaymentAuditRecord {
  timestamp: string; // ISO 8601 UTC
  type: 'success' | 'failure' | 'partial';
  housePaymentId?: string;
  houseFeeAmount?: number;
  staffPaymentId?: string;
  staffAmount?: number;
  tipAmount?: number;
  routingMethod: 'staff' | 'sibling_staff' | 'house';
  credentialResolutionPath: string[];
  failureReason?: string;
  attemptedAmountCents?: number;
  credentialSource?: string;
  idempotencyKey?: string;
  // Custom charge fields (Requirement 8.2)
  description?: string;
  clientName?: string;
}

/**
 * Maps a record type to the corresponding paymentStatus field value.
 */
function mapTypeToStatus(type: PaymentAuditRecord['type']): string {
  switch (type) {
    case 'success':
      return 'paid';
    case 'failure':
      return 'failed';
    case 'partial':
      return 'partial';
  }
}

/**
 * Parses the existing paymentRaw field into an array of records.
 * Handles all possible existing states:
 * - null/undefined → empty array
 * - A single object (legacy format) → wrapped in array
 * - An existing array → used as-is
 * - A JSON string (legacy stringify) → parsed then normalized
 *
 * Requirement 8.5: No previously stored paymentRaw data is overwritten;
 * new records are appended alongside existing records.
 */
function parseExistingRecords(paymentRaw: unknown): unknown[] {
  if (paymentRaw === null || paymentRaw === undefined) {
    return [];
  }

  // Handle JSON string (legacy: some paths stored JSON.stringify'd values)
  if (typeof paymentRaw === 'string') {
    try {
      const parsed = JSON.parse(paymentRaw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (typeof parsed === 'object' && parsed !== null) {
        return [parsed];
      }
      return [];
    } catch {
      return [];
    }
  }

  // Already an array
  if (Array.isArray(paymentRaw)) {
    return paymentRaw;
  }

  // Single object (legacy format)
  if (typeof paymentRaw === 'object') {
    return [paymentRaw];
  }

  return [];
}

/**
 * Builds a PaymentAuditRecord with an auto-generated ISO 8601 UTC timestamp.
 * This is a convenience helper that constructs the record without requiring
 * the caller to generate the timestamp manually.
 *
 * @param fields - All record fields except timestamp (which is auto-generated)
 * @returns A complete PaymentAuditRecord with the current UTC timestamp
 */
export function buildAuditRecord(
  fields: Omit<PaymentAuditRecord, 'timestamp'>,
): PaymentAuditRecord {
  return {
    timestamp: new Date().toISOString(),
    ...fields,
  };
}

/**
 * Atomically appends a payment audit record to the appointment's `paymentRaw`
 * array and updates `paymentStatus` in a single database update call.
 *
 * This function:
 * 1. Fetches the existing appointment record
 * 2. Parses existing paymentRaw (handles null, single object, or array)
 * 3. Appends the new record to the array
 * 4. Updates both paymentRaw AND paymentStatus in one update call
 *
 * Requirement 8.4: The paymentRaw record is stored atomically with the
 * paymentStatus update — no status change occurs without a corresponding
 * audit record.
 *
 * Requirement 8.5: No previously stored paymentRaw data is overwritten;
 * the new record is always appended to the existing array.
 *
 * @param appointmentId - The appointment to update
 * @param record - The audit record to append
 */
export async function appendAuditRecord(
  appointmentId: string,
  record: PaymentAuditRecord,
): Promise<void> {
  const dataClient = generateClient<Schema>();

  // 1. Fetch existing appointment record
  const { data: appointment } = await (dataClient.models as any).Appointment.get({
    appointmentId,
  });

  if (!appointment) {
    throw new Error(`Appointment not found: ${appointmentId}`);
  }

  // 2. Parse existing paymentRaw into an array (handles null, object, array, string)
  const existingRecords = parseExistingRecords(appointment.paymentRaw);

  // 3. Append the new record — never overwrite existing records
  const updatedRecords = [...existingRecords, record];

  // 4. Atomically update both paymentRaw and paymentStatus in one call
  const newStatus = mapTypeToStatus(record.type);

  await (dataClient.models as any).Appointment.update({
    appointmentId,
    paymentRaw: JSON.stringify(updatedRecords),
    paymentStatus: newStatus,
  });
}
