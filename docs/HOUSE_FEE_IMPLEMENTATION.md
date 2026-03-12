# House Fee Implementation

## Overview

The platform supports "house fees" where The Kera Studio (the house) receives a portion of payments for services performed by vendors who sublet space. This is automatically handled during payment processing.

## Business Model

**The Kera Studio** owns the physical space and leases rooms to other vendors:
- **Winsome Woods** - Subletting space, pays house fee
- **Selene Glow Studio** - Subletting space, pays house fee
- **The Kera Studio** - Owns space, no house fee on their own services

## Database Structure

### Vendor Model
```javascript
{
  vendorId: 'vendor-kera',
  name: 'The Kera Studio',
  isHouse: true,  // Marks this vendor as the house
  // Uses platform Square credentials (no OAuth needed)
}
```

### Service Model
```javascript
{
  serviceId: 'svc-winsome-massage-60',
  vendorId: 'vendor-winsome',
  name: 'Massage - 60 min',
  price: 65,
  houseFeeEnabled: true,      // Enable house fee for this service
  houseFeeAmount: 20,         // Fixed dollar amount
  houseFeePercent: 0,         // Or percentage (not currently used)
}
```

## Payment Flow Examples

### Example 1: Single Service with House Fee
```
Customer books: Massage from Winsome Woods
- Service price: $65
- House fee: $20
- Vendor receives: $45

Square Payment:
- Total charged: $65
- Kera (house) keeps: $20
- Winsome Woods receives: $45
```

### Example 2: Service Without House Fee
```
Customer books: Facial from The Kera Studio
- Service price: $65
- House fee: $0 (Kera's own service)
- Vendor receives: $65

Square Payment:
- Total charged: $65
- Kera receives: $65 (single payment, no split)
```

### Example 3: Bundle with Mixed Services
```
Customer books bundle:
- Massage (Winsome) - $65 (house fee: $20)
- Facial (Kera) - $65 (no house fee)
- Total: $130

Payment splits:
- Kera (house fee): $20
- Kera (facial): $65
- Winsome: $45

Consolidated:
- Kera receives: $85 ($20 + $65)
- Winsome receives: $45

Square Payment:
- Total charged: $130
- Kera (platform account) keeps: $85
- additionalRecipients: [{ Winsome: $45 }]
```

### Example 4: Multiple Services from Same Vendor
```
Customer books:
- Massage 60min (Winsome) - $65 (house fee: $20)
- Massage 90min (Winsome) - $120 (house fee: $30)
- Total: $185

Payment splits:
- Kera (house fees): $50 ($20 + $30)
- Winsome: $135 ($45 + $90)

Square Payment:
- Total charged: $185
- Kera keeps: $50
- additionalRecipients: [{ Winsome: $135 }]
```

## Implementation Details

### Payment Calculation
The `calculatePaymentSplits` utility function handles:
1. Iterating through all services in booking
2. Checking if house fee is enabled
3. Splitting payment between house and vendor
4. Consolidating multiple payments to same vendor

```javascript
import { calculatePaymentSplits } from '@/app/utils/payment';

const services = [
  { price: 65, houseFeeEnabled: true, houseFeeAmount: 20, vendorId: 'vendor-winsome' },
  { price: 65, houseFeeEnabled: false, houseFeeAmount: 0, vendorId: 'vendor-kera' }
];

const { total, splits } = calculatePaymentSplits(services, 'vendor-kera');

// Result:
// total: 130
// splits: [
//   { vendorId: 'vendor-kera', amount: 85, isHouseFee: true },
//   { vendorId: 'vendor-winsome', amount: 45, isHouseFee: false }
// ]
```

### Square Payment Processing
The payment API automatically:
1. Identifies the house vendor (`isHouse: true`)
2. Consolidates all house fees
3. Makes house the primary recipient (keeps their portion)
4. Splits remaining amounts to other vendors via `additionalRecipients`

