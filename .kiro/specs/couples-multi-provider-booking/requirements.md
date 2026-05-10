# Requirements Document

## Introduction

This feature extends the existing booking system to support couples and multi-provider services. A couples service (e.g., "Couples Head Bath") requires two staff members to serve two guests simultaneously. The system automatically assigns available staff — potentially from different vendors — and ensures both providers are free at the selected time. Payment is collected as a single transaction and split between the involved vendors/providers.

## Glossary

- **Booking_System**: The customer-facing booking flow that allows guests to select services, pick time slots, and confirm appointments.
- **Multi_Provider_Service**: A service that requires two or more staff members to deliver simultaneously to multiple guests.
- **Lead_Vendor**: The vendor who owns and manages the multi-provider service definition. The lead vendor has authority to override staff assignments.
- **Staff_Assigner**: The subsystem responsible for automatically selecting eligible staff members for a multi-provider booking.
- **Availability_Engine**: The subsystem that computes available time slots by checking staff schedules and existing appointments.
- **Payment_Splitter**: The subsystem that divides a single payment among the vendors/providers involved in a multi-provider booking.
- **Provider_Slot**: A combination of a staff member and a time window during which that staff member is available.
- **Booking_Group**: The set of linked appointments created for a single multi-provider service booking.

## Requirements

### Requirement 1: Multi-Provider Service Data Model

**User Story:** As a vendor, I want to define a service that requires multiple providers, so that couples or groups can be served simultaneously.

#### Acceptance Criteria

1. THE Multi_Provider_Service SHALL include a `minPeople` field indicating the minimum number of guests (default 2 for couples).
2. THE Multi_Provider_Service SHALL include a `maxPeople` field indicating the maximum number of guests.
3. THE Multi_Provider_Service SHALL include a `providersRequired` field indicating how many staff members are needed to deliver the service.
4. THE Multi_Provider_Service SHALL include an `allowedStaff` array that lists all eligible staff identifiers across one or more vendors.
5. THE Multi_Provider_Service SHALL include a `leadVendorId` field identifying the vendor who owns and manages the service.
6. THE Multi_Provider_Service SHALL store a single `price` representing the total cost for the group, not per person.
7. THE Multi_Provider_Service SHALL include a `paymentSplitRules` field defining how revenue is distributed among involved vendors.

### Requirement 2: Automatic Staff Assignment

**User Story:** As a customer, I want the system to automatically assign available providers when I book a couples service, so that I do not need to manually select staff.

#### Acceptance Criteria

1. WHEN a customer selects a Multi_Provider_Service, THE Staff_Assigner SHALL automatically select the required number of eligible staff members who are available at the chosen time.
2. THE Staff_Assigner SHALL only assign staff members whose identifiers appear in the service `allowedStaff` array.
3. THE Staff_Assigner SHALL verify that each assigned staff member has no conflicting appointments at the selected date and time.
4. IF the Staff_Assigner cannot find enough available staff for the requested time, THEN THE Booking_System SHALL exclude that time slot from the available options.
5. THE Staff_Assigner SHALL support staff members from different vendors within a single booking.
6. WHEN multiple valid staff combinations exist, THE Staff_Assigner SHALL prefer staff members who have auto-assign rules matching the requested day.

### Requirement 3: Availability Calculation for Multi-Provider Services

**User Story:** As a customer, I want the time picker to only show slots where all required providers are free, so that I can book with confidence.

#### Acceptance Criteria

1. WHEN the Availability_Engine generates time slots for a Multi_Provider_Service, THE Availability_Engine SHALL only return slots where at least `providersRequired` eligible staff members are simultaneously available.
2. THE Availability_Engine SHALL check each eligible staff member's schedule for the requested day, including recurrence rules and working hours.
3. THE Availability_Engine SHALL check each eligible staff member's existing appointments to detect conflicts.
4. THE Availability_Engine SHALL account for buffer minutes between appointments when determining availability.
5. WHEN a staff member's schedule indicates they are off on the requested day, THE Availability_Engine SHALL exclude that staff member from the available pool for that day.
6. THE Availability_Engine SHALL compute the intersection of available time ranges across all eligible staff and return only slots within that intersection that can accommodate the service duration.

