/**
 * Property-Based Tests for Partial Cancellation Correctness
 *
 * Uses fast-check to validate correctness properties for partial cancellation
 * in multi-vendor bundle bookings.
 * Feature: multi-vendor-bundle-booking
 *
 * Properties tested:
 * - Property 13: Partial Cancellation Correctness
 *
 * **Validates: Requirements 8.2**
 *
 * For any bundle with N services (N ≥ 3, to maintain 2-vendor minimum after removal),
 * when a single service is cancelled:
 * - That appointment's status is "cancelled"
 * - The Bundle record's `appointmentIds` is updated to exclude the cancelled appointment
 * - The bundle price is recalculated based on remaining services and the applicable tier discount
 * - The remaining N-1 appointments are unchanged
 *
 * Tests the logic at the pure-function level by simulating partial cancellation.
 */

import fc from 'fast-check'
import { calculateBundlePrice } from '../../app/utils/bundleDiscount.js'

// ── Helpers ───────────────────────────────────────────────────

/**
 * Rounds a number to 2 decimal places (cents), matching the implementation.
 */
function roundCents(value) {
  return Math.round(value * 100) / 100
}

// ── Pure Partial Cancellation Logic ───────────────────────────
// Mirrors the partial cancellation logic from app/api/appointments/cancel/route.ts
// extracted as a pure function for property-based testing.

/**
 * Simulates partial cancellation of a single service within a multi-vendor bundle.
 * Validates constraints and recalculates bundle price.
 *
 * @param {Object} params
 * @param {Object} params.bundle - Bundle record with appointmentIds, serviceIds, vendorIds, price, status
 * @param {Array} params.appointments - Array of { appointmentId, vendorId, serviceId, status }
 * @param {Array} params.services - Array of { serviceId, vendorId, price, isActive }
 * @param {string} params.cancelAppointmentId - The appointment to cancel
 * @param {Object} params.bundleSettings - BundleSettings with tier discounts
 * @returns {{ success: boolean, error?: string, bundleStatus?: string, appointments?: Array, updatedBundle?: Object }}
 */
function partialCancelService({ bundle, appointments, services, cancelAppointmentId, bundleSettings }) {
  const cancelledAppointment = appointments.find(a => a.appointmentId === cancelAppointmentId)
  if (!cancelledAppointment) {
    return { success: false, error: 'Appointment not found' }
  }

  // Get remaining appointment IDs after removing the cancelled one
  const remainingAppointmentIds = bundle.appointmentIds.filter(id => id !== cancelAppointmentId)

  // Check minimum service count
  if (remainingAppointmentIds.length < 2) {
    return { success: false, error: 'Cannot remove service — bundle requires at least 2 services' }
  }

  // Get remaining appointments to check vendor constraint
  const remainingAppointments = appointments.filter(a => a.appointmentId !== cancelAppointmentId)

  // Check minimum vendor count
  const remainingVendorIds = new Set(remainingAppointments.map(a => a.vendorId))
  if (remainingVendorIds.size < 2) {
    return { success: false, error: 'Cannot remove service — bundle requires at least 2 vendors' }
  }

  // Cancel the appointment
  const updatedAppointments = appointments.map(a => {
    if (a.appointmentId === cancelAppointmentId) {
      return { ...a, status: 'cancelled' }
    }
    return { ...a }
  })

  // Get remaining services for price recalculation
  const cancelledServiceId = cancelledAppointment.serviceId
  const remainingServices = services.filter(s => s.serviceId !== cancelledServiceId)

  // Recalculate bundle price based on remaining services and tier discount
  const priceResult = calculateBundlePrice({
    services: remainingServices.map(s => ({ price: s.price })),
    predefinedBundle: null, // Custom bundle: use tier-based discount
    bundleSettings,
  })

  // Update bundle record
  const updatedBundle = {
    ...bundle,
    appointmentIds: remainingAppointmentIds,
    serviceIds: remainingServices.map(s => s.serviceId),
    vendorIds: [...remainingVendorIds],
    price: priceResult.total,
    discountPercent: priceResult.discountPercent,
  }

  return {
    success: true,
    appointments: updatedAppointments,
    updatedBundle,
    cancelledAppointmentId: cancelAppointmentId,
    newPrice: priceResult.total,
    newDiscountPercent: priceResult.discountPercent,
  }
}

// ── Generators ────────────────────────────────────────────────

/**
 * Generates BundleSettings with discount percentages between 0 and 50 for each tier.
 */