```javascript
POST /api/payment
{
  "sourceId": "card-nonce",
  "amount": 130,
  "bundlePayments": [
    { "vendorId": "vendor-kera", "amount": 85, "isHouseFee": true },
    { "vendorId": "vendor-winsome", "amount": 45, "isHouseFee": false }
  ]
}
```

## Configuration

### Setting House Fees on Services

**Dashboard → Services → Edit Service:**
1. Check "Enable House Fee"
2. Enter house fee amount (e.g., $20)
3. System automatically calculates vendor net amount
4. Display shows: "Vendor receives: $XX.XX"

### House Fee Guidelines

Typical house fee structure:
- **Massage services**: $20-30 per session
- **Wellness services**: $5-15 per session
- **Nail services**: $5-12 per service
- **Hair services**: Varies by service complexity

Kera's own services have `houseFeeEnabled: false`

## Square Account Setup

### Development
Use your (developer's) Square sandbox account:
```bash
SQUARE_APPLICATION_ID=sandbox-sq0idb-YOUR_DEV_ID
SQUARE_APPLICATION_SECRET=sandbox-sq0csb-YOUR_DEV_SECRET
```

### Production
Use Kera's Square production account:
```bash
SQUARE_APPLICATION_ID=sq0idp-KERA_PRODUCTION_ID
SQUARE_APPLICATION_SECRET=sq0csp-KERA_PRODUCTION_SECRET
```

**Why Kera's account?**
- Kera is the business owner and merchant of record
- House fees automatically stay in Kera's account
- Kera sees all transactions in their Square dashboard
- Proper tax reporting under Kera's business entity

## Vendor Dashboard

### For Kera (House)
- No Square OAuth connection needed
- Uses platform Square credentials
- Sees all transactions in Square dashboard
- Receives house fees + own service payments

### For Other Vendors
- Must connect Square account via OAuth
- Dashboard → Settings → "Connect Square Account"
- Receives their net amount after house fees
- Sees only their transactions in their Square dashboard

## Testing

### Test Scenarios

1. **Single service with house fee**
   - Book Winsome massage ($65)
   - Verify Kera receives $20
   - Verify Winsome receives $45

2. **Service without house fee**
   - Book Kera facial ($65)
   - Verify Kera receives full $65

3. **Bundle with mixed vendors**
   - Book services from multiple vendors
   - Verify house fees consolidated
   - Verify correct splits to each vendor

4. **Multiple services same vendor**
   - Book 2+ services from Winsome
   - Verify house fees added together
   - Verify vendor receives consolidated net amount

### Test Cards (Sandbox)
- Card: `4111 1111 1111 1111`
- CVV: Any 3 digits
- Expiration: Any future date
- Postal: Any 5 digits

## Troubleshooting

### "House vendor not configured"
→ Ensure one vendor has `isHouse: true` in database
→ Run seed script to set Kera as house

### House fees not splitting correctly
→ Check service has `houseFeeEnabled: true`
→ Verify `houseFeeAmount` is set
→ Check payment calculation in browser console

### Vendor not receiving correct amount
→ Verify: vendorAmount = price - houseFeeAmount
→ Check Square dashboard for actual deposit
→ Ensure vendor is connected via OAuth

## Future Enhancements

1. **Percentage-based house fees** - Use `houseFeePercent` instead of fixed amount
2. **Variable house fees** - Different rates by service category
3. **House fee reports** - Dashboard showing house fee totals
4. **Vendor payout reports** - Show net amounts after house fees
5. **Automated invoicing** - Generate invoices with house fee breakdown

---

## Summary

✅ **Kera is the house** - Marked with `isHouse: true`
✅ **Services have house fees** - Configurable per service
✅ **Automatic payment splitting** - House fees + vendor portions
✅ **Kera uses platform Square account** - No OAuth needed
✅ **Other vendors connect via OAuth** - Receive net amounts
✅ **Consolidated payments** - Multiple services combined efficiently
