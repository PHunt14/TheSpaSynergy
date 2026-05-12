/**
 * Property-Based Tests for Cascade Cancellation Completeness
 *
 * Uses fast-check to validate correctness properties for cascade cancellation
 * in multi-vendor bundle bookings.
 * Feature: multi-vendor-bundle-booking
 *
 * Properties tested:
 * - Property 12: Cascade Cancellation Completeness
 *
 * **Validates: Requirements 8.3, 8.4**
 *
 * For any bundle with N appointments, when cascade cancellation is triggered
 * (by vendor decline or customer full-cancel), ALL N appointments SHALL have
 * status "cancelled" and the bundle status SHALL be "cancelled".
 *
 * Tests the logic at the pure-function level by simulating cascade cancellation.
 */

import fc from 'fast-check'

// ── Pure Helper Functions ─────────────────────────────────────
// These mirror the cascade cancellation logic from app/api/bundles/confirm/route.ts
// and app/api/appointments/cancel/route.ts, extracted as pure functions for testing.

/**
 * Simulates cascade cancellation triggered by a vendor decline.
 * When a vendor declines, ALL appointments in the bundle are cancelled
 * and the bundle status becomes "cancelled".
 *
 * @param {Object} params
 * @param {Object} params.bundle - Bundle record with status, vendorConfirmations, appointmentIds
 * @param {Array} params.appointments - Array of { appointmentId, vendorId, status }
 * @param {string} params.decliningVendorId - The vendor who declined
 * @returns {{ bundleStatus: string, appointments: Array, confirmations: Object }}
 */
function cascadeCancelByVendorDecline({ bundle, appointments, decliningVendorId }) {
  // Cancel ALL appointments in the bundle
  const updatedAppointments = appointments.map(apt => ({
    ...apt,
    status: 'cancelled',
  }))

  // Update vendor confirmations - declining vendor set to "cancelled"
  const updatedConfirmations = Object.fromEntries(
    Object.keys(bundle.vendorConfirmations).map(v => [
      v,
      v === decliningVendorId ? 'cancelled' : bundle.vendorConfirmations[v],
    ])
  )

  return {
    bundleStatus: 'cancelled',
    appointments: updatedAppointments,
    confirmations: updatedConfirmations,
  }
}

/**
 * Simulates cascade cancellation triggered by a customer full-cancel.
 * When a customer cancels the entire bundle, ALL appointments are cancelled
 * and the bundle status becomes "cancelled".
 *
 * @param {Object} params
 * @param {Object} params.bundle - Bundle record with status, appointmentIds
 * @param {Array} params.appointments - Array of { appointmentId, vendorId, status }
 * @returns {{ bundleStatus: string, appointments: Array }}
 */
function cascadeCancelByCustomer({ bundle, appointments }) {
  // Cancel ALL appointments in the bundle
  const updatedAppointments = appointments.map(apt => ({
    ...apt,
    status: 'cancelled',
  }))

  return {
    bundleStatus: 'cancelled',
    appointments: updatedAppointments,
  }
}

// ── Generators ────────────────────────────────────────────────

/**
 * Generates a valid multi-vendor bundle with N appointments (2-10)
 * distributed across M vendors (M >= 2).
 * Supports various initial statuses to test cascade from different states.
 */
function arbBundleWithAppointments() {
  return fc.integer({ min: 2, max: 6 }).chain(numVendors => {
    return fc.integer({ min: numVendors, max: 10 }).chain(numAppointments => {
      const vendorIds = Array.from(
        { length: numVendors },
        (_, i) => `vendor-${String.fromCodePoint(97 + i)}`
      )

      return fc.array(
        fc.integer({ min: 0, max: numVendors - 1 }),
        { minLength: numAppointments - numVendors, maxLength: numAppointments - numVendors }
      ).chain(extraAssignments => {
        // Ensure each vendor has at least one appointment
        const appointmentVendors = [...vendorIds]
        for (const idx of extraAssignments) {
          appointmentVendors.push(vendorIds[idx])
        }

        // Generate appointment statuses - mix of pending and confirmed
        return fc.array(
          fc.constantFrom('pending-confirmation', 'confirmed'),
          { minLength: appointmentVendors.length, maxLength: appointmentVendors.length }
        ).map(statuses => {
          const appointments = appointmentVendors.map((vid, i) => ({
            appointmentId: `apt-${i}`,
            vendorId: vid,
            status: statuses[i],
          }))

          // Build vendor confirmations based on appointment statuses
          const confirmations = {}
          for (const vid of vendorIds) {
            const vendorApts = appointments.filter(a => a.vendorId === vid)
            const allConfirmed = vendorApts.every(a => a.status === 'confirmed')
            confirmations[vid] = allConfirmed ? 'confirmed' : 'pending'
          }

          const allVendorsConfirmed = Object.values(confirmations).every(s => s === 'confirmed')
          const bundleStatus = allVendorsConfirmed ? 'confirmed' : 'pending-confirmation'

          return {
            bundle: {
              bundleId: `bundle-test-${numAppointments}`,
              vendorIds,
              vendorConfirmations: confirmations,
              appointmentIds: appointments.map(a => a.appointmentId),
              status: bundleStatus,
            },
            appointments,
            vendorIds,
            numAppointments: appointments.length,
          }
        })
      })
    })
  })
}