function arbBundleSettings() {
  return fc.record({
    discount2Services: fc.integer({ min: 0, max: 50 }),
    discount3Services: fc.integer({ min: 0, max: 50 }),
    discount4PlusServices: fc.integer({ min: 0, max: 50 }),
  })
}

/**
 * Generates a valid multi-vendor bundle with N services (N ≥ 3) from at least 3 vendors,
 * ensuring that removing any single service still leaves at least 2 vendors.
 * This guarantees the partial cancellation constraint is satisfiable.
 */
function arbBundleForPartialCancel() {
  // We need at least 3 services from at least 3 vendors so that removing any one
  // still leaves 2+ vendors. Alternatively, we need at least 3 vendors each with
  // at least 1 service, so removing one vendor's service still leaves 2 vendors.
  return fc.integer({ min: 3, max: 6 }).chain(numVendors => {
    return fc.integer({ min: numVendors, max: 10 }).chain(numServices => {
      const vendorIds = Array.from(
        { length: numVendors },
        (_, i) => `vendor-${String.fromCodePoint(97 + i)}`
      )

      // Distribute extra services across vendors
      return fc.array(
        fc.integer({ min: 0, max: numVendors - 1 }),
        { minLength: numServices - numVendors, maxLength: numServices - numVendors }
      ).chain(extraAssignments => {
        // Ensure each vendor has at least one service
        const serviceVendors = [...vendorIds]
        for (const idx of extraAssignments) {
          serviceVendors.push(vendorIds[idx])
        }

        // Generate prices for each service
        return fc.array(
          fc.integer({ min: 10, max: 500 }),
          { minLength: serviceVendors.length, maxLength: serviceVendors.length }
        ).chain(prices => {
          return arbBundleSettings().map(bundleSettings => {
            const services = serviceVendors.map((vid, i) => ({
              serviceId: `svc-${i}`,
              vendorId: vid,
              price: prices[i],
              isActive: true,
            }))

            const appointments = services.map((svc, i) => ({
              appointmentId: `apt-${i}`,
              vendorId: svc.vendorId,
              serviceId: svc.serviceId,
              status: 'confirmed',
            }))

            // Calculate initial bundle price
            const initialPrice = calculateBundlePrice({
              services: services.map(s => ({ price: s.price })),
              predefinedBundle: null,
              bundleSettings,
            })

            const bundle = {
              bundleId: `bundle-test-${numServices}`,
              vendorIds,
              appointmentIds: appointments.map(a => a.appointmentId),
              serviceIds: services.map(s => s.serviceId),
              price: initialPrice.total,
              discountPercent: initialPrice.discountPercent,
              status: 'confirmed',
            }

            return {
              bundle,
              appointments,
              services,
              vendorIds,
              bundleSettings,
              numServices: services.length,
            }
          })
        })
      })
    })
  })
}

/**
 * Generates a bundle and picks a cancellable appointment (one whose removal
 * still leaves at least 2 vendors and 2 services).
 */
function arbPartialCancelScenario() {
  return arbBundleForPartialCancel().chain(data => {
    // Find appointments that can be cancelled without violating constraints
    const cancellableIndices = []
    for (let i = 0; i < data.appointments.length; i++) {
      const remaining = data.appointments.filter((_, j) => j !== i)
      const remainingVendors = new Set(remaining.map(a => a.vendorId))
      if (remaining.length >= 2 && remainingVendors.size >= 2) {
        cancellableIndices.push(i)
      }
    }

    if (cancellableIndices.length === 0) {
      // Fallback: shouldn't happen with 3+ vendors, but just in case
      return fc.constant({ ...data, cancelIndex: 0 })
    }

    return fc.constantFrom(...cancellableIndices).map(cancelIndex => ({
      ...data,
      cancelIndex,
    }))
  })
}

// ── Property 13: Partial Cancellation Correctness ─────────────

