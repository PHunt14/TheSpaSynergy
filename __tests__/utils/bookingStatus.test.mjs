/**
 * Unit Tests for Booking Status Determination
 *
 * Tests the determineBookingStatus utility function which decides whether
 * a booking should be "confirmed" or "pending-confirmation" based on
 * client history and resource type.
 *
 * **Validates: Requirements 2.5, 2.7, 2.8**
 */

import { determineBookingStatus } from '../../app/utils/bookingStatus.js'

describe('determineBookingStatus', () => {
  describe('new client always gets pending-confirmation', () => {
    test('isNewClient true with resourceType "sauna" returns pending-confirmation', () => {
      const result = determineBookingStatus({
        isNewClient: true,
        resourceType: 'sauna',
        requiresConsultation: false,
      })
      expect(result).toBe('pending-confirmation')
    })

    test('isNewClient true with resourceType "room" returns pending-confirmation', () => {
      const result = determineBookingStatus({
        isNewClient: true,
        resourceType: 'room',
        requiresConsultation: false,
      })
      expect(result).toBe('pending-confirmation')
    })

    test('isNewClient true with resourceType "staff" returns pending-confirmation', () => {
      const result = determineBookingStatus({
        isNewClient: true,
        resourceType: 'staff',
        requiresConsultation: false,
      })
      expect(result).toBe('pending-confirmation')
    })

    test('isNewClient true with requiresConsultation true returns pending-confirmation', () => {
      const result = determineBookingStatus({
        isNewClient: true,
        resourceType: 'sauna',
        requiresConsultation: true,
      })
      expect(result).toBe('pending-confirmation')
    })
  })

  describe('returning client with sauna or room gets confirmed', () => {
    test('isNewClient false with resourceType "sauna" returns confirmed', () => {
      const result = determineBookingStatus({
        isNewClient: false,
        resourceType: 'sauna',
        requiresConsultation: false,
      })
      expect(result).toBe('confirmed')
    })

    test('isNewClient false with resourceType "room" returns confirmed', () => {
      const result = determineBookingStatus({
        isNewClient: false,
        resourceType: 'room',
        requiresConsultation: false,
      })
      expect(result).toBe('confirmed')
    })
  })

  describe('returning client with other resource types gets pending-confirmation', () => {
    test('isNewClient false with resourceType "staff" returns pending-confirmation', () => {
      const result = determineBookingStatus({
        isNewClient: false,
        resourceType: 'staff',
        requiresConsultation: false,
      })
      expect(result).toBe('pending-confirmation')
    })

    test('isNewClient false with resourceType "equipment" returns pending-confirmation', () => {
      const result = determineBookingStatus({
        isNewClient: false,
        resourceType: 'equipment',
        requiresConsultation: false,
      })
      expect(result).toBe('pending-confirmation')
    })

    test('isNewClient false with undefined resourceType returns pending-confirmation', () => {
      const result = determineBookingStatus({
        isNewClient: false,
        resourceType: undefined,
        requiresConsultation: false,
      })
      expect(result).toBe('pending-confirmation')
    })
  })
})
