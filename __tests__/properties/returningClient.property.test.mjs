/**
 * Property-Based Tests for Returning Client Detection
 *
 * Uses fast-check to validate correctness properties for returning client
 * detection based on phone/email matching against existing client records.
 * Feature: booking-enhancements
 *
 * Properties tested:
 * - Property 3: Returning client detection
 *
 * **Validates: Requirements 2.9**
 */

import fc from 'fast-check'
import { detectReturningClient } from '../../app/utils/returningClientDetector.js'

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a valid US phone number (10 digits).
 */
function arbPhone() {
  return fc.stringMatching(/^[2-9]\d{2}[2-9]\d{6}$/)
}

/**
 * Generates a formatted phone number with various separators.
 */
function arbFormattedPhone() {
  return arbPhone().map((digits) => {
    const formats = [
      `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`,
      `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`,
      `+1${digits}`,
      `1${digits}`,
      digits,
    ]
    return formats[Math.floor(Math.random() * formats.length)]
  })
}

/**
 * Generates a valid email address.
 */
function arbEmail() {
  return fc
    .tuple(
      fc.stringMatching(/^[a-z][a-z0-9.]{1,15}$/),
      fc.stringMatching(/^[a-z]{2,10}$/),
      fc.constantFrom('com', 'org', 'net', 'io', 'co')
    )
    .map(([local, domain, tld]) => `${local}@${domain}.${tld}`)
}

/**
 * Generates a client record with phone and/or email.
 */
function arbClientRecord() {
  return fc
    .tuple(arbPhone(), arbEmail(), fc.constantFrom('both', 'phone-only', 'email-only'))
    .map(([phone, email, mode]) => {
      if (mode === 'phone-only') return { phone, email: null }
      if (mode === 'email-only') return { phone: null, email }
      return { phone, email }
    })
}

/**
 * Generates a list of client records (simulating the database).
 */
function arbClientRecords() {
  return fc.array(arbClientRecord(), { minLength: 1, maxLength: 20 })
}

// ── Property 3: Returning client detection ────────────────────

describe('Feature: booking-enhancements, Property 3: Returning client detection', () => {
  test('phone match identifies returning client', () => {
    fc.assert(
      fc.property(
        arbClientRecords(),
        fc.nat({ max: 19 }),
        (clientRecords, indexSeed) => {
          // Pick a client record that has a phone
          const clientsWithPhone = clientRecords.filter((c) => c.phone)
          if (clientsWithPhone.length === 0) return true // skip if no phone records

          const targetClient = clientsWithPhone[indexSeed % clientsWithPhone.length]
          const bookingPhone = targetClient.phone

          const result = detectReturningClient(bookingPhone, null, clientRecords)
          return result.isReturning === true && result.matchedBy === 'phone'
        }
      ),
      { numRuns: 100 }
    )
  })

  test('email match identifies returning client', () => {
    fc.assert(
      fc.property(
        arbClientRecords(),
        fc.nat({ max: 19 }),
        (clientRecords, indexSeed) => {
          // Pick a client record that has an email
          const clientsWithEmail = clientRecords.filter((c) => c.email)
          if (clientsWithEmail.length === 0) return true // skip if no email records

          const targetClient = clientsWithEmail[indexSeed % clientsWithEmail.length]
          const bookingEmail = targetClient.email

          // Use null phone to ensure email path is tested
          const result = detectReturningClient(null, bookingEmail, clientRecords)
          return result.isReturning === true && result.matchedBy === 'email'
        }
      ),
      { numRuns: 100 }
    )
  })

  test('no match returns not a returning client', () => {
    fc.assert(
      fc.property(
        arbClientRecords(),
        arbPhone(),
        arbEmail(),
        (clientRecords, bookingPhone, bookingEmail) => {
          // Ensure booking phone/email don't match any client records
          const phoneMatches = clientRecords.some((c) => {
            if (!c.phone) return false
            return c.phone.replace(/\D/g, '').slice(-10) === bookingPhone.replace(/\D/g, '').slice(-10)
          })
          const emailMatches = clientRecords.some((c) => {
            if (!c.email) return false
            return c.email.trim().toLowerCase() === bookingEmail.trim().toLowerCase()
          })

          // Only test when there's genuinely no match
          if (phoneMatches || emailMatches) return true

          const result = detectReturningClient(bookingPhone, bookingEmail, clientRecords)
          return result.isReturning === false && result.matchedBy === null
        }
      ),
      { numRuns: 100 }
    )
  })

  test('phone match takes priority over email match', () => {
    fc.assert(
      fc.property(
        arbPhone(),
        arbEmail(),
        (phone, email) => {
          // Create a client that matches both phone and email
          const clientRecords = [{ phone, email }]

          const result = detectReturningClient(phone, email, clientRecords)
          return result.isReturning === true && result.matchedBy === 'phone'
        }
      ),
      { numRuns: 100 }
    )
  })

  test('phone matching is format-insensitive (normalized to last 10 digits)', () => {
    fc.assert(
      fc.property(
        arbPhone(),
        arbEmail(),
        (rawPhone, email) => {
          // Store phone in one format
          const storedClient = { phone: rawPhone, email: null }
          // Search with a different format (adding country code prefix)
          const bookingPhone = `+1${rawPhone}`

          const result = detectReturningClient(bookingPhone, null, [storedClient])
          return result.isReturning === true && result.matchedBy === 'phone'
        }
      ),
      { numRuns: 100 }
    )
  })

  test('email matching is case-insensitive', () => {
    fc.assert(
      fc.property(
        arbEmail(),
        (email) => {
          // Store email in lowercase
          const storedClient = { phone: null, email: email.toLowerCase() }
          // Search with uppercase variant
          const bookingEmail = email.toUpperCase()

          const result = detectReturningClient(null, bookingEmail, [storedClient])
          return result.isReturning === true && result.matchedBy === 'email'
        }
      ),
      { numRuns: 100 }
    )
  })

  test('empty client records always returns not returning', () => {
    fc.assert(
      fc.property(
        arbPhone(),
        arbEmail(),
        (phone, email) => {
          const result = detectReturningClient(phone, email, [])
          return result.isReturning === false && result.matchedBy === null
        }
      ),
      { numRuns: 100 }
    )
  })

  test('null phone and null email always returns not returning', () => {
    fc.assert(
      fc.property(
        arbClientRecords(),
        (clientRecords) => {
          const result = detectReturningClient(null, null, clientRecords)
          return result.isReturning === false && result.matchedBy === null
        }
      ),
      { numRuns: 100 }
    )
  })
})
