# Rollout Plan: Unified Business Model & Sequential Booking Fix

## Overview

This rollout includes:
1. **Sequential booking fix** — Multi-service bookings are now placed back-to-back instead of all at the same time
2. **Service category management** — Categories are managed from a dedicated table with admin UI in Settings
3. **ServiceCatalog refactoring** — Public services page uses flat category grouping (no vendor names)
4. **Resource type fix** — Spa Room is now selectable in the service editor
5. **Settings restructure** — Admin-only options consolidated under a single "Admin" tab
6. **Terminology rebrand** — "Vendor" → "Provider" in public-facing UI and routes

---

## Pre-Deploy Checklist

- [ ] All tests pass (`npm run test:coverage`)
- [ ] Verify `amplify/data/resource.ts` has `ServiceCategory` model and `categories` array on `Service`
- [ ] Verify `amplify/data/resource.ts` has `allowedStaff` array on `Service`
- [ ] Confirm the Amplify schema is already deployed (ServiceCategory table exists in production DynamoDB)
- [ ] `amplify_outputs_main.json` points at the correct production backend
- [ ] Merge branch into main

---

## Deploy Steps

### Step 1: Deploy the code

Push to main / trigger Amplify build. The code is safe to deploy without running migration first because:

- `ServiceCatalog` component falls back to legacy `category` (string) field if `categories` (array) is empty
- `/api/categories` endpoint falls back to extracting categories from services if `ServiceCategory` table is empty
- Sequential booking fix and resource type fix are pure improvements with no data dependency

### Step 2: Run the category migration (immediately after deploy)

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/migrate-categories-prod.mjs
```

This script (idempotent, safe to run multiple times):
1. Reads all existing services from production
2. Extracts unique category names from the legacy `category` field
3. Creates `ServiceCategory` records in DynamoDB
4. Updates each service's `categories` array from the legacy `category` string

**Expected output:**
```
🔄 Starting category migration for production...
  Found ~75 services
  Found ~12 unique categories: Facial Rituals, Hair Ritual Add-ons, Hair Rituals, ...

── Creating ServiceCategory records ──
  ✓ Created: Facial Rituals (cat-facial-rituals)
  ✓ Created: Hair Studio (cat-hair-studio)
  ...

── Updating services with categories array ──
  ✓ Massage - 30 min: "Massage" → ["Massage"]
  ✓ Head Bath: "Spa Room" → ["Spa Room"]
  ...

✅ Migration complete!
```

### Step 3: Run the staff assignment migration

```bash
# First do a dry run to review changes
NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/migrate-staff-assignments-prod.mjs --dry-run

# If the output looks correct, run for real
NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/migrate-staff-assignments-prod.mjs
```

This script (idempotent, safe to run multiple times):
1. Reads all services and staff from production
2. For services WITHOUT `allowedStaff`, infers staff from legacy `vendorId` (all active staff under that vendor)
3. Creates the `resource-sauna` StaffSchedule record if it doesn't already exist (using the vendor that owns sauna-type services)
4. Sauna-type services get assigned to `resource-sauna`
5. Services that already have `allowedStaff` populated are SKIPPED (never overwrites)
6. Services with no `vendorId` and no `allowedStaff` are flagged for manual review

**Expected output:**
```
🔄 Starting staff assignment migration for production...
  Found ~75 services
  Found ~5 staff members

── Vendor → Staff mapping ──
  vendor-kera-studio: [Stacey, Trinity]
  vendor-winsome-woods: [Makaila]
  vendor-selene-glow-studio: [Jylian]

── Processing services ──
  ✓ Massage - 30 min: assigned → [staff-winsome-makaila]
  ✓ Facial: assigned → [staff-kera-stacey, staff-selene-jylian]
  ⏭ Trim: already has allowedStaff [staff-kera-stacey, staff-kera-trinity]
  ✓ Sauna - 25 min: assigned → [resource-sauna]
  ...

✅ Migration complete!
   45 services updated with allowedStaff
   30 services skipped (already assigned or inactive)
