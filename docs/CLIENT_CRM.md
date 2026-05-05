# Client CRM

## Overview

A cross-vendor client catalog that automatically builds from booking data. All vendors can view all clients, their appointment history, and add notes.

## How It Works

### Auto-Population

When a customer books an appointment, the system automatically:
1. Checks if a client record exists (by phone first, then email)
2. If found, links the appointment to the existing client
3. If not found, creates a new client record and links it

No manual data entry needed — the catalog builds itself from bookings.

### Client Matching

Clients are matched in this order:
1. **Phone number** (primary) — normalized to 10 digits, strips formatting
2. **Email** (fallback) — case-insensitive, trimmed

This means a customer who books as "Stacey" with phone 240-329-6537 and later books as "Stacey M." with the same phone will be recognized as the same client.

## Dashboard

### Client List

**Dashboard → Clients** shows all clients with:
- Name, phone, email, and "client since" date
- Search by name, phone, or email (debounced, searches as you type)
- Click any row to view the client detail
- **"+ Add Client"** button to manually create a client

### Client Detail

Clicking a client shows:
- **Contact info** — name, phone (clickable), email (clickable)
- **Edit** button — inline edit of name, phone, email
- **Delete** button — removes the client and all their notes (with confirmation)
- **Appointment history** — all appointments across all vendors, with date, service, and status
- **Notes** — comment thread with author name and timestamp

### Notes

Notes work like a comment thread:
- Any logged-in staff member can add notes
- Each note shows the author name and timestamp
- You can **edit your own notes** (shows "edited" indicator)
- You **cannot edit or delete other people's notes**
- Notes are sorted newest-first

## Data Model

### Client

| Field | Type | Description |
|---|---|---|
| `clientId` | ID (PK) | Unique client identifier |
| `name` | String | Client's name |
| `phone` | String | Normalized phone (10 digits) |
| `email` | String | Normalized email (lowercase) |
| `createdAt` | DateTime | When the client was first seen |

Secondary indexes on `phone` and `email` for fast lookup.

### ClientNote

| Field | Type | Description |
|---|---|---|
| `noteId` | ID (PK) | Unique note identifier |
| `clientId` | String | Links to Client |
| `authorId` | String | Author's email (from Cognito) |
| `authorName` | String | Author's display name |
| `content` | String | Note text |
| `createdAt` | DateTime | When the note was created |
| `updatedAt` | DateTime | When the note was last edited |

Secondary index on `clientId` with `createdAt` sort key.

### Appointment (updated)

| Field | Type | Description |
|---|---|---|
| `clientId` | String | Links to Client (set on booking) |

## API

### GET /api/clients

Query params:
- `clientId` — get a single client
- `search` — search by name, phone, or email

### POST /api/clients

Creates or finds a client. Returns `{ client, created: true/false }`.

```json
{ "name": "Jane Doe", "phone": "2403296537", "email": "jane@example.com" }
```

### PATCH /api/clients

Update client info.

```json
{ "clientId": "client-abc123", "name": "Jane M. Doe" }
```

### DELETE /api/clients?clientId=...

Deletes the client and all their notes.

### GET /api/client-notes?clientId=...

Returns notes for a client, sorted newest-first.

### POST /api/client-notes

Add a note (requires auth).

```json
{ "clientId": "client-abc123", "content": "Prefers lavender oil for massage." }
```

### PATCH /api/client-notes

Edit your own note (requires auth, enforces ownership).

```json
{ "noteId": "note-xyz789", "content": "Updated: Prefers eucalyptus oil now." }
```

## Backfilling Existing Data

To populate the client catalog from existing appointments (run once after first deploy):

```bash
node scripts/backfill-clients.js
```

This scans all appointments, creates client records for unique customers (matched by phone/email), and links appointments to their client records.

## Files

| File | Purpose |
|---|---|
| `amplify/data/resource.ts` | Client and ClientNote models |
| `app/utils/client.js` | Phone/email normalization, client matching |
| `app/api/clients/route.ts` | Client CRUD + find-or-create |
| `app/api/client-notes/route.ts` | Note CRUD with ownership enforcement |
| `app/api/appointments/route.ts` | Auto-populates client on booking |
| `app/api/dashboard/route.ts` | Supports `clientId` param for appointment history |
| `app/dashboard/clients/page.jsx` | Client list, detail, history, and notes UI |
| `app/components/Sidebar.jsx` | Added "Clients" link |
| `__tests__/utils/client.test.mjs` | 12 tests for normalization and matching |
