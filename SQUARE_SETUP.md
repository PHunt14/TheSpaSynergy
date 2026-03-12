# Square Integration Setup

## Overview

Vendors manually enter their Square credentials (Access Token + Location ID) in Dashboard → Settings to receive split payments from bundle bookings.

## For Vendors: How to Connect

### 1. Get Your Square Credentials

**Sandbox (Testing):**
1. Go to https://developer.squareup.com
2. Select your application
3. **Sandbox tab** → Copy **Sandbox Access Token**
4. **Sandbox Test Accounts** → Open → **Locations** → Copy **Location ID**

**Production (Live):**
1. Go to https://developer.squareup.com
2. Select your application
3. **Production tab** → Copy **Production Access Token**
4. Your Square account → **Locations** → Copy **Location ID**

### 2. Connect in Dashboard

1. Login to Dashboard → Settings
2. Select your vendor
3. Click **"Connect Square Account"**
4. Paste **Access Token** and **Location ID**
5. Click **"Save & Connect"**

Done! You'll now receive split payments automatically.

---

## Payment Flow

### Example: Bundle Booking

**Customer books:**
- Massage (Winsome) - $65
- Facial (Kera) - $65
- Total: $130

**Payment splits:**
- Kera (house fee from Winsome): $20
- Kera (facial service): $65
- Winsome (net after house fee): $45

**Result:**
- Kera receives: $85 in their Square account
- Winsome receives: $45 in their Square account

---

## House Fees

**The Kera Studio** is the house and receives fees from vendors who sublet space:
- Winsome Woods: Pays house fee
- Selene Glow Studio: Pays house fee
- The Kera Studio: No house fee (owns space)

House fees are configured per service and automatically deducted during payment processing.

---

## For Platform Admin

### Environment Variables

```bash
# Platform Square credentials (Kera's account)
SQUARE_ACCESS_TOKEN=YOUR_PLATFORM_ACCESS_TOKEN
NEXT_PUBLIC_SQUARE_LOCATION_ID=YOUR_PLATFORM_LOCATION_ID
NEXT_PUBLIC_SQUARE_ENVIRONMENT=sandbox  # or production
```

### Database Schema

**Vendor fields:**
- `squareAccessToken` - Vendor's Square access token
- `squareLocationId` - Vendor's Square location ID
- `squareConnectedAt` - Connection timestamp
- `isHouse` - True for Kera (the house)

**Service fields:**
- `houseFeeEnabled` - Enable house fee for this service
- `houseFeeAmount` - Dollar amount for house fee
- `houseFeePercent` - Percentage (future use)

---

## Testing

1. Create two Square developer accounts
2. Each vendor enters their own credentials
3. Book a bundle with services from multiple vendors
4. Verify payment splits in each Square dashboard

**Test Card:**
- Card: `4111 1111 1111 1111`
- CVV: `111`
- Exp: `12/25`
- Zip: `12345`

---

## Documentation

- **House Fees:** `/docs/HOUSE_FEE_IMPLEMENTATION.md`
- **Payment API:** `/docs/SQUARE_MULTI_PARTY_PAYMENTS.md`
