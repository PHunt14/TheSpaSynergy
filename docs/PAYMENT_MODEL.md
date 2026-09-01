# Payment Model: Staff-Owned Square Accounts

## Overview

The SpaSynergy payment model is built around **staff members owning their own Square accounts**, not vendors. This allows multiple practitioners in a shared space (like a kiosk-based salon) to accept card payments independently while a "house provider" (Stacey) collects facility fees.

## Core Principles

1. **Staff are payment receivers** — Each staff member connects their own Square account via OAuth
2. **Fallback chain prevents failures** — If staff isn't connected, try sibling staff, then vendor, then house
3. **House account is optional** — Only used when a service has a `houseFeeEnabled` and `houseFeeAmount`
4. **Vendor is the business entity** — Groups staff members and manages availability, but doesn't hold Square credentials

---

## Credential Hierarchy

When a payment is made for a service assigned to a staff member, credentials are resolved in this order:

```
1. Assigned staff's Square account
   └─ If: staffId provided + staff.squareAccessToken + staff.squareLocationId valid
   
2. Sibling staff on same vendor
   └─ If: assigned staff has no credentials
   └─ Finds another staff at the same vendor with valid credentials
   
3. Vendor's direct Square credentials
   └─ If: no staff connected at this vendor
   └─ Uses vendor.squareAccessToken + vendor.squareLocationId
   
4. House vendor credentials (only if house fee applies)
   └─ If: service.houseFeeEnabled && service.houseFeeAmount > 0
   └─ Uses house vendor's credentials for the fee split
   
Payment fails if no valid credentials found
```

**Implementation**: [app/utils/paymentRouting.ts](../../app/utils/paymentRouting.ts)

---

## Payment Scenarios

### Scenario 1: Single Staff, No House Fee

**Example**: Massage from Sarah at Winsome Woods

```
Service: 60-min Massage
├─ Price: $65
├─ House fee: None
└─ Assigned staff: Sarah (Winsome Woods)

Credential resolution:
1. Check Sarah's Square → Found! squareAccessToken="sq_...", squareLocationId="loc_..."
2. Payment processed to Sarah's location
   └─ Sarah's Square: $65 charged

Result: Sarah receives $65 in her Square account
```

---

### Scenario 2: Staff + House Fee

**Example**: Massage from Sarah (house fee to Kera, the owner)

```
Service: 60-min Massage
├─ Price: $65
├─ House fee: $20 (enabled)
└─ Assigned staff: Sarah

Credential resolution:
1. Check Sarah's Square → Found!
2. Check house vendor (Kera) for fee split → Found!
3. Split decision:
   └─ If credentials match → Single charge ($65 to Sarah's account)
   └─ If credentials differ → Two charges:
      ├─ Sarah receives: $45 ($65 - $20 fee)
      └─ Kera receives: $20 (house fee)

Implementation: lib/payment/houseFee.ts
```

---

### Scenario 3: Staff Disconnected, Use Sibling Fallback

**Example**: Facial from Jordan (not connected), but Casey (same vendor) is

```
Service: Facial
├─ Price: $85
├─ Assigned staff: Jordan (no Square)
└─ Vendor: Winsome Woods

Credential resolution:
1. Check Jordan's Square → Disconnected ✗
2. Check sibling staff at Winsome Woods → Found Casey with valid token ✓
3. Payment processed to Casey's location
   └─ Casey's Square: $85 charged

Result: Casey's Square receives the payment; Jordan's compensation handled separately
```

---

### Scenario 4: No Staff Connected, Use Vendor Fallback

**Example**: Any service from a vendor with no staff connections

```
Service: Consultation
├─ Price: $50
├─ Assigned staff: None
└─ Vendor: Local Wellness (has squareAccessToken set directly)

Credential resolution:
1. No staff assigned ✗
2. Check vendor's direct credentials → Found! ✓
3. Payment to vendor's Square location

Result: Vendor's Square account receives the payment
```

---

### Scenario 5: Couples Service (Multi-Staff)

**Example**: Couples head bath requiring 2 staff

```
Service: 90-min Couples Head Bath
├─ Price: $150
├─ House fee: $30
├─ Assigned staff: [Sarah, Marcus]

Credential resolution:
1. Collect credentials for Sarah + Marcus
2. Split decision:
   ├─ House fee: $30 → Kera's account
   ├─ Net service: $120 split equally → Sarah ($60) + Marcus ($60)

Execution:
1. Split payment to house → $30
2. Parallel staff payments → $60 each

Implementation: app/api/payment/route.ts processMultiProviderPayment()
```

---

### Scenario 6: No Valid Credentials (Payment Fails)

```
Service: Massage
├─ Price: $65
├─ Assigned staff: Alex (disconnected)
└─ Vendor: Winsome (no direct credentials)

Credential resolution:
1. Alex's Square → Disconnected ✗
2. Sibling staff → None connected ✗
3. Vendor credentials → None ✗
4. House fee credentials → Not applicable (no fee)

Result: Payment rejected
└─ Message: "Card payment not available. Please pay at desk."
└─ Status: 400 Bad Request
```

