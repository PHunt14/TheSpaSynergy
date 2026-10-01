import { sendEmail, emailWrapper } from '@/lib/email';

/**
 * Payment observability alerts.
 *
 * We confirmed that server-side payment logs do NOT reach CloudWatch for this
 * app (Amplify SSR compute only ships START/REPORT lines). So a failed or
 * partial payment previously left no visible trace — discovered only when a
 * provider noticed their bank. This module emails an operator on the payment
 * conditions that need human attention, so failures surface immediately.
 *
 * All functions are best-effort and never throw: alerting must not affect the
 * payment response path.
 */

type PaymentAlertKind =
  | 'failure'          // charge failed outright (no money moved)
  | 'partial'          // a charge captured but the paired one failed
  | 'ledger_unrecorded' // provider charged fine, but house-fee obligation write failed

export interface PaymentAlertInput {
  kind: PaymentAlertKind;
  appointmentId?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  serviceName?: string | null;
  customerName?: string | null;
  amount?: number;
  houseFeeAmount?: number;
  paymentId?: string | null;
  housePaymentId?: string | null;
  houseRefunded?: boolean;
  details?: string | null;
}

function alertRecipient(): string | null {
  return (
    process.env.PAYMENT_ALERT_EMAIL ||
    process.env.EMAIL_TEST_ADDRESS ||
    process.env.SES_FROM_EMAIL ||
    null
  );
}

const SUBJECTS: Record<PaymentAlertKind, string> = {
  failure: '⚠️ Payment failed — The Spa Synergy',
  partial: '⚠️ PARTIAL payment — action needed — The Spa Synergy',
  ledger_unrecorded: '⚠️ House fee not recorded — The Spa Synergy',
};

/**
 * Sends an operator alert for a payment event needing attention.
 * Never throws; logs and returns on failure.
 */
export async function sendPaymentAlert(input: PaymentAlertInput): Promise<void> {
  try {
    const to = alertRecipient();
    if (!to) {
      console.error('Payment alert not sent: no PAYMENT_ALERT_EMAIL configured.', input.kind);
      return;
    }

    const rows: string[] = [];
    const row = (label: string, value: unknown) => {
      if (value === undefined || value === null || value === '') return;
      rows.push(`<p style="margin:4px 0;"><strong>${label}:</strong> ${String(value)}</p>`);
    };

    row('Type', input.kind);
    row('Service', input.serviceName);
    row('Provider', input.staffName || input.staffId);
    row('Customer', input.customerName);
    if (typeof input.amount === 'number') row('Amount', `$${input.amount.toFixed(2)}`);
    if (typeof input.houseFeeAmount === 'number') row('House fee', `$${input.houseFeeAmount.toFixed(2)}`);
    row('Appointment', input.appointmentId);
    row('Payment id', input.paymentId);
    row('House payment id', input.housePaymentId);
    if (input.kind === 'partial') {
      row('House charge reversed', input.houseRefunded ? 'YES — card at net $0, safe to retry' : 'NO — a charge may still be live; do NOT recharge');
    }
    row('Details', input.details);

    const guidance =
      input.kind === 'partial'
        ? '<p>Verify in Square whether any charge remains before re-running this payment.</p>'
        : input.kind === 'ledger_unrecorded'
          ? '<p>The customer was charged correctly, but the house-fee obligation was not recorded. Add it manually in the House Fees ledger.</p>'
          : '<p>No money moved. The customer can retry the payment.</p>';

    const html = emailWrapper(`
      <h2 style="color:#c0392b;">Payment needs attention</h2>
      ${rows.join('\n')}
      ${guidance}
    `);

    await sendEmail(to, SUBJECTS[input.kind], html);
  } catch (err) {
    console.error('Failed to send payment alert:', err);
  }
}
