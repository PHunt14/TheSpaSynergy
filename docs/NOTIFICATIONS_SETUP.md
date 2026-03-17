# Notifications Setup Guide

The Spa Synergy sends SMS and email notifications to both customers and vendors when appointments are booked.

## What Gets Sent

| Event | Customer SMS | Customer Email | Vendor SMS | Vendor Email |
|-------|-------------|----------------|------------|--------------|
| Booking created | ✅ (if opted in) | ✅ (always) | ✅ (if enabled) | ✅ (always) |

## Architecture

All notifications flow through two shared utilities:
- `lib/sms.ts` — pluggable SMS (SNS, Twilio, or Console)
- `lib/email.ts` — pluggable email (SES or Console)

Both support test overrides to route all messages to your personal phone/email during development.

---

## Quick Start (Local Development)

Add to `.env.local`:
```env
SMS_PROVIDER=console
EMAIL_PROVIDER=console
```

Run `npm run dev`, create a booking, and check your terminal for output like:
```
📱 SMS (CONSOLE MODE)
To: +12401234567
Message: Booking Submitted!...

📧 EMAIL (CONSOLE MODE)
From: noreply@thespasynergy.com
To: customer@example.com
Subject: Booking Confirmation - The Spa Synergy
```

---

## SMS Setup

### Provider Options

| Provider | `SMS_PROVIDER` | Best For |
|----------|---------------|----------|
| AWS SNS | `sns` (default) | Production |
| Twilio | `twilio` | Dev with real texts |
| Console | `console` | Quick local testing |

### Option A: Console (No Setup)
```env
SMS_PROVIDER=console
```
Logs all SMS to terminal. No AWS or third-party credentials needed.

### Option B: Twilio (Real SMS for Dev)

1. Sign up at [twilio.com](https://www.twilio.com/) (free trial = $15 credit)
2. Get a phone number from the Twilio console
3. Add to `.env.local`:
```env
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```
4. **Twilio trial limitation**: Can only send to your verified phone number. Add `SMS_TEST_PHONE` to route all messages to it:
```env
SMS_TEST_PHONE=2401234567
```

### Option C: AWS SNS (Production)

SNS requires an **originator** (sending number) for US SMS. Steps:

1. **Register a toll-free number or 10DLC** in the [AWS SNS Console → Text messaging](https://console.aws.amazon.com/sns/v3/home#/mobile/text-messaging)
   - Toll-free: ~$2/month, faster approval
   - 10DLC: ~$0.50/month + brand registration ($4 one-time), higher throughput
2. **Request production access** (exit SMS sandbox):
   - SNS Console → Text messaging → Edit account settings
   - Provide use case: "Appointment booking confirmations for spa customers"
   - Approval takes ~24 hours
3. Set in `.env.local`:
```env
SMS_PROVIDER=sns
SNS_ORIGINATION_NUMBER=+18005551234
```

`SNS_ORIGINATION_NUMBER` is the toll-free or 10DLC number you registered. Without it, SNS will reject US SMS.

**Pricing**: ~$0.00645 per SMS in the US.

### Test Phone Override
Route ALL SMS to your phone regardless of provider:
```env
SMS_TEST_PHONE=2401234567
```
Messages will be prefixed with `[TEST → +1original_number]` so you can see who it would have gone to.

---

## Email Setup

### Provider Options

| Provider | `EMAIL_PROVIDER` | Best For |
|----------|-----------------|----------|
| AWS SES | `ses` (default) | Production |
| Console | `console` | Quick local testing |

### Option A: Console (No Setup)
```env
EMAIL_PROVIDER=console
```
Logs all emails (plain text) to terminal.

### Option B: AWS SES (Production)

SES starts in **sandbox mode** — you can only send to verified email addresses.

#### Step 1: Verify Your Domain (Recommended)

This lets you send from any `@thespasynergy.com` address:

```bash
node scripts/dev-tools/verify-ses-domain.js
```

Add the TXT record it outputs to your DNS. Check status:
```bash
node scripts/dev-tools/check-ses-status.js
```

#### Step 2: Verify Individual Emails (Sandbox Only)

While in sandbox, you must also verify recipient addresses:
```bash
node scripts/dev-tools/verify-ses-email.js
```

#### Step 3: Request Production Access

1. Go to [AWS SES Console → Account dashboard](https://console.aws.amazon.com/ses/home#/account)
2. Click "Request production access"
3. Fill in:
   - **Mail type**: Transactional
   - **Website URL**: thespasynergy.com
   - **Use case**: "Appointment booking confirmations and vendor notifications for a spa booking platform"
4. Approval typically takes 24 hours

#### Step 4: Configure
```env
EMAIL_PROVIDER=ses
SES_FROM_EMAIL=noreply@thespasynergy.com
```

**Pricing**: $0.10 per 1,000 emails.

### Test Email Override
Route ALL emails to your address regardless of provider:
```env
EMAIL_TEST_ADDRESS=you@example.com
```
Emails will include a banner showing the original recipient.

---

## Testing Checklist

### Console Mode
- [ ] Set `SMS_PROVIDER=console` and `EMAIL_PROVIDER=console` in `.env.local`
- [ ] Run `npm run dev`
- [ ] Create a booking with SMS opt-in checked
- [ ] Verify 4 console outputs: customer SMS, customer email, vendor SMS, vendor email

### Twilio + SES Sandbox
- [ ] Set `SMS_PROVIDER=twilio` with credentials
- [ ] Set `SMS_TEST_PHONE` to your number
- [ ] Set `EMAIL_TEST_ADDRESS` to your verified SES email
- [ ] Create a booking
- [ ] Verify SMS on your phone and email in your inbox

### Production
- [ ] SNS originator registered and production access approved
- [ ] SES domain verified and production access approved
- [ ] Remove `SMS_TEST_PHONE` and `EMAIL_TEST_ADDRESS` from `.env.local`
- [ ] Set `SMS_PROVIDER=sns` and `EMAIL_PROVIDER=ses`
- [ ] Test with a real booking

---

## Troubleshooting

### SMS not received
- Check `SMS_PROVIDER` value in `.env.local`
- **SNS**: Verify originator is registered, account is out of sandbox
- **Twilio**: Check credentials, verify trial number can send to recipient
- Check vendor has `smsAlertsEnabled: true` and `smsAlertPhone` set in dashboard settings

### Email not received
- Check `EMAIL_PROVIDER` value in `.env.local`
- **SES sandbox**: Both sender AND recipient must be verified
- Check spam/junk folder
- Run `node scripts/dev-tools/check-ses-status.js` to verify domain status

### Customer SMS not sending
- Customer must check the "I agree to receive text messages" checkbox during booking
- The `smsOptIn` field must be `true` in the customer data

### Customer email not sending
- Customer must provide an email address during booking
- Check server console for `Customer email failed:` errors

---

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `SMS_PROVIDER` | `sns` | SMS provider: `sns`, `twilio`, or `console` |
| `EMAIL_PROVIDER` | `ses` | Email provider: `ses` or `console` |
| `SES_FROM_EMAIL` | `noreply@thespasynergy.com` | Sender email address |
| `SNS_ORIGINATION_NUMBER` | _(none)_ | Registered toll-free or 10DLC number for SNS |
| `SMS_TEST_PHONE` | _(none)_ | Override: route all SMS here |
| `EMAIL_TEST_ADDRESS` | _(none)_ | Override: route all emails here |
| `TWILIO_ACCOUNT_SID` | _(none)_ | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | _(none)_ | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | _(none)_ | Twilio sender number |
