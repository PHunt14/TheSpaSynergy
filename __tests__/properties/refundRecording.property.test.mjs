/**
 * Property-Based Tests for Refund Recording Accuracy
 *
 * Uses fast-check to validate correctness properties for refund recording
 * on full and partial cancellation of paid multi-vendor bundles.
 * Feature: multi-vendor-bundle-booking
 *
 * Properties tested:
 * - Property 14: Refund Recording Accuracy
 *
 * **Validates: Requirements 8.5, 8.6**
 *
 * For any paid bundle that is cancelled (full or partial), the `refundRecord`
 * SHALL contain:
 * - For full cancellation: the total payment amount
 * - For partial cancellation: the proportional amount for the cancelled service
 *   (service price / undiscounted total × actual paid amount)
 *
 * Tests the logic at the pure-function level by mirroring the refund-recording
 * logic from app/api/appointments/cancel/route.ts.
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

// ── Pure Refund Recording Logic ───────────────────────────────
// Mirrors the refund-recording logic from app/api/appointments/cancel/route.ts
// extracted as a pure function for property-based testing.

/**
 * Builds the refund record entry for a FULL bundle cancellation.
 * Mirrors handleFullBundleCancellation in the cancel route.
 *
 * @param {Object} params
 * @param {Object} params.bundle - Bundle record with price (actual paid amount), appointmentIds
 * @param {string} params.cancelledAt - ISO timestamp of cancellation
 * @returns {{ type: string, cancelledAt: string, totalRefundAmount: number, appointmentIds: string[] }}
 */
function buildFullCancellationRefundRecord({ bundle, cancelledAt }) {
  const totalRefundAmount = bundle.price || 0
  return {
    type: 'full',
    cancelledAt,
    totalRefundAmount,
    appointmentIds: bundle.appointmentIds || [],
  }
}

/**
 * Appends a partial cancellation entry to an existing refund record.
 * Mirrors handlePartialBundleCancellation in the cancel route.
 *
 * The refundAmount is proportional to the cancelled service:
 *   refundAmount = (cancelledServicePrice / undiscountedTotal) × actualPaidAmount
 *
 * @param {Object} params
 * @param {Object} params.bundle - Bundle record with price (actual paid amount), serviceIds, refundRecord
 * @param {Object} params.cancelledAppointment - { appointmentId, serviceId, vendorId }
 * @param {Array} params.allBundleServices - All services originally in bundle with { serviceId, price }
 * @param {string} params.cancelledAt - ISO timestamp
 * @returns {{ refundRecord: Object, refundAmount: number }}
 */
function appendPartialCancellationRefundRecord({
  bundle,
  cancelledAppointment,
  allBundleServices,
  cancelledAt,
}) {
  const cancelledService = allBundleServices.find(
    s => s.serviceId === cancelledAppointment.serviceId
  )
  const cancelledServicePrice = cancelledService?.price || 0

  const undiscountedTotal = allBundleServices.reduce(
    (sum, s) => sum + (s.price || 0),
    0
  )

  const originalPaidAmount = bundle.price || 0

  const refundAmount =
    undiscountedTotal > 0
      ? roundCents((cancelledServicePrice / undiscountedTotal) * originalPaidAmount)
      : 0

  const existingRefundRecord = bundle.refundRecord
    ? typeof bundle.refundRecord === 'string'
      ? JSON.parse(bundle.refundRecord)
      : bundle.refundRecord
    : { cancellations: [] }

  const cancellations = [
    ...(existingRefundRecord.cancellations || []),
    {
      appointmentId: cancelledAppointment.appointmentId,
      serviceId: cancelledAppointment.serviceId,
      vendorId: cancelledAppointment.vendorId,
      cancelledAt,
      refundAmount,
      cancelledServicePrice,
    },
  ]

  return {
    refundRecord: { ...existingRefundRecord, cancellations },
    refundAmount,
  }
}

// ── Generators ────────────────────────────────────────────────

function arbBundleSettings() {
  return fc.record({
    discount2Services: fc.integer({ min: 0, max: 50 }),
    discount3Services: fc.integer({ min: 0, max: 50 }),
    discount4PlusServices: fc.integer({ min: 0, max: 50 }),
  })
}

/**
 * Generates a paid multi-vendor bundle (2-10 services from 2+ vendors).
 * The bundle's `price` represents the actual amount the customer paid
 * (subtotal minus bundle discount).
 */
