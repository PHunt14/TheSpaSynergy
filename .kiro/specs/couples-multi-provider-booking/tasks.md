# Implementation Plan: Couples Multi-Provider Booking

## Overview

This plan implements multi-provider booking support for couples services. The approach starts with data model changes (foundation), then builds pure utility functions (independently testable), extends API routes (depend on utilities), updates the customer booking UI (depends on APIs), and validates everything with property-based and unit tests.

## Tasks

- [x] 1. Extend data models for multi-provider services
  - [x] 1.1 Add multi-provider fields to the Service model in `amplify/data/resource.ts`
    - Add `providersRequired` (integer, default 1)
    - Add `leadVendorId` (string, optional)
    - Add `minPeople` (integer, optional)
    - Add `maxPeople` (integer, optional)
    - Add `paymentSplitRules` (json, optional)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 1.2 Add `groupId` field and secondary index to the Appointment model in `amplify/data/resource.ts`
    - Add `groupId` (string, optional)
    - Add secondary index on `groupId` for efficient group lookups
    - _Requirements: 4.2, 8.1_

- [x] 2. Implement Multi-Provider Availability Calculator
  - [x] 2.1 Create `getMultiProviderSlots` pure function in `app/utils/availability.js`
    - Accept service, staffSchedules, appointments, date, and bufferMinutes parameters
    - Filter staff to those in `allowedStaff` and active
    - Compute per-staff available time ranges (working hours minus existing appointments minus buffer)
    - Find 30-minute-aligned slots where at least `providersRequired` staff are simultaneously free for the full service duration
    - Return intersection set as available time slots
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x]* 2.2 Write property test: Multi-Provider Slot Validity
    - **Property 5: Multi-Provider Slot Validity**
    - **Validates: Requirements 3.1, 3.5, 3.6**
    - Use fast-check to generate random services, staff schedules, and appointments
    - Assert every returned slot has at least `providersRequired` eligible staff simultaneously free

  - [x]* 2.3 Write property test: Buffer Minutes Respected in Availability
    - **Property 6: Buffer Minutes Respected in Availability**
    - **Validates: Requirements 3.4**
    - Assert time gap between any returned slot and existing appointments is at least `bufferMinutes`

- [x] 3. Implement Staff Assigner utility
  - [x] 3.1 Create `assignStaff` pure function in `app/utils/staffAssigner.js`
    - Accept service, staffSchedules, appointments, date, time, and bufferMinutes parameters
    - Filter to eligible staff (in `allowedStaff`, active, available at the specific time)
    - Prefer staff with auto-assign rules matching the requested day
    - Return exactly `providersRequired` StaffAssignment objects `{ staffId, vendorId, staffName }`
    - Throw if fewer than `providersRequired` are available
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x]* 3.2 Write property test: Staff Assignment Count Invariant
    - **Property 1: Staff Assignment Count Invariant**
    - **Validates: Requirements 2.1, 4.1, 8.3**
    - Assert that when at least N staff are available, exactly N are returned

  - [x]* 3.3 Write property test: Staff Assignment Subset of AllowedStaff
    - **Property 2: Staff Assignment Subset of AllowedStaff**
    - **Validates: Requirements 2.2**
    - Assert every assigned staff ID appears in `service.allowedStaff`

  - [x]* 3.4 Write property test: Assigned Staff Are Conflict-Free
    - **Property 3: Assigned Staff Are Conflict-Free**
    - **Validates: Requirements 2.3**
    - Assert no assigned staff has an overlapping appointment at the assigned time

  - [x]* 3.5 Write property test: Auto-Assign Preference
    - **Property 4: Auto-Assign Preference**
    - **Validates: Requirements 2.6**
    - Assert staff with matching auto-assign rules are preferred over those without

