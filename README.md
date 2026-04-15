# The Spa Synergy

Luxury spa and wellness booking platform serving Fort Ritchie, MD and surrounding areas.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Backend**: AWS Amplify Gen 2
- **Database**: DynamoDB
- **Authentication**: AWS Cognito
- **Payments**: Square (multi-party splits)
- **Notifications**: AWS SNS (SMS), AWS SES (email), Twilio (dev SMS)
- **Hosting**: AWS Amplify
- **Node**: v22.16.0

## Local Development

```bash
npm install
npm run dev
```

For sandbox backend:
```bash
npx ampx sandbox
```

## Database Seeding

```bash
node scripts/seed-amplify.js
```

## Deployment

Deployed via AWS Amplify with automatic CI/CD from Git. See `AMPLIFY_SETUP.md`.

## Service Areas

**Maryland**: Fort Ritchie, Hagerstown, Thurmont, Smithsburg, Sabillasville, Leitersburg, Frederick

**Pennsylvania**: Waynesboro, Blue Ridge Summit, Gettysburg, Chambersburg

---

## Acceptance Criteria

### Booking Flow

- Customers can browse vendors, view services, and book appointments through a multi-step flow
- Customers can select multiple services and book them together
- When a vendor's Square account is connected, customers can pay online at checkout
- Customers who don't pay online will pay in-person at the appointment
- On booking, both the customer and vendor receive:
  - An **email** notification with appointment details
  - An **SMS** notification (customer must opt in; vendor must enable in settings)
- Vendors can mark services as **"requires confirmation"** — the customer selects a preferred date/time, but the appointment stays pending until the vendor confirms. Both parties are notified on scheduling and again on confirmation
- **House fees**: The house vendor (building owner) can take a configurable fee from services performed by vendors who sublet space. This is automatically handled during payment splitting

### Vendor Dashboard

- Accessible only with Cognito credentials (1-hour inactivity timeout)
- **Role-based access**:
  - **Owner**: full access including Square payment integration
  - **Admin**: can manage all vendors and access Square integration
  - **Vendor**: can only see their own data
- A staff member for one vendor cannot see appointments or payment info for another vendor
- Vendors can:
  - View appointments and filter by day/week
  - View payment totals by week, month, or year
  - Add, edit, and deactivate services
  - Assign which staff members can perform each service (based on staff logged in for that vendor, excluding admins)
  - Cancel, reschedule, and confirm appointments
  - Add and manage staff members
  - Connect their Square account (Settings)
  - Enable/disable SMS alerts and set their alert phone number (Settings)
  - Add social media links (Facebook, Instagram, TikTok, website)
  - Update contact information

### Public Vendor Pages

- Each vendor has a profile page with description and staff member introductions (with photos)
- Contact information is displayed on vendor pages and the contact page
- Vendor pages link to that vendor's available services
- A services page lists all services across vendors; customers can multi-select to book several at once

---

## Documentation

| Doc | Description |
|-----|-------------|
| `AMPLIFY_SETUP.md` | AWS Amplify deployment and environment setup |
| `SQUARE_SETUP.md` | Square integration quick-start for vendors and admins |
| `docs/SQUARE_MULTI_PARTY_PAYMENTS.md` | Technical details: payment API, multi-vendor splits |
| `docs/HOUSE_FEE_IMPLEMENTATION.md` | House fee business model, payment flow examples, configuration |
| `docs/NOTIFICATIONS_SETUP.md` | SMS + email setup: providers, testing, production checklist |
| `docs/REFUND_STRATEGY.md` | Refund logic, house fee reversal, vendor ledger design, phased build plan |
| `docs/CHERRY_BLOSSOM_USAGE.md` | Cherry blossom decorative component usage guide |
| `docs/BOOKING_BLACKOUT_MANUAL_APPOINTMENTS.md` | Booking blackout system and manual appointment entry |
| `docs/PRODUCTION_CHECKLIST.md` | Step-by-step checklist for launching the `main` branch to production |
| `docs/SMS_PHONE_NUMBER.md` | Toll-free number registration, AWS verification form values, approval tips |

---

## Microservice Architecture (Planned)

The following bounded contexts are candidates for extraction from the Next.js monolith into standalone services. Listed in recommended order of extraction.

### 1. Payment Service (highest priority)

**Current code**: `app/api/payment/route.js`, `lib/square/core.js`, `app/api/square/*`, `app/api/webhooks/square/`