```

**Important:** Always run with `--dry-run` first to verify the assignments look correct. The script never deletes or overwrites existing `allowedStaff` arrays.

### Step 4: Verify in production

- [ ] Visit `/services` — services should be grouped by category (Hair Studio, Massage, Spa Room, etc.)
- [ ] Visit `/spa-room` — spa room services should appear and booking should work
- [ ] Visit `/sauna` — sauna services should appear
- [ ] Dashboard → Settings → Admin → Categories — should show all categories
- [ ] Dashboard → Services → Edit a service — category dropdown should show predefined categories
- [ ] Dashboard → Services → Edit a service — "Allowed Staff" field should show the assigned team members
- [ ] Book a service — provider selection should only show staff in that service's `allowedStaff`
- [ ] Book a multi-service appointment — verify calendar shows sequential times (not overlapping)

---

## What Changed (Code)

### Bug Fixes
| File | Change |
|------|--------|
| `app/api/bundle-availability/route.ts` | Returns full schedule (per-service start times) in slot response |
| `app/booking/bundle-time/page.jsx` | Passes schedule to confirm page via URL param |
| `app/booking/confirm/page.jsx` | Uses per-service start time when creating appointments (sequential) |
| `app/components/ResourceBookingPage.jsx` | Fixed routing from `/booking/time?vendor=` to `/booking/provider?service=` |
| `app/dashboard/services/page.jsx` | Fixed focus loss bug (nested component → inline JSX), added Spa Room to resource type dropdown |

### New Features
| File | Change |
|------|--------|
| `app/api/categories/route.ts` | New API: GET (list), POST (create), DELETE categories |
| `app/dashboard/settings/CategorySettings.jsx` | Category management UI (add/delete) |
| `app/dashboard/settings/AdminSettings.jsx` | Consolidated admin section (Categories, Provider Settings, Building & Hours) |
| `app/dashboard/settings/page.jsx` | Two tabs: My Settings + Admin (admin-only) |

### Data Model Compatibility
| File | Change |
|------|--------|
| `app/components/ServiceCatalog.jsx` | Falls back to legacy `category` string if `categories` array is empty |
| `app/api/categories/route.ts` | Falls back to extracting from services if ServiceCategory table is empty |
| `app/dashboard/services/page.jsx` | Category dropdown loads from `/api/categories` (with fallback) |

### Migration Scripts
| File | Purpose |
|------|---------|
| `scripts/migrate-categories-prod.mjs` | One-time: seeds ServiceCategory table + populates categories array on services |
| `scripts/migrate-staff-assignments-prod.mjs` | One-time: populates allowedStaff arrays from legacy vendor ownership |
| `scripts/seed-dev.js` | Dev/sandbox seeding with full unified model data |

---

## Rollback Plan

If something goes wrong:

1. **Code rollback** — Revert to previous commit. The legacy `category` field is untouched by the migration, so the old code will still work.
2. **Data is safe** — Both migrations only ADD data (new `ServiceCategory` records, `categories` array, `allowedStaff` array). They never delete existing fields or overwrite populated arrays.
3. **Staff assignment rollback** — If `allowedStaff` causes incorrect provider filtering, you can set it back to `null` on specific services via Dashboard → Services → Edit. A `null` allowedStaff means "all staff" (open assignment).
4. **Sequential booking** — If the schedule param is missing (old links/bookmarks), the confirm page falls back to the original behavior (same start time). This means old in-flight bookings still work.

---

## Post-Deploy (Optional, Non-Urgent)

These can be done anytime after the rollout is stable:

- [ ] Consolidate duplicate categories in production if any exist (e.g., "Nail Rituals" vs "Nail Care")
- [ ] Assign multi-category services where appropriate (e.g., "Up-Do" → ["Hair Studio", "Wedding"])
- [ ] Review any services flagged for manual review by the staff assignment migration
- [ ] Remove the `/vendors` page once redirects have been live for a few months
- [ ] Clean up `seed-amplify.js` (legacy seed script) — no longer needed

---

## Key Architectural Notes

- **Categories are stored by name** (not ID) in the Service model's `categories` array
- **ServiceCategory table** is the source of truth for the dropdown list; deleting a category there removes it from the dropdown but doesn't remove it from existing services
- **Sequential booking** relies on the `schedule` URL param passed from bundle-time → confirm. If absent (single service or old flow), behavior is unchanged.
- **The `category` (singular) field on services is preserved** for backward compatibility. It's not written to by new code but is read as a fallback.
