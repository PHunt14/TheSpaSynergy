# Testing Guide

## Overview

The project uses three testing layers:

| Layer | Tool | Runs With | What It Tests |
|-------|------|-----------|---------------|
| **Unit** | Jest (Node) | `npm test` or `npm run test:unit` | Pure functions, business logic, API route handlers |
| **Component** | Jest + React Testing Library (jsdom) | `npm test` or `npm run test:components` | React component rendering, user interactions, conditional display |
| **E2E** | Playwright | `npm run test:e2e` | Full browser flows against running app |

## Quick Start

```bash
# Run all Jest tests (unit + component)
npm test

# Run only unit tests
npm run test:unit

# Run only component tests
npm run test:components

# Run with coverage report
npm run test:coverage

# Run E2E tests (requires dev server or auto-starts one)
npm run test:e2e

# Run E2E tests with visible browser
npm run test:e2e:headed
```

## What's Implemented

### Unit Tests (`__tests__/`)

| File | Tests | What's Covered |
|------|-------|----------------|
| `square/oauth-payment.test.mjs` | 37 | OAuth URL generation, state encoding/decoding, webhook signature verification, webhook event processing + idempotency, vendor token builders (legacy), staff token builders, disconnect builders, payment validation (staff-level only), token expiry detection, payment route integration (POST /api/payment with staff-level Square auth) |
| `utils/payment.test.mjs` | 23 | `calculatePaymentSplits` — single/multi vendor, house fees, aggregation, edge cases; `calculateVendorNet` — fee subtraction; `formatPaymentSplits` — display formatting |
| `utils/availability.test.mjs` | 39 | `getRecurrenceHours` — every-other-week (with/without anchor), 2nd-of-month, standard fallback; `resolveStaffSync` — auto-assign rules, schedule-based resolution, allowedStaff filtering, recurrence in schedules; `getDayHoursSync` — sauna hours, staff schedule priority, vendor fallback; `hasAnySlot` — open/fully-booked detection, staff filtering, window-too-small; `timeOverlaps` — overlap with buffer, adjacent, identical, zero-buffer; `generateTimeSlots` — slot generation, booked exclusion, dateTime formats; `formatTime` — 12-hour display; `DAY_NAMES` constant |

### Component Tests (`__tests__/components/`)

| File | Tests | What's Covered |
|------|-------|----------------|
| `Footer.test.jsx` | 4 | Business name, address, navigation links (Practitioners, Packages, Book Now, Contact, Dashboard), copyright year |
| `BookingDisabled.test.jsx` | 7 | Default vs vendor-specific messaging, phone link rendering, resume date display, back-to-home link |

### E2E Tests (`e2e/`)

| File | Tests | What's Covered |
|------|-------|----------------|
| `smoke.spec.ts` | 6 | Homepage load + title + CTA, booking page loads, vendors page loads, contact page loads, navbar links, footer content |

**Current totals: 110 Jest tests passing, 6 E2E tests ready**

## Architecture

### Jest Config (`jest.config.mjs`)

Uses Jest `projects` to run two environments from a single config:

- **`unit`** — `testEnvironment: 'node'`, matches `**/__tests__/**/*.test.mjs`. Used for pure logic and API route tests that need Node APIs (crypto, fetch, etc.)
- **`components`** — `testEnvironment: 'jest-environment-jsdom'`, matches `**/__tests__/components/**/*.test.(jsx|tsx)`. Uses ts-jest to transform JSX/TSX. Supports `@/` path alias.

### Playwright Config (`playwright.config.ts`)

- Runs against `http://localhost:3000`
- Auto-starts `npm run dev` if no server is running
- Tests in `e2e/` directory
- Chromium only (add Firefox/WebKit in config if needed)

### File Naming Conventions

- Unit/API tests: `__tests__/<domain>/<name>.test.mjs`
- Component tests: `__tests__/components/<ComponentName>.test.jsx` (or `.tsx`)
- E2E tests: `e2e/<feature>.spec.ts`

## Playwright Setup

Playwright browsers need to be installed once:

```bash
npx playwright install chromium
```

If the download fails (network issues), retry or use `npx playwright install --with-deps chromium`.

## Where to Go Next

Prioritized by business value and complexity. Each section includes the file to test and what to cover.

### 1. Availability / Time Slot Logic ✅ DONE

Pure functions have been extracted to `app/utils/availability.js` and are shared by both `app/api/availability/route.ts` and `app/api/available-dates/route.ts`. Covered in `__tests__/utils/availability.test.mjs` (39 tests).

**What's tested:**
- `getRecurrenceHours` — every-other-week (with/without anchor), 2nd-of-month, standard
- `resolveStaffSync` — auto-assign rules, schedule fallback, allowedStaff filtering, recurrence
- `getDayHoursSync` — sauna hours, staff schedule priority, vendor working hours fallback
- `hasAnySlot` — open/booked detection, staff filtering, window size edge cases
- `timeOverlaps` — overlap with buffer, adjacent slots, zero buffer
- `generateTimeSlots` — full slot generation, booked exclusion, dateTime format variants
- `formatTime` — 12-hour AM/PM display

