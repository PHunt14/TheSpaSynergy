# Worklog & Notes

Consolidated tracking document for The Spa Synergy. Organized by month.

---

## Status Key
- ✅ Done
- 🔧 In Progress
- ⬜ Todo
- ❌ Removed/Won't Do

---

## March 2025

### Customer Feedback (On-Site)

- ✅ Paragraph text visibility — increased font size and contrast
- ✅ "Make Your Own Spa Day" bundle — seeded with services
- ✅ Building & provider schedules — StaffSchedule model, per-staff hours, recurrence patterns
- ✅ Vendor confirmation for all non-sauna services — `requiresConsultation: true`
- ✅ Sauna as separate scheduling entity — `saunaHours` field, separate from staff hours
- ✅ Auto-routing: Kera → Trinity on Mon/Fri — `autoAssignRules` on StaffSchedule
- ⬜ Booking add-ons — snack board, tiered pricing variants (AddOn model with variants)
- ❌ Customer cancel/reschedule from SMS — long-term, token-based link in notifications

### Open Questions (March)
- [ ] "Make Your Own Spa Day" — fixed bundle or build-your-own picker?
- [ ] Makaila (Winsome Woods) — which days of the week?
- [ ] Stacey's "every other" Saturday — specific dates or dashboard toggle?
- [ ] Walk-in sauna sessions — show on booking page or appointments only?
- [ ] Snack board add-on — only for spa day bundle or available for any booking?
- [ ] Add-ons — vendor-specific, service-specific, or both?

---

## April 2025

### Visit Notes (On-Site)

- ✅ Vendor edit/activate page broken — fixed form render and refresh bugs
- ✅ Social media & Google review links on vendor pages — verified working
- ✅ Staff/profile pictures uniform size — fixed 300×300px with object-fit cover
- ✅ Jylian cover photo — added as Selene Glow Studio hero image
- ✅ Individual vendor booking QA pass — completed
- ✅ QR code for website — done
- ✅ Spa package day restrictions — `allowedDays` field on Bundle, configurable per-bundle
- ⬜ Bridal party / group event booking rules — limit ≤30 min for 3+, require deposit, group filtering
- ⬜ Advance booking requirement — `minAdvanceBookingDays` on Bundle/Service
- ⬜ Event/package time frame selection — morning/afternoon/evening blocks instead of exact slots
- ⬜ Vendor intake forms — per-vendor or per-service questions during booking
- ⬜ New client checkbox at booking — flag for first-time clients, triggers consultation
- ⬜ Liability/waiver form — acceptance required at booking, stored on appointment
- ⬜ Calendar invites in emails — .ics attachments for booking/confirmation/cancellation/reschedule
- ⬜ Kiosk appointment views — calendar view, customer name, vendor/staff groupings
- 
⬜ Split pay for spa days — confirmed done

### Open Questions (April)
- [ ] Split pay for spa days — splitting bill between group members vs. vendor payment splitting?
- [ ] Liability form — who drafts content? Legal review needed?
- [ ] Intake form questions — get specific questions from Makaila and Jylian
- [ ] Sound room rental — same pricing model as sauna? Same vendor?
- [ ] Advance booking minimum — 7 days for spa days, what about other bundles/events?

---

## May 2025

### Client Feedback

- ✅ Time-block calendar view (planner style) — complete rewrite with 30-min grid, day/week/month views
- ✅ Sort appointments chronologically — inherent in time-block view
- ✅ Month navigation button — month view toggle with navigation arrows
- ✅ Predefined service category list — admin UI in Settings (from Rollout)
- ✅ Kiosk tipping — tip selection screen (15%/20%/25%/custom/none)
- ⬜ Rebook feature (quick forward scheduling) — +4/6/8 week suggested dates from appointment
- ⬜ Override vendor/staff on existing appointment — reassign without cancel/rebook
- ⬜ Allow manual double bookings — bypass conflict check for dashboard actions
- ⬜ Force deposit or full payment per service — per-service payment requirement setting

