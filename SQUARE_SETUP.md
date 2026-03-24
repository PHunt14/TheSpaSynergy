# Square Integration Setup

## For Vendors: Connecting Your Square Account

1. Log in to the Vendor Dashboard → Settings
2. Click **"Connect with Square"**
3. You'll be redirected to Square to authorize access
4. After authorizing, you'll be redirected back to the dashboard
5. Your connection status will show as "Connected"

That's it — no credentials to copy/paste.

## For Platform Admin

### Environment Variables

Set in `.env.local` for local development and in **Amplify Console → App Settings → Environment variables** for deployed environments.

```env
# Platform Square app (single developer account)
SQUARE_APPLICATION_ID=YOUR_APP_ID
SQUARE_APPLICATION_SECRET=YOUR_OAUTH_SECRET
SQUARE_ACCESS_TOKEN=YOUR_PLATFORM_ACCESS_TOKEN
SQUARE_WEBHOOK_SIGNATURE_KEY=YOUR_WEBHOOK_SIGNATURE_KEY

# Public (exposed to browser)
NEXT_PUBLIC_SQUARE_APPLICATION_ID=YOUR_APP_ID
NEXT_PUBLIC_SQUARE_ENVIRONMENT=sandbox  # or production
```

### Square Developer Dashboard Setup

1. Go to https://developer.squareup.com → your application
2. Under **OAuth**, add the redirect URL: `https://yourdomain.com/api/square/callback`
3. Under **Webhooks**, add endpoint: `https://yourdomain.com/api/webhooks/square`
   - Subscribe to: `payment.updated`, `payment.completed`
   - Copy the signature key to `SQUARE_WEBHOOK_SIGNATURE_KEY`

### Going to Production

1. Set `NEXT_PUBLIC_SQUARE_ENVIRONMENT=production`
2. Update all credentials to production values
3. Update OAuth redirect URL in Square Developer Dashboard

## How Payments Work

- **Single vendor**: Payment goes to the vendor's Square account. If a vendor hasn't connected Square, only in-person payment is offered at checkout
- **Bundle (multi-vendor)**: Payment is split via Square's `additionalRecipients` — house vendor is the primary recipient, other vendors receive their portions
- **House fees**: Automatically deducted and kept by the house vendor. See `docs/HOUSE_FEE_IMPLEMENTATION.md`

## OAuth Flow

1. Vendor clicks "Connect with Square" → `GET /api/square/connect?vendorId=...`
2. Redirected to Square authorization page
3. Vendor authorizes → Square redirects to `GET /api/square/callback?code=...&state=...`
4. Backend exchanges code for access + refresh tokens
5. Tokens stored on vendor record, location auto-detected
6. Tokens auto-refresh before expiry (30-day lifecycle)

## Disconnecting

Vendors can disconnect via Settings → "Disconnect Square". This revokes the OAuth token and clears stored credentials.

## Testing

### Sandbox vs Production OAuth

Square's sandbox OAuth login page (`connect.squareupsandbox.com`) is unreliable — it renders a blank screen for unauthenticated users. **Use production Square credentials for all OAuth testing.**

The OAuth flow itself (connect/disconnect) does not involve any money. It only links a vendor's Square account to the platform.

### Testing Payments Without Spending Real Money

With production credentials, use any of these approaches:

1. **$0 services** — Create a test service priced at $0.00. The full payment flow executes without charging anything
2. **Small amount + refund** — Process a $1.00 payment, then immediately refund it from the [Square Dashboard](https://squareup.com/dashboard). You'll lose a few cents to processing fees
3. **Test OAuth only** — The connect/disconnect flow doesn't touch payments at all. You can test the entire OAuth lifecycle without any payment configuration

### Setup for Production Testing

1. In the Square Developer Dashboard, get your **production** Application ID and OAuth Secret
2. Set env vars in Amplify (or `.env.local` for local dev):
   - `SQUARE_APPLICATION_ID` → production ID (starts with `sq0idb-`, no `sandbox-` prefix)
   - `SQUARE_APPLICATION_SECRET` → production OAuth secret
3. Add your redirect URL under the **production** app's OAuth settings:
   - Dev: `https://www.dev.thespasynergy.com/api/square/callback`
   - Prod: `https://www.thespasynergy.com/api/square/callback`
4. The code auto-detects sandbox vs production from the Application ID prefix

### Test Card (Sandbox Only)

`4111 1111 1111 1111`, CVV: `111`, Exp: any future date, Zip: `12345`

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/square/connect?vendorId=` | GET | Initiates OAuth flow |
| `/api/square/callback` | GET | OAuth callback (handles token exchange) |
| `/api/square/disconnect` | POST | Revokes token, clears vendor fields |
| `/api/webhooks/square` | POST | Square webhook receiver |
| `/api/payment` | POST | Process payment |

## Further Reading

- **Payment splitting technical details**: `docs/SQUARE_MULTI_PARTY_PAYMENTS.md`
- **House fee configuration & examples**: `docs/HOUSE_FEE_IMPLEMENTATION.md`
