# Refund Strategy

## Current State

- Cancel route (`app/api/appointments/cancel/route.ts`) sets status to `cancelled` and sends notifications
- **No Square refund is triggered**
- No consideration for reversing house fee splits
- No vendor ledger or balance tracking

---

## How Square Payment Splits Work

When a payment is processed with `additionalRecipients`, Square does not move money in real-time. The primary recipient (house vendor / Kera) receives the full charge, and Square's ledger records obligations to additional recipients. At settlement (next business day), Square deposits each party's share to their respective bank accounts.

```
Customer pays $65 for Winsome massage
  → $65 lands in Kera's Square account (primary)
  → Square records $45 obligation to Winsome
  → Settlement: Kera bank gets $20, Winsome bank gets $45
```

---

## Refund Scenarios

### 1. Full Refund (single service or full bundle)

Square handles everything. One API call using the primary recipient's (Kera) credentials:

```
RefundPayment(paymentId, $65)
  → Square debits $20 from Kera's balance
  → Square debits $45 from Winsome's balance
  → Customer receives $65
```

If funds already settled to bank accounts, Square pulls from each party's next-day balance. No manual coordination needed.

### 2. Partial Refund (one service in a bundle)

Example bundle:
```
Winsome massage: $65 → Kera $20 (fee) + Winsome $45
Kera facial:     $65 → Kera $65
Total:          $130
```

Customer cancels only the massage. `RefundPayment` with a partial amount **only debits the primary recipient**:

```
RefundPayment($65 of $130)
  → Square debits $65 from Kera
  → Winsome keeps $45
  → Customer gets $65 back
  → Kera is out $45 that Winsome received
```

**Resolution: internal vendor ledger with future split adjustment.**

1. Refund $65 to customer (from Kera)
2. Record in DB: Winsome owes Kera $45
3. On Winsome's next payment, reduce their `additionalRecipients` amount by $45

```
Next Winsome booking: $70 → normally Kera $20, Winsome $50
Adjusted for debt:          Kera $65, Winsome $5
```

### 3. No-show / Late Cancellation

Business decision — partial refund where house keeps a cancellation fee:

```
$65 massage cancelled late
  → Refund $45 to customer
  → Kera keeps $20 house fee as cancellation fee
  → Winsome gets nothing (no service performed)
```

This is a partial refund from the primary recipient only. No ledger adjustment needed since Winsome's $45 was never earned.

### 4. Service with no house fee (Kera's own services)

Straightforward — full or partial refund debits only Kera. No split to reverse.

---

## Alternatives Considered

| Approach | Pros | Cons |
|----------|------|------|
| **Ledger + future split adjustment** (recommended) | No extra charges, automatic settlement | Requires ledger tracking, delay in settlement |
| Full refund + re-charge remaining | Clean split on new charge | Bad UX (two transactions), needs card on file |
| Charge vendor's Square account | Immediate settlement | Not possible — Square only charges customers |
| Manual Venmo/Zelle between vendors | No code needed | Unscalable, error-prone, no audit trail |

---

## Data Model

### PaymentRecord (extend existing Appointment or new table)

```
PaymentRecord
  ├── paymentId          (Square payment ID)
  ├── appointmentId
  ├── bundleId           (if bundle payment)
  ├── vendorId           (primary recipient)
  ├── totalAmount
  ├── splits[]
  │     ├── vendorId
  │     ├── amount
  │     ├── type          ("service" | "houseFee")
  │     └── serviceId
  ├── refunds[]
  │     ├── refundId      (Square refund ID)
  │     ├── amount
  │     ├── reason
  │     ├── createdAt
  │     └── splitAdjustments[]
  │           ├── vendorId
  │           ├── amount        (how much this vendor should have returned)
  │           └── settled       (true when recouped via future split)
  └── status              ("completed" | "partially_refunded" | "refunded")
```

### VendorLedger (new table)

```
VendorLedger
  ├── vendorId
  ├── tenantId            (for multi-tenant payment service)
  ├── balance             (positive = owed to vendor, negative = vendor owes house)
  └── entries[]
        ├── entryId
        ├── type           ("refund_debt" | "split_adjustment" | "manual")
        ├── amount
        ├── reason         ("Partial refund for appointment X")
        ├── relatedPaymentId
        ├── settledInPaymentId   (null until recouped)
        └── createdAt
```

---

## Implementation Plan

### Phase 1: Full Refunds Only

**Scope**: Cancel + refund for single services and full bundles. No partial refunds, no ledger.

**Files to modify**:
- `app/api/appointments/cancel/route.ts` — add refund logic after status update
- `lib/square/core.js` — add `refundPayment` helper
- `amplify/data/resource.ts` — add `refundId`, `refundStatus`, `refundAmount` fields to Appointment model

**Steps**:

