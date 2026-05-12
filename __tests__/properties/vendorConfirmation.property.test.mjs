/**
 * Property-Based Tests for Vendor Confirmation State Transitions
 *
 * Uses fast-check to validate correctness properties for vendor confirmation
 * state transitions in multi-vendor bundle bookings.
 * Feature: multi-vendor-bundle-booking
 *
 * Properties tested:
 * - Property 11: Vendor Confirmation State Transitions
 *
 * **Validates: Requirements 7.2, 7.3, 7.4**
 *
 * Since the confirmation API involves database operations, this test validates
 * the logic at the pure-function level by simulating the state transitions.
 */

import fc from 'fast-check'

// ── Pure Helper Functions ─────────────────────────────────────
// These mirror the logic in app/api/bundles/confirm/route.ts
// extracted as pure functions for property-based testing.

/**
 * Simulates a vendor confirming their portion of a bundle.
 * Returns the updated state (confirmations, bundle status, appointment statuses).
 *
 * @param {Object} params
 * @param {Object} params.confirmations - Current vendorId → status map
 * @param {string} params.vendorId - The vendor confirming
 * @param {Array} params.appointments - Array of { appointmentId, vendorId, status }
 * @returns {{ confirmations: Object, bundleStatus: string, appointments: Array }}
 */
function processVendorConfirmation({ confirmations, vendorId, appointments }) {
  // Update this vendor's confirmation to "confirmed"
  const updatedConfirmations = { ...confirmations, [vendorId]: 'confirmed' }

  // Check if all vendors are now confirmed
  const allConfirmed = Object.values(updatedConfirmations).every(s => s === 'confirmed')
  const bundleStatus = allConfirmed ? 'confirmed' : 'pending-confirmation'

  // Update appointments belonging to this vendor to "confirmed"
  const updatedAppointments = appointments.map(apt => {
    if (apt.vendorId === vendorId) {
      return { ...apt, status: 'confirmed' }
    }
    return { ...apt }
  })

  return {
    confirmations: updatedConfirmations,
    bundleStatus,
    appointments: updatedAppointments,
  }
}

/**
 * Simulates a vendor declining (cancelling) their portion of a bundle.
 * Returns the updated state with all appointments cancelled and bundle cancelled.
 *
 * @param {Object} params
 * @param {Object} params.confirmations - Current vendorId → status map
 * @param {string} params.vendorId - The vendor declining
 * @param {Array} params.appointments - Array of { appointmentId, vendorId, status }
 * @returns {{ confirmations: Object, bundleStatus: string, appointments: Array }}
 */
function processVendorDecline({ confirmations, vendorId, appointments }) {
  // Update the declining vendor's confirmation to "cancelled"
  const updatedConfirmations = Object.fromEntries(
    Object.keys(confirmations).map(v => [v, v === vendorId ? 'cancelled' : confirmations[v]])
  )

  // Cancel ALL appointments in the bundle (cascade cancellation)
  const updatedAppointments = appointments.map(apt => ({
    ...apt,
    status: 'cancelled',
  }))

  return {
    confirmations: updatedConfirmations,
    bundleStatus: 'cancelled',
    appointments: updatedAppointments,
  }
}

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a valid multi-vendor bundle in "pending-confirmation" status
 * with M vendors (M >= 2) and N appointments distributed across vendors.
 */
function arbPendingBundle() {
  return fc.integer({ min: 2, max: 6 }).chain(numVendors => {
    // Generate between numVendors and numVendors * 3 appointments (at least 1 per vendor)
    const minAppointments = numVendors
    const maxAppointments = Math.min(numVendors * 3, 10)

    return fc.integer({ min: minAppointments, max: maxAppointments }).chain(numAppointments => {
      // Generate vendor IDs
      const vendorIds = Array.from({ length: numVendors }, (_, i) => `vendor-${String.fromCharCode(97 + i)}`)

      // Distribute appointments across vendors (ensure each vendor has at least 1)
      return fc.array(
        fc.integer({ min: 0, max: numVendors - 1 }),
        { minLength: numAppointments - numVendors, maxLength: numAppointments - numVendors }
      ).map(extraAssignments => {
        // First, give each vendor at least one appointment
        const appointmentVendors = [...vendorIds]
        // Then distribute remaining appointments
        for (const idx of extraAssignments) {
          appointmentVendors.push(vendorIds[idx])
        }

        // Shuffle to make it more realistic
        const appointments = appointmentVendors.map((vid, i) => ({
          appointmentId: `apt-${i}`,
          vendorId: vid,
          status: 'pending-confirmation',
        }))

        // Initialize all vendor confirmations to "pending"
        const confirmations = Object.fromEntries(vendorIds.map(v => [v, 'pending']))

        return {
          bundleId: 'bundle-test',
          vendorIds,
          confirmations,
          appointments,
          bundleStatus: 'pending-confirmation',
        }
      })
    })
  })
}