### Open Questions (May)
- [ ] Deposit amount — fixed dollar amount or percentage of service price?
- [ ] Rebook — auto-select same time of day, or just jump to date?

---

## June–July 2025

### Unified Model Rollout

- ✅ Sequential booking fix — multi-service bookings back-to-back
- ✅ Service category management — dedicated table with admin UI
- ✅ ServiceCatalog refactoring — flat category grouping
- ✅ Spa Room selectable in service editor
- ✅ Settings restructure — admin-only consolidated tab
- ✅ Terminology rebrand — "Vendor" → "Provider" in public UI
- ✅ Category migration script — seeded ServiceCategory table
- ✅ Staff assignment migration script — populated allowedStaff arrays
- ✅ Consolidate duplicate categories
- ✅ Remove `/vendors` page after redirects stable

### Production Launch

- ✅ Production checklist completed (items 1–10)
- ✅ Amplify deployment on `main`
- ✅ Custom domain + SSL
- ✅ Environment variables configured
- ✅ SES production access
- ✅ SNS production access
- ✅ Data seeded
- ✅ Cognito users created
- ✅ Square OAuth + webhooks configured
- ✅ Smoke test passed

### Other Completed

- ✅ Client CRM — auto-populates from bookings, cross-vendor notes
- ✅ Square Catalog sync — staff can sync from My Settings
- ✅ Kiosk checkout — full tablet POS with bundle/multi-service/tipping support
- ✅ Booking flow redesign — done
- ✅ Multi-service week requests — done
- ✅ Appointment reminders — done
- ✅ Advance booking minimum — done
- ✅ Remove inactive/old vendors from public pages — done
- ✅ Shared service support — done
- ✅ Update Kera's service list — done
- ✅ Vagaro calendar sync — done
- ✅ Rebook feature — done
- ✅ Override vendor/staff on appointment — done
- ✅ Manual double bookings — done
- ✅ Individual vendor booking QA — done
- ✅ Split pay for spa days — done

---

## August 2026

