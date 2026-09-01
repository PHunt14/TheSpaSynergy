# Payment System & Provider Dashboard Review

## Executive Summary

The payment routing fix aligns the system with the staff-owned Square model correctly. The provider dashboard is **minimally connected** to the payment system and mostly handles **staff/vendor management** rather than payment operations. Below are actionable recommendations for cleanup, documentation, security hardening, and optimization.

---

## 1. Dashboard Reconnection & Cleanup

### 1.1 Current State: Minimal Payment Visibility
The dashboard shows:
- ✅ **Transactions view** (`/dashboard/transactions`) — lists appointments by date with payment status badges
- ✅ **Staff status** — shows `💳 Square` / `💳 No Square` indicator per staff
- ✅ **Staff connection** — My Settings allows staff to connect/disconnect Square OAuth
- ❌ **No house fee configuration in UI** — house fee setup only possible via code/API
- ❌ **No payment ledger/payout report** — users cannot see payment splits or settlement
- ❌ **No house vendor Square setup flow** — house vendor credentials must be set directly in DB

### 1.2 Recommended Reconnections & Cleanup

| Item | Type | Impact | Action |
|------|------|--------|--------|
| **House Fee Service Configuration** | UI | HIGH | Add checkbox + amount field to Dashboard → Services → Edit Service for `houseFeeEnabled` and `houseFeeAmount` |
| **House Vendor Credentials Setup** | UI | HIGH | Add Dashboard → Settings → Vendor Settings tab for house vendor to enter Square credentials directly (like regular vendor) |
| **Payment Ledger/Settlement** | UI | MEDIUM | Add Dashboard → Payments → Ledger view showing: per-appointment splits, house fee amounts, net received, settlement status |
| **Staff Square Status Clarity** | UX | LOW | Clarify in MySettings that "disconnected" means no online card payments, not that staff cannot work |
| **Dashboard → Transactions** | Cleanup | LOW | Currently shows all vendors to admins; consider staff-level filtering to show only their appointments |
| **Remove Vendor Settings Upload Flow** | Security | LOW | Some older Vendor Settings code may support file uploads — verify and remove if unused |

---

## 2. Documentation Gaps

### 2.1 Missing Docs

| Document | Purpose | Users | Priority |
|----------|---------|-------|----------|
| **PAYMENT_MODEL.md** | Staff-owned Square model, credential fallback chain, house fee logic | Staff, admins, developers | **CRITICAL** |
| **HOUSE_FEE_DASHBOARD_CONFIG.md** | Step-by-step: enable house fee on a service, configure house vendor credentials | Staff, admins | **HIGH** |
| **PAYMENT_ROUTING_INTERNALS.md** | How `/api/payment/route.ts` resolves credentials, how `app/utils/paymentRouting.ts` works | Developers | **MEDIUM** |
| **DASHBOARD_PAYMENT_FEATURES.md** | What dashboard views exist for payments, what's missing, roadmap | PMs, developers | **MEDIUM** |

### 2.2 Recommendations

**1. Update [docs/SQUARE_MULTI_PARTY_PAYMENTS.md](docs/SQUARE_MULTI_PARTY_PAYMENTS.md):**
   - Add section: "**Staff-Owned Model**" — explain that staff members hold the Square credentials, not the vendor
   - Add section: "**House Fee Credentials**" — when Stacey (house) is needed and where her credentials are stored
   - Add decision tree: "When does a payment need the house vendor?"

**2. Update [docs/HOUSE_FEE_IMPLEMENTATION.md](docs/HOUSE_FEE_IMPLEMENTATION.md):**
   - Add section: "**Dashboard Configuration**" — checkboxes and fields to enable house fees
   - Add troubleshooting: "House fee isn't deducting" → check service has `houseFeeEnabled: true` and house vendor has credentials
   - Add note: "House vendor credentials are stored directly on Vendor record, NOT via OAuth"

**3. Create [docs/PAYMENT_MODEL.md](docs/PAYMENT_MODEL.md):**
   ```
   # Payment Model: Staff-Owned Square Accounts

   ## Overview
   - Staff members (not vendors) own Square accounts
   - Payments are routed to staff's Square location
   - House account (Stacey) collects house fees only
   - Fallback chain prevents payment failures

   ## Credential Hierarchy (per appointment)
   1. Assigned staff's Square account (if connected + valid)
   2. Sibling staff on same vendor (if connected + valid)
   3. Vendor's direct Square credentials (if present)
   4. House vendor's credentials (only if houseFeeEnabled && houseFeeAmount > 0)

   ## Scenarios
   - [staff has Square, no house fee] → pay to staff
   - [staff has Square, house fee exists] → split: staff gets (price - fee), house gets fee
   - [staff no Square, vendor has credentials] → pay to vendor (staff doesn't get direct payment)
   - [no valid credentials] → payment fails, customer pays in-person

   See: app/utils/paymentRouting.ts, lib/payment/houseFee.ts
   ```

