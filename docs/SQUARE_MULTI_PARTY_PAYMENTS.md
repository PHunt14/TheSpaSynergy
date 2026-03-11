# Square Multi-Party Payment Implementation

## Overview

This implementation enables automatic payment splitting for bundle bookings across multiple vendors using Square's OAuth and Payment APIs.

## How It Works

### 1. Vendor Square Connection
- Vendors connect their Square accounts via OAuth in Dashboard → Settings
- System stores vendor's Square access token, refresh token, location ID, and merchant ID
- Connection is secure and follows Square's OAuth 2.0 flow

### 2. Bundle Payment Flow
When a customer books a bundle with services from multiple vendors:

1. **Customer pays once** - Single payment transaction
2. **Square splits funds** - Automatically distributes to each vendor's Square account
3. **Vendors receive payments** - Direct deposit to their Square accounts
4. **Appointments created** - Separate appointment records for each vendor

### 3. Payment Split Calculation
```javascript
// Example: Bundle with 3 vendors
Customer pays: $200 total

Split:
- Vendor A (Massage $80) → Receives $80 - Square fees
- Vendor B (Facial $70) → Receives $70 - Square fees  
- Vendor C (Manicure $50) → Receives $50 - Square fees
```

## API Endpoints

### Square OAuth

#### `POST /api/square/connect`
Generates Square OAuth authorization URL for vendor connection.

**Request:**
```json
{
  "vendorId": "vendor-123"
}
```

**Response:**
```json
{
  "authUrl": "https://connect.squareupsandbox.com/oauth2/authorize?..."
}
```

#### `GET /api/square/oauth`
OAuth callback endpoint that exchanges authorization code for access token.

**Query Parameters:**
- `code` - Authorization code from Square
- `state` - Vendor ID
- `error` - Error message if authorization failed

#### `POST /api/square/disconnect`
Revokes Square access token and clears vendor credentials.

**Request:**
```json
{
  "vendorId": "vendor-123"
}
```

### Payment Processing

#### `POST /api/payment`
Processes single or multi-vendor payments.

**Single Vendor Payment:**
```json
{
  "sourceId": "cnon:card-nonce-ok",
  "amount": 65.00,
  "vendorId": "vendor-123"
}
```

**Bundle Payment (Multi-Vendor):**
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

**Response:**
```json
{
  "success": true,
  "paymentId": "sq-payment-123",
  "status": "COMPLETED",
  "splitPayments": [
    { "vendorId": "vendor-a", "amount": 80.00 },
    { "vendorId": "vendor-b", "amount": 70.00 },
    { "vendorId": "vendor-c", "amount": 50.00 }
  ]
}
```

## Database Schema Updates

### Vendor Model
Added Square OAuth fields:
- `squareAccessToken` - OAuth access token
- `squareRefreshToken` - OAuth refresh token
- `squareLocationId` - Vendor's Square location ID
- `squareMerchantId` - Vendor's Square merchant ID
- `squareTokenExpiresAt` - Token expiration timestamp
- `squareConnectedAt` - Connection timestamp

### Bundle Model
Added:
- `vendorIds` - Array of vendor IDs in the bundle

### Appointment Model
Added:
- `bundleId` - Reference to bundle if part of bundle booking
- `paymentAmount` - Amount paid for this specific appointment

## Environment Variables

Required in `.env.local`:

```bash
# Square OAuth
SQUARE_APPLICATION_ID=sandbox-sq0idb-...
SQUARE_APPLICATION_SECRET=sandbox-sq0csb-...
SQUARE_ACCESS_TOKEN=EAAA... # Platform access token

# Square Environment
NEXT_PUBLIC_SQUARE_ENVIRONMENT=sandbox # or production
NEXT_PUBLIC_SQUARE_LOCATION_ID=... # Platform location ID

# App URL for OAuth callback
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Setup Instructions

### 1. Square Developer Account
1. Create Square Developer account at https://developer.squareup.com
2. Create a new application
3. Note your Application ID and Application Secret
4. Set OAuth Redirect URL: `http://localhost:3000/api/square/oauth`

### 2. Configure Environment Variables
Copy `.env.local.example` to `.env.local` and fill in:
- `SQUARE_APPLICATION_ID`
- `SQUARE_APPLICATION_SECRET`
- `SQUARE_ACCESS_TOKEN` (your platform's access token)

### 3. Deploy Schema Changes
```bash
npx ampx sandbox
```

### 4. Vendor Connection
1. Vendors log into Dashboard → Settings
2. Click "Connect Square Account"
3. Authorize The Spa Synergy to access their Square account
4. System stores credentials securely

## Security Considerations

1. **Token Storage** - Access tokens stored encrypted in DynamoDB
2. **OAuth Scopes** - Limited to: `MERCHANT_PROFILE_READ`, `PAYMENTS_WRITE`, `PAYMENTS_READ`
3. **Token Refresh** - Implement token refresh logic before expiration
4. **Revocation** - Vendors can disconnect anytime, revoking access

## Testing

### Sandbox Mode
Use Square's sandbox environment for testing:
- Test card: `4111 1111 1111 1111`
- CVV: Any 3 digits
- Expiration: Any future date
- Postal: Any 5 digits

### Test Flow
1. Create test vendors in sandbox
2. Connect each vendor's Square sandbox account
3. Create a bundle with services from multiple vendors
4. Book the bundle and complete payment
5. Verify split payments in each vendor's Square dashboard

## Production Deployment

1. Switch `NEXT_PUBLIC_SQUARE_ENVIRONMENT` to `production`
2. Update OAuth redirect URL in Square dashboard to production URL
3. Use production Square credentials
4. Test with real Square accounts before going live

## Troubleshooting

### "Vendor not connected to Square"
- Vendor needs to connect their Square account in Settings
- Check if `squareAccessToken` exists for vendor

### "No locations found for merchant"
- Vendor's Square account has no locations set up
- Vendor needs to create a location in Square dashboard

### OAuth callback fails
- Verify `NEXT_PUBLIC_APP_URL` matches OAuth redirect URL in Square
- Check `SQUARE_APPLICATION_SECRET` is correct

## Future Enhancements

1. **Token Refresh** - Automatic refresh of expired tokens
2. **Platform Commission** - Deduct platform fee from split payments
3. **Payout Scheduling** - Control when vendors receive funds
4. **Dispute Handling** - Automated dispute resolution workflow
5. **Multi-Currency** - Support for international payments
