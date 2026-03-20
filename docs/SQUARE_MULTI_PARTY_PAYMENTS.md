# Square Multi-Party Payment Implementation

## Overview

Automatic payment splitting for bundle bookings across multiple vendors using Square's Payment API with `additionalRecipients`.

## How It Works

1. **Vendor connects** by entering their Square credentials in Dashboard → Settings (Application ID, Access Token, Location ID)
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
1. Look up vendor's `squareAccessToken` and `squareLocationId`
2. Fall back to platform credentials (`SQUARE_ACCESS_TOKEN`, `NEXT_PUBLIC_SQUARE_LOCATION_ID`) if vendor isn't connected
3. Create payment via Square Payments API

### Bundle (Multi-Vendor)
1. Identify house vendor (`isHouse: true`)
2. Consolidate payments by vendor (combine house fees + service amounts)
3. Validate all non-house vendors have `squareAccessToken` set
4. Create payment with house vendor as primary, others as `additionalRecipients`

## Vendor Model Fields

| Field | Description |
|-------|-------------|
| `squareApplicationId` | Vendor's Square Application ID |
| `squareAccessToken` | Vendor's Square Access Token |
| `squareLocationId` | Vendor's Square Location ID |
| `squareConnectedAt` | Connection timestamp |

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Vendor not connected to Square" | Vendor needs to enter credentials in Dashboard → Settings |
| "Payment configuration error" | No access token — check vendor or platform credentials |
| "House vendor not configured" | Ensure one vendor has `isHouse: true` in the database |

## Future Enhancements

- [ ] Platform commission deduction
- [ ] Square Catalog integration for automatic pricing
