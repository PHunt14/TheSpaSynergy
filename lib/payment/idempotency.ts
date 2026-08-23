import { createHash } from 'node:crypto';

/**
 * Payment type identifiers used in idempotency key generation.
 * These correspond to the different charge types in split/single payments.
 */
export type PaymentType = 'house_fee' | 'staff' | 'full' | 'custom';

/**
 * Produces a stable, truncated SHA-256 hash of a Square source token (nonce).
 * The hash is truncated to 16 hex characters (64 bits) — sufficient for
 * uniqueness within the scope of a single appointment's payment attempts.
 *
 * @param sourceId - The Square source token / nonce string
 * @returns A 16-character hex string derived from SHA-256
 */
export function hashSourceToken(sourceId: string): string {
  const hash = createHash('sha256').update(sourceId).digest('hex');
  return hash.slice(0, 16);
}

/**
 * Generates a deterministic idempotency key for a Square payment API call.
 *
 * The key is derived from three components:
 * - appointmentId: identifies the appointment or charge session
 * - paymentType: distinguishes house_fee vs staff vs full vs custom charges
 * - sourceTokenHash: binds the key to a specific card nonce
 *
 * For split payments, callers should append `-house` or `-staff` suffixes
 * to the base key returned for house_fee/staff types respectively,
 * ensuring each leg of the split uses a distinct idempotency key.
 *
 * Same inputs always produce the same output (deterministic).
 * Different inputs produce different outputs (collision-resistant via SHA-256).
 *
 * @param appointmentId - The appointment or session identifier
 * @param paymentType - The type of payment charge
 * @param sourceTokenHash - The hashed source token (from hashSourceToken)
 * @returns A deterministic idempotency key string
 */
export function generateIdempotencyKey(
  appointmentId: string,
  paymentType: PaymentType,
  sourceTokenHash: string,
): string {
  // Combine components with a delimiter that won't appear in UUIDs or hex strings
  const composite = `${appointmentId}|${paymentType}|${sourceTokenHash}`;
  const hash = createHash('sha256').update(composite).digest('hex');
  // Use first 32 hex chars (128 bits) for the base key — well within Square's
  // 45-character idempotency key limit while providing strong uniqueness
  return hash.slice(0, 32);
}