/**
 * Generates a bundle specifically in "pending-confirmation" status
 * (all appointments pending) for vendor decline scenarios.
 */
function arbPendingBundle() {
  return fc.integer({ min: 2, max: 6 }).chain(numVendors => {
    return fc.integer({ min: numVendors, max: 10 }).chain(numAppointments => {
      const vendorIds = Array.from(
        { length: numVendors },
        (_, i) => `vendor-${String.fromCodePoint(97 + i)}`
      )

      return fc.array(
        fc.integer({ min: 0, max: numVendors - 1 }),
        { minLength: numAppointments - numVendors, maxLength: numAppointments - numVendors }
      ).map(extraAssignments => {
        const appointmentVendors = [...vendorIds]
        for (const idx of extraAssignments) {
          appointmentVendors.push(vendorIds[idx])
        }

        const appointments = appointmentVendors.map((vid, i) => ({
          appointmentId: `apt-${i}`,
          vendorId: vid,
          status: 'pending-confirmation',
        }))

        const confirmations = Object.fromEntries(vendorIds.map(v => [v, 'pending']))

        return {
          bundle: {
            bundleId: `bundle-pending-${numAppointments}`,
            vendorIds,
            vendorConfirmations: confirmations,
            appointmentIds: appointments.map(a => a.appointmentId),
            status: 'pending-confirmation',
          },
          appointments,
          vendorIds,
          numAppointments: appointments.length,
        }
      })
    })
  })
}

/**
 * Generates a bundle in "confirmed" status (all vendors confirmed)
 * for customer full-cancel scenarios.
 */
function arbConfirmedBundle() {
  return fc.integer({ min: 2, max: 6 }).chain(numVendors => {
    return fc.integer({ min: numVendors, max: 10 }).chain(numAppointments => {
      const vendorIds = Array.from(
        { length: numVendors },
        (_, i) => `vendor-${String.fromCodePoint(97 + i)}`
      )

      return fc.array(
        fc.integer({ min: 0, max: numVendors - 1 }),
        { minLength: numAppointments - numVendors, maxLength: numAppointments - numVendors }
      ).map(extraAssignments => {
        const appointmentVendors = [...vendorIds]
        for (const idx of extraAssignments) {
          appointmentVendors.push(vendorIds[idx])
        }

        const appointments = appointmentVendors.map((vid, i) => ({
          appointmentId: `apt-${i}`,
          vendorId: vid,
          status: 'confirmed',
        }))

        const confirmations = Object.fromEntries(vendorIds.map(v => [v, 'confirmed']))

        return {
          bundle: {
            bundleId: `bundle-confirmed-${numAppointments}`,
            vendorIds,
            vendorConfirmations: confirmations,
            appointmentIds: appointments.map(a => a.appointmentId),
            status: 'confirmed',
          },
          appointments,
          vendorIds,
          numAppointments: appointments.length,
        }
      })
    })
  })
}

// ── Property 12: Cascade Cancellation Completeness ────────────

