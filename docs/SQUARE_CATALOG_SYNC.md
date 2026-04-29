# Square Catalog Sync

## Overview

The catalog sync feature pushes services from The Spa Synergy into each staff member's Square catalog. This ensures that:

- Charges show up with service names in the vendor's Square Dashboard (instead of generic dollar amounts)
- Services appear in Square's sales reporting by item/category
- Staff can use the same services on their Square POS app (phone, tablet, terminal) for in-person payments
- Payments include an Order with named line items

## How It Works

### Sync Flow

1. Staff navigates to **Dashboard → Settings → My Settings**
2. Staff clicks **"Sync Services to Square"** (only visible when Square is connected)
3. The system:
   - Loads all active services for the staff's vendor
   - Filters to services the staff member is allowed to perform (based on `allowedStaff`)
   - Checks the staff's existing Square catalog for previously synced items
   - Creates new categories and items, or updates existing ones
4. Staff sees a summary: "Synced 8 services (3 new, 5 updated)"

### What Gets Synced

| Spa Synergy Field | Square Catalog Field |
|---|---|
| Service name | Item name + Variation name |
| Service price | Variation price (FIXED_PRICING) |
| Service duration | Variation service duration |
| Service description | Item description (plaintext) |
| Service category | Catalog category |

Items are created with `productType: APPOINTMENTS_SERVICE`.

### Matching Logic

- **Categories**: Matched by exact name in the Square catalog. If "Relaxation" already exists, it's reused.
- **Items**: Matched by `serviceId` using a per-staff mapping stored on the StaffSchedule record (`squareCatalogMappings`). This means renaming a service in the app correctly updates the existing Square catalog item instead of creating a duplicate.
- **Updates**: On re-sync, existing items get their name, price, duration, and description updated. The Square catalog item ID is preserved.

## API

### `POST /api/square/catalog-sync`

**Request:**
```json
{
  "staffId": "staff-trinity-001"
}
```

**Response (success):**
```json
{
  "success": true,
  "synced": 8,
  "created": 3,
  "updated": 5
}
```

**Response (error):**
```json
{
  "error": "Square not connected"
}
```

## Data Model

A JSON field is stored on the `StaffSchedule` model:

| Field | Type | Description |
|---|---|---|
| `squareCatalogMappings` | JSON | Per-staff mapping of `serviceId` → `{ itemId, variationId }` in their Square catalog |

Example value:
```json
{
  "svc-massage-001": { "itemId": "ABC123", "variationId": "DEF456" },
  "svc-facial-002": { "itemId": "GHI789", "variationId": "JKL012" }
}
```

This is per-staff — Trinity's mappings are independent of the owner's. Each person's sync only reads/writes their own record.

## Payment Integration

When a customer pays online, the payment route (`/api/payment`) now:

1. Loads the booked service details
2. Creates a Square Order with named line items (service name, price, quantity)
3. Attaches the Order to the payment

This means charges show up with service names in the vendor's Square Dashboard regardless of whether they've synced their catalog. The catalog sync adds the items to their Square POS app and reporting — the Order line items work independently.

## OAuth Scopes

The catalog sync requires two additional OAuth scopes:

- `ITEMS_WRITE` — create/update catalog items
- `ITEMS_READ` — list existing catalog items (for duplicate detection)

**Staff who connected Square before this feature must disconnect and reconnect** to grant the new scopes.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  My Settings UI  │────▶│  catalog-sync    │────▶│  Square Catalog │
│  (Sync button)   │     │  API route       │     │  API            │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │
                              ▼
                        ┌──────────────────┐
                        │  Service model   │
                        │  (save IDs)      │
                        └──────────────────┘

┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Checkout page   │────▶│  payment route   │────▶│  Square Orders  │
│  (pays online)   │     │  (creates Order) │     │  + Payments API │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Shared Code

Pure functions live in `lib/square/catalog.js`:

| Function | Purpose |
|---|---|
| `buildCategoryObject(name)` | Build a Square CatalogObject for a category |
| `buildItemObject(service, categoryId)` | Build a Square CatalogObject for a service item |
| `getStaffServices(allServices, staffId)` | Filter services a staff member can perform |
| `groupByCategory(services)` | Group services by category name |
| `buildUpsertBatches(services, existing)` | Build the full batch upsert request |
| `parseSyncResponse(objects)` | Count synced items and categories from response |
| `buildOrderLineItems(services, people)` | Build Order line items for payment |

All functions are tested in `__tests__/square/catalog.test.mjs` (30 tests).

## Troubleshooting

| Issue | Fix |
|---|---|
| "Square not connected" | Staff must connect Square in My Settings before syncing |
| "No services to sync" | No active services are assigned to this staff member |
| Sync button not visible | Only appears when Square is connected |
| Duplicate items in Square | Shouldn't happen — items are tracked by `serviceId` in the staff's `squareCatalogMappings`. If it does happen, delete the duplicate from Square Dashboard and re-sync |
| "UNAUTHORIZED" error on sync | Staff needs to disconnect and reconnect Square to grant `ITEMS_WRITE`/`ITEMS_READ` scopes |