describe('Feature: multi-vendor-bundle-booking, Property 13: Partial Cancellation Correctness', () => {
  describe('Cancelled appointment status', () => {
    test('the cancelled appointment has status "cancelled"', () => {
      fc.assert(
        fc.property(
          arbPartialCancelScenario(),
          ({ bundle, appointments, services, cancelIndex, bundleSettings }) => {
            const cancelAppointmentId = appointments[cancelIndex].appointmentId

            const result = partialCancelService({
              bundle,
              appointments,
              services,
              cancelAppointmentId,
              bundleSettings,
            })

            if (!result.success) return false

            const cancelledApt = result.appointments.find(
              a => a.appointmentId === cancelAppointmentId
            )
            return cancelledApt.status === 'cancelled'
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Bundle appointmentIds updated', () => {
    test('the Bundle record appointmentIds excludes the cancelled appointment', () => {
      fc.assert(
        fc.property(
          arbPartialCancelScenario(),
          ({ bundle, appointments, services, cancelIndex, bundleSettings }) => {
            const cancelAppointmentId = appointments[cancelIndex].appointmentId

            const result = partialCancelService({
              bundle,
              appointments,
              services,
              cancelAppointmentId,
              bundleSettings,
            })

            if (!result.success) return false

            return (
              !result.updatedBundle.appointmentIds.includes(cancelAppointmentId) &&
              result.updatedBundle.appointmentIds.length === bundle.appointmentIds.length - 1
            )
          }
        ),
        { numRuns: 100 }
      )
    })

    test('all remaining appointment IDs are preserved in the bundle', () => {
      fc.assert(
        fc.property(
          arbPartialCancelScenario(),
          ({ bundle, appointments, services, cancelIndex, bundleSettings }) => {
            const cancelAppointmentId = appointments[cancelIndex].appointmentId
            const expectedRemainingIds = bundle.appointmentIds.filter(
              id => id !== cancelAppointmentId
            )

            const result = partialCancelService({
              bundle,
              appointments,
              services,
              cancelAppointmentId,
              bundleSettings,
            })

            if (!result.success) return false

            const resultIds = new Set(result.updatedBundle.appointmentIds)
            return expectedRemainingIds.every(id => resultIds.has(id))
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Bundle price recalculation', () => {
    test('bundle price is recalculated based on remaining services and applicable tier discount', () => {
      fc.assert(
        fc.property(
          arbPartialCancelScenario(),
          ({ bundle, appointments, services, cancelIndex, bundleSettings }) => {
            const cancelAppointmentId = appointments[cancelIndex].appointmentId
            const cancelledServiceId = appointments[cancelIndex].serviceId

            const result = partialCancelService({
              bundle,
              appointments,
              services,
              cancelAppointmentId,
              bundleSettings,
            })

            if (!result.success) return false

            // Independently calculate expected price from remaining services
            const remainingServices = services.filter(s => s.serviceId !== cancelledServiceId)
            const expectedPrice = calculateBundlePrice({
              services: remainingServices.map(s => ({ price: s.price })),
              predefinedBundle: null,
              bundleSettings,
            })

            return (
              result.updatedBundle.price === expectedPrice.total &&
              result.updatedBundle.discountPercent === expectedPrice.discountPercent
            )
          }
        ),
        { numRuns: 100 }
      )
    })

    test('the tier discount changes when service count crosses a tier boundary', () => {
      fc.assert(
        fc.property(
          arbPartialCancelScenario(),
          ({ bundle, appointments, services, cancelIndex, bundleSettings }) => {
            const cancelAppointmentId = appointments[cancelIndex].appointmentId

            const result = partialCancelService({
              bundle,
              appointments,
              services,
              cancelAppointmentId,
              bundleSettings,
            })

            if (!result.success) return false

            // Verify the discount percent matches the tier for remaining service count
            const remainingCount = result.updatedBundle.serviceIds.length
            let expectedDiscountPercent
            if (remainingCount >= 4) {
              expectedDiscountPercent = bundleSettings.discount4PlusServices
            } else if (remainingCount === 3) {
              expectedDiscountPercent = bundleSettings.discount3Services
            } else if (remainingCount === 2) {
              expectedDiscountPercent = bundleSettings.discount2Services
            } else {
              expectedDiscountPercent = 0
            }

            return result.updatedBundle.discountPercent === expectedDiscountPercent
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Remaining appointments unchanged', () => {
    test('the remaining N-1 appointments are unchanged after partial cancellation', () => {
      fc.assert(
        fc.property(
          arbPartialCancelScenario(),
          ({ bundle, appointments, services, cancelIndex, bundleSettings }) => {
            const cancelAppointmentId = appointments[cancelIndex].appointmentId

            const result = partialCancelService({
              bundle,
              appointments,
              services,
              cancelAppointmentId,
              bundleSettings,
            })

            if (!result.success) return false

            // All non-cancelled appointments should retain their original status
            const remainingOriginal = appointments.filter(
              a => a.appointmentId !== cancelAppointmentId
            )
            const remainingResult = result.appointments.filter(
              a => a.appointmentId !== cancelAppointmentId
            )

            return remainingOriginal.every((orig, i) => {
              const updated = remainingResult.find(a => a.appointmentId === orig.appointmentId)
              return (
                updated &&
                updated.status === orig.status &&
                updated.vendorId === orig.vendorId &&
                updated.serviceId === orig.serviceId
              )
            })
          }
        ),
        { numRuns: 100 }
      )
    })

    test('exactly one appointment changes status to cancelled', () => {
      fc.assert(
        fc.property(
          arbPartialCancelScenario(),
          ({ bundle, appointments, services, cancelIndex, bundleSettings }) => {
            const cancelAppointmentId = appointments[cancelIndex].appointmentId

            const result = partialCancelService({
              bundle,
              appointments,
              services,
              cancelAppointmentId,
              bundleSettings,
            })

            if (!result.success) return false

            const cancelledCount = result.appointments.filter(
              a => a.status === 'cancelled'
            ).length

            // Only the one we cancelled should be cancelled
            // (original appointments were all 'confirmed')
            return cancelledCount === 1
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Constraint enforcement', () => {
    test('partial cancellation that would leave fewer than 2 vendors is rejected', () => {
      // Generate a bundle with exactly 2 vendors where one vendor has only 1 service
      fc.assert(
        fc.property(
          fc.integer({ min: 10, max: 500 }),
          fc.integer({ min: 10, max: 500 }),
          fc.integer({ min: 10, max: 500 }),
          arbBundleSettings(),
          (price1, price2, price3, bundleSettings) => {
            // 2 vendors: vendor-a has 2 services, vendor-b has 1 service
            const services = [
              { serviceId: 'svc-0', vendorId: 'vendor-a', price: price1, isActive: true },
              { serviceId: 'svc-1', vendorId: 'vendor-a', price: price2, isActive: true },
              { serviceId: 'svc-2', vendorId: 'vendor-b', price: price3, isActive: true },
            ]

            const appointments = services.map((svc, i) => ({
              appointmentId: `apt-${i}`,
              vendorId: svc.vendorId,
              serviceId: svc.serviceId,
              status: 'confirmed',
            }))

            const initialPrice = calculateBundlePrice({
              services: services.map(s => ({ price: s.price })),
              predefinedBundle: null,
              bundleSettings,
            })

            const bundle = {
              bundleId: 'bundle-2vendor',
              vendorIds: ['vendor-a', 'vendor-b'],
              appointmentIds: appointments.map(a => a.appointmentId),
              serviceIds: services.map(s => s.serviceId),
              price: initialPrice.total,
              discountPercent: initialPrice.discountPercent,
              status: 'confirmed',
            }

            // Try to cancel vendor-b's only service — should fail
            const result = partialCancelService({
              bundle,
              appointments,
              services,
              cancelAppointmentId: 'apt-2', // vendor-b's only appointment
              bundleSettings,
            })

            return !result.success && result.error.includes('2 vendors')
          }
        ),
        { numRuns: 100 }
      )
    })

    test('partial cancellation that would leave fewer than 2 services is rejected', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10, max: 500 }),
          fc.integer({ min: 10, max: 500 }),
          arbBundleSettings(),
          (price1, price2, bundleSettings) => {
            // Exactly 2 services from 2 vendors — cancelling one leaves only 1
            const services = [
              { serviceId: 'svc-0', vendorId: 'vendor-a', price: price1, isActive: true },
              { serviceId: 'svc-1', vendorId: 'vendor-b', price: price2, isActive: true },
            ]

            const appointments = services.map((svc, i) => ({
              appointmentId: `apt-${i}`,
              vendorId: svc.vendorId,
              serviceId: svc.serviceId,
              status: 'confirmed',
            }))

            const initialPrice = calculateBundlePrice({
              services: services.map(s => ({ price: s.price })),
              predefinedBundle: null,
              bundleSettings,
            })

            const bundle = {
              bundleId: 'bundle-min',
              vendorIds: ['vendor-a', 'vendor-b'],
              appointmentIds: appointments.map(a => a.appointmentId),
              serviceIds: services.map(s => s.serviceId),
              price: initialPrice.total,
              discountPercent: initialPrice.discountPercent,
              status: 'confirmed',
            }

            // Try to cancel any appointment — should fail (leaves < 2 services)
            const result = partialCancelService({
              bundle,
              appointments,
              services,
              cancelAppointmentId: 'apt-0',
              bundleSettings,
            })

            return !result.success && result.error.includes('2 services')
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
