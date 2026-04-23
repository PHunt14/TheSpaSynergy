# Visit Notes — April 2025

Feedback collected during on-site visit with customers. Items triaged and sorted by priority.

## Status Key
- ✅ Done
- 🔧 In Progress
- 📋 Planned (pre-launch or near-term)
- 🔮 Future

---

## Bugs Fixed

### ✅ Vendor Edit/Activate Page Broken
**Source**: "The vendor page in the dashboard to active or edit vendors does not work"
**Root cause**: Three bugs in `app/dashboard/vendors/page.jsx`:
1. Form render condition required `editingVendor` to be truthy — blocked the form from ever showing
2. No "Add Vendor" button existed on the page
3. `loadVendors()` was called after saves but the function was named `initVendors` — list never refreshed

---

## Verify

### Social Media & Google Review Links on Vendor Pages
**Source**: "Verify what it looks like when a business has setup their social media and google review links"
**Status**: VendorSettings already supports Facebook, Instagram, TikTok, Website, and Google Place ID. Need to verify the public vendor detail page renders them.

---

## Pre-Launch

### 📋 Staff/Profile Pictures — Uniform Size
**Source**: "Make all of the staff/profile pictures the same size"
**Effort**: CSS fix

### 📋 Jylian Cover Photo
**Source**: "Jylian photo as her cover photo"
**Effort**: Content update (S3 upload + seed data or vendor settings)

### 📋 Individual Vendor Booking — QA Pass
**Source**: "Individual bookings for individual vendors is the most popular, bread and butter, make sure that is 100% fool proof before go-live."
**Priority**: Highest — this is the core flow

### 📋 QR Code for Website
**Source**: "QR code for the website"
**Effort**: Marketing asset, generate and print

---

## Near-Term Features

### 📋 Bridal Party / Group Event Booking Rules
**Source**: "Package timings get concerning for 3+ people. We should limit the booking to 30-minute or less services for 3+ people. We should take a deposit for services."
**Implementation notes**:
- Add group size field to booking flow
- When 3+ people: filter available services to ≤30 min duration
- Require deposit (partial payment at checkout)
- Charcuterie board add-on for events (see existing add-on work in June feedback #7)

### 📋 Spa Package Day Restrictions
**Source**: "Spa packages only Saturday through Monday. Perhaps also Friday, let's make this configurable in the settings page."
**Implementation notes**:
- Add `allowedDays` field to Bundle model (e.g., `["friday", "saturday", "sunday", "monday"]`)
- Configurable per-bundle in vendor settings or bundle management
- Availability API filters time slots by allowed days for bundles

### 📋 Advance Booking Requirement
**Source**: "Spa day packages need to be booked in advance... no day-of bookings, probably make it at least a week in advance"
**Implementation notes**:
- Add `minAdvanceBookingDays` field to Bundle and/or Service model
- Availability API excludes dates within the minimum window
- Default: 0 (no restriction). Spa day bundles: 7 days

### 📋 Event/Package Time Frame Selection
**Source**: "When booking events, packages, spa day they should be able to select the preferred (available) date and time frame (morning [8am], afternoon [12p], evening [4pm])."
**Implementation notes**:
- For bundles/events, replace exact time slot picker with time frame selector
- Three blocks: Morning (8 AM), Afternoon (12 PM), Evening (4 PM)
- Vendor confirms exact start time

### 📋 Vendor Intake Forms
**Source**: "We have some lead questions for services (Makaila and Jylian at least for now), so we need to add an intake form for specific vendors."
**Implementation notes**:
- Add `intakeQuestions` JSON field on Vendor or Service model
- Render questions in booking flow after service selection
- Store responses on the Appointment record
- Start with free-text questions, expand to structured types later

### 📋 New Client Checkbox at Booking
**Source**: "New client consultation for Makaila — the person booking says they're new, checkbox at booking?"
**Implementation notes**:
- Add "I'm a new client" checkbox to booking flow
- When checked, flag on appointment so vendor knows to schedule consultation time
- Could auto-add buffer time or a consultation service

### 📋 Liability / Waiver Form
**Source**: "We need some type of liability form when booking. I guess I need to design this by looking at the Vagaro one."
**Implementation notes**:
- Design waiver content (legal review needed)
- Show waiver during booking, require acceptance before checkout
- Store acceptance timestamp + version on Appointment
- Could be a simple checkbox or a full scrollable document

### 📋 Calendar Invites in Emails
**Source**: "Can we send calendar invites with the emails when an appointment has been confirmed/booked? Can we send a calendar clear/cancel when appointment is cancelled? Can we send calendar update when moved?"
**Implementation notes**:
- Generate `.ics` (iCalendar) attachments in confirmation/cancellation/reschedule emails
- Use `METHOD:REQUEST` for new/updated, `METHOD:CANCEL` for cancellations
- Most email clients (Gmail, Outlook, Apple Mail) auto-detect and offer "Add to Calendar"
- Library: `ical-generator` npm package

### 📋 Kiosk Appointment Views
**Source**: "Kiosk appointments should have a few views: Calendar view, Customer Name, Vendor/Staff."
**Implementation notes**:
- Extend existing kiosk UI with view toggle
- Views: day calendar, list by customer, list by vendor/staff

### 📋 Group Service Filtering
**Source**: "We could/should come up with a way to say 'groups of 3+ here are your available services' and sort/filter"
**Implementation notes**:
- Add group size selector to services page
- Filter to services ≤30 min when group is 3+
- Related to bridal party booking rules above

### 📋 Split Pay for Spa Days
**Source**: "Did we cover the split pay for spa days?"
**Status**: Need to confirm if existing multi-party payment splitting covers this, or if this means splitting the bill between multiple customers in a group

---

## Future / Explore Later

### 🔮 No-Call-No-Show Tracking
**Source**: "No Call No Show repeat offenders should have to pay up-front non-refundable. This will require tracking the clients."
**Notes**: Requires customer profiles with booking history. Flag repeat no-shows, require prepayment.

### 🔮 Client Notes / CRM
**Source**: "We want to add a notes section for clients. We want to take this into more of a CRM as well. Customer Profiles with the information we get at booking and that the vendors can update, plus a section they can add notes that the others can view such as colors (hair) contraindications (massage & wellness)."
**Notes**: New Customer model with profile data, cross-vendor notes, booking history. Big feature — design first.

### 🔮 Membership Option
**Source**: "Might want to consider having a membership option. We should explore this more. Not now though."

### 🔮 Sound Room Rental
**Source**: "Can we rent out the sound room, like the sauna?"
**Notes**: Similar to sauna scheduling — separate resource with its own hours and booking rules.

### 🔮 Sound Bath Classes Page
**Source**: "Sound bath classes, should we have a classes page and calendar available? And then also the ability to add/remove/update the classes by the vendors."
**Notes**: New concept — classes vs. appointments. Needs class model with capacity, recurring schedule, registration. Vendor CRUD in dashboard.

---

## Open Questions
- [ ] Split pay for spa days — is this splitting the bill between group members, or the existing vendor payment splitting?
- [ ] Liability form — who drafts the content? Need legal review?
- [ ] Intake form questions — get specific questions from Makaila and Jylian
- [ ] Sound room rental — same pricing model as sauna? Same vendor?
- [ ] Advance booking minimum — 7 days for spa days, what about other bundles/events?