**4. Create [docs/HOUSE_FEE_DASHBOARD_CONFIG.md](docs/HOUSE_FEE_DASHBOARD_CONFIG.md):**
   ```
   # Configuring House Fees in the Dashboard

   ## Enable House Fee on a Service
   1. Go to Dashboard → Services
   2. Click on a service to edit
   3. Check "Enable House Fee"
   4. Enter fee amount (e.g., $20)
   5. Save
   6. Dashboard will show "Vendor receives: $45" (if service is $65)

   ## Configure House Vendor Credentials
   (Currently not in dashboard — requires API/DB access)
   
   House vendor must have:
   - squareAccessToken
   - squareLocationId
   - (Optional: squareOAuthStatus = 'connected' for OAuth flow)
   
   For now, set these on the Vendor record directly in the database or via admin API.
   In the future, this should have a dedicated Dashboard UI under Settings → Vendor Settings.

   ## Test House Fee Split
   1. Create an appointment for a service with house fee enabled
   2. Pay with card at checkout
   3. In Square Dashboard for Kera (house):
      - You should see $20 transaction (or $10 if two staff split it)
   4. In Square Dashboard for staff:
      - You should see $45 transaction (or net amount after split)
   ```

---

## 3. Security Improvements

### 3.1 Critical Issues (Must Fix Before Production)

| Issue | Severity | Impact | Fix |
|-------|----------|--------|-----|
| **No input validation on payment routes** | CRITICAL | Attacker can send invalid amounts, bypass pricing | ✅ Already done: `validatePaymentAmount`, `validateTipAmount` in place. Add stricter amount range checks. |
| **Square tokens can leak in logs** | CRITICAL | Tokens in error messages → credential theft | ✅ Partial: Sanitizer strips tokens from logs. Verify no `accessToken` in error responses. |
| **Dashboard staff list shows token status in UI** | MEDIUM | Token status visible to all dashboard users | 🔧 **TODO**: Hide token status from non-admin roles; only show to staff member themselves |
| **Payment API has no CSRF protection** | MEDIUM | Form-based CSRF attack possible if called from browser | ✅ Mitigated: API is called from Next.js server-side, not browser. Verify CORS is restrictive. |
| **No rate limiting on `/api/payment`** | MEDIUM | Brute-force / DoS on payment endpoints | 🔧 **TODO**: Add `express-rate-limit` or API Gateway throttling |
| **Payment service doc mentions no authentication** | HIGH | Standalone payment service has zero auth | 🔧 **TODO**: If extracted to standalone service, add API key or JWT validation |

### 3.2 Recommended Security Hardening

