# August 2026 — Platform Scoping Discussion

Purpose: Work through the August client feedback items to assess feasibility, effort, options, and tradeoffs. This document is preparation for a conversation with the clients.

---

## Client Feedback Summary

The client envisions The Spa Synergy evolving into a cohesive salon/spa management platform — referencing Vagaro and GlossGenius as benchmarks. Key themes: mobile-first provider experience, connected data, professional client management, and individual business identity within a shared umbrella.

---

## 1. Simple Provider Dashboard

**What they want:** A landing page on login showing today's appointments, upcoming schedule, calendar, clients, messages/notifications, and quick actions. Frequently used features immediately accessible.

**Current state:** Providers land on the general dashboard. Navigation exists but isn't role-optimized or mobile-first.

**Feasibility:** High — this is primarily a UI/UX restructuring, not new backend logic.

**Options:**
- A) Build a dedicated `/provider/dashboard` page with role-based redirect on login. Pulls today's appointments, next few days, and surfaces quick-action buttons (block time, add note, view client).
- B) Make the existing dashboard configurable with widgets/cards that providers can rearrange.

**Effort estimate (includes testing & validation):** 
- Option A: ~3–4 days (straightforward page + queries + QA)
- Option B: ~7–10 days (drag/drop layout, persistence of preferences + QA)

**Recommendation:** Option A first. Clean, opinionated layout. Widget customization is a "nice to have" later.

**Questions for client:**
- What are the top 3 quick actions providers use most?
- Do they want a unified inbox for messages/notifications, or just a badge count linking to existing pages?

---

## 2. Flexible Calendar & Availability System

**What they want:** Recurring schedules + date-specific overrides. Add one-off availability, block partial days, tap a date to manage it directly. Blocked time must actually prevent booking.

**Current state:** StaffSchedule model supports recurring patterns and `autoAssignRules`. There's infrastructure for hours management, but date-specific overrides and partial-day blocks may not be fully supported or easy to use.

**Feasibility:** Medium-High — the data model may need an `AvailabilityOverride` table (date, staffId, startTime, endTime, type: "available" | "blocked"). The booking availability check needs to layer overrides on top of recurring schedule.

**Options:**
- A) Add an `AvailabilityOverride` model. Booking logic checks overrides first, then falls back to recurring schedule. Provider UI: tap a date → see/edit that day's hours.
- B) Extend the existing StaffSchedule model with an `overrides` JSON field. Simpler schema, but harder to query and maintain.

**Effort estimate (includes testing & validation):**
- Option A: ~6–7 days (model + booking logic update + provider calendar UI for overrides + integration testing)
- Option B: ~4–5 days (less clean, potential performance issues at scale)

**Recommendation:** Option A. A dedicated overrides table is cleaner, queryable, and scales better.

**Questions for client:**
- How far in advance do providers typically adjust availability?
- Should blocked time show as "unavailable" on the public booking page, or just not show slots?
- Do they need bulk operations (e.g., "block every Friday at 2 PM for the next month")?

---

## 3. Mobile-First Provider Experience

**What they want:** Provider side feels like an app — bottom nav with Dashboard, Calendar, Clients, More/Settings. Quick actions between clients.

**Current state:** The app is responsive but desktop-oriented. No dedicated mobile nav pattern for providers.

**Feasibility:** High — this is a layout/navigation overhaul for authenticated provider views. No new backend work.

**Options:**
- A) Responsive bottom tab bar for provider routes (Dashboard, Calendar, Clients, Settings). Conditionally rendered on mobile viewports for authenticated provider users.
- B) Full PWA (Progressive Web App) with install prompt, offline caching, push notifications.

**Effort estimate (includes testing & validation):**
- Option A: ~5–6 days (bottom nav, responsive layout adjustments, quick-action floating button + cross-device testing)
- Option B: ~12–16 days (service worker, offline strategy, push notification infrastructure + cross-device testing)

**Recommendation:** Option A for now. Bottom nav + responsive tweaks give the "app feel" without the complexity of a full PWA. PWA can be a Phase 2 goal.

**Questions for client:**
- Are providers okay with using it in a mobile browser, or do they expect an installable app?
- Which specific quick actions matter most on mobile? (block time, view next client, add note?)

