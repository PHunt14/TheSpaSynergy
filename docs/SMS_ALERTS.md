# SMS Alerts Setup

## Overview
Vendors can receive SMS text alerts when new appointments are booked.

## Features
- ✅ Opt-in/opt-out via Dashboard Settings
- ✅ Custom phone number per vendor
- ✅ Automatic alerts on new bookings
- ✅ Uses AWS SNS (native AWS service)

## Setup Instructions

### 1. Deploy Backend Changes
```bash
npx ampx sandbox
```

This will:
- Update the Vendor model with SMS fields
- Deploy the send-sms Lambda function
- Configure SNS permissions

### 2. Enable SMS for Testing (Dev)
```bash
node scripts/enable-sms-alerts.js
```

This sets up the first vendor with phone number: 2403670395

### 3. Configure in Dashboard
Vendors can manage SMS settings at `/dashboard/settings`:
- Toggle SMS alerts on/off
- Enter their phone number (10 digits)
- Save preferences

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

1. Go to `/dashboard/settings`
2. Enable SMS alerts
3. Enter phone: 2403670395
4. Save settings
5. Create a test booking
6. Check phone for SMS!

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