**1. Token Exposure — Dashboard Staff List**
   - **Issue**: [app/dashboard/staff/page.jsx](app/dashboard/staff/page.jsx#L683) shows `s.squareAccessToken` to determine the badge
   - **Fix**: Only display badge if user is that staff member OR is admin; hide from other staff
   ```jsx
   // Before
   {s.squareAccessToken
     ? <span>💳 Square</span>
     : <span>💳 No Square</span>
   }
   
   // After
   {(currentUser.email === s.staffEmail || currentUser.role === 'admin')
     ? (s.squareAccessToken ? <span>💳 Square</span> : <span>💳 No Square</span>)
     : null
   }
   ```

**2. Token in Error Responses**
   - **Audit**: Ensure `app/api/payment/route.ts` never returns `accessToken` or `squareAccessToken` in error responses
   - **Current**: Good — errors use `details` strings, not tokens
   - **Verify**: Check all error paths in payment routes:
     ```bash
     grep -r "accessToken\|squareAccessToken" app/api/payment/ | grep -v "const\|let\|="
     ```
     Should only show variable assignments, not returns

**3. Dashboard Access Control**
   - **Add**: Role check on dashboard API routes to ensure user can only see their vendor's data
   - **Current**: [app/api/dashboard/transactions/route.ts](app/api/dashboard/transactions/route.ts) shows all vendors to all authenticated users
   - **Fix**: Modify to filter by `currentUser.vendorId` for non-admin roles:
     ```ts
     let vendorsToQuery = activeVendors;
     if (currentUser.role === 'vendor' || currentUser.role === 'staff') {
       vendorsToQuery = activeVendors.filter(v => v.vendorId === currentUser.vendorId);
     }
     ```

**4. Rate Limiting**
   - **Add to** `/api/payment`, `/api/payment/split`, `/api/payment/custom`, `/api/square/connect`
   - **Recommended**: 10 requests per 10 seconds per IP (payment attempts)
   ```ts
   import rateLimit from 'express-rate-limit';
   
   const paymentLimiter = rateLimit({
     windowMs: 10 * 1000, // 10 seconds
     max: 10,
     message: 'Too many payment attempts. Please try again later.',
   });
   
   app.post('/api/payment', paymentLimiter, POST);
   ```

**5. Request Size Limits**
   - **Add**: Validate that `sourceId` (Square nonce) is reasonably sized (max 100 chars)
   - **Current**: No check; nonce could be megabytes
   - **Fix**: Use middleware to limit JSON body size to 1 MB:
     ```ts
     import express from 'express';
     app.use(express.json({ limit: '1mb' }));
     ```

---

## 4. Optimizations

### 4.1 Dashboard Performance Issues

| Issue | Severity | Impact | Solution |
|-------|----------|--------|----------|
| **N+1 query in transactions endpoint** | MEDIUM | Fetches every service + staff record individually | Batch-load service/staff; use Promise.all correctly (already done, but verify indexes exist in DynamoDB) |
| **No pagination on transactions view** | MEDIUM | Loads all appointments for a day at once | Add `limit` + `nextToken` pagination; load 50 at a time |
| **Service/staff data refetched on each request** | LOW | Redundant DB calls for the same services | Cache in-memory for 5 minutes or add DynamoDB stream invalidation |
| **No GSI for staff-by-vendor** | MEDIUM | `listStaffScheduleByVendorId` may full-table scan | Verify GSI exists in `amplify/data/resource.ts`; may already exist |

### 4.2 Recommended Optimizations

**1. Add Pagination to Transactions View**
   ```jsx
   // app/dashboard/transactions/page.jsx
   const [transactions, setTransactions] = useState([]);
   const [nextToken, setNextToken] = useState(null);
   const [hasMore, setHasMore] = useState(false);
   
   const loadTransactions = async (token) => {
     const params = new URLSearchParams({ startDate, endDate });
     if (token) params.set('nextToken', token);
     
     const res = await fetch(`/api/dashboard/transactions?${params}`);
     const data = await res.json();
     setTransactions(data.transactions);
     setNextToken(data.nextToken);
     setHasMore(!!data.nextToken);
   };
   ```

**2. Cache Service/Staff Lookups**
   ```ts
   // app/api/dashboard/transactions/route.ts
   // Replace individual fetches with batch + cache
   
   const serviceCache = new Map();
   const staffCache = new Map();
   
   async function getService(id) {
     if (serviceCache.has(id)) return serviceCache.get(id);
     const { data } = await client.models.Service.get({ serviceId: id });
     serviceCache.set(id, data);
     return data;
   }
   ```

**3. Verify DynamoDB Indexes**
   - Check `amplify/data/resource.ts` for these indexes:
     - `Appointment` → GSI on `vendorId` + `dateTime` (for date range queries) ✅
     - `StaffSchedule` → GSI on `vendorId` + `visibleId` (for `listStaffScheduleByVendorId`) — verify exists
     - `Service` → GSI on `vendorId` (for service lookups by vendor) — verify exists
   - Use AWS Console → DynamoDB → Tables → Indexes to confirm

**4. Batch Payment Data Enrichment**
   ```ts
   // Current: O(n) fetches for each appointment
   // Optimized: Batch fetch all unique IDs, then map
   
   const uniqueServiceIds = [...new Set(filtered.map(a => a.serviceId))];
   const serviceData = await Promise.all(
     uniqueServiceIds.map(id => client.models.Service.get({ serviceId: id }))
   );
   const serviceMap = new Map(serviceData.map(({ data }) => [data.serviceId, data]));
   ```
   Already partially done; verify it's used throughout.

---

## 5. Test Coverage Gaps

### 5.1 Missing Dashboard Tests

| Feature | Type | Priority | Notes |
|---------|------|----------|-------|
| **Transactions by date/status filter** | Unit | MEDIUM | Test endpoint with `status`, `paymentStatus` filters |
| **Staff Square connection flow** | Integration | MEDIUM | Mock Cognito, verify staff can toggle Square connection |
| **House fee display in service edit** | Component | MEDIUM | Currently no UI; test once added |
| **Payment ledger view** | Integration | HIGH | Once dashboard ledger is built, full E2E test |
| **Role-based access** | Security | HIGH | Test vendor/staff cannot see other vendors' data |
| **Dashboard redirects for legacy vendor URLs** | Routing | LOW | ✅ Already tested in redirect tests |

### 5.2 Recommendations

Create `__tests__/integration/dashboardPayments.test.mjs`:
```javascript
describe('Dashboard Payment Features', () => {
  it('filters transactions by date range', async () => {
    // Fetch /api/dashboard/transactions?startDate=...&endDate=...
  });

  it('shows only vendor data to vendor-role users', async () => {
    // Mock vendor cognito token, verify only vendor A's data returned
  });

  it('enumerates staff and enriches with payment status', async () => {
    // Verify staff list shows square connection status
  });
});
```

---

## 6. Actionable Checklist

### High Priority (Do First)
- [ ] **Add house fee configuration to Dashboard → Services** (`houseFeeEnabled`, `houseFeeAmount` fields)
- [ ] **Add house vendor Square credentials input** to Dashboard → Settings → Vendor Settings
- [ ] **Fix token exposure** in staff list — hide from non-admin/non-self
- [ ] **Create [docs/PAYMENT_MODEL.md](docs/PAYMENT_MODEL.md)** explaining staff-owned credentials
- [ ] **Update [docs/HOUSE_FEE_IMPLEMENTATION.md](docs/HOUSE_FEE_IMPLEMENTATION.md)** with dashboard config steps
- [ ] **Add pagination** to dashboard transactions endpoint + UI
- [ ] **Verify DynamoDB indexes** exist for vendor + date range queries

### Medium Priority (Nice to Have)
- [ ] Add rate limiting to `/api/payment` routes
- [ ] Add payment ledger view to dashboard (shows splits, house fees, settlements)
- [ ] Role-based filtering: vendor-role users see only their vendor data
- [ ] Create dashboard integration tests for payment flows
- [ ] Cache service/staff lookups in transactions endpoint
- [ ] Add staff SMS/email notification when Square connects/disconnects

### Low Priority (Future)
- [ ] Add payout/settlement reports (monthly reconciliation)
- [ ] Percentage-based house fees (`houseFeePercent`) UI
- [ ] Payment refund flow in dashboard (currently no UI)
- [ ] Webhook event log viewer

---

## 7. Summary: What's Working vs. What Needs Work

| Area | Status | Notes |
|------|--------|-------|
| **Payment routing (staff-owned model)** | ✅ FIXED | Credentials resolve correctly; fallback chain works |
| **House fee split logic** | ✅ FIXED | Correct deduction; tests passing |
| **Kiosk checkout** | ✅ WORKING | End-to-end payment flow proven |
| **Booking-time card payment** | ✅ WORKING | `app/booking/confirm/page.jsx` integrates correctly |
| **Dashboard transactions view** | ✅ BASIC | Shows appointments + payment status; no splits/ledger |
| **Staff Square connection in dashboard** | ✅ BASIC | MySettings allows connect/disconnect; "No Square" indicator shown |
| **House fee service configuration** | ❌ MISSING | No dashboard UI; must edit DB directly |
| **House vendor Square setup** | ❌ MISSING | No dashboard UI; must set credentials in DB directly |
| **Payment ledger/settlement** | ❌ MISSING | No dashboard view of splits or payouts |
| **Documentation of payment model** | ⚠️ PARTIAL | HOUSE_FEE_IMPLEMENTATION.md exists; PAYMENT_MODEL.md missing |
| **Dashboard test coverage** | ⚠️ MINIMAL | Only redirect tests; no payment feature tests |

---

## Next Steps

1. **Immediate**: Run all payment tests to confirm current state:
   ```bash
   npm test -- --selectProjects unit integration --testNamePattern "payment|routing|house|kiosk|split"
   ```

2. **This week**: Build dashboard UI for house fee config (service) + house vendor credentials

3. **Next week**: Create PAYMENT_MODEL.md doc + update HOUSE_FEE_IMPLEMENTATION.md

4. **Then**: Add dashboard integration tests + pagination

5. **Finally**: Build payment ledger view for staff payouts
