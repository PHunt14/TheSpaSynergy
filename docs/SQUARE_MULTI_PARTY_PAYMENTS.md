# Square Multi-Party Payment Implementation

## Overview

Automatic payment splitting for bundle bookings across multiple vendors using Square's Payment API with `additionalRecipients`.

## How It Works

1. **Staff connects** via OAuth in Dashboard → Settings → My Settings (tokens and location ID are stored on their StaffSchedule record)
2. **Customer books** a bundle with services from multiple vendors
3. **Customer pays once** — single payment transaction
4. **Square splits funds** — house vendor is the primary recipient, other vendors receive their portions via `additionalRecipients`

## Payment API

### `POST /api/payment`

**Single vendor:**
```json
{
  "sourceId": "cnon:card-nonce-ok",
  "amount": 65.00,
  "vendorId": "vendor-123"
}
```

**Multi-vendor bundle:**
```json
{
  "sourceId": "cnon:card-nonce-ok",
  "amount": 200.00,
  "bundlePayments": [
    { "vendorId": "vendor-a", "amount": 80.00 },
    { "vendorId": "vendor-b", "amount": 70.00 },
    { "vendorId": "vendor-c", "amount": 50.00 }
  ]
}
```

House fees are automatically calculated and consolidated. See `docs/HOUSE_FEE_IMPLEMENTATION.md` for details.

## Payment Flow

### Single Vendor
1. Look up assigned staff member's `squareAccessToken` and `squareLocationId`
2. Fail with error if staff hasn't connected Square
3. Create payment via Square Payments API

### Bundle (Multi-Vendor)
1. Identify house vendor (`isHouse: true`)
2. Consolidate payments by vendor (combine house fees + service amounts)
3. Validate all non-house vendors' assigned staff have `squareAccessToken` set
4. Create payment with house vendor as primary, others as `additionalRecipients`

## StaffSchedule Model Fields (Square)

| Field | Description |
|-------|-------------|
| `squareAccessToken` | Staff's Square Access Token |
| `squareLocationId` | Staff's Square Location ID |
| `squareMerchantId` | Staff's Square Merchant ID |
| `squareOAuthStatus` | Connection status (connected/disconnected/error) |
| `squareConnectedAt` | Connection timestamp |

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Vendor not connected to Square" | Assigned staff member needs to connect Square in Dashboard → Settings → My Settings |
| "Payment configuration error" | Staff hasn't connected Square — only in-person payment is available |
| "House vendor not configured" | Ensure one vendor has `isHouse: true` in the database |

## Future Enhancements

- [ ] Platform commission deduction
- [ ] Square Catalog integration for automatic pricing
