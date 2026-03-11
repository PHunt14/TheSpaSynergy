# House Fee Implementation - Complete ✅

## What Was Implemented

The platform now supports automatic house fee splitting where **The Kera Studio** (the house) receives a portion of payments for services performed by vendors who sublet space.

## Key Changes

### 1. Database Schema Updates
**Vendor Model:**
- Added `isHouse` field (boolean) - Marks Kera as the house vendor

**Service Model:**
- Added `houseFeeEnabled` (boolean) - Enable/disable house fee per service
- Added `houseFeeAmount` (float) - Fixed dollar amount for house fee
- Added `houseFeePercent` (float) - Percentage-based fee (for future use)

### 2. Seed Data Updates
**Vendors:**
- Kera marked as `isHouse: true`
- Winsome and Selene marked as `isHouse: false`
- Removed placeholder Square IDs

**Services:**
- Winsome services: House fees added ($5-$30 depending on service)
- Selene services: House fees added ($5-$12 depending on service)
- Kera services: No house fees (`houseFeeEnabled: false`)

### 3. Payment Processing
**Updated `/app/api/payment/route.js`:**
- Identifies house vendor automatically
- Consolidates house fees from multiple services
- House vendor becomes primary recipient (keeps their portion)
- Other vendors receive net amounts via `additionalRecipients`
- Handles mixed scenarios (services with/without house fees)

### 4. Utility Functions
**Created `/app/utils/payment.js`:**
- `calculatePaymentSplits()` - Calculate splits with house fees
- `calculateVendorNet()` - Calculate vendor's net after house fee
- `formatPaymentSplits()` - Format splits for display

### 5. API Updates
**Updated `/app/api/services/route.ts`:**
- Added house fee fields to service creation
- Supports `houseFeeEnabled`, `houseFeeAmount`, `houseFeePercent`

### 6. Documentation
**Created `/docs/HOUSE_FEE_IMPLEMENTATION.md`:**
- Complete documentation of house fee system
- Payment flow examples
- Configuration guidelines
- Testing scenarios

## How It Works

### Payment Flow Example

**Customer books Massage from Winsome Woods ($65):**

1. **Service Configuration:**
   ```javascript
   {
     price: 65,
     houseFeeEnabled: true,
     houseFeeAmount: 20,
     vendorId: 'vendor-winsome'
   }
   ```

2. **Payment Calculation:**
   ```javascript
   House fee (Kera): $20
   Vendor portion (Winsome): $45
   Total: $65
   ```

3. **Square Payment:**
   ```javascript
   {
     amount: 6500, // $65 in cents
     locationId: "KERA_LOCATION_ID",
     additionalRecipients: [
       {
         locationId: "WINSOME_LOCATION_ID",
         amount: 4500 // $45 in cents
       }
     ]
   }
   ```

4. **Result:**
   - Kera receives: $20 (house fee)
   - Winsome receives: $45 (net amount)

## Business Logic

### Who Pays House Fees?
- ✅ **Winsome Woods** - Subletting space from Kera
- ✅ **Selene Glow Studio** - Subletting space from Kera
- ❌ **The Kera Studio** - Owns the space (no house fee on own services)

### House Fee Amounts (Examples from Seed Data)
- Massage 60min: $20
- Massage 90min: $30
- Reiki: $20
- Sound Healing 30min: $10
- Manicure: $8-12
- Tarot Reading: $5-12

### Square Account Structure
- **Kera's Square account** = Platform account (primary)
- **Other vendors** = Connect via OAuth (receive splits)
- **House fees** = Automatically stay in Kera's account

## Files Modified/Created

### Modified (5 files)
1. `/amplify/data/resource.ts` - Added schema fields
2. `/scripts/seed-amplify.js` - Updated vendor/service data
3. `/app/api/payment/route.js` - House fee payment logic
4. `/app/api/services/route.ts` - House fee field support

### Created (2 files)
1. `/app/utils/payment.js` - Payment calculation utilities
2. `/docs/HOUSE_FEE_IMPLEMENTATION.md` - Complete documentation

## Next Steps

### 1. Deploy Schema Changes
```bash
npx ampx sandbox
```

### 2. Reseed Database
```bash
npm run seed
```

### 3. Test Payment Flow
1. Book service from Winsome (with house fee)
2. Verify payment splits correctly
3. Check Kera receives house fee
4. Check Winsome receives net amount

### 4. Update Service Management UI (Future)
Add to Dashboard → Services:
- ☑️ Enable House Fee checkbox
- $ House Fee Amount input
- Display: "Vendor receives: $XX.XX" (calculated)

## Testing Checklist

- [ ] Deploy schema with `npx ampx sandbox`
- [ ] Reseed data with `npm run seed`
- [ ] Verify Kera has `isHouse: true`
- [ ] Verify Winsome services have house fees
- [ ] Book single service with house fee
- [ ] Verify payment splits in Square sandbox
- [ ] Book bundle with mixed vendors
- [ ] Verify consolidated house fees
- [ ] Check vendor receives correct net amount

## Production Deployment

### Before Going Live:
1. **Kera creates Square Developer account**
2. **Kera creates Square Application**
3. **Get production credentials from Kera**
4. **Update `.env` with Kera's credentials:**
   ```bash
   SQUARE_APPLICATION_ID=sq0idp-KERA_PROD_ID
   SQUARE_APPLICATION_SECRET=sq0csp-KERA_PROD_SECRET
   NEXT_PUBLIC_SQUARE_ENVIRONMENT=production
   ```
5. **Deploy to production**
6. **Vendors connect their Square accounts**
7. **Test with real payment**

## Key Benefits

✅ **Automatic house fee collection** - No manual calculations
✅ **Transparent for vendors** - See net amount in their Square dashboard
✅ **Flexible configuration** - Set house fee per service
✅ **Consolidated payments** - Multiple services combined efficiently
✅ **Kera as merchant of record** - Proper business structure
✅ **Scalable** - Easy to add new vendors with house fees

## Support

- **Technical docs:** `/docs/HOUSE_FEE_IMPLEMENTATION.md`
- **Payment utils:** `/app/utils/payment.js`
- **Square setup:** `/SQUARE_SETUP.md`

---

## Summary

✅ **House fee system implemented**
✅ **Kera marked as house vendor**
✅ **Services configured with house fees**
✅ **Payment splitting automated**
✅ **Utilities created for calculations**
✅ **Documentation complete**

**Ready to deploy!** Run `npx ampx sandbox` then `npm run seed`