/**
 * Generates a bundle where some vendors have already confirmed (but not all).
 * Useful for testing the "last vendor confirms" scenario.
 */
function arbPartiallyConfirmedBundle() {
  return arbPendingBundle().chain(bundle => {
    const { vendorIds, confirmations, appointments } = bundle
    if (vendorIds.length < 2) return fc.constant(bundle)

    // Confirm some vendors (at least 1, but not all)
    const numToConfirm = Math.min(vendorIds.length - 1, Math.max(1, Math.floor(vendorIds.length / 2)))

    return fc.shuffledSubarray(vendorIds, { minLength: numToConfirm, maxLength: numToConfirm })
      .map(vendorsToConfirm => {
        const updatedConfirmations = { ...confirmations }
        const updatedAppointments = appointments.map(apt => {
          if (vendorsToConfirm.includes(apt.vendorId)) {
            return { ...apt, status: 'confirmed' }
          }
          return { ...apt }
        })

        for (const vid of vendorsToConfirm) {
          updatedConfirmations[vid] = 'confirmed'
        }

        return {
          ...bundle,
          confirmations: updatedConfirmations,
          appointments: updatedAppointments,
          confirmedVendors: vendorsToConfirm,
          pendingVendors: vendorIds.filter(v => !vendorsToConfirm.includes(v)),
        }
      })
  })
}

// ── Property 11: Vendor Confirmation State Transitions ────────

