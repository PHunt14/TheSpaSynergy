# Square Multi-Party Payment Implementation

## Overview

Automatic payment splitting for bundle bookings across multiple vendors using Square's OAuth and Payment APIs.

## How It Works

1. **Vendor connects** Square account via OAuth (Dashboard → Settings)
2. **Customer books** a bundle with services from multiple vendors
3. **Customer pays once** — single payment transaction
4. **Square splits funds** — automatically distributes to each vendor's Square account

## API Endpoints

### OAuth

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/square/connect` | POST | Generates OAuth authorization URL |
| `/api/square/oauth` | GET | OAuth callback — exchanges code for access token |
| `/api/square/disconnect` | POST | Revokes token and clears vendor credentials |

### Payment

#### `POST /api/payment`

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

## Vendor Model Fields

| Field | Description |
|-------|-------------|
| `squareAccessToken` | OAuth access token |
| `squareRefreshToken` | OAuth refresh token |
| `squareLocationId` | Vendor's Square location ID |
| `squareMerchantId` | Vendor's Square merchant ID |
| `squareTokenExpiresAt` | Token expiration timestamp |
| `squareConnectedAt` | Connection timestamp |

## Security

- OAuth scopes limited to: `MERCHANT_PROFILE_READ`, `PAYMENTS_WRITE`, `PAYMENTS_READ`
- Vendors can disconnect anytime, revoking access
- Token refresh should be implemented before expiration

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Vendor not connected to Square" | Vendor needs to connect in Dashboard → Settings |
| "No locations found for merchant" | Vendor needs to create a location in Square dashboard |
| OAuth callback fails | Verify `NEXT_PUBLIC_APP_URL` matches redirect URL in Square |

## Future Enhancements

- [ ] Automatic token refresh
- [ ] Platform commission deduction
- [ ] Payout scheduling
- [ ] Dispute handling workflow
