# Square Integration Setup

## For Staff & Owners: Connecting Your Square Account

Square accounts are connected at the **individual staff level**, not the vendor level. This means each person who performs services connects their own Square account.

1. Log in to the Vendor Dashboard → Settings → **My Settings** tab
2. Under "Your Payment Account", click **"Connect with Square"**
3. You'll be redirected to Square to authorize access
4. After authorizing, you'll be redirected back to the dashboard
5. Your connection status will show as "Connected"

This applies to owners too — owners connect their Square account through My Settings, just like any other staff member.

Admins can see which staff members have connected Square on the **Staff** page (💳 badge on each staff card).

## For Platform Admin

### Environment Variables

Set in `.env.local` for local development and in **Amplify Console → App Settings → Environment variables** for deployed environments.

**All 6 variables below are required.** The OAuth flow will fail with "Square credentials not configured" if any are missing.

```env
# Platform Square app (single developer account)
SQUARE_APPLICATION_ID=sq0idb-XXXXXXXXXXXXXXXXXXXX
SQUARE_APPLICATION_SECRET=sq0csp-XXXXXXXXXXXXXXXXXXXX
SQUARE_ACCESS_TOKEN=EAAAl...(your platform access token)
SQUARE_WEBHOOK_SIGNATURE_KEY=your_webhook_signature_key

# Public (exposed to browser — MUST match SQUARE_APPLICATION_ID)
NEXT_PUBLIC_SQUARE_APPLICATION_ID=sq0idb-XXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_SQUARE_ENVIRONMENT=production
```

#### Where to find each value

1. Go to https://developer.squareup.com → select your application
2. **SQUARE_APPLICATION_ID** / **NEXT_PUBLIC_SQUARE_APPLICATION_ID**: Credentials page → "Production Application ID" (starts with `sq0idb-`). Both vars must have the same value
3. **SQUARE_APPLICATION_SECRET**: OAuth page → "Production Application Secret" (starts with `sq0csp-`)
4. **SQUARE_ACCESS_TOKEN**: Credentials page → "Production Access Token" (starts with `EAAAl`)
5. **SQUARE_WEBHOOK_SIGNATURE_KEY**: Webhooks page → your endpoint → "Signature Key"

> **Important**: `SQUARE_APPLICATION_ID` and `SQUARE_APPLICATION_SECRET` are passed to server-side code via `next.config.mjs`. If you add new server-side Square env vars, they must also be added to the `env` block in `next.config.mjs`.

#### Verifying env vars are set correctly

After deploying, visit `/api/square/debug` in your browser. It will show which variables are set (with partial values) without exposing secrets. **Delete this endpoint before going live with real customers.**

### Square Developer Dashboard Setup

1. Go to https://developer.squareup.com → your application
2. Under **OAuth**:
   - Add redirect URL for dev: `https://www.dev.thespasynergy.com/api/square/callback`
   - Add redirect URL for prod: `https://www.thespasynergy.com/api/square/callback`
   - Ensure the redirect URL **exactly matches** `NEXT_PUBLIC_APP_URL` + `/api/square/callback`
3. Under **Webhooks**, add endpoint: `https://yourdomain.com/api/webhooks/square`
   - Subscribe to: `payment.updated`, `payment.completed`
   - Copy the signature key to `SQUARE_WEBHOOK_SIGNATURE_KEY`

### Setting Environment Variables in Amplify

1. Go to **AWS Amplify Console** → your app → **Hosting** → **Environment variables**
2. Add all 6 variables listed above
3. Also ensure `NEXT_PUBLIC_APP_URL` is set (e.g., `https://www.thespasynergy.com`)
4. **Trigger a new build/deploy** — env var changes are NOT picked up until the next deployment
5. After deploy completes, verify at `https://yoursite.com/api/square/debug`

### Going to Production

1. Set `NEXT_PUBLIC_SQUARE_ENVIRONMENT=production`
2. Update all credentials to production values
3. Update OAuth redirect URL in Square Developer Dashboard
4. Delete the `/api/square/debug` endpoint

