# The Spa Synergy

Luxury spa and wellness booking platform serving Fort Ritchie, MD and surrounding areas.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Backend**: AWS Amplify Gen 2
- **Database**: DynamoDB
- **Authentication**: AWS Cognito
- **Hosting**: AWS Amplify
- **Node**: v22.16.0

## Features

### Public Site
- Homepage with service categories
- Vendor directory with detailed profiles
- Multi-step booking flow (vendor → service → time → confirmation)
- Contact page with vendor information and map
- SEO optimized with metadata and structured data

### Vendor Dashboard
- Cognito authentication with 1-hour inactivity timeout
- Role-based access (superadmin, admin, staff)
- Appointments management
- Services management (add, edit, toggle active/inactive)
- Staff management with inline editing
- Settings page

## Service Areas

**Maryland**: Fort Ritchie, Hagerstown, Thurmont, Smithsburg, Sabillasville, Leitersburg, Frederick

**Pennsylvania**: Waynesboro, Blue Ridge Summit, Gettysburg, Chambersburg

## Local Development

```bash
npm install
npm run dev
```

## Database Seeding

```bash
node scripts/seed-amplify.js
```

## Deployment

Deployed via AWS Amplify with automatic CI/CD from Git repository.


## Recent Updates

### Square Multi-Party Payment Integration
- ✅ Vendors can connect Square accounts via OAuth in Dashboard → Settings
- ✅ Bundle payments automatically split to each vendor's Square account
- ✅ Secure authentication - no credential sharing required
- ✅ Direct deposits to vendor Square accounts
- See `SQUARE_SETUP.md` for setup instructions
- See `docs/SQUARE_MULTI_PARTY_PAYMENTS.md` for technical details



## Issues

- should send an email to the person that signed up for an appointment
- text not coming through to vendor phone
- Relaxation, Beauty, and Wellness blocks should go to those specific services
- Get pictures
- Get Selene Glow services and information for listing
- Add new pictures
- Recurring services (sauna as first service)
- Winsome service updates
- Selene Glow services updated
- appointments show on calendar 
- for "Rebook" suggest rebooking dates after checkout? Skip to 4+ weeks into the future on a calendar?
- typically keep it on "week of" but checks "today" appointments at least daily.
- Typically keep the day up all day to be able to see upcoming appointments 
- remove old vendors
- some services offered by all or individuals
- some services hosted by "the house" and then a separate vendor performs the action so we need a "house" and "vendor" fees for services
- update Kera services
- similar font as KEra door for the names
- auto rent payment?
- just first name for vendor intros
- adjust the booking flow
    - book -> what day/week -> services
- have intros that allow individual booking, but also allow... not bundling, but being able to select multiple services and then request a week.
