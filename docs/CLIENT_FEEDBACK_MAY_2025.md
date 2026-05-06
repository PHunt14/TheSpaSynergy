# Client Feedback — May 2025

Feedback collected from client on May 6, 2025. Items triaged and sorted by priority.

## Status Key
- ✅ Done
- 🔧 In Progress
- 📋 Planned (pre-launch or near-term)
- 🔮 Future

---

## High Priority

### 📋 Time-Block Calendar View (Planner Style)
**Source**: "I find myself switching to Vagaro to book because it puts my schedule in front of me in time blocks so I can glance at the blocks while rebooking, versus just reading the dates"
**Priority**: Highest — client's #1 pain point this session
**Context**: Current calendar (`app/dashboard/calendar/page.jsx`) uses a card-list layout. Appointments are stacked vertically without visual time positioning.
**Implementation notes**:
- Redesign the day/week view to use a vertical time-axis layout (like Google Calendar / Vagaro)
- Each row = a time slot (e.g., 30-min increments from open to close)
- Appointments render as blocks whose height represents duration
- Empty gaps between blocks are visually obvious (white space = open slot)
- Staff can glance at open slots while rebooking a client
- This is the staff/dashboard view — not customer-facing booking flow

### 📋 Rebook Feature (Quick Forward Scheduling)
**Source**: "Can we add a rebook feature with maybe 4, 6, 8 week suggested times to skip ahead?"
**Context**: Staff want to rebook recurring clients quickly from any appointment view.
**Implementation notes**:
- Add a "Rebook" button on appointment cards (calendar view, appointments list, day view)
- Opens a quick-action modal/panel with suggested dates: +4 weeks, +6 weeks, +8 weeks from the original appointment
- Pre-fills same service, same vendor/staff, same client
- Jumps the calendar/date picker to the suggested date so staff can see available slots
- Should work alongside the new time-block view for fast visual slot selection

---

## Calendar & Appointments UX

### 📋 Sort Appointments Chronologically
**Source**: "Also we should sort/order the appointments"
**Implementation notes**:
- Ensure all appointment lists (dashboard, calendar day view, appointments page) sort by start time ascending
- Current `getAppointmentsForDate` already sorts — verify this is applied consistently across all views (appointments page, kiosk, etc.)

### 📋 Month Navigation Button
**Source**: "Can we add a month button to skip through quickly? Some book all the way out."
**Implementation notes**:
- Add a "Month" view toggle alongside existing Day/Week buttons
- Or: add forward/back month skip buttons (« ») in addition to the day/week arrows
- Allows staff to jump ahead quickly when rebooking clients weeks/months out

---

## Appointment Management

### 📋 Override Vendor/Staff on Existing Appointment
**Source**: "For an existing appointment can we please add an option to be able to override the vendor/staff member?"
**Context**: Dashboard admin action — reassign an already-booked appointment to a different staff member without canceling and rebooking.
**Implementation notes**:
- Add "Change Staff" action on appointment detail (dashboard)
- Dropdown of available staff for that service
- Updates the appointment record's `staffId`/`staffName`
- No conflict check required (see double-booking item below)
- Send notification to new staff member

### 📋 Allow Manual Double Bookings (Override Conflicts)
**Source**: "Want to be able to manually add in some double bookings, the override should handle this correct?"
**Implementation notes**:
- When staff override vendor/staff or manually book via dashboard, bypass the time-slot conflict check
- No confirmation warning needed — just allow it through
- This applies to admin/staff dashboard actions only, not customer-facing booking
- Existing manual booking flow (`/api/appointments/manual`) should skip overlap validation when triggered from dashboard

---

## Service Configuration

### 📋 Force Deposit or Full Payment Per Service
**Source**: "Want to force deposits or full payment on some services"
**Implementation notes**:
- Add per-service payment requirement setting in dashboard service config
- Options: "No payment required at booking" / "Require deposit" / "Require full payment"
- For deposits: add a `depositAmount` or `depositPercent` field (clarify with client which)
- Booking flow enforces payment step when service requires it
- Integrate with existing Square payment flow

### 📋 Predefined Service Category List (Dropdown)
**Source**: "Can we also restrict the categories to a predefined list and the vendors select from a dropdown when creating a new service?"
**Implementation notes**:
- Replace free-text category input with a dropdown/select on the service creation form
- Maintain a predefined list of categories (admin-managed or hardcoded to start)
- Vendors pick from the list when creating/editing a service
- Keeps services consistently categorized across all vendors
- Consider: admin setting to manage the category list, or start with a static list and iterate

---

---

## Completed

### ✅ Kiosk Tipping
**Source**: Identified as open question in kiosk checkout design
**Implementation**: Added tip selection screen (15%, 20%, 25%, custom, no tip) to kiosk checkout flow. Tips sent to Square via `tipMoney` field, tracked independently in Square reporting. Stored on appointment record.
**Files changed**: `app/kiosk/[appointmentId]/page.jsx`, `app/api/payment/route.js`, `docs/KIOSK_CHECKOUT.md`

---

## Open Questions
- [ ] Deposit amount — fixed dollar amount or percentage of service price?
- [ ] Predefined category list — who defines the initial list? Need the list from client.
- [ ] Time-block calendar — what are the business hours to display (earliest open to latest close)?
- [ ] Rebook — should it auto-select the same time of day, or just jump to the date and let staff pick?
- [ ] Month view — full month grid with appointment counts, or just a quick-jump date picker?
