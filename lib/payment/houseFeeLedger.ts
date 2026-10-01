import { randomUUID } from 'crypto';

/**
 * House Fee Ledger
 *
 * When a house-fee-enabled service is paid, we charge the PROVIDER the full
 * amount in a single Square charge (this avoids the cross-merchant single-use
 * nonce failure that previously lost the provider portion). The house fee is
 * then recorded here as an obligation: money the provider owes the house.
 *
 * The provider dashboard aggregates these per person per month, and the house
 * marks them settled when collected.
 *
 * This module never throws in a way that would fail an otherwise-successful
 * payment: the customer's card has already been charged correctly, so a ledger
 * write failure must not roll that back. Failures are reported to the caller so
 * they can be surfaced/alerted, but the payment still succeeds.
 */

export interface RecordHouseFeeInput {
  staffId: string;
  staffName?: string | null;
  vendorId?: string | null;
  appointmentId?: string | null;
  serviceId?: string | null;
  serviceName?: string | null;
  customerName?: string | null;
  houseFeeAmount: number;
  /** Square payment id of the full charge to the provider (for audit). */
  paymentId?: string | null;
  /** Optional explicit ISO timestamp; defaults to now. Used to derive month. */
  at?: Date;
}

export interface RecordHouseFeeResult {
  recorded: boolean;
  ledgerId?: string;
  month?: string;
  error?: string;
}

/**
 * Derives the billing month (YYYY-MM, UTC) from a date.
 */
export function billingMonth(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Records a house-fee obligation in the HouseFeeLedger. Idempotency: if an
 * appointmentId is provided and a ledger row already exists for it, we do not
 * create a duplicate (protects against retries / double submits).
 *
 * Never throws — returns { recorded: false, error } on failure so the caller
 * can alert without failing the payment.
 */
export async function recordHouseFeeObligation(
  dataClient: any,
  input: RecordHouseFeeInput,
): Promise<RecordHouseFeeResult> {
  try {
    if (!input.staffId || !(input.houseFeeAmount > 0)) {
      return { recorded: false, error: 'Invalid house fee ledger input' };
    }

    const now = input.at ?? new Date();
    const month = billingMonth(now);

    // Idempotency guard: avoid duplicate obligations for the same appointment.
    if (input.appointmentId) {
      try {
        const { data: existing } = await dataClient.models.HouseFeeLedger.list({
          filter: { appointmentId: { eq: input.appointmentId } },
        });
        if (Array.isArray(existing) && existing.length > 0) {
          return { recorded: true, ledgerId: existing[0].ledgerId, month: existing[0].month };
        }
      } catch {
        // If the lookup fails, fall through and attempt the create. A rare
        // duplicate is preferable to silently dropping the obligation.
      }
    }

    const ledgerId = randomUUID();
    await dataClient.models.HouseFeeLedger.create({
      ledgerId,
      staffId: input.staffId,
      staffName: input.staffName ?? undefined,
      vendorId: input.vendorId ?? undefined,
      appointmentId: input.appointmentId ?? undefined,
      serviceId: input.serviceId ?? undefined,
      serviceName: input.serviceName ?? undefined,
      customerName: input.customerName ?? undefined,
      houseFeeAmount: input.houseFeeAmount,
      month,
      status: 'owed',
      paymentId: input.paymentId ?? undefined,
      createdAt: now.toISOString(),
    });

    return { recorded: true, ledgerId, month };
  } catch (error: any) {
    return {
      recorded: false,
      error: error?.message || 'Failed to record house fee obligation',
    };
  }
}