describe('Feature: multi-vendor-bundle-booking, Property 11: Vendor Confirmation State Transitions', () => {
  describe('When a vendor confirms', () => {
    test('that vendor\'s confirmation changes to "confirmed"', () => {
      fc.assert(
        fc.property(
          arbPendingBundle().chain(bundle =>
            fc.constantFrom(...bundle.vendorIds).map(vendorId => ({ bundle, vendorId }))
          ),
          ({ bundle, vendorId }) => {
            const result = processVendorConfirmation({
              confirmations: bundle.confirmations,
              vendorId,
              appointments: bundle.appointments,
            })

            // The confirming vendor's status must be "confirmed"
            return result.confirmations[vendorId] === 'confirmed'
          }
        ),
        { numRuns: 100 }
      )
    })

    test('their appointments change to "confirmed"', () => {
      fc.assert(
        fc.property(
          arbPendingBundle().chain(bundle =>
            fc.constantFrom(...bundle.vendorIds).map(vendorId => ({ bundle, vendorId }))
          ),
          ({ bundle, vendorId }) => {
            const result = processVendorConfirmation({
              confirmations: bundle.confirmations,
              vendorId,
              appointments: bundle.appointments,
            })

            // All appointments belonging to the confirming vendor must be "confirmed"
            const vendorAppointments = result.appointments.filter(a => a.vendorId === vendorId)
            return vendorAppointments.every(a => a.status === 'confirmed')
          }
        ),
        { numRuns: 100 }
      )
    })

    test('other vendors\' confirmations remain unchanged', () => {
      fc.assert(
        fc.property(
          arbPendingBundle().chain(bundle =>
            fc.constantFrom(...bundle.vendorIds).map(vendorId => ({ bundle, vendorId }))
          ),
          ({ bundle, vendorId }) => {
            const result = processVendorConfirmation({
              confirmations: bundle.confirmations,
              vendorId,
              appointments: bundle.appointments,
            })

            // Other vendors' confirmations must remain unchanged
            for (const [vid, status] of Object.entries(bundle.confirmations)) {
              if (vid !== vendorId) {
                if (result.confirmations[vid] !== status) return false
              }
            }
            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    test('other vendors\' appointments remain unchanged', () => {
      fc.assert(
        fc.property(
          arbPendingBundle().chain(bundle =>
            fc.constantFrom(...bundle.vendorIds).map(vendorId => ({ bundle, vendorId }))
          ),
          ({ bundle, vendorId }) => {
            const result = processVendorConfirmation({
              confirmations: bundle.confirmations,
              vendorId,
              appointments: bundle.appointments,
            })

            // Appointments not belonging to the confirming vendor must remain unchanged
            for (const apt of result.appointments) {
              if (apt.vendorId !== vendorId) {
                const original = bundle.appointments.find(a => a.appointmentId === apt.appointmentId)
                if (apt.status !== original.status) return false
              }
            }
            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    test('if all M vendors are now confirmed, bundle status changes to "confirmed"', () => {
      fc.assert(
        fc.property(
          arbPartiallyConfirmedBundle().filter(b => b.pendingVendors && b.pendingVendors.length === 1),
          (bundle) => {
            // The last pending vendor confirms
            const lastVendor = bundle.pendingVendors[0]

            const result = processVendorConfirmation({
              confirmations: bundle.confirmations,
              vendorId: lastVendor,
              appointments: bundle.appointments,
            })

            // All vendors are now confirmed, so bundle status must be "confirmed"
            return result.bundleStatus === 'confirmed'
          }
        ),
        { numRuns: 100 }
      )
    })

    test('if not all vendors confirmed yet, bundle status remains "pending-confirmation"', () => {
      fc.assert(
        fc.property(
          arbPartiallyConfirmedBundle().filter(b => b.pendingVendors && b.pendingVendors.length > 1),
          (bundle) => {
            // One of the pending vendors confirms (but not the last one)
            const confirmingVendor = bundle.pendingVendors[0]

            const result = processVendorConfirmation({
              confirmations: bundle.confirmations,
              vendorId: confirmingVendor,
              appointments: bundle.appointments,
            })

            // Not all vendors confirmed yet, so bundle status must remain "pending-confirmation"
            return result.bundleStatus === 'pending-confirmation'
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('When a vendor declines', () => {
    test('all appointments in the bundle are cancelled', () => {
      fc.assert(
        fc.property(
          arbPendingBundle().chain(bundle =>
            fc.constantFrom(...bundle.vendorIds).map(vendorId => ({ bundle, vendorId }))
          ),
          ({ bundle, vendorId }) => {
            const result = processVendorDecline({
              confirmations: bundle.confirmations,
              vendorId,
              appointments: bundle.appointments,
            })

            // ALL appointments must be cancelled (cascade cancellation)
            return result.appointments.every(a => a.status === 'cancelled')
          }
        ),
        { numRuns: 100 }
      )
    })

    test('bundle status changes to "cancelled"', () => {
      fc.assert(
        fc.property(
          arbPendingBundle().chain(bundle =>
            fc.constantFrom(...bundle.vendorIds).map(vendorId => ({ bundle, vendorId }))
          ),
          ({ bundle, vendorId }) => {
            const result = processVendorDecline({
              confirmations: bundle.confirmations,
              vendorId,
              appointments: bundle.appointments,
            })

            // Bundle status must be "cancelled"
            return result.bundleStatus === 'cancelled'
          }
        ),
        { numRuns: 100 }
      )
    })

    test('the declining vendor\'s confirmation is set to "cancelled"', () => {
      fc.assert(
        fc.property(
          arbPendingBundle().chain(bundle =>
            fc.constantFrom(...bundle.vendorIds).map(vendorId => ({ bundle, vendorId }))
          ),
          ({ bundle, vendorId }) => {
            const result = processVendorDecline({
              confirmations: bundle.confirmations,
              vendorId,
              appointments: bundle.appointments,
            })

            // The declining vendor's confirmation must be "cancelled"
            return result.confirmations[vendorId] === 'cancelled'
          }
        ),
        { numRuns: 100 }
      )
    })

    test('decline from a partially-confirmed bundle still cancels all appointments', () => {
      fc.assert(
        fc.property(
          arbPartiallyConfirmedBundle().chain(bundle => {
            // A pending vendor declines
            if (!bundle.pendingVendors || bundle.pendingVendors.length === 0) {
              return fc.constant(null)
            }
            return fc.constantFrom(...bundle.pendingVendors).map(vendorId => ({ bundle, vendorId }))
          }).filter(x => x !== null),
          ({ bundle, vendorId }) => {
            const result = processVendorDecline({
              confirmations: bundle.confirmations,
              vendorId,
              appointments: bundle.appointments,
            })

            // ALL appointments must be cancelled, even those from already-confirmed vendors
            return result.appointments.every(a => a.status === 'cancelled') &&
              result.bundleStatus === 'cancelled'
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
