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
**Status**: ✅ Implemented
**Context**: Current calendar (`app/dashboard/calendar/page.jsx`) uses a card-list layout. Appointments are stacked vertically without visual time positioning.
**Implementation**:
- Redesigned day/week views to use a vertical time-axis layout (planner style)
- Each row = 30-min increment, appointments render as blocks with height proportional to duration
- Empty gaps between blocks are visually obvious (white space = open slot)
- Default range: 6 AM – 6 PM, adjustable via dropdowns
- Week view: 7 day-columns with time blocks (default view)
- Day view: single column with time blocks
- Month view: card-list grid (compact overview)
- Click any appointment block to see full details in a modal
- Overlapping/double-booked appointments render side-by-side (50%/33% width each)
- Color coding: 🟢 Green = paid, 🔵 Blue = confirmed (unpaid), 🟠 Orange = pending, 🔴 Red = cancelled

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
**Status**: ✅ Implemented — time-block view inherently sorts by time position. Month view sorts appointments within each day cell.

### 📋 Month Navigation Button
**Source**: "Can we add a month button to skip through quickly? Some book all the way out."
**Status**: ✅ Implemented — Month view added as a third view toggle alongside Day/Week. Navigation arrows skip by month in month view.

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

## Completed

### ✅ Kiosk Tipping
**Source**: Identified as open question in kiosk checkout design
**Implementation**: Added tip selection screen (15%, 20%, 25%, custom, no tip) to kiosk checkout flow. Tips sent to Square via `tipMoney` field, tracked independently in Square reporting. Stored on appointment record.
**Files changed**: `app/kiosk/[appointmentId]/page.jsx`, `app/api/payment/route.js`, `docs/KIOSK_CHECKOUT.md`

### ✅ Time-Block Calendar View
**Source**: "I find myself switching to Vagaro to book because it puts my schedule in front of me in time blocks"
**Implementation**: Complete rewrite of dashboard calendar with planner-style time-block layout. Day/week views show 30-min grid with proportional appointment blocks. Month view uses card-list grid. Adjustable hour range (default 6AM–6PM). Date-range filtering added to dashboard API.
- Action buttons (Confirm, Edit, Cancel) in appointment detail modal — Edit opens inline form to change time, staff, service, vendor, status, and customer info without leaving the calendar
- Click empty time slots to create new appointments or block time directly from the calendar
- "+ New" button in top bar for quick appointment/block creation
- Overlapping appointments render side-by-side
- Month view shows all appointments with times (no cutoff)
**Files changed**: `app/dashboard/calendar/page.jsx`, `app/utils/calendar.js`, `app/api/dashboard/route.ts`

### ✅ Sort Appointments + Month Navigation
**Source**: "Sort/order the appointments" + "Can we add a month button to skip through quickly?"
**Implementation**: Time-block view inherently sorts by time position. Month view added as third toggle. Navigation arrows skip by day/week/month depending on active view.

---

## Open Questions
- [ ] Deposit amount — fixed dollar amount or percentage of service price?
- [ ] Predefined category list — who defines the initial list? Need the list from client.
- [ ] Rebook — should it auto-select the same time of day, or just jump to the date and let staff pick?
