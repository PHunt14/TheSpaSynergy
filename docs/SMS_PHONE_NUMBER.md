# SMS Phone Number Setup

## Decision: One Toll-Free Number for the Platform

The Spa Synergy uses a single SMS origination number for all outbound texts across all vendors (The Kera Studio, Winsome Woods, Selene Glow Studio). Messages already include the vendor name and service details, so recipients know which business the text is about.

Register the number under **The Kera Studio** — the business that owns the building and operates the booking platform (thespasynergy.com). "The Spa Synergy" is the platform brand name, not a registered business. AWS verifies that the registered company is a real entity, so the registration must use The Kera Studio's legal business information.

### Why Toll-Free Over 10DLC

| | Toll-Free | 10DLC |
|---|---|---|
| Approval time | ~days | ~2–4 weeks (brand + campaign registration) |
| Monthly cost | ~$2 | ~$0.50 + $4 one-time brand registration |
| Setup complexity | Single verification form | Brand registration → campaign registration → number assignment |
| Throughput | 3 SMS/second | Varies by trust score (usually higher) |
| Best for | Transactional, low-to-moderate volume | High-volume marketing |

At spa booking volume (a few dozen texts/day at most), toll-free is the right choice. 10DLC is overkill and takes longer to set up.

---

## Step-by-Step: AWS Toll-Free Number Registration

### Step 1: Request a Toll-Free Number