## How Payments Work

- **Single service**: Payment goes to the **assigned staff member's** Square account. If the staff member hasn't connected Square, only in-person payment is offered at checkout
- **Bundle (multi-vendor)**: Payment is split via Square's `additionalRecipients` — house vendor is the primary recipient, other vendors receive their portions
- **House fees**: Automatically deducted and kept by the house vendor. See `docs/HOUSE_FEE_IMPLEMENTATION.md`
- **Apple Pay / Google Pay**: When available on the customer's device, express checkout buttons appear above the card form. Same payment flow — no additional backend setup required

### Apple Pay & Google Pay Setup

Both wallet options use the Square Web Payments SDK. Google Pay works out of the box. Apple Pay requires domain registration.

#### Apple Pay — Domain Verification (Required)

1. Go to https://developer.squareup.com → your application → **Apple Pay** tab
2. Click **Add** under "Web domains"
3. Register each domain where checkout runs:
   - `www.thespasynergy.com` (production)
   - `www.dev.thespasynergy.com` (dev, if testing Apple Pay)
4. Square will provide a domain verification file — download it
5. Host the file at `https://yourdomain.com/.well-known/apple-developer-merchantid-domain-association`
   - In Next.js: place the file in `public/.well-known/apple-developer-merchantid-domain-association`
6. Click **Verify** in the Square dashboard
7. Apple Pay buttons will appear for customers on Safari (iPhone, iPad, Mac with Touch ID)

> **Note**: Apple Pay will not appear on localhost. Test on a deployed environment with HTTPS.

#### Google Pay — No Setup Required

Google Pay works automatically with the Square Web Payments SDK. The button appears for customers using Chrome with a saved card in Google Pay.

## OAuth Flow

1. Staff clicks "Connect with Square" → `GET /api/square/connect?vendorId=...&staffId=...`
2. Redirected to Square authorization page
3. Staff authorizes → Square redirects to `GET /api/square/callback?code=...&state=...`
4. Backend exchanges code for access + refresh tokens
5. Tokens stored on the **StaffSchedule** record, location auto-detected
6. Tokens auto-refresh before expiry (30-day lifecycle)

## Disconnecting

Staff can disconnect via Settings → My Settings tab → "Disconnect Square". This revokes the OAuth token and clears stored credentials.

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

1. In the Square Developer Dashboard, get your **production** Application ID and OAuth Secret (see "Where to find each value" above)
2. Set all 6 env vars in Amplify Console (or `.env.local` for local dev) — see the Environment Variables section above
3. Ensure `NEXT_PUBLIC_APP_URL` is set correctly:
   - Local: `http://localhost:3000`
   - Dev: `https://www.dev.thespasynergy.com`
   - Prod: `https://www.thespasynergy.com`
4. In Square Developer Dashboard → OAuth, add your redirect URL:
   - Dev: `https://www.dev.thespasynergy.com/api/square/callback`
   - Prod: `https://www.thespasynergy.com/api/square/callback`
5. **Deploy** — env var changes require a new build
6. Verify at `/api/square/debug` that all vars show as "set"
7. Test the OAuth flow: Dashboard → Settings → My Settings tab → Connect with Square

### Test Card (Sandbox Only)

`4111 1111 1111 1111`, CVV: `111`, Exp: any future date, Zip: `12345`

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/square/connect?vendorId=&staffId=` | GET | Initiates OAuth flow (staffId required) |
| `/api/square/callback` | GET | OAuth callback (saves tokens to StaffSchedule) |
| `/api/square/disconnect` | POST | Revokes token, clears staff Square fields |
| `/api/webhooks/square` | POST | Square webhook receiver |
| `/api/payment` | POST | Process payment |

## Further Reading

- **Payment splitting technical details**: `docs/SQUARE_MULTI_PARTY_PAYMENTS.md`
- **House fee configuration & examples**: `docs/HOUSE_FEE_IMPLEMENTATION.md`
