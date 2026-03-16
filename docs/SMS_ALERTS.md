# SMS Alerts Setup

## Overview
Vendors can receive SMS text alerts when new appointments are booked.

## Features
- ✅ Opt-in/opt-out via Dashboard Settings
- ✅ Custom phone number per vendor
- ✅ Automatic alerts on new bookings
- ✅ Pluggable SMS provider (SNS, Twilio, or Console)

## SMS Provider Configuration

Set `SMS_PROVIDER` in `.env.local`:

| Provider | Value | Use Case |
|----------|-------|----------|
| AWS SNS | `sns` (default) | Production |
| Twilio | `twilio` | Dev/testing with real SMS |
| Console | `console` | Quick local testing |

### Console Mode (Quick Testing)
```env
SMS_PROVIDER=console
```
Logs all SMS to terminal instead of sending.

### Twilio Mode (Real SMS for Dev)
```env
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```
Sign up at twilio.com for free trial ($15 credit).

### SNS Mode (Production)
```env
SMS_PROVIDER=sns
```
Requires 10DLC or toll-free number registration.

### Test Phone Override
Force all SMS to your phone (works with any provider):
```env
SMS_TEST_PHONE=2401234567
```

## How It Works

1. **Booking Created** → Appointment API creates record
2. **SMS Triggered** → Calls `/api/send-sms` with appointment details
3. **Vendor Check** → Verifies vendor has SMS enabled
4. **Message Sent** → SNS sends SMS to vendor's phone

## Message Format
```
New Booking Alert!

Service: [Service Name]
Customer: [Customer Name]
Phone: [Customer Phone]
Date/Time: [Appointment DateTime]

The Spa Synergy
```

## AWS SNS Pricing
- ~$0.00645 per SMS in US
- Pay only for what you use
- No monthly fees

## Production Setup

### Required: SNS Sandbox Exit
By default, AWS SNS is in "sandbox mode" and can only send to verified numbers.

**To send to any number:**
1. Go to AWS SNS Console
2. Request production access (SMS)
3. Provide use case details
4. Wait for approval (~24 hours)

### Environment Variables
Add to `.env.local`:
```
SEND_SMS_FUNCTION_URL=<your-lambda-function-url>
```

## Testing

1. Set `SMS_PROVIDER=console` in `.env.local`
2. Run `npm run dev`
3. Create a test booking
4. Check terminal for SMS output

For real SMS testing:
1. Set `SMS_PROVIDER=twilio` with credentials
2. Optionally set `SMS_TEST_PHONE` to your number
3. Create a test booking
4. Check your phone!

## Troubleshooting

**No SMS received?**
- Check vendor has SMS enabled in settings
- Verify phone number is 10 digits (no dashes)
- Check AWS SNS sandbox status
- Review CloudWatch logs for errors

**SMS to wrong number?**
- Each vendor has their own phone number
- Update in Dashboard → Settings

## Future Enhancements
- [ ] Calendar sync (Google/Apple)
- [ ] Email notifications
- [ ] SMS for appointment reminders
- [ ] SMS for cancellations