### Sprint Items
- ⬜ (#4) Event time frame selection (morning/afternoon/evening blocks for packages)
- ⬜ (#6) New client flag at booking (checkbox, triggers consultation scheduling)
- ⬜ (#8) Booking add-ons (optional add-ons with tiered pricing)
- ⬜ (#24) Review and resolve SonarQube issues (blockers only)
- ⬜ (#25) Optimize CI/CD pipeline and improve security posture
- ⬜ (#26) No-show tracking (flag repeat offenders, require prepayment)

### Client Feedback (August)

Major feedback received outlining a vision for The Spa Synergy as a cohesive salon/spa management system. References Vagaro and GlossGenius for functionality benchmarks. Key themes: mobile-first provider experience, connected data, professional client management.

**1. Simple Provider Dashboard**
- Main screen on login: today's appointments, upcoming, calendar, clients, messages/notifications, quick actions
- Frequently used features immediately accessible without navigating through multiple pages

**2. Flexible Calendar & Availability System**
- Two availability types: recurring schedule + date-specific overrides
- Add one-off availability (e.g., open Saturday 12–4 without making it recurring)
- Block partial days (e.g., leave at 2 PM one Friday only)
- Blocked time must actually prevent online booking
- Ideally tap a date on calendar to manage that day directly

**3. Mobile-First Provider Experience**
- Most providers manage from phones; current calendar is desktop-oriented on mobile
- Provider side should feel like an app: Dashboard, Calendar, Clients, More/Settings in main nav
- Quick actions between clients: change availability, block time, check appointment, look up client, add notes

**4. Complete Client Profiles**
- Professional client records beyond name/phone/email
- Appointment/service history, provider notes, service notes, products used
- Hair color/formulas, facial/skincare treatment notes
- Allergies/contraindications, photos, intake/consent forms
- Client preferences, future recommendations/rebooking notes
- Example: stylist saves a hair-color formula → available at next appointment

**5. Digital Intake & Consent Forms**
- Create or upload intake/consent forms, associate with specific services
- Auto-send form by text/email when a service is booked
- Completed form stored on client profile for provider review before appointment
- Different services trigger different forms

**6. Services AND Add-ons**
- Each provider maintains their own services and relevant add-ons
- Keep customer-facing booking simple (e.g., pick pedicure → offered paraffin add-on)
- Don't eliminate services, just organize them better

**7. Individual Businesses Within The Spa Synergy**
- Umbrella experience, but individual businesses keep their identity
- Own services, pricing, providers, client info, and settings
- Everything feels connected without losing individual business uniqueness

**8. Packages, Couples Appointments, Multi-Provider Bookings**
- One booking reserves time on BOTH providers' calendars
- Prevent double-booking across providers in multi-provider transactions
- Payment/service allocation must reflect which provider performed which part

**9. Payments & Checkout**
- Square integration, cohesive checkout
- Appointment, provider, services, add-ons, tips, packages, payment stay correctly connected
- Especially critical for multi-provider/multi-business transactions

**10. Better Organization of Settings**
- Clear sections: Dashboard, Calendar, Clients, Appointments, Services & Add-ons, Forms, Packages, Payments/Checkout, Reports, Messages/Notifications, Settings
- Frequently used = immediately accessible; advanced = under More/Settings

**11. Customer-Facing vs. Provider Side**
- Two related but different experiences
- Customer: Spa Synergy personality/aesthetic, colors, florals, elegant typography, visually appealing
- Provider: cleaner, more functional, built for actually running businesses

**12. Overall Goal — Connected System**
- Appointment connects to: client profile, provider, calendar, intake forms, service notes, add-ons, payment, history
- Everything communicates rather than feeling like separate pieces

**Client also provided visual mockups** (not prescriptive on exact design, but showing desired level of organization, mobile usability, and functionality).

---

## Backlog (Unprioritized)

Items not yet scheduled. Numbered for easy reference.

### Calendar & Scheduling
1. Calendar sync (Google/Apple) + .ics invites in emails
2. Recurring services (e.g., sauna as recurring first service)

### Booking Flow
3. Bridal party / group booking rules (≤30 min for 3+, deposit, group filtering)
4. Event time frame selection (morning/afternoon/evening blocks for packages)
5. Vendor intake forms (per-vendor/per-service questions during booking)
6. New client flag at booking (checkbox, triggers consultation scheduling)
7. Liability/waiver form (acceptance at booking, stored on appointment)
8. Booking add-ons (optional add-ons with tiered pricing)

### Payments & Financials
9. Refund strategy — Phase 1: full refunds (cancel + Square refund)
10. Refund strategy — Phase 2: vendor ledger + partial refunds
11. Force deposit/full payment per service
12. Auto rent payment (automated collection from subletting vendors)
13. Percentage-based house fees (`houseFeePercent`, variable rates)
14. House fee & payout reports in dashboard

### Platform & Infrastructure
15. Appointment export (vendors text themselves daily link)
16. Monthly operations report (Lambda + EventBridge + SES)
17. Payment service extraction (microservice)
18. Category blocks link to filtered service lists (homepage)
19. Clean up legacy `seed-amplify.js`
20. Improve provider and staff schedule/hours management
21. Implement a dedicated testing environment for isolated QA
22. Optimize infrastructure — codify as IaC (replace manual/console setup)
23. Modularize and optimize codebase where possible
24. Review and resolve SonarQube issues
25. Optimize CI/CD pipeline and improve security posture

### CRM & Client Management
26. No-show tracking (flag repeat offenders, require prepayment)
27. Kiosk appointment views (calendar, customer, vendor/staff views)

### Future / Explore
28. Membership option (recurring model)
29. Sound room rental (bookable resource)
30. Sound bath classes (class calendar, registration, vendor CRUD)

### Won't Fix
- ❌ Square sandbox OAuth — workaround documented, not blocking

