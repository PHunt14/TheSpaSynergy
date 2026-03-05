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



## Issues

- should send an email to the person that signed up for an appointment
- text not coming through to vendor phone
- Relaxation, Beauty, and Wellness blocks should go to those specific services
- Get pictures
- Get Selene Glow services and information for listing
- admin should be able to add a new vendor

