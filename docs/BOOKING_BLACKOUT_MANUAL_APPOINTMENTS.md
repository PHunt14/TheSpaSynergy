# Booking Blackout & Manual Appointments

## Overview

Two features that work together to support the Vagaro-to-Spa-Synergy calendar transition:

1. **Booking Blackout** — Temporarily disable online booking per-vendor or globally, so no one can book while Vagaro is the active scheduling system
2. **Manual Appointments** — Dashboard users can add appointments directly to the calendar (e.g. to mirror Vagaro bookings, record walk-ins, or block time)

---

## Booking Blackout

### How It Works

- **Vendor-level blackout**: Set a `bookingDisabledUntil` date on a specific vendor. Customers trying to book that vendor see a "call to book" message instead of available times
- **Global blackout**: Set a `globalBookingDisabledUntil` date in `SiteSettings`. Blocks ALL vendors site-wide
- Both are enforced at two layers:
  1. **Availability API** — returns empty slots + `bookingDisabled: true` flag
  2. **Appointment creation API** — rejects POST requests with 403

### Blackout Behavior

| Scenario | Customer sees |
|----------|--------------|
| No blackout | Normal time slot picker |
| Vendor blackout active | "Online booking is not available" + phone number + resume date |
| Global blackout active | Same message, applies to all vendors |
| Both set | Global takes precedence (checked first) |

### Setting Blackout via Dashboard

1. Go to **Dashboard → Settings → Vendor Settings** tab
2. Scroll to **Booking Blackout** section
3. Pick a date — booking is disabled through end of that day (11:59 PM)
4. Click **Save**
5. To re-enable early, click **Re-enable Booking** or clear the date and save

For global blackout (admin only):
1. Go to **Dashboard → Settings → Building Settings** tab
2. Same workflow — affects all vendors

### Setting Blackout via API

```bash
# Vendor blackout
curl -X POST /api/booking-blackout \
  -H "Content-Type: application/json" \
  -d '{"vendorId": "vendor-kera-studio", "scope": "vendor", "disabledUntil": "2025-08-01T23:59:59.000Z"}'

# Global blackout
curl -X POST /api/booking-blackout \
  -H "Content-Type: application/json" \
  -d '{"scope": "global", "disabledUntil": "2025-08-01T23:59:59.000Z"}'

# Clear blackout (pass null)
curl -X POST /api/booking-blackout \
  -H "Content-Type: application/json" \
  -d '{"vendorId": "vendor-kera-studio", "scope": "vendor", "disabledUntil": null}'

# Check current blackout status
curl "/api/booking-blackout?vendorId=vendor-kera-studio"
```

### Vagaro Transition Workflow

1. Admin sets **global blackout** to a date in the future (e.g. 2 weeks out)
2. During that window, vendors continue using Vagaro for scheduling
3. Vendors manually add Vagaro bookings to the Spa Synergy calendar using **Add Appointment**
4. When ready to go live, admin clicks **Re-enable All Booking**
5. Customers can now book online through Spa Synergy

---

## Manual Appointments

### How It Works