- [x] 4. Implement Payment Split Calculator
  - [x] 4.1 Create `calculateMultiProviderSplit` function in `app/utils/payment.js`
    - Accept service, assignedStaff array, and houseVendorId parameters
    - Calculate house fee from service `houseFeeAmount` when `houseFeeEnabled` is true
    - Split remainder equally: `(price - houseFeeAmount) / providersRequired` per provider
    - Return `{ total, houseFee, providerShares: [{ vendorId, staffId, amount }] }`
    - Support both equal splits and custom percentage splits from `paymentSplitRules`
    - _Requirements: 6.1, 6.2, 6.3, 6.6_

  - [x]* 4.2 Write property test: Payment Split Correctness
    - **Property 12: Payment Split Correctness**
    - **Validates: Requirements 6.2, 6.3, 6.6**
    - Assert house vendor receives exactly H, each provider receives (P - H) / N, and sum equals P

  - [x]* 4.3 Write property test: PaymentSplitRules Serialization Round-Trip
    - **Property 14: PaymentSplitRules Serialization Round-Trip**
    - **Validates: Requirements 8.2**
    - Assert serializing to JSON and deserializing back produces an equivalent object

- [x] 5. Checkpoint - Verify pure utility functions
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Extend Availability API for multi-provider services
  - [x] 6.1 Add `multiProvider=true` query parameter support to `app/api/availability/route.ts`
    - When `multiProvider=true`, fetch all staff schedules for staff IDs in `service.allowedStaff`
    - Fetch appointments for ALL those staff members on the requested date
    - Call `getMultiProviderSlots()` instead of the single-staff path
    - Return slots without exposing specific staff assignments
    - _Requirements: 3.1, 3.5, 3.6_

- [x] 7. Extend Booking API for group creation
  - [x] 7.1 Add multi-provider booking support to `app/api/appointments/route.ts` POST handler
    - Accept `multiProvider: true` and `providersRequired` in request body
    - Run staff assignment via `assignStaff()` for the selected time
    - Generate a shared `groupId` (UUID)
    - Create one appointment per assigned staff member, all sharing the same `groupId`, `dateTime`, `customer`, and `serviceId`
    - Assign correct `vendorId` and `staffId` per appointment based on staff vendor affiliation
    - Return all created appointment IDs and the `groupId`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x]* 7.2 Write property test: Booking Group Consistency
    - **Property 7: Booking Group Consistency**
    - **Validates: Requirements 4.2, 4.3**
    - Assert all appointments in a group share the same `groupId`, `dateTime`, `customer`, and `serviceId`

  - [x]* 7.3 Write property test: Booking Group VendorId Matches Staff Vendor
    - **Property 8: Booking Group VendorId Matches Staff Vendor**
    - **Validates: Requirements 4.4**
    - Assert each appointment's `vendorId` equals the assigned staff member's `vendorId`

  - [x]* 7.4 Write property test: Booking Group Round-Trip
    - **Property 13: Booking Group Round-Trip**
    - **Validates: Requirements 8.1**
    - Assert creating a group and retrieving by `groupId` returns matching records

- [x] 8. Extend Payment route for multi-provider split
  - [x] 8.1 Add multi-provider payment processing to `app/api/payment/route.js`
    - Accept `multiProvider: true` and `paymentSplit` in request body
    - Use `calculateMultiProviderSplit()` to compute shares
    - Build `bundlePayments` array from provider shares
    - Process via existing `processBundlePayment` path with `additionalRecipients`
    - Record payment split details on each appointment in the group
    - Reject card payment if any involved vendor lacks Square credentials
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 9. Implement Group Cancellation Handler
  - [x] 9.1 Extend `app/api/appointments/cancel/route.ts` for group cancellation
    - When cancelling an appointment that has a `groupId`, query all appointments with the same `groupId`
    - Cancel all appointments in the group atomically
    - Handle refund initiation through Square if payment was processed
    - Return 404 for invalid `groupId`
    - Handle idempotent cancellation of already-cancelled groups
    - _Requirements: 4.5_

  - [x]* 9.2 Write property test: Group Cancellation Cascades
    - **Property 9: Group Cancellation Cascades**
    - **Validates: Requirements 4.5**
    - Assert cancelling any single appointment in a group results in all N appointments being cancelled