### Requirement 4: Booking Group Creation

**User Story:** As a vendor, I want couples bookings to create linked appointments for each provider, so that each staff member sees their assignment on the calendar.

#### Acceptance Criteria

1. WHEN a Multi_Provider_Service booking is confirmed, THE Booking_System SHALL create one appointment record per assigned staff member.
2. THE Booking_System SHALL link all appointments in a Booking_Group using a shared `groupId` field.
3. THE Booking_System SHALL store the same `dateTime`, `customer`, and `serviceId` on each appointment in the group.
4. THE Booking_System SHALL assign the correct `vendorId` and `staffId` to each appointment based on the staff member's vendor affiliation.
5. IF one appointment in a Booking_Group is cancelled, THEN THE Booking_System SHALL cancel all appointments in the same group.

### Requirement 5: Lead Vendor Staff Override

**User Story:** As a lead vendor, I want to reassign providers after a booking is made, so that I can manage staffing changes.

#### Acceptance Criteria

1. WHILE a Booking_Group has status "pending-confirmation" or "confirmed", THE Booking_System SHALL allow the Lead_Vendor to reassign any staff member in the group.
2. WHEN the Lead_Vendor reassigns a staff member, THE Booking_System SHALL verify the replacement staff member is in the service `allowedStaff` array.
3. WHEN the Lead_Vendor reassigns a staff member, THE Booking_System SHALL verify the replacement staff member has no conflicting appointments at the booked time.
4. WHEN a non-lead vendor is involved in the Booking_Group, THE Booking_System SHALL allow that vendor to reassign only their own staff members.
5. WHEN a staff reassignment occurs, THE Booking_System SHALL update the affected appointment record with the new `staffId` and `vendorId`.

### Requirement 6: Payment Processing and Splitting

**User Story:** As a business owner, I want payments for couples services to be split between the involved providers, so that each vendor receives their share.

#### Acceptance Criteria

1. WHEN a customer pays for a Multi_Provider_Service, THE Payment_Splitter SHALL process a single payment for the total service price.
2. THE Payment_Splitter SHALL distribute the payment amount among involved vendors according to the service `paymentSplitRules`.
3. WHEN the service has a `houseFeeEnabled` flag set to true, THE Payment_Splitter SHALL deduct the house fee before splitting the remainder among providers.
4. THE Payment_Splitter SHALL record the payment split details on each appointment in the Booking_Group.
5. IF a vendor involved in the split does not have Square connected, THEN THE Payment_Splitter SHALL reject the card payment and inform the customer that in-person payment is required.
6. THE Payment_Splitter SHALL support both equal splits and custom percentage splits as defined in `paymentSplitRules`.

### Requirement 7: Customer Booking Flow Integration

**User Story:** As a customer, I want to book a couples service through the same booking flow I use for regular services, so that the experience is seamless.

#### Acceptance Criteria

1. WHEN a customer selects a Multi_Provider_Service, THE Booking_System SHALL skip the provider selection step.
2. THE Booking_System SHALL display the service price as the total for the group on the confirmation page.
3. THE Booking_System SHALL display the number of guests (group size) on the confirmation page.
4. WHEN the booking is confirmed, THE Booking_System SHALL display a success message indicating the service is for multiple guests.
5. THE Booking_System SHALL not expose individual staff assignments to the customer during the booking flow.

### Requirement 8: Round-Trip Data Integrity

**User Story:** As a developer, I want to verify that booking group data remains consistent through creation and retrieval, so that no information is lost.

#### Acceptance Criteria

1. FOR ALL valid Booking_Group records, creating a group and then retrieving it by `groupId` SHALL return all appointment records with matching `serviceId`, `dateTime`, and `customer` fields.
2. FOR ALL valid Multi_Provider_Service definitions, serializing the `paymentSplitRules` to JSON and deserializing back SHALL produce an equivalent object.
3. FOR ALL valid staff assignment results, the number of assigned staff SHALL equal the `providersRequired` field of the service.