---

## Database Schema

### StaffSchedule (Staff Member)

```typescript
{
  visibleId: "staff_abc123",
  staffName: "Sarah",
  staffEmail: "sarah@example.com",
  vendorId: "vendor-winsome",
  
  // Square OAuth credentials (per staff member)
  squareAccessToken: "sq_...",          // OAuth token
  squareRefreshToken: "sq_...",         // For token refresh
  squareLocationId: "loc_...",          // Location to charge
  squareMerchantId: "merchant_...",     // Merchant ID
  squareOAuthStatus: "connected",       // "connected" | "error" | "disconnected"
  squareTokenExpiresAt: "2026-09-30T...",
  squareConnectedAt: "2026-08-31T...",
}
```

**Notes**:
- `squareOAuthStatus = "connected"` means OAuth flow completed; token may still be valid
- `squareAccessToken` presence is the actual source of truth for "can process payments"
- Tokens are stored per staff member, not per vendor

### Vendor (Business Entity)

```typescript
{
  vendorId: "vendor-kera",
  name: "The Kera Studio",
  isActive: true,
  isHouse: true,  // Special flag for house vendor
  
  // Direct Square credentials (fallback, set by admin)
  squareAccessToken: "sq_...",    // Rarely used; usually staff-owned
  squareLocationId: "loc_...",    // Fallback location
}
```

**Notes**:
- Vendor credentials are used only as a fallback when no staff is connected
- `isHouse: true` marks the vendor as the facility owner (for house fee recipient)

### Service (Bookable Service)

```typescript
{
  serviceId: "svc_massage_60",
  vendorId: "vendor-winsome",
  name: "60-min Massage",
  price: 65.00,
  
  // House fee configuration
  houseFeeEnabled: true,
  houseFeeAmount: 20,           // Fixed dollar amount
  houseFeePercent: 0,           // Future: percentage-based fees
  
  allowedStaff: ["staff_abc", "staff_def"],  // Staff who can provide this service
}
```

**Notes**:
- `houseFeeAmount` is deducted from the service price when charging
- `houseFeeEnabled` is the kill switch; even if `houseFeeAmount > 0`, no fee if disabled

---

## Token Refresh & Expiry

**Problem**: Square OAuth tokens expire after 30 days. Stale tokens cause payment failures.

**Solution**: Proactive token refresh before expiry

```
Payment flow:
1. Resolve credentials for staff/vendor
2. Check if token expires within 1 hour → Refresh if needed
3. Use fresh token for payment
4. If refresh fails + token is expired → Error to user
```

**Implementation**: 
- [lib/square-token-enhanced.ts](../../lib/square-token-enhanced.ts) — Main refresh logic
- [app/api/payment/route.ts](../../app/api/payment/route.ts) — Calls refresh before payment

**User-facing error**:
> "Square token expired. Please reconnect Square in Dashboard → Settings → My Settings"

---

## Security Considerations

1. **Token Storage**:
   - Tokens stored in DynamoDB (should use encryption at rest)
   - Tokens never logged (sanitizer strips them)
   - Tokens not returned in API responses (only `accessToken` used internally)

2. **Access Control**:
   - Staff can only connect their own Square account via OAuth
   - Admins can view staff connection status (not the token value)
   - Non-admins see only their own staff record

3. **Input Validation**:
   - All payment amounts validated against expected service price (±$0.01 tolerance)
   - Amount bounds enforced: $0.50–$9,999.99
   - Rate limiting: 10 requests per 10 seconds per IP

4. **Audit Trail**:
   - All payments logged with sourceId hash (not full token)
   - Correlation IDs track multi-step payment flows
   - Sanitizer removes sensitive data from logs

---

## Troubleshooting

### "Payment configuration error"
- **Cause**: No valid Square credentials found
- **Fix**: Have assigned staff connect Square via Dashboard → Settings → My Settings

### "Square token expired"
- **Cause**: OAuth token older than 30 days
- **Fix**: Staff member reconnects Square (auto-refresh attempted, but explicit reconnect sometimes needed)

### "Payment unavailable"
- **Cause**: House fee required but house vendor not configured
- **Fix**: Admin must set house vendor credentials in Dashboard → Settings

### "Amount doesn't match — please refresh"
- **Cause**: Client-side amount differs from server-side service price by >$0.01
- **Fix**: Page likely stale; refresh browser and try again

---

## Related Documentation

- [HOUSE_FEE_IMPLEMENTATION.md](./HOUSE_FEE_IMPLEMENTATION.md) — Configuration & examples
- [SQUARE_MULTI_PARTY_PAYMENTS.md](./SQUARE_MULTI_PARTY_PAYMENTS.md) — Payment splitting details
- [KIOSK_CHECKOUT.md](./KIOSK_CHECKOUT.md) — Kiosk payment flow
- [app/utils/paymentRouting.ts](../../app/utils/paymentRouting.ts) — Credential resolution code
