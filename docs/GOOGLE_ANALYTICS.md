# Google Analytics (GA4) Setup

Site visitor tracking via Google Analytics 4, added alongside the existing AWS Pinpoint analytics.

## How It Works

The GA4 script is loaded in `app/layout.jsx` using Next.js `<Script>` with `strategy="afterInteractive"`. It only loads when the `NEXT_PUBLIC_GA_MEASUREMENT_ID` environment variable is set — no ID means no script, so dev/preview environments stay clean by default.

Pinpoint (via `AnalyticsProvider`) continues to run independently.

## Setup

### 1. Create a GA4 Property

1. Go to [analytics.google.com](https://analytics.google.com)
2. Admin → Create Property
3. Add a **Web** data stream for your domain (e.g., `thespasynergy.com`)
4. Copy the **Measurement ID** — looks like `G-XXXXXXXXXX`

### 2. Set the Environment Variable

**Local development** (`.env.local`):
```
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

**Production** (Amplify Console):
1. Go to AWS Amplify Console → your app → Environment variables
2. Add `NEXT_PUBLIC_GA_MEASUREMENT_ID` = `G-XXXXXXXXXX`
3. Redeploy (or wait for next push)

### 3. Verify

1. Open your site in a browser
2. In GA4, go to **Reports → Realtime** — you should see your visit appear within seconds

## What You Get (Out of the Box)

GA4 automatically tracks:
- Page views and navigation
- Session count and duration
- User count (new vs returning)
- Geographic location
- Device type, browser, OS
- Traffic sources (direct, search, social, referral)
- Engagement metrics (scroll depth, outbound clicks)

No additional code needed for any of the above.

## Optional: Custom Events

If you want to track specific actions (e.g., booking started, service selected), add `gtag` calls anywhere in client components:

```js
window.gtag('event', 'booking_started', {
  vendor_id: vendorId,
  service_count: services.length,
})
```

These show up in GA4 under **Reports → Engagement → Events**.

## Files

| File | Role |
|------|------|
| `app/layout.jsx` | Loads GA4 script in `<head>` when env var is set |
| `app/components/AnalyticsProvider.jsx` | Existing Pinpoint page view tracking (unchanged) |