function arbPaidBundle() {
  return fc.integer({ min: 2, max: 6 }).chain(numVendors => {
    return fc
      .integer({ min: Math.max(numVendors, 2), max: 10 })
      .chain(numServices => {
        const vendorIds = Array.from(
          { length: numVendors },
          (_, i) => `vendor-${String.fromCodePoint(97 + i)}`
        )

        return fc
          .array(fc.integer({ min: 0, max: numVendors - 1 }), {
            minLength: numServices - numVendors,
            maxLength: numServices - numVendors,
          })
          .chain(extraAssignments => {
            const serviceVendors = [...vendorIds]
            for (const idx of extraAssignments) {
              serviceVendors.push(vendorIds[idx])
            }

            return fc
              .array(fc.integer({ min: 10, max: 500 }), {
                minLength: serviceVendors.length,
                maxLength: serviceVendors.length,
              })
              .chain(prices => {
                return arbBundleSettings().map(bundleSettings => {
                  const services = serviceVendors.map((vid, i) => ({
                    serviceId: `svc-${i}`,
                    vendorId: vid,
                    price: prices[i],
                    isActive: true,
                  }))

                  const appointments = services.map(svc => ({
                    appointmentId: `apt-${svc.serviceId}`,
                    vendorId: svc.vendorId,
                    serviceId: svc.serviceId,
                    status: 'confirmed',
                  }))

                  const priceResult = calculateBundlePrice({
                    services: services.map(s => ({ price: s.price })),
                    predefinedBundle: null,
                    bundleSettings,
                  })

                  const bundle = {
                    bundleId: `bundle-paid-${numServices}`,
                    vendorIds,
                    appointmentIds: appointments.map(a => a.appointmentId),
                    serviceIds: services.map(s => s.serviceId),
                    price: priceResult.total, // actual paid amount after discount
                    discountPercent: priceResult.discountPercent,
                    status: 'confirmed',
                    refundRecord: null,
                  }

                  return { bundle, appointments, services, bundleSettings }
                })
              })
          })
      })
  })
}

/**
 * Generates a paid bundle and picks a cancellable appointment index
 * (removal still leaves ≥ 2 services and ≥ 2 vendors).
 */
function arbPartialCancelScenario() {
  return arbPaidBundle().chain(data => {
    const cancellableIndices = []
    for (let i = 0; i < data.appointments.length; i++) {
      const remaining = data.appointments.filter((_, j) => j !== i)
      const remainingVendors = new Set(remaining.map(a => a.vendorId))
      if (remaining.length >= 2 && remainingVendors.size >= 2) {
        cancellableIndices.push(i)
      }
    }
    if (cancellableIndices.length === 0) {
      return fc.constant(null)
    }
    return fc
      .constantFrom(...cancellableIndices)
      .map(cancelIndex => ({ ...data, cancelIndex }))
  })
}

// ── Property 14: Refund Recording Accuracy ────────────────────

