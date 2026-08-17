import { normalizePhone, normalizeEmail } from './client.js'

/**
 * Detect whether a booking customer is a returning client by matching
 * their phone or email against existing client records.
 *
 * Uses the same normalization logic as the existing client utilities
 * to mirror the secondary index behavior (phone/email GSI lookups).
 *
 * @param {string|null} phone - Phone number provided during booking
 * @param {string|null} email - Email address provided during booking
 * @param {Array<{phone?: string, email?: string}>} clientRecords - Existing client records
 * @returns {{ isReturning: boolean, matchedBy: 'phone' | 'email' | null }}
 */
export function detectReturningClient(phone, email, clientRecords) {
  if (!clientRecords || clientRecords.length === 0) {
    return { isReturning: false, matchedBy: null }
  }

  const normalizedPhone = normalizePhone(phone)
  const normalizedEmail = normalizeEmail(email)

  // Phone match takes priority (mirrors listClientByPhone index lookup)
  if (normalizedPhone) {
    for (const client of clientRecords) {
      const clientPhone = normalizePhone(client.phone)
      if (clientPhone && clientPhone === normalizedPhone) {
        return { isReturning: true, matchedBy: 'phone' }
      }
    }
  }

  // Fall back to email match (mirrors listClientByEmail index lookup)
  if (normalizedEmail) {
    for (const client of clientRecords) {
      const clientEmail = normalizeEmail(client.email)
      if (clientEmail && clientEmail === normalizedEmail) {
        return { isReturning: true, matchedBy: 'email' }
      }
    }
  }

  return { isReturning: false, matchedBy: null }
}
