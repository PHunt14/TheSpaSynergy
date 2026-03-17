# Customer Feedback — June 2025

## Status Key
- ✅ Done
- 🔧 In Progress
- 📋 Planned
- 🔮 Future

---

## 1. ✅ Paragraph Text Visibility
**Priority**: Quick Win
**Request**: Paragraph texts need to be larger overall and more visible.
**Changes**: Increased base `p` font size and improved `--color-text-light` contrast in `variables.css` and `globals.css`.

---

## 2. ✅ "Make Your Own Spa Day" Package
**Priority**: Quick Win (seed data + UI)
**Request**: A curated spa day bundle with these services:
- 15-min targeted massage
- 30-min mini head bath
- 30-min mini facial
- Sauna session
- Himalayan salt foot soak
- 30–60 min group sound bath

**Optional add-on**: Snack board
- $55 for 4–5 people
- $75 for 6–8 people

**Implementation**:
- Added as `bundle-make-your-own-spa-day` in seed data with `price: 0` (sum of individual services)
- Snack board add-on still needs a new concept — bundles don't currently support optional add-ons
- May need an `addOns` field on the Bundle model or a separate add-on service

---

## 3. ✅ Building & Provider Schedules (Seed Data)
**Priority**: Medium — requires data model changes for full staff-level scheduling
**Request**: Staff-level hours (not just vendor-level).

**Seed data updated**:
- **Kera Studio**: Mon 6:30a–5p, Tue/Thu 6:30a–6p, Fri 6:30a–5p, Sat 10a–2p (covers Trinity Mon/Fri + Stacey Tue/Thu + sauna hours)
- **Kera Studio saunaHours**: Mon–Fri 6:30a–6p, Sat 10a–2p (separate field on Vendor model)
- **Selene Glow Studio**: Tue 10a–5p, Fri 12p–6p (Jylian's hours; 2nd Saturday TBD)
- **Winsome Woods**: Mon–Fri 10:30a–4p (Makaila's hours; days TBD with customer)

### Sauna Schedule (Kera Studio — separate from staff)
- **Mon–Fri**: 6:30 AM – 6:00 PM
- **Saturday**: 10:00 AM – 2:00 PM
- **Sunday**: Closed
- Accepts appointments AND walk-ins
- **No vendor confirmation required** (auto-confirmed)

### Kera Studio Staff
| Staff   | Days                        | Hours        | Notes |
|---------|-----------------------------|--------------|-------|
| Stacey  | Tue, Thu                    | 11 AM – 6 PM | Owner; every other Saturday 10 AM – 2 PM; available for call-in appointments |
| Trinity | Mon, Fri                    | 12 PM – 5 PM | Kera appointments on Mon/Fri auto-route to Trinity |

### Selene Glow Studio Staff
| Staff   | Days                        | Hours        | Notes |
|---------|-----------------------------|--------------|-------|
| Jylian  | Tue, Fri                    | Tue 10 AM – 5 PM, Fri 12 PM – 6 PM | 2nd Saturday of every month 10 AM – 2 PM |

### Winsome Woods Staff
| Staff   | Days                        | Hours        | Notes |
|---------|-----------------------------|--------------|-------|
| Makaila | (days TBD)                  | 10:30 AM – 4 PM | Need to confirm which days |

### Implementation Notes
- Current system only has vendor-level `workingHours` — need staff-level schedules
- Options:
  1. Add a `StaffSchedule` model linked to Cognito user + vendor
  2. Add `staffSchedules` JSON field on Vendor model (simpler, less flexible)
- Sauna needs its own schedule separate from Kera staff hours
- "Every other Saturday" for Stacey and "2nd Saturday" for Jylian need special handling (recurring pattern)

---

## 4. ✅ Vendor Confirmation for All Non-Sauna Services
**Priority**: Quick Win (seed data change)
**Request**: All appointments except sauna require vendor confirmation before being considered scheduled.

**Implementation**:
- Set `requiresConsultation: true` on all non-sauna services in seed data
- Sauna services have `requiresConsultation: false` (auto-confirmed)
- The booking flow already supports `requiresConsultation` — shows a "pending confirmation" message

---

## 5. ✅ Sauna as Separate Scheduling Entity
**Priority**: Medium
**Request**: Sauna still falls under Kera Studio vendor, but scheduling is completely separate.

**Implementation**:
- Added `saunaHours` JSON field on Vendor model in `amplify/data/resource.ts`
- Kera Studio seed data now has separate `saunaHours`: Mon–Fri 6:30a–6p, Sat 10a–2p
- Sauna services already have `resourceType: 'sauna'` — availability API already filters by resource type
- Availability API needs to be updated to use `saunaHours` when `resourceType === 'sauna'`

---

## 6. 📋 Auto-Routing: Kera → Trinity on Mon/Fri
**Priority**: Medium
**Request**: Kera appointments on Monday and Friday should automatically go to Trinity. Stacey is available for call-in appointments as well.

**Implementation Notes**:
- Need staff assignment logic in the booking flow
- When a Kera service is booked on Mon/Fri → assign to Trinity
- Stacey remains available but only via phone/call-in (not online booking on those days)
- Requires staff-level scheduling (see item #3)

---

## 7. 🔮 Customer Cancel/Reschedule from SMS
**Priority**: Long-term
**Request**: Customers should be able to cancel or reschedule from the text message they receive.

**Implementation Notes**:
- Add a unique action URL in SMS notifications (e.g., `https://thespasynergy.com/appointment/manage?token=<unique-token>`)
- Create a public appointment management page
- Token-based auth (no login required) with expiration
- Actions: cancel, request reschedule
- Reschedule could show available times or just notify vendor of the request
- Need to add `managementToken` field to Appointment model

---

## Open Questions for Customer
- [ ] "Make Your Own Spa Day" — is this a fixed bundle or a build-your-own picker where customers choose from the listed services?
- [ ] Makaila (Winsome Woods) — which days of the week?
- [ ] Stacey's "every other" Saturday — do we have the specific dates, or should we build a toggle in the dashboard?
- [ ] Should walk-in sauna sessions show on the booking page, or is online booking only for appointments?
- [ ] Snack board add-on — is this only for the spa day bundle, or available for any booking?