describe('Feature: multi-vendor-bundle-booking, Property 14: Refund Recording Accuracy', () => {
  describe('Full cancellation refund record', () => {
    test('refundRecord.totalRefundAmount equals the actual paid bundle amount', () => {
      fc.assert(
        fc.property(arbPaidBundle(), ({ bundle }) => {
          const record = buildFullCancellationRefundRecord({
            bundle,
            cancelledAt: '2024-03-15T10:00:00.000Z',
          })
          return record.totalRefundAmount === bundle.price
        }),
        { numRuns: 100 }
      )
    })

    test('refundRecord marks the cancellation type as "full"', () => {
      fc.assert(
        fc.property(arbPaidBundle(), ({ bundle }) => {
          const record = buildFullCancellationRefundRecord({
            bundle,
            cancelledAt: '2024-03-15T10:00:00.000Z',
          })
          return record.type === 'full'
        }),
        { numRuns: 100 }
      )
    })

    test('refundRecord contains all cancelled appointment IDs', () => {
      fc.assert(
        fc.property(arbPaidBundle(), ({ bundle }) => {
          const record = buildFullCancellationRefundRecord({
            bundle,
            cancelledAt: '2024-03-15T10:00:00.000Z',
          })
          const recordIds = new Set(record.appointmentIds)
          return (
            record.appointmentIds.length === bundle.appointmentIds.length &&
            bundle.appointmentIds.every(id => recordIds.has(id))
          )
        }),
        { numRuns: 100 }
      )
    })
  })

  describe('Partial cancellation refund record', () => {
    test('refundAmount equals (cancelled service price / undiscounted total) × actual paid amount, rounded to cents', () => {
      fc.assert(
        fc.property(arbPartialCancelScenario(), scenario => {
          if (!scenario) return true // skip if unable to generate
          const { bundle, appointments, services, cancelIndex } = scenario
          const cancelledAppointment = appointments[cancelIndex]

          const { refundAmount } = appendPartialCancellationRefundRecord({
            bundle,
            cancelledAppointment,
            allBundleServices: services,
            cancelledAt: '2024-03-15T10:00:00.000Z',
          })

          // Independently compute expected refund amount
          const cancelledService = services.find(
            s => s.serviceId === cancelledAppointment.serviceId
          )
          const undiscountedTotal = services.reduce((sum, s) => sum + s.price, 0)
          const expectedRefund = roundCents(
            (cancelledService.price / undiscountedTotal) * bundle.price
          )

          return refundAmount === expectedRefund
        }),
        { numRuns: 100 }
      )
    })

    test('refundRecord.cancellations contains an entry for the cancelled service', () => {
      fc.assert(
        fc.property(arbPartialCancelScenario(), scenario => {
          if (!scenario) return true
          const { bundle, appointments, services, cancelIndex } = scenario
          const cancelledAppointment = appointments[cancelIndex]

          const { refundRecord } = appendPartialCancellationRefundRecord({
            bundle,
            cancelledAppointment,
            allBundleServices: services,
            cancelledAt: '2024-03-15T10:00:00.000Z',
          })

          const entry = refundRecord.cancellations.find(
            c => c.appointmentId === cancelledAppointment.appointmentId
          )

          return (
            entry !== undefined &&
            entry.serviceId === cancelledAppointment.serviceId &&
            entry.vendorId === cancelledAppointment.vendorId
          )
        }),
        { numRuns: 100 }
      )
    })

    test('refund entry records the cancelled service price accurately', () => {
      fc.assert(
        fc.property(arbPartialCancelScenario(), scenario => {
          if (!scenario) return true
          const { bundle, appointments, services, cancelIndex } = scenario
          const cancelledAppointment = appointments[cancelIndex]
          const cancelledService = services.find(
            s => s.serviceId === cancelledAppointment.serviceId
          )

          const { refundRecord } = appendPartialCancellationRefundRecord({
            bundle,
            cancelledAppointment,
            allBundleServices: services,
            cancelledAt: '2024-03-15T10:00:00.000Z',
          })

          const entry = refundRecord.cancellations.find(
            c => c.appointmentId === cancelledAppointment.appointmentId
          )
          return entry.cancelledServicePrice === cancelledService.price
        }),
        { numRuns: 100 }
      )
    })

    test('proportional refund amount is non-negative and at most the actual paid amount', () => {
      fc.assert(
        fc.property(arbPartialCancelScenario(), scenario => {
          if (!scenario) return true
          const { bundle, appointments, services, cancelIndex } = scenario
          const cancelledAppointment = appointments[cancelIndex]

          const { refundAmount } = appendPartialCancellationRefundRecord({
            bundle,
            cancelledAppointment,
            allBundleServices: services,
            cancelledAt: '2024-03-15T10:00:00.000Z',
          })

          // refund is proportional so 0 ≤ refund ≤ paidAmount
          // Allow 1 cent tolerance for rounding
          return refundAmount >= 0 && refundAmount <= bundle.price + 0.01
        }),
        { numRuns: 100 }
      )
    })

    test('multiple sequential partial cancellations accumulate entries in refundRecord', () => {
      fc.assert(
        fc.property(arbPartialCancelScenario(), scenario => {
          if (!scenario) return true
          const { bundle, appointments, services, cancelIndex } = scenario
          const cancelledAppointment = appointments[cancelIndex]

          // First cancellation
          const { refundRecord: afterFirst } = appendPartialCancellationRefundRecord({
            bundle,
            cancelledAppointment,
            allBundleServices: services,
            cancelledAt: '2024-03-15T10:00:00.000Z',
          })

          // Pick a different cancellable index for a hypothetical second cancel
          // (still using same bundle & allBundleServices for property testing)
          const secondIndex = appointments.findIndex(
            (a, i) => i !== cancelIndex && a.vendorId !== cancelledAppointment.vendorId
          )
          if (secondIndex === -1) {
            return afterFirst.cancellations.length === 1
          }

          const secondAppointment = appointments[secondIndex]
          const { refundRecord: afterSecond } = appendPartialCancellationRefundRecord({
            bundle: { ...bundle, refundRecord: afterFirst },
            cancelledAppointment: secondAppointment,
            allBundleServices: services,
            cancelledAt: '2024-03-15T11:00:00.000Z',
          })

          return (
            afterSecond.cancellations.length === 2 &&
            afterSecond.cancellations[0].appointmentId === cancelledAppointment.appointmentId &&
            afterSecond.cancellations[1].appointmentId === secondAppointment.appointmentId
          )
        }),
        { numRuns: 100 }
      )
    })

    test('refund proportions across all services sum approximately to the actual paid amount', () => {
      // If we hypothetically cancelled every service (one by one), the sum of
      // proportional refund amounts should equal the actual paid amount (modulo rounding).
      fc.assert(
        fc.property(arbPaidBundle(), ({ bundle, appointments, services }) => {
          const totalRefundIfAllCancelled = appointments.reduce((sum, appt) => {
            const { refundAmount } = appendPartialCancellationRefundRecord({
              bundle,
              cancelledAppointment: appt,
              allBundleServices: services,
              cancelledAt: '2024-03-15T10:00:00.000Z',
            })
            return sum + refundAmount
          }, 0)

          // Allow small rounding tolerance per service
          const tolerance = appointments.length * 0.01
          return Math.abs(totalRefundIfAllCancelled - bundle.price) <= tolerance
        }),
        { numRuns: 100 }
      )
    })
  })
})
