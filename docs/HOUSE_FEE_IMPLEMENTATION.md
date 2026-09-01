# House Fee Implementation

## Business Model

**The Kera Studio** owns the physical space and leases rooms to other vendors. When a subletting vendor's service is booked, the house automatically receives a fee.

| Vendor | Relationship | Pays House Fee? |
|--------|-------------|-----------------|
| The Kera Studio | Owns space (`isHouse: true`) | No |
| Winsome Woods | Subletting | Yes |
| Selene Glow Studio | Subletting | Yes |

## Configuration

### Vendor Model
```javascript
{ vendorId: 'vendor-kera', name: 'The Kera Studio', isHouse: true }
```

### Service Model
```javascript
{
  serviceId: 'svc-winsome-massage-60',
  vendorId: 'vendor-winsome',
  price: 65,
  houseFeeEnabled: true,
  houseFeeAmount: 20,    // fixed dollar amount
  houseFeePercent: 0,    // percentage (future use)
}
```

## Dashboard Configuration

### Step 1: Enable House Fee on a Service (Coming Soon)

**Note**: The Dashboard UI for house fee configuration is planned for Q3 2026. For now, follow the API steps below or contact your administrator.

**Future UI Path**: Dashboard → Services → [Select Service] → Enable House Fee

**API method** (admin only):
```bash
curl -X PATCH https://your-domain/api/services \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "serviceId": "svc-winsome-massage-60",
    "houseFeeEnabled": true,
    "houseFeeAmount": 20
  }'
```

### Step 2: Configure House Vendor Square Credentials

**Path**: Dashboard → Settings → Vendor Settings → [Select House Vendor]

1. Log in to Dashboard as Admin
2. Go to **Settings → Vendor Settings** tab
3. In the vendor selector dropdown, find and select your house vendor (e.g., "The Kera Studio")
4. Scroll to **Square Account** section
5. Enter:
   - **Kiosk Payment Credentials** (house vendor's Square info)
   - Credentials can be set via OAuth (recommended) or directly as a fallback

**Option A: OAuth (Recommended)**
- Click **"Connect Square"** button
- Authorize the house vendor's Square account
- Dashboard will save `squareAccessToken`, `squareLocationId`, and token expiry

**Option B: Direct Credentials (Fallback)**
- Enter `squareAccessToken` and `squareLocationId` directly
- Use this if OAuth needs to be bypassed
- Note: Tokens will not auto-refresh; you must manually update when they expire

### Step 3: Verify Configuration

**Test**: Create an appointment for a service with house fee enabled and pay with a test card

**Verify in Square Dashboard**:
1. Log in to house vendor's Square account (e.g., Kera's account)
2. Go to **Transactions** or **Customers**
3. Look for a charge matching the house fee amount (e.g., $20)
4. If found: ✅ House fee is being routed correctly

**If house fee doesn't appear**:
- Check: `houseFeeEnabled: true` on the service
- Check: `houseFeeAmount > 0` on the service
- Check: House vendor has valid `squareAccessToken` and `squareLocationId`
- Check: Staff member has valid Square credentials (for the service portion to charge)

## Payment Flow Examples

### Single service with house fee
```
Massage from Winsome: $65
  → Kera (house fee): $20
  → Winsome (net):    $45
```

### Service without house fee
```
Facial from Kera: $65
  → Kera: $65 (single payment, no split)
```

### Bundle with mixed vendors
```
Massage (Winsome): $65  →  Kera fee: $20, Winsome: $45
Facial (Kera):     $65  →  Kera: $65

Total: $130
  → Kera receives:    $85 ($20 fee + $65 service)
  → Winsome receives: $45
```

### Multiple services, same vendor
```
Massage 60min (Winsome): $65   →  Kera fee: $20, Winsome: $45
Massage 90min (Winsome): $120  →  Kera fee: $30, Winsome: $90

Total: $185
  → Kera receives:    $50 (fees consolidated)
  → Winsome receives: $135 (net consolidated)
```

## Implementation

The `calculatePaymentSplits` utility handles all splitting logic:

```javascript
import { calculatePaymentSplits } from '@/app/utils/payment';

const { total, splits } = calculatePaymentSplits(services, 'vendor-kera');
// splits: [
//   { vendorId: 'vendor-kera', amount: 85, isHouseFee: true },
//   { vendorId: 'vendor-winsome', amount: 45, isHouseFee: false }
// ]
```

The payment API then:
1. Makes the house vendor the primary recipient (keeps their portion)
2. Splits remaining amounts to other vendors via Square's `additionalRecipients`

## Why Kera's Square Account Is the Platform Account

- Kera is the merchant of record
- House fees automatically stay in Kera's account
- Kera sees all transactions in their Square dashboard
- Proper tax reporting under Kera's business entity
- Other vendors connect via OAuth and receive net amounts

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "House vendor not configured" | Ensure one vendor has `isHouse: true` in the database |
| House fees not splitting | Check service has `houseFeeEnabled: true` and `houseFeeAmount` set |
| Vendor receives wrong amount | Verify: vendor amount = price - houseFeeAmount |
| Kiosk shows "Card payment not available" on house-fee services | Ensure the house vendor record has `squareAccessToken` and `squareLocationId` set. `squareOAuthStatus` does not need to be `'connected'` — the house vendor's credentials are stored directly on the Vendor record, not via the staff OAuth flow. Check Dashboard → Settings → Vendor Settings for the house vendor. |

## Future Enhancements

- [ ] Percentage-based house fees via `houseFeePercent`
- [ ] Variable rates by service category
- [ ] House fee totals report in dashboard
- [ ] Vendor payout reports showing net amounts