1. Go to [AWS SNS Console → Text messaging → Phone numbers](https://console.aws.amazon.com/sns/v3/home#/mobile/text-messaging/phone-numbers)
2. Click **"Request phone number"** (or go via Amazon Pinpoint → Phone numbers)
3. Select:
   - Country: **United States**
   - Number type: **Toll-free**
   - Default message type: **Transactional**
4. AWS will assign a toll-free number (e.g., `+18005551234`)

### Step 2: Submit Toll-Free Verification

AWS requires toll-free verification before you can send to real customers. Unverified toll-free numbers are blocked or heavily throttled.

1. Go to [Amazon Pinpoint → Phone numbers](https://console.aws.amazon.com/pinpoint/home#/sms-account-settings/phoneNumbers) or SNS Console → Phone numbers
2. Select your toll-free number → **"Create registration"** or **"Submit verification"**
3. Fill in the form using the values below

### Step 3: Verification Form — What to Enter

#### Company Information

| Field | Value |
|-------|-------|
| Company name | The Kera Studio |
| Company website | https://www.thespasynergy.com |
| Business address | *(Fort Ritchie, MD — The Kera Studio's physical address)* |
| Contact email | thekerastudio@gmail.com *(or Kera's preferred admin email)* |
| Contact phone | 240-329-6537 *(or Kera's preferred admin phone)* |

#### Use Case

| Field | Value |
|-------|-------|
| Use case category | **Appointment reminders / notifications** |
| Monthly SMS volume | **Under 10,000** |
| Use case description | See below |

**Use case description** (copy/paste):

> The Kera Studio, doing business as The Spa Synergy (thespasynergy.com), operates a multi-vendor spa and wellness booking platform at its location in Fort Ritchie, MD. The platform sends transactional SMS notifications to customers and service providers when appointments are booked, confirmed, cancelled, or rescheduled. Messages are only sent to users who have explicitly opted in via an unchecked-by-default checkbox during the online booking checkout process. We do not send marketing or promotional messages. The Kera Studio is the legal business entity; "The Spa Synergy" is the consumer-facing brand name for the booking platform.

#### Opt-In Information

| Field | Value |
|-------|-------|
| Opt-in type | **Web form** |
| Opt-in website URL | https://www.thespasynergy.com |
| Opt-in description | See below |

**Opt-in description** (copy/paste):

> During the online booking checkout process at https://www.thespasynergy.com/booking/confirm, customers are presented with an unchecked-by-default checkbox labeled: "I agree to receive automated SMS appointment updates from The Spa Synergy (e.g. confirmations, reminders, cancellations). Msg frequency: ~1–5 msgs per booking. Msg & data rates may apply. Reply STOP to cancel, HELP for help. Consent is not required to book. Privacy Policy & Terms." The checkbox links to our Privacy Policy (https://www.thespasynergy.com/privacy) and Terms of Service (https://www.thespasynergy.com/terms), both of which contain dedicated SMS sections covering message frequency, opt-out instructions, and data sharing practices. Service providers (vendors) enable SMS alerts through their authenticated dashboard settings.

> **CRITICAL**: Attach a screenshot of the booking checkout page showing the SMS opt-in checkbox in its unchecked state, with the full disclosure text and Privacy Policy / Terms links visible. AWS reviewers almost always require this — missing screenshots are the #1 reason for registration returns.

#### Sample Messages

Provide 2–3 examples. These should closely match what your app actually sends:

**Sample 1 — Customer booking confirmation:**
> Booking Submitted! Your appointment for Massage - 60 min with Winsome Woods on Saturday, July 12, 2025 at 2:00 PM has been submitted. You'll receive a confirmation once the vendor reviews your request. — The Spa Synergy

**Sample 2 — Vendor new booking alert:**
> New Booking! Jane D. has requested Signature Glow Facial on Friday, July 18, 2025 at 12:00 PM. Log in to your dashboard to confirm. — The Spa Synergy

**Sample 3 — Customer appointment confirmed:**
> Your appointment for Head Bath with The Kera Studio on Tuesday, July 15, 2025 at 11:00 AM has been confirmed. See you then! — The Spa Synergy

### Step 4: Wait for Approval

- Toll-free verification typically takes **2–5 business days**
- AWS may email follow-up questions — respond promptly to avoid delays
- You can check status in the SNS/Pinpoint console under your phone number

### Step 5: Exit SMS Sandbox

Separately from toll-free verification, your AWS account may be in the **SMS sandbox**, which only allows sending to verified phone numbers.

1. SNS Console → Text messaging → Edit account settings
2. Request to move to production
3. Use case: same description as above
4. This is usually approved within 24 hours

### Step 6: Configure the App

Once approved, set the env var in Amplify:

```
SNS_ORIGINATION_NUMBER=+18005551234
```

Replace with your actual toll-free number. Redeploy after setting the variable.

---

## Tips for Faster Approval

- **Have the website live** before submitting — AWS checks the URL. At minimum, the booking page with the SMS opt-in checkbox should be accessible
- **Be specific** in the use case description — "transactional appointment notifications" is better than "sending texts to customers"
- **Mention opt-in explicitly** — AWS cares a lot about consent. The checkbox-based opt-in is exactly what they want to see
- **Don't mention marketing** — even if you plan to add it later. Transactional-only use cases get approved faster
- **Respond to follow-ups quickly** — if AWS asks for clarification, slow responses can restart the review timer

## Troubleshooting

### Verification rejected

Common reasons and fixes:
- **Company name mismatch**: Registration says "The Kera Studio" but website says "The Spa Synergy." Fix: the use case description now explicitly states the DBA relationship. Both names should appear in the registration
- **Missing opt-in screenshot**: AWS almost always requires a screenshot attachment showing the checkbox. This is the #1 return reason
- **Opt-in URL not directly accessible**: The checkbox lives on `/booking/confirm` which requires query params. Use the base URL `https://www.thespasynergy.com` and attach a screenshot instead of relying on the reviewer navigating to the checkbox
- **Privacy/Terms pages not live**: Verify `thespasynergy.com/privacy` and `thespasynergy.com/terms` are deployed and accessible before submitting
- **Sample messages don't match use case**: Keep sample messages consistent with "transactional appointment notifications"
- Website wasn't accessible at review time

You can resubmit with corrections. Check the rejection reason in the console.

### Messages not delivering after approval

- Confirm `SNS_ORIGINATION_NUMBER` is set and the app was redeployed
- Confirm the account is out of SMS sandbox
- Check CloudWatch logs for SNS publish errors
- Verify the recipient phone number format (must be E.164: `+1XXXXXXXXXX`)
