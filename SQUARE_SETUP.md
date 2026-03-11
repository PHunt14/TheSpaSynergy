# Square Multi-Party Payment Implementation - Setup Guide

## What Was Implemented

✅ **Square OAuth Integration** - Vendors can connect their Square accounts securely
✅ **Multi-Vendor Payment Splitting** - Automatic fund distribution for bundle bookings
✅ **Vendor Dashboard UI** - Square connection management in Settings page
✅ **Payment API Updates** - Support for both single and split payments
✅ **Database Schema Updates** - Added Square OAuth fields to Vendor model

## Quick Start

### 1. Update Environment Variables

Add to your `.env.local`:

```bash
# Square OAuth Credentials
SQUARE_APPLICATION_ID=sandbox-sq0idb-YOUR_APP_ID
SQUARE_APPLICATION_SECRET=sandbox-sq0csb-YOUR_SECRET
SQUARE_ACCESS_TOKEN=YOUR_ACCESS_TOKEN

# App URL (for OAuth callback)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Square Environment
NEXT_PUBLIC_SQUARE_ENVIRONMENT=sandbox
```

**Get these from:** https://developer.squareup.com/apps

### 2. Configure Square OAuth Redirect URL

In your Square Developer Dashboard:
1. Go to your application
2. Navigate to OAuth settings
3. Add redirect URL: `http://localhost:3000/api/square/oauth`

### 3. Deploy Database Schema Changes

```bash
npx ampx sandbox
```

This updates the Vendor, Bundle, and Appointment models with new fields.

### 4. Vendor Connection Flow

**For Vendors:**
1. Log into Dashboard → Settings
2. Select your vendor from dropdown
3. Click "Connect Square Account"
4. Authorize The Spa Synergy in Square popup
5. Redirected back with success message

**What Happens:**
- Vendor's Square access token stored securely
- Location ID retrieved automatically
- Ready to receive split payments

## How Bundle Payments Work

### Example Scenario

**Customer books "Relaxation Bundle":**
- Winsome Woods: Massage 60min ($65)
- The Kera Studio: Facial ($65)
- **Total: $130**

**Payment Flow:**
1. Customer enters card info once
2. Square charges $130
3. Square automatically splits:
   - $65 → Winsome Woods Square account
   - $65 → The Kera Studio Square account
4. Each vendor sees payment in their Square dashboard
5. Separate appointments created for each vendor

### Payment API Usage

**Frontend booking code:**
```javascript
const response = await fetch('/api/payment', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sourceId: cardNonce,
    amount: 130.00,
    bundlePayments: [
      { vendorId: 'vendor-winsome', amount: 65.00 },
      { vendorId: 'vendor-kera', amount: 65.00 }
    ]
  })
});
```

## Files Created/Modified

### New Files
- `/app/api/square/oauth/route.js` - OAuth callback handler
- `/app/api/square/connect/route.js` - Generate auth URL
- `/app/api/square/disconnect/route.js` - Revoke access
- `/docs/SQUARE_MULTI_PARTY_PAYMENTS.md` - Full documentation
- `/scripts/get-square-location.js` - Utility script

### Modified Files
- `/amplify/data/resource.ts` - Added Square fields to schema
- `/app/api/payment/route.js` - Added split payment support
- `/app/dashboard/settings/page.jsx` - Added Square connection UI
- `/.env.local.example` - Added Square OAuth variables

## Testing

### Sandbox Testing
1. Use Square sandbox credentials
2. Test card: `4111 1111 1111 1111`
3. Create test vendors and connect sandbox accounts
4. Book a bundle and verify split payments

### Verify Connection
```bash
node scripts/get-square-location.js vendor-winsome
```

## Production Checklist

Before going live:

- [ ] Get production Square credentials
- [ ] Update `NEXT_PUBLIC_SQUARE_ENVIRONMENT=production`
- [ ] Update OAuth redirect URL to production domain
- [ ] Test with real Square accounts
- [ ] Verify all vendors are connected
- [ ] Test bundle booking end-to-end

## Key Benefits

1. **Seamless Customer Experience** - One payment, no confusion
2. **Automatic Distribution** - No manual payouts needed
3. **Direct Deposits** - Vendors receive funds in their Square accounts
4. **Secure** - OAuth 2.0 authentication, no credential sharing
5. **Transparent** - Each vendor sees their transactions in Square dashboard

## Support & Troubleshooting

### Common Issues

**"Vendor not connected to Square"**
→ Vendor needs to connect in Dashboard → Settings

**"No locations found"**
→ Vendor needs to create a location in Square dashboard

**OAuth fails**
→ Check redirect URL matches in Square and `.env.local`

### Get Help
- Square Developer Docs: https://developer.squareup.com/docs
- Square Support: https://squareup.com/help
- Full docs: `/docs/SQUARE_MULTI_PARTY_PAYMENTS.md`

## Next Steps

1. **Set up Square Developer account** if you haven't
2. **Add credentials to `.env.local`**
3. **Deploy schema changes** with `npx ampx sandbox`
4. **Test vendor connection** in Dashboard → Settings
5. **Create a test bundle** and verify payment splitting

## Architecture Overview

```
Customer Books Bundle
        ↓
Frontend collects payment info
        ↓
POST /api/payment with bundlePayments
        ↓
Validates all vendors connected to Square
        ↓
Creates Square payment with additionalRecipients
        ↓
Square splits funds automatically
        ↓
Each vendor receives payment in their account
        ↓
Appointments created for each vendor
```

---

**Questions?** See full documentation in `/docs/SQUARE_MULTI_PARTY_PAYMENTS.md`
