# Production Checklist

Everything needed to get the `main` branch Amplify deployment live and accepting customer bookings.

Items are ordered by priority. The **minimum viable launch** is items 1–6 and 8 — that gets you a working site with email confirmations and in-person payments. SMS notifications (item 7) and online payments (item 9) can follow.

---

## 1. Connect `main` Branch in Amplify Console

- [ ] Amplify Console → "Connect branch" → select `main`
- [ ] App name: `TheSpaSynergy` (or `TheSpaSynergy-prod`)
- [ ] Amplify will automatically create the prod backend (Cognito user pool, AppSync API, DynamoDB tables, Lambda functions)
- [ ] Verify deployment completes without errors

## 2. Custom Domain / DNS

- [ ] Amplify Console → Domain management → Add `thespasynergy.com`
- [ ] Add `www.thespasynergy.com` subdomain
- [ ] Update DNS records as instructed by Amplify (CNAME or ANAME)
- [ ] Wait for SSL certificate provisioning (can take ~15 minutes)
- [ ] Verify `https://www.thespasynergy.com` loads

## 3. Set Environment Variables

In Amplify Console → App Settings → Environment variables, scoped to the `main` branch:

| Variable | Value | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_APP_URL` | `https://www.thespasynergy.com` | Used for OAuth callbacks and email links |
| `NEXT_PUBLIC_BOOKING_ENABLED` | `true` | |
| `NEXT_PUBLIC_SQUARE_APPLICATION_ID` | `sq0idp-...` | Production Square app ID |
| `NEXT_PUBLIC_SQUARE_ENVIRONMENT` | `production` | |
| `SQUARE_APPLICATION_ID` | same as above | |
| `SQUARE_APPLICATION_SECRET` | `sq0csp-...` | Production OAuth secret |
| `SQUARE_ACCESS_TOKEN` | `EAAAl...` | Platform (Kera's) production token |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | from Square webhook config | |
| `EMAIL_PROVIDER` | `ses` | |
| `SES_FROM_EMAIL` | `noreply@thespasynergy.com` | |
| `SMS_PROVIDER` | `sns` | |
| `SNS_ORIGINATION_NUMBER` | `+1XXXXXXXXXX` | Your registered toll-free or 10DLC number |

**Do NOT set in production:**
- `SMS_TEST_PHONE`
- `EMAIL_TEST_ADDRESS`
- `TWILIO_*` variables
- `EMAIL_PROVIDER=console`
- `SMS_PROVIDER=console` or `twilio`

After setting variables, **trigger a new deploy** — env var changes are not picked up until the next build.

## 4. AWS SES (Email Notifications)

- [ ] Verify `thespasynergy.com` domain in SES Console (add DNS TXT record)
- [ ] Confirm domain verification status is "Verified"
- [ ] **Request production access** (exit SES sandbox)
  - SES Console → Account dashboard → "Request production access"
  - Mail type: Transactional
  - Use case: "Appointment booking confirmations and vendor notifications for a spa booking platform"
  - Approval typically takes ~24 hours
- [ ] Confirm you are out of sandbox (can send to any email address)

> While in sandbox, SES can only send to verified email addresses — customers won't receive booking confirmations until you exit sandbox.

## 5. Seed Production Data

After the `main` branch deploys and the prod backend is created:

- [ ] Ensure `amplify_outputs.json` points to the prod backend
- [ ] Run: `node scripts/seed-amplify.js`
- [ ] Verify vendors, services, staff schedules, and bundles are populated in DynamoDB

## 6. Create Cognito Users (Vendor Dashboard Access)

- [ ] Create the house owner account: `node scripts/make-owner.js`
- [ ] Create admin accounts: `node scripts/make-admin.js`
- [ ] Create vendor accounts as needed
- [ ] Verify each user can log in to the dashboard at `/dashboard`

## 7. AWS SNS (SMS Notifications)

- [ ] Register a toll-free number or 10DLC in SNS Console → Text messaging
  - Toll-free: ~$2/month, faster approval
  - 10DLC: ~$0.50/month + $4 one-time brand registration, higher throughput
- [ ] **Request production access** (exit SMS sandbox)
  - SNS Console → Text messaging → Edit account settings
  - Use case: "Appointment booking confirmations for spa customers"
  - Approval takes ~24 hours
- [ ] Set `SNS_ORIGINATION_NUMBER` in Amplify env vars to the registered number
- [ ] Redeploy after updating the env var
- [ ] Test with a real booking

> SMS is not required for launch. Without it, customers and vendors still receive email notifications. SMS can be enabled after launch.

## 8. Smoke Test the Booking Flow

- [ ] Browse vendors and services on the public site
- [ ] Select a service and walk through the booking flow
- [ ] Confirm the appointment appears in DynamoDB
- [ ] Confirm the customer receives a booking confirmation email
- [ ] Confirm the vendor receives a notification email
- [ ] Log in to the vendor dashboard and verify the appointment shows up

## 9. Square (Online Payments)

- [ ] In Square Developer Dashboard → OAuth, add redirect URL: `https://www.thespasynergy.com/api/square/callback`
- [ ] In Square Developer Dashboard → Webhooks, add endpoint: `https://www.thespasynergy.com/api/webhooks/square`
  - Subscribe to: `payment.updated`, `payment.completed`
  - Copy the signature key to `SQUARE_WEBHOOK_SIGNATURE_KEY` env var
- [ ] Each vendor connects their Square account: Dashboard → Settings → "Connect with Square"
- [ ] Test a payment (use a $0 service or refund a small test payment)
- [ ] **Delete `/api/square/debug` endpoint** before going live with real customers

> Online payments are not required for launch. Vendors without a connected Square account will only offer in-person payment at checkout.

---

## Post-Launch

### API Key Rotation

The AppSync API key expires every 30 days (`apiKeyAuthorizationMode: { expiresInDays: 30 }`). If it expires, the entire public site breaks (browsing, booking, everything).

- [ ] Set a recurring reminder to rotate the API key before expiry
- [ ] Consider extending `expiresInDays` in `amplify/data/resource.ts` or setting up auto-rotation

### Ongoing Maintenance

- [ ] Monitor SES bounce/complaint rates (AWS will suspend sending if rates are too high)
- [ ] Monitor SNS delivery logs for failed SMS
- [ ] Keep Square OAuth tokens fresh (they auto-refresh, but monitor for failures)
- [ ] Review and update vendor/service data as the business evolves