- [x] 10. Implement Lead Vendor Override API
  - [x] 10.1 Create `app/api/appointments/reassign/route.ts` with POST handler
    - Accept `appointmentId`, `newStaffId`, and `requestingVendorId` in request body
    - Verify requesting vendor is the lead vendor OR owns the staff being replaced
    - Verify new staff is in `allowedStaff`
    - Verify new staff has no conflicts at the booked time
    - Update the appointment record with new `staffId` and `vendorId`
    - Return 400 if staff not eligible, 403 if not authorized, 409 if conflict exists
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x]* 10.2 Write property test: Reassignment Validates AllowedStaff
    - **Property 10: Reassignment Validates AllowedStaff**
    - **Validates: Requirements 5.2**
    - Assert reassignment accepted only if new staff is in `allowedStaff`

  - [x]* 10.3 Write property test: Reassignment Rejects Conflicts
    - **Property 11: Reassignment Rejects Conflicts**
    - **Validates: Requirements 5.3**
    - Assert reassignment rejected when new staff has a conflicting appointment

- [x] 11. Checkpoint - Verify API routes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Update customer booking flow UI
  - [x] 12.1 Skip provider selection for multi-provider services in `app/booking/service/page.jsx`
    - When a service has `providersRequired > 1`, route directly to time selection instead of provider selection
    - Pass `multiProvider=true` query parameter to the time picker page
    - _Requirements: 7.1_

  - [x] 12.2 Update time picker page `app/booking/time/page.jsx` for multi-provider availability
    - When `multiProvider=true` query param is present, call availability API with `multiProvider=true`
    - Display available slots without showing individual staff names
    - _Requirements: 3.1, 7.5_

  - [x] 12.3 Update confirmation page `app/booking/confirm/page.jsx` for multi-provider bookings
    - Display total group price (not per-person)
    - Display number of guests (group size) based on `minPeople`/`maxPeople`
    - Show success message indicating the service is for multiple guests
    - Do not expose individual staff assignments to the customer
    - _Requirements: 7.2, 7.3, 7.4, 7.5_

- [x] 13. Write unit tests for multi-provider features
  - [x]* 13.1 Write unit tests for `getMultiProviderSlots` in `__tests__/utils/availability.test.mjs`
    - Test cross-vendor staff availability
    - Test recurrence rule handling for multi-provider
    - Test specific appointment conflict scenarios
    - Test boundary: exactly `providersRequired` staff available
    - Test backward compatibility: `providersRequired = 1`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x]* 13.2 Write unit tests for `assignStaff` in `__tests__/utils/staffAssigner.test.mjs`
    - Test cross-vendor staff assignment
    - Test auto-assign preference logic
    - Test error when insufficient staff available
    - Test all staff from same vendor (no cross-vendor split)
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6_

  - [x]* 13.3 Write unit tests for `calculateMultiProviderSplit` in `__tests__/utils/payment.test.mjs`
    - Test equal split with house fee
    - Test equal split without house fee
    - Test custom percentage splits
    - Test vendor missing Square credentials rejection
    - _Requirements: 6.2, 6.3, 6.5, 6.6_

  - [x]* 13.4 Write unit tests for group cancellation and reassignment
    - Test cascade cancellation of all group appointments
    - Test lead vendor vs non-lead vendor authorization
    - Test reassignment to same staff member (no-op)
    - Test cancellation of already-cancelled group (idempotent)
    - _Requirements: 4.5, 5.1, 5.4_

- [x] 14. Write integration tests for end-to-end flows
  - [x]* 14.1 Write integration test for full multi-provider booking flow in `__tests__/integration/multiProviderBooking.test.mjs`
    - Test service selection → time pick → confirm → appointments created with shared groupId
    - Test payment flow: single charge with additionalRecipients split
    - Test group cancellation: cancel one → all cancelled
    - Test availability API returns correct slots for multi-provider service
    - _Requirements: 4.1, 4.2, 6.1, 7.1_

- [x] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (14 properties total)
- Unit tests validate specific examples and edge cases
- The existing `processBundlePayment` infrastructure in `app/api/payment/route.js` is reused for payment splitting
- The existing `resolveStaffSync` pattern in `app/utils/availability.js` informs the staff assignment approach
- All new utility functions are pure functions for easy testing
