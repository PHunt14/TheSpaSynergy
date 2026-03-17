# Square Integration Setup

## For Vendors: Connecting Your Square Account

1. Log in to the Vendor Dashboard → Settings
2. Click **"Connect Square Account"**
3. Authorize The Spa Synergy to access your Square account (OAuth)
4. Done — you'll now receive split payments automatically

## For Platform Admin

### Environment Variables

Add to `.env.local`:
```env
SQUARE_APPLICATION_ID=sandbox-sq0idb-YOUR_ID
SQUARE_APPLICATION_SECRET=sandbox-sq0csb-YOUR_SECRET
SQUARE_ACCESS_TOKEN=EAAA...  # Platform (Kera's) access token
NEXT_PUBLIC_SQUARE_APPLICATION_ID=sandbox-sq0idb-YOUR_ID
NEXT_PUBLIC_SQUARE_LOCATION_ID=YOUR_LOCATION_ID
NEXT_PUBLIC_SQUARE_ENVIRONMENT=sandbox  # or production
```

### Square Developer Setup

1. Create an app at https://developer.squareup.com
2. Set OAuth Redirect URL: `http://localhost:3000/api/square/oauth` (dev) or your production URL
3. Note your Application ID and Application Secret

### Going to Production

1. Set `NEXT_PUBLIC_SQUARE_ENVIRONMENT=production`
2. Update all credentials to production values
3. Update OAuth redirect URL in Square dashboard

## Testing

**Test Card**: `4111 1111 1111 1111`, CVV: `111`, Exp: any future date, Zip: `12345`

## Further Reading

- **Payment splitting & OAuth technical details**: `docs/SQUARE_MULTI_PARTY_PAYMENTS.md`
- **House fee configuration & examples**: `docs/HOUSE_FEE_IMPLEMENTATION.md`