**Why extract**:
- Square credentials and token refresh logic are security-sensitive and shouldn't live in the frontend deployment
- Multi-party payment splitting is complex business logic that other apps could reuse
- Has a clean API boundary: `processPayment`, `connectOAuth`, `refreshToken`, `handleWebhook`

**Suggested deployment**: API Gateway + Lambda or standalone Amplify function

### 2. Notification Service

**Current code**: `lib/sms.ts`, `lib/email.ts`, `amplify/functions/send-email/`, `amplify/functions/send-sms/`, inline notification logic in `app/api/appointments/route.ts`

**Why extract**:
- The appointment POST route currently has ~80 lines of notification logic inlined (staff resolution, message building, multi-channel delivery)
- An event-driven service would accept events (`booking.created`, `booking.confirmed`, `booking.cancelled`) and handle all recipient resolution + delivery
- Enables appointment reminders without touching booking code
- Decouples delivery provider choices (SNS vs Twilio) from business logic

**Suggested deployment**: SQS queue → Lambda consumer. Booking endpoint publishes an event and returns immediately instead of awaiting all notifications

### 3. Availability/Scheduling Service

**Current code**: `app/api/availability/route.ts`, `app/api/staff-schedules/route.ts`

**Why extract**:
- Most computationally complex route — N+1 queries per request, staff schedule resolution with recurrence patterns, time slot generation
- Read-heavy workload that can scale independently from writes
- Availability results are cacheable
- Duplicated `resolveStaff` logic would be consolidated

**Suggested deployment**: Lambda behind API Gateway with caching (API Gateway cache or ElastiCache)

### 4. Vendor/Service Catalog (lowest urgency)

**Current code**: `app/api/vendors/route.ts`, `app/api/services/route.ts`

**Why extract**:
- Mostly CRUD with auth checks — fine as Next.js API routes for now
- Becomes valuable if a mobile app or the booking flow redesign requires a standalone catalog API

### Target Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Next.js UI  │────▶│  Payment Service  │────▶│  Square API     │
│  (Amplify)   │     │  (Lambda/ECS)     │     └─────────────────┘
│              │     └──────────────────┘
│              │     ┌──────────────────┐     ┌─────────────────┐
│              │────▶│ Notification Svc  │────▶│  SNS/SES/Twilio │
│              │     │  (Lambda + SQS)   │     └─────────────────┘
│              │     └──────────────────┘
│              │     ┌──────────────────┐     ┌─────────────────┐
│              │────▶│ Availability Svc  │────▶│  DynamoDB       │
│              │     │  (Lambda)         │     └─────────────────┘
└─────────────┘     └──────────────────┘
```

---

## Known Issues

- [ ] **Square sandbox OAuth is broken** — Square's sandbox login page (`connect.squareupsandbox.com`) renders a blank screen for unauthenticated users. The OAuth flow works correctly with production credentials. To test OAuth without real payments, use production Square credentials and process $0 services or refund small test payments. See `SQUARE_SETUP.md` for details
- [ ] Relaxation, Beauty, and Wellness category blocks should link to filtered service lists
- [ ] Recurring services not yet supported (e.g., sauna as a recurring first service)
- [ ] "Rebook" should suggest dates 4+ weeks out after checkout
- [ ] Dashboard defaults to "week of" view but should also surface "today" prominently
- [ ] Need to remove inactive/old vendors from public pages
- [ ] Some services are offered by multiple vendors — need shared service support
- [ ] Update Kera's service list
- [ ] Vagaro calendar sync — currently handled via booking blackout + manual entry (see `docs/BOOKING_BLACKOUT_MANUAL_APPOINTMENTS.md`)

## Future Enhancements

- [ ] **Booking flow redesign**: book → pick day/week → select services (instead of vendor-first)
- [ ] **Multi-service week requests**: select multiple services and request availability for a given week
- [ ] **Square Catalog sync**: link services to Square catalog items for automatic pricing/reporting
- [ ] **Appointment export**: vendors can text themselves a link to the day's appointments
- [ ] **Appointment reminders**: SMS/email reminders before appointments
- [ ] **Calendar sync**: Google/Apple calendar integration
- [ ] **Auto rent payment**: automated rent collection from subletting vendors
- [ ] **Square Integration service**: aplit as a backend microservice that can be duplicated and/or used separately

