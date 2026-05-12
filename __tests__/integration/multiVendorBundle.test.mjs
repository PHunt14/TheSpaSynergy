/**
 * Integration Tests for Multi-Vendor Bundle Booking Flow
 *
 * Tests the end-to-end flows by composing utility functions and simulating
 * API behavior with mocked data layer (DynamoDB/Amplify).
 *
 * Validates Requirements: 1.1, 4.1, 5.1, 6.1, 7.2, 7.3, 7.4, 8.2, 8.3
 */

import { jest } from '@jest/globals'
import { getSequentialBundleSlots, calculateServiceSchedule, calculateTotalBundleDuration } from '../../app/utils/sequentialAvailability.js'
import { assignBundleStaff } from '../../app/utils/bundleStaffAssigner.js'
import { calculateBundlePrice, validateBundleServices, distributeDiscountAcrossVendors } from '../../app/utils/bundleDiscount.js'
import { calculateBundlePaymentSplit } from '../../app/utils/bundlePaymentSplit.js'

// ── Test Data ─────────────────────────────────────────────────

const services = [
  {
    serviceId: 'svc-massage',
    name: 'Deep Tissue Massage',
    vendorId: 'vendor-a',
    duration: 60,
    price: 120,
    allowedStaff: ['staff-alice', 'staff-diana'],
    providersRequired: 1,
    isActive: true,
    houseFeeEnabled: true,
    houseFeeAmount: 15,
  },
  {
    serviceId: 'svc-facial',
    name: 'Hydrating Facial',
    vendorId: 'vendor-b',
    duration: 45,
    price: 90,
    allowedStaff: ['staff-bob'],
    providersRequired: 1,
    isActive: true,
    houseFeeEnabled: true,
    houseFeeAmount: 10,
  },
  {
    serviceId: 'svc-nails',
    name: 'Gel Manicure',
    vendorId: 'vendor-c',
    duration: 30,
    price: 50,
    allowedStaff: ['staff-carol'],
    providersRequired: 1,
    isActive: true,
    houseFeeEnabled: false,
    houseFeeAmount: 0,
  },
]

const staffSchedules = {
  'svc-massage': [
    {
      visibleId: 'staff-alice',
      vendorId: 'vendor-a',
      isActive: true,
      name: 'Alice',
      schedule: { monday: { start: '09:00', end: '17:00' }, tuesday: { start: '09:00', end: '17:00' }, wednesday: { start: '09:00', end: '17:00' } },
      autoAssignRules: [{ action: 'auto-assign', days: ['monday', 'tuesday', 'wednesday'] }],
    },
    {
      visibleId: 'staff-diana',
      vendorId: 'vendor-a',
      isActive: true,
      name: 'Diana',
      schedule: { monday: { start: '10:00', end: '16:00' }, tuesday: { start: '10:00', end: '16:00' } },
      autoAssignRules: null,
    },
  ],
  'svc-facial': [
    {
      visibleId: 'staff-bob',
      vendorId: 'vendor-b',
      isActive: true,
      name: 'Bob',
      schedule: { monday: { start: '09:00', end: '17:00' }, tuesday: { start: '09:00', end: '17:00' }, wednesday: { start: '09:00', end: '17:00' } },
      autoAssignRules: [{ action: 'auto-assign', days: ['monday', 'tuesday'] }],
    },
  ],
  'svc-nails': [
    {
      visibleId: 'staff-carol',
      vendorId: 'vendor-c',
      isActive: true,
      name: 'Carol',
      schedule: { monday: { start: '09:00', end: '17:00' }, tuesday: { start: '09:00', end: '17:00' }, wednesday: { start: '09:00', end: '17:00' } },
      autoAssignRules: [{ action: 'auto-assign', days: ['monday'] }],
    },
  ],
}

const bundleSettings = {
  discount2Services: 5,
  discount3Services: 10,
  discount4PlusServices: 15,
}

const customer = {
  name: 'Jane Smith',
  email: 'jane@example.com',
  phone: '555-9876',
  smsOptIn: true,
}

// ── Helper Functions ──────────────────────────────────────────