---

## 4. Complete Client Profiles

**What they want:** Professional client records — service history, provider notes, products used, formulas (hair color), allergies, photos, intake forms, preferences, rebooking notes.

**Current state:** Client model exists with basic fields. ClientNote model exists. Appointment history is queryable. No structured fields for formulas, allergies, photos, or products.

**Feasibility:** Medium — requires schema additions and a new UI section. The tricky part is making it usable and not overwhelming.

**Options:**
- A) Extend Client model with structured fields (allergies, preferences as JSON). Add a `ClientServiceNote` model tied to both client and service type (e.g., "Hair Color" note stores formula). Photo uploads via S3.
- B) Keep it simple: expand the existing ClientNote model with categories/tags (formula, allergy, preference, product). Less structured but faster to build.

**Effort estimate (includes testing & validation):**
- Option A: ~8–11 days (schema, S3 integration, profile UI with tabs for history/notes/forms/photos + data migration testing)
- Option B: ~4–6 days (categorized notes, basic profile page + QA)

**Recommendation:** Hybrid — structured fields for critical data (allergies, preferences) + categorized notes for freeform stuff (formulas, products). Photos can be Phase 2 unless it's a dealbreaker.

**Questions for client:**
- Which fields are must-haves for launch vs. nice-to-haves?
- Do multiple providers need to see each other's notes for a shared client, or are notes provider-private?
- Photo storage — how many photos per client realistically? (impacts cost)

---

## 5. Digital Intake & Consent Forms

**What they want:** Create/upload forms, associate with services, auto-send when booked, stored on client profile, different services trigger different forms.

**Current state:** No form builder or intake system exists. The waiver/liability item has been in backlog since April.

**Feasibility:** Medium — form builder is a significant feature. However, a simpler "link to external form" or "template-based form" approach can reduce scope dramatically.

**Options:**
- A) Full form builder (drag-drop fields, conditional logic, signature capture). This is essentially building a mini Typeform.
- B) Template-based forms — predefined field types (text, checkbox, signature, date). Admin creates forms from templates. Forms rendered in-app, responses stored as JSON.
- C) External form link — just store a URL (Google Form, Jotform, etc.) per service. Auto-send the link. No in-app rendering.

**Effort estimate (includes testing & validation):**
- Option A: ~20–28 days (substantial feature + extensive form logic testing)
- Option B: ~11–14 days (template engine, form renderer, storage, auto-send logic + QA)
- Option C: ~3–4 days (URL field on service, trigger in booking confirmation email/SMS + QA)

**Recommendation:** Start with Option C for immediate value, then build toward Option B. A full form builder (A) is a product in itself and probably overkill unless they have very specific form needs.

**Questions for client:**
- Do they already use a form tool (Google Forms, Jotform, etc.) they'd be happy linking to?
- How many different forms do they need? (If it's 2–3, templates work fine. If 20+, builder might matter.)
- Is digital signature capture required?
- Does the form need to be fillable within the booking flow, or is "sent before appointment" acceptable?

---

## 6. Services AND Add-ons

**What they want:** Each provider maintains their own services and add-ons. Keep booking simple — pick a service, get offered relevant add-ons. Don't eliminate services, just organize better.

**Current state:** The booking-enhancements spec already covers an `Extra` model with bundle assignment, per-person pricing, and group-only filtering. The current sprint has this partially specced.

**Feasibility:** High — largely already planned in the booking-enhancements spec.

**Options:**
- A) Continue with the current `Extra` model approach (the booking-enhancements spec). Extras are assigned to bundles and optionally to individual services.
- B) Expand to per-provider add-on catalogs — each provider manages their own add-ons, shown only when their services are selected.

**Effort estimate (includes testing & validation):**
- Option A: Already specced, ~7–10 days remaining to complete implementation + testing
- Option B: Additional ~4–6 days on top of A for provider-scoped add-on management

**Recommendation:** Ship Option A (current spec), then extend to provider-scoped add-ons as the "individual businesses" theme matures.

**Questions for client:**
- Are add-ons shared across the spa, or does each provider have their own? (e.g., paraffin add-on — is that spa-wide or just for one provider?)
- Should add-on pricing vary by provider?