Dashboard users can add appointments directly without going through the customer booking flow. These appointments:
- Show up in the appointments table like any other booking
- Block the time slot in the availability system (so customers can't double-book)
- Are marked as `confirmed` immediately
- Have `isManual: true` in the customer data for easy identification

### Adding a Manual Appointment

1. Go to **Dashboard → Appointments**
2. Click **+ Add Appointment**
3. Fill in:
   - **Date & Time** (required) — when the appointment is
   - **Service** (optional) — select from vendor's services, or leave as "None" for a generic time block
   - **Staff Member** (optional) — assign to a specific staff member
   - **Customer Name** (optional) — e.g. "Jane Doe", "Vagaro booking", "Walk-in"
   - **Phone** (optional)
   - **Notes** (optional) — e.g. "Booked via Vagaro", "recurring client"
4. Click **Add Appointment**

### Manual Appointment API

```bash
curl -X POST /api/appointments/manual \
  -H "Content-Type: application/json" \
  -H "Cookie: <auth-cookies>" \
  -d '{
    "vendorId": "vendor-kera-studio",
    "serviceId": "service-haircut",
    "staffId": "staff-jane",
    "dateTime": "2025-07-15T14:00:00",
    "customerName": "Walk-in client",
    "customerPhone": "2401234567",
    "notes": "Booked via Vagaro"
  }'
```

Only `vendorId` and `dateTime` are required. Everything else is optional.

### Authorization

| Role | Can add to |
|------|-----------|
| Admin | Any vendor |
| Owner | Their own vendor |
| Vendor | Their own vendor only |

---

## Data Model Changes

### Vendor (updated)

| Field | Type | Description |
|-------|------|-------------|
| `bookingDisabledUntil` | String (ISO date) | When set and in the future, online booking is blocked for this vendor |

### SiteSettings (new)

| Field | Type | Description |
|-------|------|-------------|
| `settingKey` | String (PK) | Setting identifier, e.g. `globalBookingDisabledUntil` |
| `settingValue` | String | The setting value (ISO date string for blackout) |

---

## API Reference

### GET /api/booking-blackout

Query params: `vendorId` (optional)

Response:
```json
{
  "globalDisabledUntil": "2025-08-01T23:59:59.000Z",
  "vendorDisabledUntil": "2025-07-20T23:59:59.000Z"
}
```

### POST /api/booking-blackout

Body:
```json
{
  "scope": "vendor",
  "vendorId": "vendor-kera-studio",
  "disabledUntil": "2025-08-01T23:59:59.000Z"
}
```

- `scope`: `"vendor"` or `"global"`
- `disabledUntil`: ISO date string, or `null` to clear

### POST /api/appointments/manual

Body:
```json
{
  "vendorId": "vendor-kera-studio",
  "serviceId": "service-haircut",
  "staffId": "staff-jane",
  "dateTime": "2025-07-15T14:00:00",
  "customerName": "Walk-in",
  "customerPhone": "2401234567",
  "customerEmail": "client@example.com",
  "notes": "Booked via Vagaro"
}
```

Required: `vendorId`, `dateTime`. All other fields optional.

---

## Testing

### Manual Testing Checklist

**Blackout — Vendor Level**
- [ ] Set vendor blackout date in Settings → verify availability API returns `bookingDisabled: true`
- [ ] Try to book that vendor → see "booking not available" message with phone number and resume date
- [ ] Other vendors remain bookable
- [ ] Clear blackout → booking works again
- [ ] Expired blackout date (in the past) → booking works normally

**Blackout — Global**
- [ ] Set global blackout as admin → all vendors return empty availability
- [ ] Non-admin cannot set global blackout (403)
- [ ] Clear global blackout → all vendors bookable again
- [ ] Vendor blackout + global blackout → global takes precedence

**Blackout — API Enforcement**
- [ ] POST to `/api/appointments` during vendor blackout → 403
- [ ] POST to `/api/appointments` during global blackout → 403
- [ ] POST to `/api/appointments/manual` during blackout → succeeds (manual bypasses blackout)

**Manual Appointments**
- [ ] Add manual appointment with all fields → appears in appointments table
- [ ] Add manual appointment with only date/time → appears as "Manual Entry"
- [ ] Manual appointment blocks the time slot in availability API
- [ ] Vendor role can only add to their own vendor
- [ ] Admin can add to any vendor
- [ ] Unauthenticated request → 401

### Automated Testing

The blackout logic is enforced in the API routes. To test programmatically:

```javascript
// Test availability returns bookingDisabled when vendor has blackout
const res = await fetch('/api/availability?vendorId=test&serviceId=test&date=2025-07-15')
const data = await res.json()
assert(data.bookingDisabled === true)
assert(data.availableSlots.length === 0)

// Test appointment creation is blocked
const aptRes = await fetch('/api/appointments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ vendorId: 'test', serviceId: 'test', dateTime: '2025-07-15T10:00:00', customer: { name: 'Test' } })
})
assert(aptRes.status === 403)

// Test manual appointment bypasses blackout
const manualRes = await fetch('/api/appointments/manual', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ vendorId: 'test', dateTime: '2025-07-15T10:00:00' })
})
assert(manualRes.status === 200)
```

---

## Files Changed

| File | Change |
|------|--------|
| `amplify/data/resource.ts` | Added `bookingDisabledUntil` to Vendor, added `SiteSettings` model |
| `app/api/availability/route.ts` | Check global + vendor blackout before generating slots |
| `app/api/appointments/route.ts` | Reject bookings during blackout |
| `app/api/booking-blackout/route.ts` | New — GET/POST blackout settings |
| `app/api/appointments/manual/route.ts` | New — POST manual appointments |
| `app/components/BookingDisabled.jsx` | Added `disabledUntil` prop to show resume date |
| `app/booking/time/page.jsx` | Handle `bookingDisabled` response from availability API |
| `app/dashboard/settings/page.jsx` | Added blackout controls (vendor + global) |
| `app/dashboard/appointments/page.jsx` | Added "Add Appointment" button + modal form |