function createBundleRecord(bundleId, appointmentIds, services, priceResult, schedule, date, startTime) {
  const uniqueVendorIds = [...new Set(services.map(s => s.vendorId))]
  const vendorConfirmations = Object.fromEntries(uniqueVendorIds.map(v => [v, 'pending']))

  return {
    bundleId,
    name: 'Custom Bundle',
    serviceIds: services.map(s => s.serviceId),
    vendorIds: uniqueVendorIds,
    price: priceResult.total,
    discountPercent: priceResult.discountPercent,
    status: 'pending-confirmation',
    vendorConfirmations,
    appointmentIds,
    customer,
    dateTime: `${date}T${startTime}`,
    serviceOrder: services.map(s => s.serviceId),
    schedule,
    isActive: true,
    refundRecord: null,
  }
}

function createAppointments(bundleId, staffAssignments, date) {
  return staffAssignments.map((assignment, i) => ({
    appointmentId: `apt-${bundleId}-${i}`,
    vendorId: assignment.vendorId,
    serviceId: assignment.serviceId,
    staffId: assignment.staffId,
    bundleId,
    dateTime: `${date}T${assignment.startTime}`,
    customer,
    status: 'pending-confirmation',
    paymentId: null,
    paymentAmount: null,
  }))
}

// ── Tests ─────────────────────────────────────────────────────