---

## 7. Individual Businesses Within The Spa Synergy

**What they want:** Umbrella experience with individual business identity preserved. Own services, pricing, providers, client info, settings. Connected without losing uniqueness.

**Current state:** The Vendor model exists and providers have their own pages/services. But there's no formal "business" entity that groups providers, settings, and branding together.

**Feasibility:** Medium — this is more of an architectural direction than a single feature. It touches multi-tenancy patterns.

**Options:**
- A) Lightweight: Add a `Business` model that groups vendors/providers. Each business has its own branding (logo, colors, description), services, and settings. Public pages already support per-vendor branding.
- B) Full multi-tenancy: Separate data isolation per business, independent admin panels, white-label domains. This is a platform rebuild.

**Effort estimate (includes testing & validation):**
- Option A: ~7–10 days (model + admin UI + public page enhancements + multi-tenant QA)
- Option B: ~40–65+ days (architectural overhaul + extensive testing)

**Recommendation:** Option A. The current system already has vendor-level separation. Formalizing it with a Business model and giving each business its own settings section is achievable without rearchitecting.

**Questions for client:**
- Do businesses need completely separate logins/admin panels, or is a single login with a business switcher acceptable?
- Can businesses see each other's client lists, or is that private?
- Do businesses set their own cancellation policies, or is that spa-wide?

---

## 8. Packages, Couples Appointments, Multi-Provider Bookings

**What they want:** One booking reserves time on both providers' calendars. Prevent double-booking across providers. Payment allocation must reflect which provider did which part.

**Current state:** Sequential booking exists (multi-service back-to-back). The Bundle model supports multi-service packages. Split payment sessions exist. But true simultaneous multi-provider bookings (couples massage at the same time) may not be fully supported.

**Feasibility:** Medium — the booking logic needs to handle parallel time slots across multiple providers and enforce availability for all simultaneously.

**Options:**
- A) Extend existing appointment model: a "group appointment" links multiple individual appointments (one per provider) with a shared `groupId`. Booking checks availability for all providers at the selected time. Payment split tracked per linked appointment.
- B) New `MultiProviderBooking` model that owns child appointments and manages the lifecycle as a unit.

**Effort estimate (includes testing & validation):**
- Option A: ~8–11 days (group linking, parallel availability check, split payment attribution + booking flow regression testing)
- Option B: ~11–14 days (new model + lifecycle management + UI + regression testing)

**Recommendation:** Option A. Linking existing appointments with a `groupId` is simpler and reuses existing infrastructure. The key work is the parallel availability check and the booking UI flow.

**Questions for client:**
- For couples bookings, do both services need to start at the same time, or just overlap?
- If one provider cancels, does the whole group booking cancel?
- How should the confirmation email look — one email per person, or one combined?

---

## 9. Payments & Checkout

**What they want:** Square integration stays cohesive. Appointment, provider, services, add-ons, tips, packages, payment all correctly connected. Critical for multi-provider transactions.

**Current state:** Square integration exists (OAuth, catalog sync, kiosk checkout with tipping). Split payment sessions exist. The fundamentals are solid.

**Feasibility:** High for incremental improvements, Medium for multi-provider payment splitting.

**Options:**
- A) Ensure existing checkout correctly attributes line items to providers. Add provider-level tip allocation. This is mostly data integrity and reporting.
- B) Full payment splitting at Square level — separate charges to separate merchant accounts. This requires Square's multi-party payment features and is complex.

**Effort estimate (includes testing & validation):**
- Option A: ~4–6 days (attribution fixes, tip splitting logic, reporting + payment reconciliation testing)
- Option B: ~14–20 days (Square marketplace/multi-party setup, compliance considerations + end-to-end payment testing)

**Recommendation:** Option A. Keep a single Square account with internal ledger tracking for provider attribution. Actual fund disbursement (paying providers) can remain a manual or semi-automated process for now.

**Questions for client:**
- Is the goal to split the actual Square charge between providers, or to track internally who earned what?
- How do tips get distributed today — per provider or pooled?
- Are they okay with internal tracking + manual payouts, or do they need automated disbursement?

---

## 10. Better Organization of Settings