1. Add refund fields to the Appointment model:
   - `refundId` (string, nullable) — Square refund ID
   - `refundStatus` (string, nullable) — "pending" | "completed" | "failed"
   - `refundAmount` (float, nullable)

2. Add `refundPayment` to `lib/square/core.js`:
   - Accept `paymentId`, `amount`, `reason`
   - Resolve Square credentials for the primary vendor (same logic as `resolveSquareCredentials` in payment route)
   - Call Square `RefundsApi.refundPayment`
   - Return refund ID and status

3. Update cancel route:
   - After setting status to `cancelled`, check if `appointment.paymentId` exists
   - If paid, call `refundPayment` with the full payment amount
   - Store `refundId` and `refundStatus` on the appointment
   - Include refund status in cancellation notifications ("Your refund of $XX is being processed")
   - If refund fails, still cancel the appointment but flag `refundStatus: 'failed'` for manual resolution

4. Add refund status display to dashboard appointments view

**Edge cases**:
- Payment exists but Square credentials are now disconnected → cancel appointment, flag for manual refund
- Payment was never completed (in-person payment) → cancel only, no refund needed
- Bundle cancellation → refund the single bundle payment, cancel all appointments

### Phase 2: Vendor Ledger + Partial Refunds

**Scope**: Partial bundle refunds with automatic future split adjustment. Requires the VendorLedger table.

**Depends on**: Phase 1 complete, payment service extraction (recommended but not required)

**Steps**:

1. Create VendorLedger DynamoDB table (or add to Amplify schema)

2. Add `calculateRefundSplits` utility:
   - Given a payment's original splits and the refund amount, determine how much each vendor should absorb
   - For full refund: proportional to original splits (Square handles this)
   - For partial refund: identify which service(s) are being cancelled, calculate the house fee and vendor portions

3. Update cancel route to support partial bundle cancellation:
   - Accept optional `serviceIds` array (which services in the bundle to cancel)
   - Calculate refund amount from those services' prices
   - Call Square `RefundPayment` for that amount (debits primary recipient)
   - Calculate the difference: what the additional recipient(s) received but shouldn't have
   - Write ledger entry: "vendorId owes houseVendorId $X due to partial refund on paymentId Y"

4. Update payment route (`app/api/payment/route.js`) to check ledger before processing:
   - Before calculating `additionalRecipients`, query VendorLedger for unsettled debts
   - Reduce the vendor's split by the outstanding debt amount
   - After successful payment, mark ledger entries as settled with the new paymentId
   - If debt exceeds the vendor's split in the new payment, carry the remainder

5. Add ledger visibility to dashboard:
   - Vendor settings or payments page shows outstanding balance adjustments
   - Admin view shows all vendor balances

**Edge cases**:
- Vendor's next payment split is smaller than their debt → carry remaining balance to the following payment
- Vendor has no future bookings → flag for manual settlement, surface in admin dashboard
- Multiple partial refunds accumulate → ledger entries stack, all applied to next payment
- Vendor disconnects Square while they have a debt → flag in admin dashboard

### Phase 3: Payment Service Extraction

**Scope**: Move all of the above into a standalone microservice. See `README.md` Microservice Architecture section.

At this point the service owns:
- Payment processing (single + bundle + house fee splits)
- Refund processing (full + partial)
- Vendor ledger and balance tracking
- Square OAuth and credential management
- Square Catalog sync (two-way)
- Transaction history and reporting
- Webhook handling

The Next.js app becomes a thin client that calls the service API.

---

## Square API Reference

### Refund a payment
```
POST /v2/refunds
{
  "idempotency_key": "unique-key",
  "payment_id": "original-payment-id",
  "amount_money": { "amount": 6500, "currency": "USD" },
  "reason": "Appointment cancelled"
}
```

- Full refund: `amount_money` equals original payment amount → Square reverses all splits
- Partial refund: `amount_money` less than original → Square debits only the primary recipient
- Refunds can take 2–7 business days to appear on customer's statement
- Square sends `refund.updated` webhook when refund status changes

### Relevant Square SDKs
```js
import { Client } from 'square'
const { refundsApi } = new Client({ accessToken, environment })

// Create refund
const { result } = await refundsApi.refundPayment({
  idempotencyKey: randomUUID(),
  paymentId: 'original-payment-id',
  amountMoney: { amount: 6500n, currency: 'USD' },
  reason: 'Appointment cancelled'
})

// Get refund status
const { result } = await refundsApi.getPaymentRefund(refundId)
```

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Full refunds first, partial later | Covers 90% of cases, no ledger complexity |
| Ledger-based settlement over re-charging | No extra customer charges, automatic resolution |
| Primary recipient absorbs partial refund | Square limitation — partial refunds only debit primary |
| Carry debt across payments | Handles cases where debt exceeds single payment split |
| Flag manual resolution for edge cases | Better than blocking cancellations on payment failures |