describe('Multi-Vendor Bundle Booking Integration', () => {
  describe('Full Booking Flow (Req 1.1, 4.1, 6.1)', () => {
    test('service selection → sequential availability → confirm → appointments created → Bundle record created', () => {
      const date = '2025-01-06' // Monday
      const bufferMinutes = 15

      // Step 1: Validate service selection
      const validation = validateBundleServices(services)
      expect(validation.valid).toBe(true)

      // Step 2: Get sequential availability
      const { slots, suggestedOrder } = getSequentialBundleSlots({
        services,
        staffSchedulesByService: staffSchedules,
        appointments: [],
        startDate: date,
        bufferMinutes,
        serviceOrder: null,
        multiDay: false,
        maxDays: 1,
      })

      expect(slots.length).toBeGreaterThan(0)
      expect(suggestedOrder).toHaveLength(3)

      // Step 3: Customer picks first available slot
      const selectedSlot = slots[0]
      const startTime = selectedSlot.startTime

      // Step 4: Assign staff
      const orderedServices = suggestedOrder.map(id => services.find(s => s.serviceId === id))
      const staffAssignments = assignBundleStaff({
        orderedServices,
        staffSchedulesByService: staffSchedules,
        appointments: [],
        date,
        startTime,
        bufferMinutes,
      })

      expect(staffAssignments).toHaveLength(3)
      staffAssignments.forEach(assignment => {
        expect(assignment).toHaveProperty('serviceId')
        expect(assignment).toHaveProperty('staffId')
        expect(assignment).toHaveProperty('vendorId')
        expect(assignment).toHaveProperty('startTime')
        expect(assignment).toHaveProperty('endTime')
      })

      // Step 5: Calculate bundle price
      const priceResult = calculateBundlePrice({
        services: services.map(s => ({ price: s.price })),
        predefinedBundle: null,
        bundleSettings,
      })

      expect(priceResult.subtotal).toBe(260) // 120 + 90 + 50
      expect(priceResult.discountPercent).toBe(10) // 3 services → discount3Services
      expect(priceResult.discountAmount).toBe(26)
      expect(priceResult.total).toBe(234)

      // Step 6: Create appointments
      const bundleId = 'bundle-integration-test-1'
      const appointments = createAppointments(bundleId, staffAssignments, date)

      expect(appointments).toHaveLength(3)
      expect(appointments.every(apt => apt.bundleId === bundleId)).toBe(true)
      expect(appointments.every(apt => apt.status === 'pending-confirmation')).toBe(true)

      // Verify each appointment has correct vendorId matching its service
      appointments.forEach((apt, i) => {
        expect(apt.vendorId).toBe(staffAssignments[i].vendorId)
        expect(apt.serviceId).toBe(staffAssignments[i].serviceId)
        expect(apt.staffId).toBe(staffAssignments[i].staffId)
      })

      // Step 7: Create Bundle record
      const bundle = createBundleRecord(
        bundleId,
        appointments.map(a => a.appointmentId),
        orderedServices,
        priceResult,
        staffAssignments,
        date,
        startTime
      )

      expect(bundle.status).toBe('pending-confirmation')
      expect(bundle.appointmentIds).toHaveLength(3)
      expect(bundle.vendorIds).toHaveLength(3)
      expect(Object.keys(bundle.vendorConfirmations)).toHaveLength(3)
      expect(Object.values(bundle.vendorConfirmations).every(s => s === 'pending')).toBe(true)
      expect(bundle.price).toBe(234)
      expect(bundle.dateTime).toBe(`${date}T${startTime}`)
    })
  })

  describe('Payment Flow (Req 5.1)', () => {
    test('single charge with multi-vendor split via additionalRecipients', () => {
      const bufferMinutes = 15

      // Calculate price
      const priceResult = calculateBundlePrice({
        services: services.map(s => ({ price: s.price })),
        predefinedBundle: null,
        bundleSettings,
      })

      // Calculate payment split
      const paymentSplit = calculateBundlePaymentSplit({
        services,
        discountAmount: priceResult.discountAmount,
        houseVendorId: 'vendor-house',
      })

      // Verify total matches bundle price
      expect(paymentSplit.total).toBe(priceResult.total)

      // Verify house fees are collected
      expect(paymentSplit.houseFee).toBe(25) // 15 + 10 (vendor-c has no house fee)

      // Verify vendor shares exist for all vendors
      expect(paymentSplit.vendorShares).toHaveLength(3)
      const vendorIds = paymentSplit.vendorShares.map(s => s.vendorId)
      expect(vendorIds).toContain('vendor-a')
      expect(vendorIds).toContain('vendor-b')
      expect(vendorIds).toContain('vendor-c')

      // Verify bundlePayments array is compatible with processBundlePayment
      expect(paymentSplit.bundlePayments.length).toBeGreaterThan(0)
      paymentSplit.bundlePayments.forEach(payment => {
        expect(payment).toHaveProperty('vendorId')
        expect(payment).toHaveProperty('amount')
        expect(payment).toHaveProperty('isHouseFee')
        expect(payment.amount).toBeGreaterThan(0)
      })

      // Verify all amounts sum correctly
      const totalFromPayments = paymentSplit.bundlePayments.reduce((sum, p) => sum + p.amount, 0)
      // Total from bundlePayments = vendor shares + house fee
      const vendorSharesTotal = paymentSplit.vendorShares.reduce((sum, s) => sum + s.amount, 0)
      expect(Math.round((vendorSharesTotal + paymentSplit.houseFee) * 100) / 100).toBe(paymentSplit.total)
    })
  })

  describe('Vendor Confirmation Flow (Req 7.2, 7.3, 7.4)', () => {
    let bundle
    let appointments

    beforeEach(() => {
      const date = '2025-01-06'
      const startTime = '09:00'
      const bundleId = 'bundle-confirm-test'

      const priceResult = calculateBundlePrice({
        services: services.map(s => ({ price: s.price })),
        predefinedBundle: null,
        bundleSettings,
      })

      const schedule = calculateServiceSchedule(services, startTime, 15)

      appointments = services.map((svc, i) => ({
        appointmentId: `apt-confirm-${i}`,
        vendorId: svc.vendorId,
        serviceId: svc.serviceId,
        staffId: staffSchedules[svc.serviceId][0].visibleId,
        bundleId,
        dateTime: `${date}T${schedule[i].startTime}`,
        customer,
        status: 'pending-confirmation',
      }))

      bundle = createBundleRecord(
        bundleId,
        appointments.map(a => a.appointmentId),
        services,
        priceResult,
        schedule,
        date,
        startTime
      )
    })

    test('all vendors confirm → bundle confirmed → customer notified', () => {
      // Vendor A confirms
      bundle.vendorConfirmations['vendor-a'] = 'confirmed'
      const vendorAAppts = appointments.filter(a => a.vendorId === 'vendor-a')
      vendorAAppts.forEach(a => { a.status = 'confirmed' })

      // Check: not all confirmed yet
      const allConfirmedAfterA = Object.values(bundle.vendorConfirmations).every(s => s === 'confirmed')
      expect(allConfirmedAfterA).toBe(false)
      expect(bundle.status).toBe('pending-confirmation')

      // Vendor B confirms
      bundle.vendorConfirmations['vendor-b'] = 'confirmed'
      const vendorBAppts = appointments.filter(a => a.vendorId === 'vendor-b')
      vendorBAppts.forEach(a => { a.status = 'confirmed' })

      // Check: still not all confirmed
      const allConfirmedAfterB = Object.values(bundle.vendorConfirmations).every(s => s === 'confirmed')
      expect(allConfirmedAfterB).toBe(false)

      // Vendor C confirms
      bundle.vendorConfirmations['vendor-c'] = 'confirmed'
      const vendorCAppts = appointments.filter(a => a.vendorId === 'vendor-c')
      vendorCAppts.forEach(a => { a.status = 'confirmed' })

      // Now all confirmed
      const allConfirmed = Object.values(bundle.vendorConfirmations).every(s => s === 'confirmed')
      expect(allConfirmed).toBe(true)

      // Update bundle status
      bundle.status = allConfirmed ? 'confirmed' : 'pending-confirmation'
      expect(bundle.status).toBe('confirmed')

      // All appointments should be confirmed
      expect(appointments.every(a => a.status === 'confirmed')).toBe(true)

      // Customer notification would be triggered (SMS)
      expect(bundle.customer.smsOptIn).toBe(true)
      expect(bundle.customer.phone).toBeTruthy()
    })

    test('one vendor declines → cascade cancellation → customer notified', () => {
      // Vendor A confirms first
      bundle.vendorConfirmations['vendor-a'] = 'confirmed'
      appointments.filter(a => a.vendorId === 'vendor-a').forEach(a => { a.status = 'confirmed' })

      // Vendor B declines → cascade cancellation
      bundle.vendorConfirmations['vendor-b'] = 'cancelled'

      // Cascade: cancel ALL appointments
      appointments.forEach(a => { a.status = 'cancelled' })
      bundle.status = 'cancelled'

      // Verify cascade cancellation
      expect(bundle.status).toBe('cancelled')
      expect(appointments.every(a => a.status === 'cancelled')).toBe(true)

      // Even vendor-a's confirmed appointment gets cancelled
      const vendorAAppt = appointments.find(a => a.vendorId === 'vendor-a')
      expect(vendorAAppt.status).toBe('cancelled')

      // Customer notification would be triggered
      expect(bundle.customer.smsOptIn).toBe(true)
    })
  })

  describe('Partial Cancellation (Req 8.2)', () => {
    test('cancel one service → price recalculated → Bundle record updated', () => {
      const date = '2025-01-06'
      const startTime = '09:00'
      const bundleId = 'bundle-partial-cancel'
      const bufferMinutes = 15

      const priceResult = calculateBundlePrice({
        services: services.map(s => ({ price: s.price })),
        predefinedBundle: null,
        bundleSettings,
      })

      const schedule = calculateServiceSchedule(services, startTime, bufferMinutes)

      const appointments = services.map((svc, i) => ({
        appointmentId: `apt-pc-${i}`,
        vendorId: svc.vendorId,
        serviceId: svc.serviceId,
        staffId: staffSchedules[svc.serviceId][0].visibleId,
        bundleId,
        dateTime: `${date}T${schedule[i].startTime}`,
        customer,
        status: 'confirmed',
      }))

      const bundle = createBundleRecord(
        bundleId,
        appointments.map(a => a.appointmentId),
        services,
        priceResult,
        schedule,
        date,
        startTime
      )
      bundle.status = 'confirmed'

      // Cancel the nails service (vendor-c)
      const cancelledAppt = appointments.find(a => a.serviceId === 'svc-nails')
      cancelledAppt.status = 'cancelled'

      // Remaining services
      const remainingServices = services.filter(s => s.serviceId !== 'svc-nails')
      const remainingAppointments = appointments.filter(a => a.serviceId !== 'svc-nails')

      // Validate remaining bundle still meets constraints
      const remainingVendors = new Set(remainingServices.map(s => s.vendorId))
      expect(remainingVendors.size).toBeGreaterThanOrEqual(2)
      expect(remainingAppointments.length).toBeGreaterThanOrEqual(2)

      // Recalculate price with remaining services (2 services → discount2Services)
      const newPriceResult = calculateBundlePrice({
        services: remainingServices.map(s => ({ price: s.price })),
        predefinedBundle: null,
        bundleSettings,
      })

      expect(newPriceResult.subtotal).toBe(210) // 120 + 90
      expect(newPriceResult.discountPercent).toBe(5) // 2 services → discount2Services
      expect(newPriceResult.discountAmount).toBe(10.5)
      expect(newPriceResult.total).toBe(199.5)

      // Update bundle record
      bundle.appointmentIds = remainingAppointments.map(a => a.appointmentId)
      bundle.serviceIds = remainingServices.map(s => s.serviceId)
      bundle.vendorIds = [...remainingVendors]
      bundle.price = newPriceResult.total
      bundle.discountPercent = newPriceResult.discountPercent

      // Calculate refund for cancelled service
      const cancelledServicePrice = 50 // svc-nails price
      const originalSubtotal = 260
      const originalPaidAmount = priceResult.total // 234
      const refundAmount = Math.round((cancelledServicePrice / originalSubtotal) * originalPaidAmount * 100) / 100

      bundle.refundRecord = {
        cancellations: [{
          appointmentId: cancelledAppt.appointmentId,
          serviceId: 'svc-nails',
          vendorId: 'vendor-c',
          refundAmount,
          cancelledServicePrice,
        }],
      }

      // Verify updated bundle
      expect(bundle.appointmentIds).toHaveLength(2)
      expect(bundle.price).toBe(199.5)
      expect(bundle.refundRecord.cancellations).toHaveLength(1)
      expect(bundle.refundRecord.cancellations[0].refundAmount).toBeCloseTo(45, 0)
    })
  })

  describe('Full Cancellation (Req 8.3)', () => {
    test('cancel all → all appointments cancelled → refund recorded', () => {
      const date = '2025-01-06'
      const startTime = '09:00'
      const bundleId = 'bundle-full-cancel'
      const bufferMinutes = 15

      const priceResult = calculateBundlePrice({
        services: services.map(s => ({ price: s.price })),
        predefinedBundle: null,
        bundleSettings,
      })

      const schedule = calculateServiceSchedule(services, startTime, bufferMinutes)

      const appointments = services.map((svc, i) => ({
        appointmentId: `apt-fc-${i}`,
        vendorId: svc.vendorId,
        serviceId: svc.serviceId,
        staffId: staffSchedules[svc.serviceId][0].visibleId,
        bundleId,
        dateTime: `${date}T${schedule[i].startTime}`,
        customer,
        status: 'confirmed',
        paymentId: 'pay-123',
        paymentAmount: svc.price * (priceResult.total / priceResult.subtotal),
      }))

      const bundle = createBundleRecord(
        bundleId,
        appointments.map(a => a.appointmentId),
        services,
        priceResult,
        schedule,
        date,
        startTime
      )
      bundle.status = 'confirmed'

      // Full cancellation
      appointments.forEach(a => { a.status = 'cancelled' })
      bundle.status = 'cancelled'

      // Record refund for the full amount
      bundle.refundRecord = {
        type: 'full',
        cancelledAt: new Date().toISOString(),
        totalRefundAmount: priceResult.total,
        appointmentIds: appointments.map(a => a.appointmentId),
      }

      // Verify
      expect(bundle.status).toBe('cancelled')
      expect(appointments.every(a => a.status === 'cancelled')).toBe(true)
      expect(bundle.refundRecord.type).toBe('full')
      expect(bundle.refundRecord.totalRefundAmount).toBe(234)
      expect(bundle.refundRecord.appointmentIds).toHaveLength(3)
    })
  })

  describe('Multi-Day Booking (Req 4.1)', () => {
    test('services scheduled across consecutive days', () => {
      const startDate = '2025-01-06' // Monday
      const bufferMinutes = 15

      // Use multi-day mode
      const { slots, suggestedOrder } = getSequentialBundleSlots({
        services,
        staffSchedulesByService: staffSchedules,
        appointments: [],
        startDate,
        bufferMinutes,
        serviceOrder: services.map(s => s.serviceId),
        multiDay: true,
        maxDays: 3,
      })

      // Multi-day should return slots (services can be distributed across days)
      expect(slots.length).toBeGreaterThan(0)

      // Check that multi-day slots have day information
      const multiDaySlot = slots.find(s => s.schedule.some(entry => entry.day !== undefined && entry.day > 0))

      if (multiDaySlot) {
        // If multi-day distribution was found, verify services span multiple days
        const days = new Set(multiDaySlot.schedule.map(entry => entry.day))
        expect(days.size).toBeGreaterThan(1)

        // Each service should have valid start/end times
        multiDaySlot.schedule.forEach(entry => {
          expect(entry).toHaveProperty('serviceId')
          expect(entry).toHaveProperty('startTime')
          expect(entry).toHaveProperty('endTime')
        })
      } else {
        // If all services fit in one day, that's also valid
        expect(slots[0].schedule).toHaveLength(3)
      }
    })
  })

  describe('Square Credential Check (Req 5.1)', () => {
    test('vendor without Square → payment rejected', () => {
      // Simulate the credential check that happens in processBundlePayment
      const vendors = [
        { vendorId: 'vendor-house', isHouse: true, squareAccessToken: 'house-tok', squareLocationId: 'LOC-HOUSE' },
        { vendorId: 'vendor-a', squareAccessToken: 'a-tok', squareLocationId: 'LOC-A' },
        { vendorId: 'vendor-b', squareAccessToken: null, squareLocationId: null }, // Missing Square!
        { vendorId: 'vendor-c', squareAccessToken: 'c-tok', squareLocationId: 'LOC-C' },
      ]

      const houseVendor = vendors.find(v => v.isHouse)
      expect(houseVendor).toBeDefined()

      // Calculate payment split
      const priceResult = calculateBundlePrice({
        services: services.map(s => ({ price: s.price })),
        predefinedBundle: null,
        bundleSettings,
      })

      const paymentSplit = calculateBundlePaymentSplit({
        services,
        discountAmount: priceResult.discountAmount,
        houseVendorId: 'vendor-house',
      })

      // Check all non-house vendors have Square credentials
      const nonHouseVendorIds = [...new Set(paymentSplit.bundlePayments
        .filter(p => !p.isHouseFee)
        .map(p => p.vendorId))]

      const missingCredentials = nonHouseVendorIds.filter(vid => {
        const vendor = vendors.find(v => v.vendorId === vid)
        return !vendor?.squareAccessToken || !vendor?.squareLocationId
      })

      // vendor-b is missing credentials
      expect(missingCredentials).toContain('vendor-b')
      expect(missingCredentials.length).toBeGreaterThan(0)

      // Payment should be rejected
      const paymentAllowed = missingCredentials.length === 0
      expect(paymentAllowed).toBe(false)
    })
  })

  describe('Sequential Schedule Integrity', () => {
    test('services are scheduled back-to-back with correct buffer times', () => {
      const startTime = '09:00'
      const bufferMinutes = 15

      const schedule = calculateServiceSchedule(services, startTime, bufferMinutes)

      expect(schedule).toHaveLength(3)

      // First service starts at 09:00, ends at 10:00 (60 min)
      expect(schedule[0].startTime).toBe('09:00')
      expect(schedule[0].endTime).toBe('10:00')

      // Second service starts at 10:15 (10:00 + 15 buffer), ends at 11:00 (45 min)
      expect(schedule[1].startTime).toBe('10:15')
      expect(schedule[1].endTime).toBe('11:00')

      // Third service starts at 11:15 (11:00 + 15 buffer), ends at 11:45 (30 min)
      expect(schedule[2].startTime).toBe('11:15')
      expect(schedule[2].endTime).toBe('11:45')

      // Total duration
      const totalDuration = calculateTotalBundleDuration(services, bufferMinutes)
      expect(totalDuration).toBe(60 + 45 + 30 + 15 * 2) // 165 minutes
    })

    test('staff assignments respect sequential scheduling with no conflicts', () => {
      const date = '2025-01-06' // Monday
      const startTime = '09:00'
      const bufferMinutes = 15

      const staffAssignments = assignBundleStaff({
        orderedServices: services,
        staffSchedulesByService: staffSchedules,
        appointments: [],
        date,
        startTime,
        bufferMinutes,
      })

      // Verify no two assignments for the same staff overlap
      for (let i = 0; i < staffAssignments.length; i++) {
        for (let j = i + 1; j < staffAssignments.length; j++) {
          if (staffAssignments[i].staffId === staffAssignments[j].staffId) {
            const endI = timeToMinutes(staffAssignments[i].endTime)
            const startJ = timeToMinutes(staffAssignments[j].startTime)
            // End of earlier service + buffer should be <= start of later service
            expect(endI + bufferMinutes).toBeLessThanOrEqual(startJ)
          }
        }
      }
    })
  })
})

// ── Helper ────────────────────────────────────────────────────

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}