**What they want:** Clear sections matching their mental model: Dashboard, Calendar, Clients, Appointments, Services & Add-ons, Forms, Packages, Payments, Reports, Messages, Settings.

**Current state:** Settings exist but may not be grouped this way. Recent restructuring consolidated admin settings.

**Feasibility:** High — this is navigation/information architecture work.

**Effort estimate (includes testing & validation):** ~3–4 days (reorganize nav, possibly split settings into sub-pages + navigation QA)

**Recommendation:** Do this alongside item #1 (Provider Dashboard) and #3 (Mobile-First). It's the same effort of restructuring navigation and layout.

**Questions for client:**
- Is this about the provider view, the admin/owner view, or both?
- Any settings they can never find today?

---

## 11. Customer-Facing vs. Provider Side

**What they want:** Two distinct experiences. Customer side: Spa Synergy aesthetic (florals, elegant typography, visually appealing). Provider side: clean, functional, built for running businesses.

**Current state:** There's already some separation between public booking pages and the dashboard. But they share the same design system.

**Feasibility:** High — this is a theming/design system split.

**Options:**
- A) CSS/theme split: public routes use the "spa" theme (warm colors, elegant type), dashboard routes use a "functional" theme (clean, minimal, data-dense).
- B) Fully separate codebases for customer and provider. (Overkill.)

**Effort estimate (includes testing & validation):**
- Option A: ~4–7 days (theme tokens, layout variants, typography swap + visual regression testing)
- Option B: Not recommended

**Recommendation:** Option A. Tailwind makes this straightforward with theme configuration per route group.

**Questions for client:**
- Do they have brand guidelines or color palettes for the customer-facing side?
- Any specific sites they love the look of (for reference)?

---

## 12. Overall Goal — Connected System

**What they want:** Everything communicates. Appointment → client profile → provider → calendar → intake forms → service notes → add-ons → payment → history.

**Assessment:** This isn't a single feature — it's the outcome of doing items 1–11 well. The current data model already connects most of these entities (Appointment has clientId, staffId, services, payment). The gaps are intake forms, structured service notes, and add-on attribution.

**Recommendation:** Frame this as the north star, not a line item. Each feature above should be implemented with "connected data" in mind — no orphan records, everything linkable.

---

## Priority Recommendation (for client discussion)

| Priority | Items | Rationale |
|----------|-------|-----------|
| **Now (current sprint)** | #6 (Add-ons) | Already specced and partially in progress |
| **Next sprint** | #1, #3, #10, #11 | All related — provider experience + navigation + theming. Ship together. |
| **Following sprint** | #2, #4 | Calendar flexibility + client profiles. High provider value. |
| **After that** | #8, #9 | Multi-provider bookings + payment attribution. More complex. |
| **Later** | #5, #7 | Intake forms + business model formalization. Important but not urgent. |

---

## Cost Ballpark (for discussion, not commitment)

All estimates include development, testing, validation, QA cycles, and deployment.

**Rough total for all items: ~75–115 days of effort**

At standard hourly rates ($125–$150/hr, 8hr days):

| Approach | Additional Cost (beyond retainer) | Timeline |
|----------|----------------------------------|----------|
| **Within retainer only** (10–15 hrs/mo) | $0 extra | Not realistic for this scope |
| **Hybrid** — retainer covers maintenance + sprint on priority items | ~$20,000–$40,000 in additional hours | ~6–9 months for priority items |
| **Accelerated** — dedicated sprint blocks | ~$75,000–$138,000 at $125–$150/hr | 4–6 months for everything |

**Recommended approach:** Hybrid. Use monthly retainer for lower-effort items (nav, theming, settings). Bill additional hours for complex features (intake forms, multi-provider bookings, client profiles). Delivers value incrementally without sticker shock.

This spans 4–6 months of focused work depending on sprint cadence and feedback cycles. Breaking it into phases makes it manageable and delivers value incrementally.

---

## Open Discussion Points

- [ ] Budget and timeline expectations from the client
- [ ] Which items feel most urgent to them vs. what we recommend?
- [ ] Are they willing to phase this over multiple months?
- [ ] Visual mockups they mentioned — get copies for design reference
- [ ] Vagaro/GlossGenius — which specific features from those platforms matter most?
