# Kiosk Checkout (Tablet Point-of-Sale)

## Overview

A tablet at the checkout counter allows customers who didn't pay online to pay for their appointment in person using the existing Square Web Payments SDK. No additional hardware required — just a tablet running the browser-based kiosk page.

The kiosk is **cross-vendor** — it shows all unpaid appointments across all vendors for the day. Payments are automatically routed to the correct vendor (and staff member) based on the appointment, including house fee splits.

## How It Works

1. **Staff signs in** once at the start of the day (Cognito auth, no inactivity timeout)
2. **Page shows** today's unpaid appointments across all vendors
3. **Staff taps** an appointment → service summary, vendor, and total are displayed
4. **Customer taps** "Pay" → Square payment form appears
5. **On success** → appointment is marked as paid, payment routed to the correct vendor/staff

## Authentication

The kiosk uses the same Cognito authentication as the vendor dashboard, but **without the 1-hour inactivity timeout**. Staff signs in once at the start of the day and the session stays active until they explicitly sign out.

- Login page: `/kiosk` (redirects to Cognito sign-in if not authenticated)
- No inactivity auto-logout
- Sign out button in the kiosk header bar
- Page is `noindex, nofollow` — not crawled by search engines

## Cross-Vendor Payment Routing

Each appointment carries its own `vendorId` and `staffId`. When a customer pays at the kiosk:

1. The kiosk sends the appointment's `vendorId` and `staffId` to `POST /api/payment`
2. The payment API resolves Square credentials: staff's Square account first, then vendor's
3. House fees are calculated and split automatically (same logic as online checkout)
4. Payment is deposited to the correct Square account

**No kiosk configuration needed** — it just works based on the appointment data.

```
Example: Kiosk shows 3 unpaid appointments

  Jane D. — 60min Massage (Winsome Woods)     $65
  John S. — Facial (The Kera Studio)           $65
  Mary K. — Lash Extensions (Selene Glow)      $85

Staff taps "Jane D." → payment goes to Winsome's Square account
  (with $20 house fee to Kera automatically)

Staff taps "John S." → payment goes to Kera's Square account
  (no house fee — Kera is the house vendor)
```

## Approach: Web-Based Kiosk

Uses the same Square Web Payments SDK already integrated for online booking checkout. All existing payment splitting and house fee logic is reused with zero duplication.

### Why web-based instead of Square Terminal hardware

| | Web Kiosk | Square Terminal |
|---|-----------|-----------------|
| **Cost** | Free (use any tablet) | ~$300+ per device |
| **Setup** | Deploy a new route | Terminal API integration |
| **Payment splitting** | Already built | Requires Terminal API rework |
| **House fees** | Already built | Requires Terminal API rework |
| **Card-present rates** | No (card-not-present rates) | Yes (lower fees) |
| **Offline support** | No | Yes |

**Recommendation**: Start with web kiosk. Migrate to Square Terminal later if card-present rates justify the hardware cost and integration effort.

## Reused Existing Code

| Component | Location | Reuse |
|-----------|----------|-------|
| Payment processing | `app/api/payment/route.js` | As-is |
| Payment splitting | `app/utils/payment.js` | As-is |
| House fee logic | `app/utils/payment.js` | As-is |
| Square Web Payments SDK | `lib/square/core.js` | As-is |
| Cognito authentication | `@aws-amplify/ui-react` | As-is (no timeout wrapper) |

## New Code

| Component | Description |
|-----------|-------------|
| `app/kiosk/layout.jsx` | Kiosk layout with Cognito auth, no inactivity timeout |
| `app/kiosk/page.jsx` | Today's unpaid appointments across all vendors |
| `app/kiosk/[appointmentId]/page.jsx` | Payment screen for a single appointment |
| `app/api/kiosk/appointments/route.ts` | API: today's unpaid appointments across all vendors |
| `app/api/appointments/route.ts` (PATCH) | Added PATCH handler to mark appointments as paid |

## Page Flow

```
┌─────────────────────┐     ┌──────────────────────────┐     ┌─────────────────────┐
│  Kiosk Home         │     │  Appointment Detail       │     │  Payment Complete    │
│  /kiosk             │     │  /kiosk/[id]              │     │                     │
│                     │     │                           │     │  ✓ Payment received │
│  Today's Unpaid:    │     │  Customer: Jane D.        │     │                     │
│                     │────▶│  Service: 60min Massage   │────▶│  Total: $65.00      │
│  Jane D.    $65     │     │  Vendor: Winsome Woods    │     │  Jane D.            │
│  Winsome Woods      │     │  With: Makaila            │     │  Winsome Woods      │
│                     │     │  Total: $65.00            │     │                     │
│  John S.    $65     │     │                           │     │  [Back to list]     │
│  The Kera Studio    │     │  [Pay Now]                │     │                     │
└─────────────────────┘     └──────────────────────────┘     └─────────────────────┘
```

## API

### `GET /api/kiosk/appointments`

Returns today's unpaid appointments across all active vendors.

**Optional params:**
- `appointmentId` — filter to a single appointment (used by the payment page)

**Response:**
```json
{
  "appointments": [
    {
      "appointmentId": "abc-123",
      "vendorId": "vendor-winsome",
      "vendorName": "Winsome Woods",
      "serviceId": "svc-massage-60",
      "staffId": "staff-makaila",
      "dateTime": "2025-01-15T10:00:00",
      "status": "pending",
      "customer": { "name": "Jane D." },
      "service": { "name": "60min Massage", "duration": 60, "price": 65 },
      "staffName": "Makaila"
    }
  ]
}
```

### `PATCH /api/appointments`

Updates appointment payment fields after successful kiosk payment.

```json
{
  "appointmentId": "abc-123",
  "paymentId": "sq-pay-xxx",
  "paymentStatus": "paid",
  "paymentAmount": 65.00,
  "status": "confirmed"
}
```

## Open Questions

| Question | Options | Impact |
|----------|---------|--------|
| **Tipping?** | Tip screen before payment (%, custom amount) | UI complexity, tip splitting logic |
| **Receipts** | Email, SMS, printed, or none | May need receipt email/text input at checkout |
| **Partial payments** | Can a customer pay for only some services in a bundle? | Payment splitting complexity |
| **Walk-ins** | Can staff create an appointment + pay in one flow? | Needs inline appointment creation |

## Future: Square Terminal Hardware

If card-present rates become important, the upgrade path is:

1. Add Square Terminal API integration (`CreateTerminalCheckout`)
2. Pair the physical terminal device to the vendor's Square account
3. Kiosk page sends checkout to the terminal instead of rendering the web payment form
4. Terminal handles card tap/insert/swipe
5. Webhook confirms payment → same post-payment flow

This is additive — the web kiosk page structure and appointment queries stay the same.

## Related Docs

- [Square Multi-Party Payments](./SQUARE_MULTI_PARTY_PAYMENTS.md) — payment API and splitting
- [House Fee Implementation](./HOUSE_FEE_IMPLEMENTATION.md) — house fee configuration and flow
- [Refund Strategy](./REFUND_STRATEGY.md) — refund handling for kiosk payments follows the same rules