**Remaining test opportunities:**
- Today's date filtering (past slots excluded) — requires mocking `Date.now()`
- Edge cases: midnight crossover, 0-duration, end time before start time

### 2. Appointment Route Integration Tests (HIGH VALUE)

Test `app/api/appointments/route.ts` POST and PATCH handlers using the same mock pattern as the existing payment route test:

**POST /api/appointments:**
- Missing required fields → 400
- Global booking blackout active → 403
- Vendor-level booking blackout active → 403
- Successful creation → returns appointmentId
- Notification dispatch (mock sendSms, sendEmail, verify they're called with correct args)

**PATCH /api/appointments:**
- Missing appointmentId → 400
- Successful update with partial fields
- DynamoDB error handling → 500

### 3. SMS / Email Unit Tests (MEDIUM VALUE)

**`lib/sms.ts`:**
- `formatPhone` — test with/without country code, with special characters
- `sendSms` — mock SNS/Twilio/console, verify provider routing based on `SMS_PROVIDER` env
- Test override behavior (`SMS_TEST_PHONE` prepends original recipient)

**`lib/email.ts`:**
- `sendEmail` — mock SES/Lambda/console, verify provider routing
- `sendCustomerBookingEmail` — verify HTML contains service name, date, price, "with" line
- `sendVendorBookingEmail` — verify HTML contains customer info
- Test override behavior (`EMAIL_TEST_ADDRESS`)

### 4. More Component Tests (MEDIUM VALUE)

**Priority components to test next:**

| Component | What to Test |
|-----------|-------------|
| `Navbar.jsx` | Renders logo, links, vendor dropdown on hover (mock fetch for vendors) |
| `Tooltip.jsx` | Shows/hides on interaction |
| `Sidebar.jsx` | Navigation links, active state |
| `Topbar.jsx` | User info display |

**Booking flow pages** (higher effort, high value):

| Page | What to Test |
|------|-------------|
| `booking/page.jsx` | Vendor cards render after fetch, click navigates to service page |
| `booking/service/page.jsx` | Services load for selected vendor, multi-select works |
| `booking/time/page.jsx` | Time slots render, selection works |
| `booking/confirm/page.jsx` | Summary displays correctly, form validation |

These require mocking `next/navigation` (useRouter, useSearchParams) and fetch calls.

### 5. Dashboard Component Tests (MEDIUM VALUE)

Dashboard components need Cognito auth mocking. Pattern:

```javascript
jest.mock('aws-amplify', () => ({
  Amplify: { configure: jest.fn() },
}))
jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn(() => Promise.resolve({ tokens: { idToken: { payload: { 'custom:role': 'vendor' } } } })),
}))
```

### 6. E2E Tests (EXPAND)

**Next E2E tests to add:**

| Test | File | What It Covers |
|------|------|----------------|
| Booking happy path | `e2e/booking.spec.ts` | Select vendor → select service → pick time → fill form → confirm |
| Vendor page | `e2e/vendor-page.spec.ts` | Vendor profile loads, services link works |
| Services page | `e2e/services.spec.ts` | All services display, multi-select, proceed to booking |
| Dashboard login | `e2e/dashboard.spec.ts` | Login form renders, invalid credentials show error |
| Mobile responsive | `e2e/mobile.spec.ts` | Key pages render correctly at mobile viewport |

**Playwright tip**: Use `page.route()` to intercept API calls and return mock data for deterministic E2E tests without a running backend.

### 7. API Route Tests for Remaining Endpoints

| Route | Priority | Notes |
|-------|----------|-------|
| `api/available-dates/route.ts` | Medium | Month-level date availability (uses shared `availability.js` utils — pure logic already tested, route-level integration not yet) |
| `api/services/route.ts` | Medium | CRUD + auth checks |
| `api/vendors/route.ts` | Medium | Role-based filtering |
| `api/staff/route.ts` | Medium | Staff CRUD |
| `api/staff-schedules/route.ts` | Medium | Schedule management |
| `api/booking-blackout/route.ts` | Low | Simple toggle |
| `api/dashboard/route.ts` | Low | Aggregation query |
| `api/square/connect/route.ts` | Low | OAuth initiation |
| `api/webhooks/square/route.ts` | Medium | Webhook processing (partially covered by existing tests) |

## CI Integration

Add to `.github/workflows/` or `amplify.yml`:

```yaml
# GitHub Actions example
- name: Run tests
  run: npm test

# Amplify build spec (amplify.yml)
test:
  phases:
    preTest:
      commands:
        - npm ci
    test:
      commands:
        - npm test
```

## Dependencies Added

| Package | Purpose |
|---------|---------|
| `@testing-library/react` | Component rendering + queries |
| `@testing-library/jest-dom` | DOM assertion matchers (toBeInTheDocument, etc.) |
| `@testing-library/user-event` | Simulating user interactions (click, type, hover) |
| `jest-environment-jsdom` | Browser-like environment for component tests |
| `@playwright/test` | E2E browser automation |

All added as devDependencies.
