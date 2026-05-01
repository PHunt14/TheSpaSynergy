# Pricing & Transition Plan — The Spa Synergy Platform

> Internal document. Not for client distribution.

---

## Part 1: Pricing Analysis

### What You're Providing

This is not a brochure website. This is a **custom SaaS booking and payment platform** with:

- Multi-vendor scheduling with staff assignment, availability logic, and recurrence patterns
- Online payments with multi-party splits (Square OAuth per vendor, house fee deductions)
- Role-based vendor dashboard (owner / admin / vendor / staff)
- SMS + email notifications (booking, confirmation, cancellation)
- Kiosk / POS checkout capability
- Public vendor pages with service catalog
- Cognito authentication with session management
- Uptime monitoring (Route 53 health checks, CloudWatch)

**No off-the-shelf product supports this business model.** Comparable tools (Vagaro, Mindbody, Booksy) run $200–500/mo *per vendor* with far less customization, no multi-party payment splits, and no house fee logic.

### Current Pricing (Undervalued)

| Item | Amount |
|------|--------|
| Upfront build | $900 |
| Monthly retainer | $150/mo |
| Included updates | 1 per month |

#### Why This Is Too Low

- AWS infrastructure costs alone could reach $50–100/mo as usage grows
- One Square API deprecation can wipe out months of profit in unplanned work
- "1 update" is vague and will be pushed ("can you just also...")
- Incident response is implicit — if bookings break on a Saturday, you're fixing it
- The upfront development value is realistically **$30,000–50,000+** (hundreds of hours)

### What This Platform Is Actually Worth

#### Tier 1: Hosting & Infrastructure — $200–400/mo

- AWS Amplify hosting, DynamoDB, Cognito, SNS, SES, Lambda
- Domain, SSL, DNS
- Actual AWS bill is ~$50–150, but you're selling reliability, not pass-through costs

#### Tier 2: Platform Management — $500–800/mo

- Dependency updates (Next.js, Amplify, Square SDK)
- Uptime monitoring and alert response
- Square OAuth token refresh management
- Database maintenance and backups
- SSL/cert renewals, DNS management

#### Tier 3: Incident Response & Support — $300–500/mo

- Bug fixes, Square API changes, AWS service updates
- After-hours availability for critical issues
- Vendor onboarding (new staff, new services, Square connect)
- On-call availability has a price

#### Tier 4: Feature Development (Retainer) — $500–1,500/mo

- Known issues backlog and future enhancements
- Calendar sync, appointment reminders, group bookings, intake forms, CRM
- Even small changes (update service lists, fix photo sizing) add up

### Recommended Pricing Tiers (New Clients)

| Model | Monthly | What's Included |
|-------|---------|-----------------| 
| **Baseline** | **$1,500–2,000/mo** | Hosting + management + monitoring + minor fixes (~5 hrs/mo support) |
| **Standard** | **$2,500–3,500/mo** | Above + feature development retainer (~10–15 hrs/mo) |
| **Full Service** | **$4,000–5,000/mo** | Above + priority support, analytics reporting, vendor onboarding, training |

**Floor price: $1,500/mo.** Below this, the economics don't work long-term.

### Hidden Costs You May Not Be Accounting For

| Item | Why It Matters |
|------|----------------|
| **Square API version upgrades** | They deprecate versions — you'll be forced to update |
| **AWS Amplify Gen 2 breaking changes** | Still maturing, expect migration work |
| **Compliance** | Health/wellness intake data may carry privacy obligations |
| **Analytics reporting** | The owner will eventually want monthly reports from Pinpoint/GA4 |
| **Vendor training** | New staff need to learn the dashboard |
| **Backup / disaster recovery** | What's the plan if DynamoDB data gets corrupted? |
| **Performance tuning** | The availability route with N+1 queries needs attention as they scale |
| **Security patching** | npm audit fixes, dependency vulnerabilities |

### Your Leverage

If the client walked away, what would they replace this with?

- **Nothing off the shelf** does multi-vendor payment splits with house fees
- A dev shop would charge **$150–200/hr** to rebuild from scratch
- Cobbling together 3–4 SaaS products would cost **$1,000+/mo** across vendors — and still wouldn't match the functionality