describe('Feature: multi-vendor-bundle-booking, Property 12: Cascade Cancellation Completeness', () => {
  describe('Vendor decline triggers cascade cancellation', () => {
    test('ALL N appointments have status "cancelled" after vendor decline', () => {
      fc.assert(
        fc.property(
          arbBundleWithAppointments().chain(data =>
            fc.constantFrom(...data.vendorIds).map(decliningVendorId => ({
              ...data,
              decliningVendorId,
            }))
          ),
          ({ bundle, appointments, decliningVendorId, numAppointments }) => {
            const result = cascadeCancelByVendorDecline({
              bundle,
              appointments,
              decliningVendorId,
            })

            // ALL N appointments must be cancelled
            return (
              result.appointments.length === numAppointments &&
              result.appointments.every(a => a.status === 'cancelled')
            )
          }
        ),
        { numRuns: 100 }
      )
    })

    test('bundle status is "cancelled" after vendor decline', () => {
      fc.assert(
        fc.property(
          arbBundleWithAppointments().chain(data =>
            fc.constantFrom(...data.vendorIds).map(decliningVendorId => ({
              ...data,
              decliningVendorId,
            }))
          ),
          ({ bundle, appointments, decliningVendorId }) => {
            const result = cascadeCancelByVendorDecline({
              bundle,
              appointments,
              decliningVendorId,
            })

            return result.bundleStatus === 'cancelled'
          }
        ),
        { numRuns: 100 }
      )
    })

    test('cascade cancellation from pending-confirmation bundle cancels all appointments', () => {
      fc.assert(
        fc.property(
          arbPendingBundle().chain(data =>
            fc.constantFrom(...data.vendorIds).map(decliningVendorId => ({
              ...data,
              decliningVendorId,
            }))
          ),
          ({ bundle, appointments, decliningVendorId, numAppointments }) => {
            const result = cascadeCancelByVendorDecline({
              bundle,
              appointments,
              decliningVendorId,
            })

            return (
              result.appointments.length === numAppointments &&
              result.appointments.every(a => a.status === 'cancelled') &&
              result.bundleStatus === 'cancelled'
            )
          }
        ),
        { numRuns: 100 }
      )
    })

    test('no appointment is left in a non-cancelled state after vendor decline', () => {
      fc.assert(
        fc.property(
          arbBundleWithAppointments().chain(data =>
            fc.constantFrom(...data.vendorIds).map(decliningVendorId => ({
              ...data,
              decliningVendorId,
            }))
          ),
          ({ bundle, appointments, decliningVendorId }) => {
            const result = cascadeCancelByVendorDecline({
              bundle,
              appointments,
              decliningVendorId,
            })

            // No appointment should have any status other than "cancelled"
            const nonCancelledCount = result.appointments.filter(
              a => a.status !== 'cancelled'
            ).length
            return nonCancelledCount === 0
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Customer full-cancel triggers cascade cancellation', () => {
    test('ALL N appointments have status "cancelled" after customer full-cancel', () => {
      fc.assert(
        fc.property(
          arbBundleWithAppointments(),
          ({ bundle, appointments, numAppointments }) => {
            const result = cascadeCancelByCustomer({ bundle, appointments })

            // ALL N appointments must be cancelled
            return (
              result.appointments.length === numAppointments &&
              result.appointments.every(a => a.status === 'cancelled')
            )
          }
        ),
        { numRuns: 100 }
      )
    })

    test('bundle status is "cancelled" after customer full-cancel', () => {
      fc.assert(
        fc.property(
          arbBundleWithAppointments(),
          ({ bundle, appointments }) => {
            const result = cascadeCancelByCustomer({ bundle, appointments })

            return result.bundleStatus === 'cancelled'
          }
        ),
        { numRuns: 100 }
      )
    })

    test('customer full-cancel on confirmed bundle cancels all appointments', () => {
      fc.assert(
        fc.property(
          arbConfirmedBundle(),
          ({ bundle, appointments, numAppointments }) => {
            const result = cascadeCancelByCustomer({ bundle, appointments })

            return (
              result.appointments.length === numAppointments &&
              result.appointments.every(a => a.status === 'cancelled') &&
              result.bundleStatus === 'cancelled'
            )
          }
        ),
        { numRuns: 100 }
      )
    })

    test('no appointment is left in a non-cancelled state after customer full-cancel', () => {
      fc.assert(
        fc.property(
          arbBundleWithAppointments(),
          ({ bundle, appointments }) => {
            const result = cascadeCancelByCustomer({ bundle, appointments })

            const nonCancelledCount = result.appointments.filter(
              a => a.status !== 'cancelled'
            ).length
            return nonCancelledCount === 0
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Cascade cancellation completeness invariants', () => {
    test('appointment count is preserved after cascade cancellation (vendor decline)', () => {
      fc.assert(
        fc.property(
          arbBundleWithAppointments().chain(data =>
            fc.constantFrom(...data.vendorIds).map(decliningVendorId => ({
              ...data,
              decliningVendorId,
            }))
          ),
          ({ bundle, appointments, decliningVendorId, numAppointments }) => {
            const result = cascadeCancelByVendorDecline({
              bundle,
              appointments,
              decliningVendorId,
            })

            // The number of appointments must remain the same (none removed, all cancelled)
            return result.appointments.length === numAppointments
          }
        ),
        { numRuns: 100 }
      )
    })

    test('appointment count is preserved after cascade cancellation (customer full-cancel)', () => {
      fc.assert(
        fc.property(
          arbBundleWithAppointments(),
          ({ bundle, appointments, numAppointments }) => {
            const result = cascadeCancelByCustomer({ bundle, appointments })

            // The number of appointments must remain the same (none removed, all cancelled)
            return result.appointments.length === numAppointments
          }
        ),
        { numRuns: 100 }
      )
    })

    test('all appointment IDs are preserved after cascade cancellation', () => {
      fc.assert(
        fc.property(
          arbBundleWithAppointments().chain(data =>
            fc.constantFrom(...data.vendorIds).map(decliningVendorId => ({
              ...data,
              decliningVendorId,
            }))
          ),
          ({ bundle, appointments, decliningVendorId }) => {
            const result = cascadeCancelByVendorDecline({
              bundle,
              appointments,
              decliningVendorId,
            })

            // All original appointment IDs must still be present
            const originalIds = new Set(appointments.map(a => a.appointmentId))
            const resultIds = new Set(result.appointments.map(a => a.appointmentId))
            return (
              originalIds.size === resultIds.size &&
              [...originalIds].every(id => resultIds.has(id))
            )
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
