# Payment Service — Operations & Development Guide

Standalone Express microservice extracted from the Next.js monolith. Owns all Square payment processing, OAuth lifecycle, multi-party payment splitting, and webhook handling.

---

## Table of Contents

- [Architecture](#architecture)
- [Source Layout](#source-layout)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [API Reference](#api-reference)
- [Automated Testing](#automated-testing)
- [Manual Testing](#manual-testing)
- [Deployment](#deployment)
- [Switching the Next.js App](#switching-the-nextjs-app)
- [Monitoring & Troubleshooting](#monitoring--troubleshooting)
- [Roadmap](#roadmap)

---

## Architecture

```
┌──────────────┐       ┌─────────────────────┐       ┌──────────────┐
│  Next.js UI  │──────▶│   Payment Service   │──────▶│  Square API  │
│  (Amplify)   │       │   (Express, :3001)   │       └──────────────┘
└──────────────┘       │                     │
                       │  src/index.js       │       ┌──────────────┐
                       │  src/square-core.js │──────▶│  DynamoDB    │
                       │  src/db.js          │       │  (Amplify)   │
                       └─────────────────────┘       └──────────────┘
```

- **index.js** — Express app with all route handlers (payment, OAuth, webhooks)
- **square-core.js** — Pure functions: OAuth URL building, state encoding/decoding, webhook signature verification, environment resolution
- **db.js** — DynamoDB access layer for Vendor, Staff, and Appointment tables

The service reads/writes the same DynamoDB tables as the Amplify backend. No separate data store is needed.

---

## Source Layout

```
services/payment-service/
├── src/
│   ├── index.js          # Express app, all routes
│   ├── square-core.js    # OAuth helpers, webhook signature, env
│   └── db.js             # DynamoDB CRUD (Vendor, Staff, Appointment)
├── __tests__/
│   ├── setup.mjs         # Shared mock factory for all route tests
│   ├── health.test.mjs
│   ├── payment.test.mjs
│   ├── square-connect.test.mjs
│   ├── square-callback.test.mjs
│   ├── square-disconnect.test.mjs
│   ├── webhook.test.mjs
│   ├── square-core.test.mjs
│   └── db.test.mjs
├── .env.example
├── jest.config.mjs
├── package.json
└── README.md
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in values:

| Variable | Required | Description |
|----------|----------|-------------|
| `SQUARE_APPLICATION_ID` | Yes | Square app ID (prefix `sandbox-` for sandbox) |
| `SQUARE_APPLICATION_SECRET` | Yes | Square OAuth secret |
| `SQUARE_ACCESS_TOKEN` | Yes | Platform-level access token (fallback when vendor has none) |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Yes | HMAC key for verifying Square webhook payloads |
| `SQUARE_ENVIRONMENT` | Yes | `sandbox` or `production` |
| `DYNAMO_TABLE_VENDOR` | Yes | DynamoDB Vendor table name (e.g. `Vendor-abc123-NONE`) |
| `DYNAMO_TABLE_STAFF` | Yes | DynamoDB StaffSchedule table name |
| `DYNAMO_TABLE_APPOINTMENT` | Yes | DynamoDB Appointment table name |
| `AWS_REGION` | No | Defaults to `us-east-1` |
| `PORT` | No | Defaults to `3001` |
| `APP_URL` | Yes | Base URL of the Next.js app (e.g. `http://localhost:3000`) |
| `CORS_ORIGINS` | No | Comma-separated allowed origins |

### Finding DynamoDB table names

```bash
aws dynamodb list-tables --query "TableNames" --output text
```

Look for tables matching `Vendor-*`, `StaffSchedule-*`, and `Appointment-*`.

---

## Local Development

```bash
cd services/payment-service
npm install
cp .env.example .env   # then edit with real values
npm run dev             # starts with --watch for auto-restart
```

The service listens on `http://localhost:3001` by default.

### Prerequisites

- Node.js v22+
- AWS credentials configured (`aws configure` or env vars) with DynamoDB read/write access
- Square developer account with an application created

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns `{ "status": "ok" }` |
| `POST` | `/payment` | Process a single or bundle payment |
| `GET` | `/square/connect` | Initiates Square OAuth redirect |
| `GET` | `/square/callback` | Handles Square OAuth callback, stores tokens |
| `POST` | `/square/disconnect` | Revokes Square tokens, clears stored credentials |
| `POST` | `/webhooks/square` | Receives Square webhook events, updates appointment status |

### POST /payment

**Single payment:**
```json
{
  "sourceId": "cnon:card-nonce-ok",
  "amount": 25.00,
  "vendorId": "vendor-uuid",
  "staffId": "staff-uuid"       // optional — uses staff's Square account if connected
}
```

**Bundle payment (multi-vendor split):**
```json
{
  "sourceId": "cnon:card-nonce-ok",
  "amount": 100.00,
  "bundlePayments": [
    { "vendorId": "house-vendor-id", "amount": 40 },
    { "vendorId": "other-vendor-id", "amount": 60 }
  ]
}
```

**Credential resolution order:**
1. Staff's Square token (if `staffId` provided and staff has a connected account)
2. Vendor's Square token
3. Platform-level `SQUARE_ACCESS_TOKEN` (fallback, requires vendor `squareLocationId`)

### POST /webhooks/square

Expects raw text body with `x-square-hmacsha256-signature` header. Handles `payment.updated` and `payment.completed` events — updates the matching appointment's `paymentStatus`, `paymentAmount`, and auto-confirms pending appointments on `COMPLETED`.

---

## Automated Testing

Tests use Jest with ESM (`--experimental-vm-modules`) and supertest for HTTP assertions. All external dependencies (DynamoDB, Square SDK) are mocked.

### Run tests

```bash
npm test                # all tests
npm run test:coverage   # with coverage report
```

### Test structure

| File | Covers | Tests |
|------|--------|-------|
| `health.test.mjs` | `GET /health` | 1 |
| `payment.test.mjs` | `POST /payment` — validation, single, bundle, error paths | 14 |
| `square-connect.test.mjs` | `GET /square/connect` — param validation, sandbox/prod URL, state encoding | 5 |
| `square-callback.test.mjs` | `GET /square/callback` — token exchange, location resolution, vendor/staff save, errors | 9 |
| `square-disconnect.test.mjs` | `POST /square/disconnect` — vendor/staff disconnect, revocation failures, errors | 7 |
| `webhook.test.mjs` | `POST /webhooks/square` — signature check, status updates, idempotency, bad payloads | 6 |
| `square-core.test.mjs` | `squareEnv`, `verifyWebhookSignature`, `buildOAuthUrl`, `decodeOAuthState` | 13 |
| `db.test.mjs` | All DynamoDB functions | 12 |

**Current coverage:** 99% lines, 90% branches, 98% statements. The only uncovered lines are the `app.listen` startup block.

### Adding tests

1. Import from `./setup.mjs` to get pre-configured mocks
2. Call `setupMocks()` in `beforeAll` to get the app instance
3. Call `resetAllMocks()` in `beforeEach`
4. Use `dbMocks.*`, `squareCoreMocks.*`, `mockCreatePayment`, etc. to control behavior

---

## Manual Testing

### Health check

```bash
curl http://localhost:3001/health
```

### Single payment (sandbox)

```bash
curl -X POST http://localhost:3001/payment \
  -H "Content-Type: application/json" \
  -d '{
    "sourceId": "cnon:card-nonce-ok",
    "amount": 25.00,
    "vendorId": "YOUR_VENDOR_ID"
  }'
```

Square sandbox nonces:
- `cnon:card-nonce-ok` — succeeds
- `cnon:card-nonce-declined` — declines
- `cnon:card-nonce-already-used` — idempotency error

### Bundle payment

```bash
curl -X POST http://localhost:3001/payment \
  -H "Content-Type: application/json" \
  -d '{
    "sourceId": "cnon:card-nonce-ok",
    "amount": 100.00,
    "bundlePayments": [
      { "vendorId": "HOUSE_VENDOR_ID", "amount": 40 },
      { "vendorId": "OTHER_VENDOR_ID", "amount": 60 }
    ]
  }'
```

### OAuth flow

1. Open in browser: `http://localhost:3001/square/connect?vendorId=YOUR_VENDOR_ID`
2. Complete Square authorization
3. You'll be redirected to `APP_URL/dashboard/settings?success=square_connected`
4. Verify tokens stored: check the Vendor item in DynamoDB for `squareAccessToken`, `squareLocationId`

> **Note:** Square sandbox OAuth (`connect.squareupsandbox.com`) currently renders a blank page. Use production credentials with $0 services or refund small test payments. See `SQUARE_SETUP.md`.

### Disconnect

```bash
curl -X POST http://localhost:3001/square/disconnect \
  -H "Content-Type: application/json" \
  -d '{ "vendorId": "YOUR_VENDOR_ID" }'
```

### Webhook testing

Use the [Square Webhook Tester](https://developer.squareup.com/docs/webhooks/overview) or craft a manual request:

```bash
curl -X POST http://localhost:3001/webhooks/square \
  -H "Content-Type: text/plain" \
  -H "x-square-hmacsha256-signature: YOUR_COMPUTED_SIG" \
  -d '{"type":"payment.completed","data":{"object":{"payment":{"id":"PAY_ID","status":"COMPLETED","amountMoney":{"amount":2500,"currency":"USD"}}}}}'
```

To compute the signature for testing:
```js
const { createHmac } = require('crypto')
const sigKey = 'YOUR_WEBHOOK_SIGNATURE_KEY'
const webhookUrl = 'http://localhost:3001/webhooks/square'
const body = '...' // your JSON string
const hmac = createHmac('sha256', sigKey)
hmac.update(webhookUrl + body)
console.log(hmac.digest('base64'))
```

---

## Deployment

### Option A: Amplify Function (recommended short-term)

Package as an Amplify custom function using `@vendia/serverless-express`:

1. Add `@vendia/serverless-express` as a dependency
2. Create a Lambda handler entry point:
   ```js
   import serverlessExpress from '@vendia/serverless-express'
   import { app } from './src/index.js'
   export const handler = serverlessExpress({ app })
   ```
3. Define in `amplify/functions/` and wire to an API Gateway route
4. Set all env vars in the Amplify function configuration

### Option B: API Gateway + Lambda (standalone)

1. Package with a bundler (esbuild) or as a zip
2. Create a Lambda function with the handler above
3. Create an API Gateway HTTP API with `/{proxy+}` route pointing to the Lambda
4. Set env vars in Lambda configuration
5. Point Square webhook URL to the API Gateway endpoint

### Option C: Container (ECS/Fargate)

For higher throughput or long-running connections:

1. Create a Dockerfile:
   ```dockerfile
   FROM node:22-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --production
   COPY src/ src/
   EXPOSE 3001
   CMD ["node", "src/index.js"]
   ```
2. Deploy to ECS Fargate behind an ALB
3. Set env vars in the task definition

### Environment variables for deployment

All variables from [Environment Variables](#environment-variables) must be set in the deployment target. For Lambda/Amplify, use the function's environment configuration. For ECS, use the task definition or Secrets Manager.

**Security considerations:**
- Store `SQUARE_APPLICATION_SECRET`, `SQUARE_ACCESS_TOKEN`, and `SQUARE_WEBHOOK_SIGNATURE_KEY` in AWS Secrets Manager or SSM Parameter Store (SecureString)
- Grant the execution role DynamoDB read/write access to the three tables
- Restrict CORS origins to your production domain

### Square webhook configuration

After deployment, register the production webhook URL in the [Square Developer Dashboard](https://developer.squareup.com/apps):
- URL: `https://your-domain/webhooks/square`
- Events: `payment.updated`, `payment.completed`
- Copy the signature key to `SQUARE_WEBHOOK_SIGNATURE_KEY`

---

## Switching the Next.js App

Set an env var in the Next.js app:

```
NEXT_PUBLIC_PAYMENT_SERVICE_URL=http://localhost:3001
```

Then update frontend fetch calls from `/api/payment` → `${NEXT_PUBLIC_PAYMENT_SERVICE_URL}/payment`, and similarly for the other routes. The OAuth connect/callback URLs should also point to the payment service.

---

## Monitoring & Troubleshooting

### Common issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Vendor not found` (404) | `vendorId` doesn't match a DynamoDB item | Verify the vendor exists and the table name in `.env` is correct |
| `Payment configuration error` (500) | Vendor has no `squareAccessToken` or `squareLocationId` | Vendor needs to complete OAuth via `/square/connect` |
| `Payment unavailable` (400) | Vendor's `squareOAuthStatus` is `error` | Vendor needs to reconnect Square |
| `House vendor not configured` (500) | No vendor with `isHouse: true` in DynamoDB | Set `isHouse` on the house vendor record |
| `Invalid signature` (401) on webhooks | Signature key mismatch or wrong webhook URL | Verify `SQUARE_WEBHOOK_SIGNATURE_KEY` matches the Square dashboard and `APP_URL` is correct |
| `ERR_MODULE_NOT_FOUND: express` | Dependencies not installed | Run `npm install` |

### Logging

The service logs errors to stdout via `console.error`. In Lambda, these appear in CloudWatch Logs. Key log prefixes:
- `Payment error:` — payment processing failures
- `Square callback error:` — OAuth token exchange failures
- `Token revocation failed:` / `Staff token revocation failed:` — non-fatal, disconnect still succeeds
- `Webhook error:` — webhook processing failures
- `Error fetching locations:` — non-fatal during OAuth callback

---

## Known Issues & Security Findings

Identified via automated SAST scan and manual review. Listed by severity.

### Critical — No Authentication

No route in the service requires authentication. Anyone who can reach the service can process payments, disconnect Square accounts, or trigger OAuth. This is the highest-priority fix before any public deployment.

**Options:**
- **Service-to-service (recommended if only Next.js calls this):** Validate a shared API key in a request header (e.g. `x-api-key`). Add a middleware that rejects requests without a valid key. The webhook route is exempt since Square authenticates via HMAC signature.
- **Browser-facing:** Validate Cognito JWT tokens forwarded from the Next.js app using `aws-jwt-verify`.

### High — No CSRF Protection (CWE-352)

The `POST /payment` and `POST /square/disconnect` routes have no CSRF protection. If the service is called directly from a browser, an attacker could craft a form that submits to these endpoints on behalf of an authenticated user.

**Mitigation:**
- If this service is only called server-to-server from Next.js API routes, CSRF doesn't apply — restrict CORS tightly and add the API key header above.
- If called directly from the browser, add CSRF token middleware (e.g. `csurf` or double-submit cookie pattern).

### High — No Input Validation

`vendorId`, `staffId`, `amount`, and `bundlePayments` are trusted as-is. A malformed `amount` (negative, NaN, extremely large) goes straight to Square. Malformed IDs cause unnecessary DynamoDB lookups.

**Fix:** Add zod schemas for all POST routes:
```js
const paymentSchema = z.object({
  sourceId: z.string().min(1),
  amount: z.number().positive().max(10000),
  vendorId: z.string().min(1).optional(),
  staffId: z.string().min(1).optional(),
  bundlePayments: z.array(z.object({
    vendorId: z.string().min(1),
    amount: z.number().positive(),
  })).optional(),
})
```

### High — SSRF Flagged on Redirects (CWE-918)

The scanner flags `res.redirect()` calls in `/square/connect` and `/square/callback` because `req.query` values flow into redirect URLs. In practice, the redirect targets are constructed from the server-controlled `APP_URL` env var and query params are passed through `encodeURIComponent`, so this is safe. However, if `APP_URL` were ever set from user input, it would be exploitable.

**Mitigation:** Validate `APP_URL` at startup (must be a valid URL matching an allowlist of known domains). Already safe as long as `.env` is server-controlled.

### Medium — DynamoDB Full Table Scans

- `findAppointmentByPaymentId` does a full Scan with a filter expression. As the Appointment table grows, this gets slower and more expensive.
- `listVendors` scans the entire Vendor table on every bundle payment.

**Fix:**
- Add a GSI on `paymentId` to the Appointment table and switch to a Query.
- Cache `listVendors` in-memory with a short TTL (~60s) since vendors rarely change:
  ```js
  let vendorCache = { data: null, expires: 0 }
  export async function listVendors() {
    if (vendorCache.data && Date.now() < vendorCache.expires) return vendorCache.data
    const { Items } = await ddb.send(new ScanCommand({ TableName: tables.vendor() }))
    vendorCache = { data: Items || [], expires: Date.now() + 60_000 }
    return vendorCache.data
  }
  ```

### Medium — No Token Expiry Check

`squareTokenExpiresAt` is stored but never checked. If a vendor's token expires, payments fail with a confusing Square API error instead of a clear message.

**Fix:** Check expiry in `resolveSquareCredentials` and return a descriptive error. Build the refresh cron as a follow-up.

### Medium — Bundle Payment Split Logic

When there's no house vendor in the bundle, `primaryVendor` is set to `vendorChecks[0].vendor` and `additionalRecipients` is built from `otherPayments.slice(1)`. The primary vendor receives `totalAmount` charged to their location minus the `additionalRecipients` amounts — this is correct per Square's model, but the logic is fragile and undocumented. A comment or restructure would prevent future bugs.

### Low — Code Organization

`index.js` is 290 lines handling all routes, credential resolution, and payment logic. Recommended split:
- `routes/payment.js` — payment routes
- `routes/square.js` — OAuth connect/callback/disconnect
- `routes/webhook.js` — webhook handler
- `lib/credentials.js` — `resolveSquareCredentials`

### Low — Miscellaneous

- `startup.log` is committed and contains an error trace — add to `.gitignore`
- No `helmet` middleware — add for security headers (disables `X-Powered-By`, etc.)
- No graceful shutdown — add `SIGTERM` handling for container/EC2 deployments to drain in-flight requests
- No rate limiting — add `express-rate-limit` on `/payment` and `/webhooks/square`

---

## Roadmap

Ordered by priority. Items marked 🔴 are security-critical and should be completed before production deployment.

### Before Production

- [ ] 🔴 **Authentication middleware** — API key or Cognito JWT validation on all routes (except `/webhooks/square` which uses HMAC)
- [ ] 🔴 **Input validation** — Add zod schemas for `POST /payment` and `POST /square/disconnect` request bodies
- [ ] 🔴 **Rate limiting** — Add `express-rate-limit` to `/payment` and `/webhooks/square`
- [ ] 🔴 **Helmet** — Add `helmet` middleware for security headers
- [ ] 🔴 **Token expiry check** — Return a clear error in `resolveSquareCredentials` when `squareTokenExpiresAt` is past

### Short-Term

- [ ] **Token refresh** — Scheduled task (EventBridge + Lambda or cron) to refresh Square OAuth tokens before expiry
- [ ] **Appointment GSI** — Add a `paymentId` GSI to the Appointment table; replace `findAppointmentByPaymentId` Scan with Query
- [ ] **Vendor cache** — In-memory cache for `listVendors` with 60s TTL to avoid repeated Scans
- [ ] **Structured logging** — Replace `console.error` with pino for structured JSON logs (better CloudWatch querying)
- [ ] **CI pipeline** — Run `npm test` on push; fail deploy on coverage regression below 90%
- [ ] **Gitignore cleanup** — Add `startup.log` to `.gitignore`

### Medium-Term

- [ ] **Route extraction** — Split `index.js` into `routes/payment.js`, `routes/square.js`, `routes/webhook.js`, `lib/credentials.js`
- [ ] **Idempotency** — Store and check idempotency keys to prevent duplicate payments on retries
- [ ] **Refund endpoint** — `POST /refund` to handle refund logic (see `docs/REFUND_STRATEGY.md`)
- [ ] **Health check depth** — `/health` should verify DynamoDB connectivity
- [ ] **Graceful shutdown** — Handle `SIGTERM` to drain in-flight requests for container deployments
- [ ] **Bundle split documentation** — Add inline comments explaining the primary/additional recipient model in `handleBundlePayment`