You have leverage. Use it respectfully, but use it.

---

## Part 2: Transition Plan

### Week 1: Collect Current Payment

- Collect the $900 upfront + first $150/mo as agreed
- Deliver the platform, ensure everything is stable
- Let them experience the value for a billing cycle before the conversation

### Week 2: The Conversation

#### Talking Points

> "Now that the platform is live and you can see what it does — the multi-vendor booking, the payment splitting, the dashboard, notifications — I want to be transparent with you."
>
> "When I originally quoted this, I underestimated the complexity of what your business actually needs. This isn't a standard website — it's a custom booking and payment platform. There's nothing off the shelf that handles your multi-vendor model with house fees and per-vendor payment processing."
>
> "For a new customer walking in today, I'd be charging:"

#### Standard New Customer Pricing

| Item | Amount |
|------|--------|
| Platform setup fee | $5,000–8,000 |
| Monthly retainer | $800–1,000/mo |
| Includes | Hosting, monitoring, maintenance, incident response, 1–2 updates/mo |
| Additional development | $125–150/hr |

> "Because you took a chance on me early, and because you've been generous with referrals — I don't want to charge you that. Here's what I'd like to propose:"

#### Loyalty / Referral Pricing

| Item | Amount |
|------|--------|
| Setup fee | **Waived** (already paid $900) |
| Monthly retainer (Year 1) | **$300/mo** |
| Includes | Hosting, monitoring, maintenance, incident response, 1–2 updates/mo |
| Additional development | $100/hr (discounted from $125–150) |

> "The referrals you're providing have real value to me, and I want to honor that. As the platform grows and I bring on more clients, I'll adjust your rate gradually — maybe 10–15% per year — until it's in line with what others pay. But you'll always be ahead of anyone who comes after you."

#### Year-Over-Year Escalation

| Year | Monthly | Increase | Notes |
|------|---------|----------|-------|
| Year 1 | $300/mo | — | Loyalty + referral discount |
| Year 2 | $350/mo | ~17% | Still well below standard |
| Year 3 | $425/mo | ~21% | Approaching mid-range |
| Year 4 | $500/mo | ~18% | Nearing standard baseline |
| Year 5+ | $600–800/mo | Market rate | Adjust to current standard pricing |

### What They're Getting for $300/mo

Be specific so there's no ambiguity:

- **Hosting & infrastructure**: AWS services, domain, SSL, DNS
- **Monitoring**: Uptime checks, CloudWatch alerts, incident response
- **Maintenance**: Dependency updates, security patches, Square API updates
- **Support**: 1–2 updates per month (bug fixes, minor changes)
- **Incident response**: Critical issues addressed within 24 hours

#### What's NOT Included (Billable)

- New feature development beyond minor updates (group bookings, CRM, intake forms, etc.)
- Major redesigns or new pages
- Third-party integration changes (new payment provider, new notification channel)
- Vendor training sessions beyond initial onboarding
- Analytics/reporting buildout

### Why This Works

- **For them**: $300/mo is still a steal. Vagaro alone would cost them $200–500/mo *per vendor* and can't do payment splits. They know this.
- **For you**: $300/mo is 2x your current rate, covers your infrastructure costs, and gives you breathing room. The referrals generate new clients at full price.
- **The escalation is fair**: You're not surprising them. You're telling them upfront that the rate will increase gradually. Transparency builds trust.

### If They Push Back

- "What would it cost to replace this?" — They can't. No off-the-shelf tool does what this does for their model.
- "Can we stay at $150?" — "At $150, I'm losing money on infrastructure alone as you grow. $300 is already 60–70% below what I'd charge anyone else."
- "Can we do $200?" — Only if you cap it at hosting + monitoring with zero updates. Any change request is billed hourly. (This usually makes $300 look like the better deal.)

---

## Part 3: Future Client Pricing

### Setup Fee Justification

When referrals come in, the setup fee covers:

| Item | Estimated Hours | At $150/hr |
|------|----------------|------------|
| Initial consultation + requirements | 4–6 hrs | $600–900 |
| Platform configuration + vendor setup | 8–12 hrs | $1,200–1,800 |
| Square OAuth + payment setup per vendor | 4–6 hrs | $600–900 |
| Staff onboarding + training | 2–4 hrs | $300–600 |
| Testing + launch | 4–6 hrs | $600–900 |
| **Total** | **22–34 hrs** | **$3,300–5,100** |

