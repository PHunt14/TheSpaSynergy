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

Configure in Dashboard → Services → Edit Service:
1. Check "Enable House Fee"
2. Enter fee amount
3. Dashboard shows "Vendor receives: $XX.XX"

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

## Future Enhancements

- [ ] Percentage-based house fees via `houseFeePercent`
- [ ] Variable rates by service category
- [ ] House fee totals report in dashboard
- [ ] Vendor payout reports showing net amounts
