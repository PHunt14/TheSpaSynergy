# Kiosk Checkout (Tablet Point-of-Sale)

## Overview

A tablet at the checkout counter allows customers who didn't pay online to pay for their appointment in person using the existing Square Web Payments SDK. No additional hardware required — just a tablet running the browser-based kiosk page.

The kiosk is **cross-vendor** — it shows all unpaid appointments across all vendors for the day. Payments are automatically routed to the correct vendor (and staff member) based on the appointment, including house fee splits.

## How It Works

1. **Staff signs in** once at the start of the day (PIN-based auth, no inactivity timeout)
2. **Page shows** today's unpaid appointments across all vendors, grouped by customer
3. **Staff taps** an appointment → service summary, vendor, and total are displayed
4. **Customer taps** "Pay" → Square payment form appears
5. **On success** → appointment is marked as paid, payment routed to the correct vendor/staff

### Bundle & Multi-Service Support

- **Packages** — Appointments with a `bundleId` are grouped and displayed as a single "📦 Package" card. Tapping pays the full bundle with discount applied, split across vendors.
- **Multiple services, same customer** — When a customer has multiple unpaid appointments (not a bundle), each is shown individually with a "💳 Pay all at once" option below. Staff can either pay services individually or combine them into a single transaction.
- **Multi-vendor combined payments** — Both bundle and multi-service payments use Square's `additionalRecipients` to split funds across vendors in one charge.

## Authentication

The kiosk uses a **PIN-based authentication** system, completely separate from the Cognito-based vendor dashboard. This prevents kiosk users from accessing the dashboard.

- **PIN setup**: An admin sets the kiosk PIN in Dashboard → Settings → Building Settings tab → Kiosk PIN (4-8 digits)
- **Login**: Staff enters the PIN at `/kiosk` — no Cognito account needed
- **Session**: Stored as an httpOnly cookie scoped to `/kiosk`, valid for 24 hours
- **Sign out**: Button in the kiosk header bar, or session expires after 24 hours
- **PIN change**: Changing the PIN in dashboard settings invalidates all active kiosk sessions
- **Security**: No shared session with the vendor dashboard — navigating to `/dashboard` requires separate Cognito login
- **How it works**: On successful PIN entry, the server generates a random session token, stores it in SiteSettings, and sets it as an httpOnly cookie. The GET check compares the cookie against the stored token. Changing the PIN or re-authenticating generates a new token, invalidating previous sessions.

## Cross-Vendor Payment Routing

Each appointment carries its own `vendorId` and `staffId`. When a customer pays at the kiosk:

1. The kiosk sends the appointment's `vendorId` and `staffId` to `POST /api/payment`
2. The payment API resolves Square credentials from the assigned **staff member's** Square account
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
| `app/kiosk/layout.jsx` | Kiosk layout with PIN auth, no inactivity timeout |
| `app/kiosk/page.jsx` | Today's unpaid appointments, grouped by customer and bundle |
| `app/kiosk/[appointmentId]/page.jsx` | Payment screen for a single appointment |
| `app/kiosk/bundle/[bundleId]/page.jsx` | Payment screen for a package (bundle discount + multi-vendor split) |
| `app/kiosk/multi/page.jsx` | Payment screen for multiple appointments combined (same customer) |
| `app/kiosk/components/TipSelection.jsx` | Shared tip UI (15%/20%/25%/custom/none) |
| `app/kiosk/components/useSquarePayment.js` | Shared hook for Square SDK init + location resolver |
| `app/kiosk/components/KioskPaymentForm.jsx` | Shared card input, error, and pay button |
| `app/kiosk/components/PaymentSuccess.jsx` | Shared payment success screen |
| `app/api/kiosk/appointments/route.ts` | API: today's unpaid appointments across all vendors |
| `app/api/appointments/route.ts` (PATCH) | Added PATCH handler to mark appointments as paid |

## Page Flow

```
┌─────────────────────────┐
│  Kiosk Home             │
│  /kiosk                 │
│                         │
│  📦 Package: Jane D.   │──── tap ────▶ /kiosk/bundle/[bundleId]
│     Massage + Facial    │
│     $120                │
│                         │
│  Mary K. — Massage $65  │──── tap ────▶ /kiosk/[appointmentId]
│  Winsome Woods          │
│                         │
│  John S. — Facial $65   │──── tap ────▶ /kiosk/[appointmentId]
│  John S. — Haircut $45  │──── tap ────▶ /kiosk/[appointmentId]
│  💳 Pay all 2 for John  │──── tap ────▶ /kiosk/multi?ids=apt-1,apt-2
│     $110                │
└─────────────────────────┘

All payment pages share the same flow:
  Summary → Tip Selection → Card Input → Pay → ✓ Success
```

## API

### `GET /api/kiosk/appointments`

Returns today's unpaid appointments across all active vendors.

**Optional params:**
- `appointmentId` — filter to a single appointment (used by the payment page)
- `bundleId` — filter to all appointments in a bundle (used by bundle payment page)

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
      "bundleId": null,
      "dateTime": "2025-01-15T10:00:00",
      "status": "pending",
      "customer": { "name": "Jane D." },
      "service": { "name": "60min Massage", "duration": 60, "price": 65, "houseFeeEnabled": true, "houseFeeAmount": 20 },
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
| ~~**Tipping?**~~ | ~~Tip screen before payment (%, custom amount)~~ | ✅ Implemented — see Tipping section below |
| **Receipts** | Email, SMS, printed, or none | May need receipt email/text input at checkout |
| ~~**Partial payments**~~ | ~~Can a customer pay for only some services in a bundle?~~ | ✅ Resolved — customers can pay individual services or all at once |
| **Walk-ins** | Can staff create an appointment + pay in one flow? | Needs inline appointment creation |

---

## Tipping

Tipping is supported at the kiosk checkout. After viewing the appointment summary, customers see a tip selection screen before entering card details.

### How It Works

1. Customer taps an appointment from the kiosk list
2. Appointment summary is displayed (service, price, vendor, staff)
3. **Tip selection** — preset percentages (15%, 20%, 25%), custom dollar amount, or "No Tip"
4. Total updates to reflect service price + tip
5. Customer enters card and pays
6. Tip is sent to Square as a separate `tipMoney` field — tracked independently from the service amount

### Tip Handling in Square

- Tips are passed via the `tipMoney` field on `createPayment` (Square's recommended approach)
- Square tracks tips separately from the service amount in reporting
- Tips are attributed to the staff member whose Square account processes the payment
- Vendors can view tip totals in their Square Dashboard without any extra configuration
- For bundle/multi-vendor payments, the tip is included on the primary payment

### UI Details

- **Presets**: 15%, 20%, 25% — shown as buttons with calculated dollar amounts
- **Custom**: Opens a dollar amount input field
- **No Tip**: Explicitly selectable, no tip sent to Square
- **Total Due** display updates in real-time as tip selection changes
- **Success screen** shows total paid including tip breakdown

### Data Flow

```
Kiosk UI                    POST /api/payment              Square API
─────────                   ─────────────────              ──────────
tipAmount: 13.00    →       tipMoney: {                →   Payment recorded with
amount: 65.00               amount: 1300,                  amountMoney: $65.00
                            currency: 'USD'                tipMoney: $13.00
                           }                               totalMoney: $78.00
```

### Appointment Record

After payment, the appointment PATCH includes `tipAmount` so the tip is stored alongside the payment record for internal reporting.

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