Charging $5,000–8,000 setup is reasonable and leaves room for scope creep.

### Ongoing Monthly (New Clients)

| Item | Amount |
|------|--------|
| Monthly retainer | $800–1,000/mo |
| Includes | Hosting, monitoring, maintenance, incident response, 1–2 updates/mo |
| Additional development | $125–150/hr |

### Referral Discount Program

Offer clients a permanent monthly discount for referring new paying customers.

#### Discount Tiers

| Referral Type | Discount Per Referral |
|---------------|----------------------|
| **Standard referral** (any signed client) | 5% off monthly rate |
| **Same-level referral** (custom platform, $800+/mo client) | 10% off monthly rate |

#### Discount Floor

**None.** If a client brings enough referrals to earn 100% off, they've earned it. At that point the referred clients are generating far more revenue than the cost of one free account.

#### 5% Referral Progression (Standard)

| Referrals | Monthly Rate | Total Discount |
|-----------|-------------|----------------|
| 0 | $800 | — |
| 1 | $760 | 5% |
| 2 | $722 | 10% |
| 3 | $686 | 14% |
| 4 | $652 | 19% |
| 5 | $619 | 23% |
| 6 | $588 | 27% |
| 7 | $559 | 30% |
| 8 | $531 | 34% |
| 9 | $504 | 37% |
| 10 | $479 | 40% |
| 15 | $371 | 54% |
| 19 | $322 | 60% |
| 25 | $239 | 72% |
| 30 | $174 | 78% |
| 36 | $126 | 84% |
| 45+ | ~$0 | ~100% |

> At 5% per referral, it takes **~45 referrals** to effectively reach $0. Realistically, most clients will land in the $500–700 range. But if someone builds you a client base of 45+ paying customers — they've earned free service.

#### 10% Referral Progression (Same-Level)

| Referrals | Monthly Rate | Total Discount |
|-----------|-------------|----------------|
| 0 | $800 | — |
| 1 | $720 | 10% |
| 2 | $648 | 19% |
| 3 | $583 | 27% |
| 4 | $525 | 34% |
| 5 | $472 | 41% |
| 6 | $425 | 47% |
| 7 | $383 | 52% |
| 8 | $344 | 57% |
| 9 | $310 | 61% |
| 12 | $226 | 72% |
| 15 | $165 | 79% |
| 20 | $97 | 88% |
| 22+ | ~$0 | ~100% |

> At 10% per referral, it takes **~22 same-level referrals** to effectively reach $0. If someone brings you 22 clients paying $800+/mo ($17,600+/mo in revenue), their free account costs you nothing.

#### Blended Example

A client who refers 2 standard clients and 1 same-level client:

- $800 × 0.95 × 0.95 × 0.90 = **$649/mo** (19% off)

#### Why This Works

- **Incentivizes referrals** without giving away the farm
- **Compounds** — each referral is a smaller absolute dollar amount, so the curve flattens naturally
- **The $300/mo loyalty price for Spa Synergy** represents a massive discount — equivalent to ~9 same-level referrals. Frame it that way: "You're getting the rate someone would earn after bringing me 9 high-value clients."
- **New clients from referrals pay full price** ($800+/mo), so every referral is net positive for you even after the discount
- **100% discount is theoretically possible** but requires 22–45 referrals depending on tier. At that volume, you're running a real business off their network — covering one account is a no-brainer

#### Rules

- Referral must sign a contract and pay for at least 3 months to count
- Discounts are permanent once earned (not revoked if the referred client leaves)
- Discounts apply to the base monthly rate only, not hourly development work
- No floor — 100% discount is achievable if they earn it. You absorb hosting costs at that point

---

### The Roadmap Is Your Sales Tool

The known issues and future enhancements list represents **$50,000+ in development work**:

- Group bookings with deposit rules
- Vendor intake forms
- Client CRM with cross-vendor visibility
- Calendar sync (Google/Apple)
- Appointment reminders
- No-show tracking
- Membership model

Each of these is a real project. Price them as such.
