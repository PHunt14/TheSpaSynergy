# Square Integration Setup

## For Vendors: Connecting Your Square Account

1. Log in to the Vendor Dashboard → Settings
2. Click **"Connect Square Account"**
3. Enter your **Application ID**, **Access Token**, and **Location ID**
4. Click **"Save & Connect"**

### Where to Find Your Credentials

**Sandbox (Testing):**
1. Go to https://developer.squareup.com
2. Select your application
3. **Sandbox tab** → Copy **Sandbox Access Token**
4. **Sandbox Test Accounts** → Open → **Locations** → Copy **Location ID**
5. Copy the **Application ID** from the app overview

**Production (Live):**
1. Go to https://developer.squareup.com
2. Select your application
3. **Production tab** → Copy **Production Access Token**
4. **Locations** → Copy **Location ID**
5. Copy the **Application ID** from the app overview

## For Platform Admin

### Environment Variables

Set in `.env.local` for local development and in **Amplify Console → App Settings → Environment variables** for deployed environments.

```env
SQUARE_ACCESS_TOKEN=YOUR_PLATFORM_ACCESS_TOKEN
NEXT_PUBLIC_SQUARE_APPLICATION_ID=YOUR_APP_ID
NEXT_PUBLIC_SQUARE_LOCATION_ID=YOUR_LOCATION_ID
NEXT_PUBLIC_SQUARE_ENVIRONMENT=sandbox  # or production
```

These are the platform (Kera's) credentials used as a fallback when a vendor hasn't connected their own Square account.

### Going to Production

1. Set `NEXT_PUBLIC_SQUARE_ENVIRONMENT=production`
2. Update all credentials to production values

## How Payments Work

- **Single vendor**: Payment goes to the vendor's Square account (or platform account if vendor isn't connected)
- **Bundle (multi-vendor)**: Payment is split via Square's `additionalRecipients` — house vendor is the primary recipient, other vendors receive their portions
- **House fees**: Automatically deducted and kept by the house vendor. See `docs/HOUSE_FEE_IMPLEMENTATION.md`

## Testing

**Test Card**: `4111 1111 1111 1111`, CVV: `111`, Exp: any future date, Zip: `12345`

## Further Reading

- **Payment splitting technical details**: `docs/SQUARE_MULTI_PARTY_PAYMENTS.md`
- **House fee configuration & examples**: `docs/HOUSE_FEE_IMPLEMENTATION.md`
