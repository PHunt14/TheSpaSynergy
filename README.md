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
- Role-based access (owner, admin, vendor)
- Owner role: exclusive access to Square payment integration
- Admin role: can access Square payment integration and manage all vendors
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
- Recurring services (sauna as first service)
- for "Rebook" suggest rebooking dates after checkout? Skip to 4+ weeks into the future on a calendar?
- typically keep it on "week of" but checks "today" appointments at least daily.
- Typically keep the day up all day to be able to see upcoming appointments 
- remove old vendors
- some services offered by all or individuals
- some services hosted by "the house" and then a separate vendor performs the action so we need a "house" and "vendor" fees for services
- update Kera services
- auto rent payment?
- adjust the booking flow
    - book -> what day/week -> services
- have intros that allow individual booking, but also allow... not bundling, but being able to select multiple services and then request a week.

## Future Enhancements

### Square Catalog Integration
Currently, in-person payments allow vendors to charge custom amounts in their Square POS app. Future enhancement could integrate with Square's catalog system:
- Add `squareCatalogItemId` field to services
- Automatically create charges using Square catalog items
- Sync pricing between The Spa Synergy and Square
- Better reporting and analytics through Square's inventory system
- Automatic service tracking and reconciliation
### Other
- a vendor should be able to export or text them selves a link to the appointments for the day to their phone in the format of their choosing





# Current Acceptance Criteria for The Spa Synergy

## Booking flow
- Vendors can collect payment from the website when their square accounts are connected
- Vendors will get a text message when an appointment is scheduled
- Customers will get a text message when an appointment is scheduled
- vendors can set services as "requires confirmation" and the customer can select the desired date/time and this then gives the vendor an opportunity to confirm the date/time for the appointment.  The customer and vendor should get a text message what an appointment is both scheduled and then in this case when it is confirmed.
- some services are charged a "house fee" in that the "house" (a specific vendor that owns the building) takes a portion of the total for providing the area for the service

## Vendor dashboard
- There is a vendor dashboard that can only be accessed with credentials
- Vendors can see appointments and paid amounts on the vendor dashboard
- Vendors can see total paid amounts for a time period; week, month, year on the vendor dashboard
- Vendors can add, change, and remove services on the vendor dashboard
- Vendors can connect their square accounts on the vendor dashboard
- Vendors can add other staff members on the vendor dashboard
- Vendors can add links to their social media pages on the vendor dashboard
- Vendors can update and add contact information on the Vendor dashboard
- a staff member for one vendor cannot see the appointments or payment information for another vendor
- a vendor can cancel, reschedule, and confirm appointments from the vendor dashboard
- a vendor should be able to set whether all of only a selection of employees can complete a service (how do we define the list of employees, I think from the employees able to login for a specific vendor, not including admins)

## Vendor Information
- Vendors have a page with a brief description and introduction of staff members with pictures
- contact information is displayed on the vendor pages and the contact page
- from the vendor pages you should also be able to access their services
- there is a page where a customer can select from a list of all services, they can multi-select form here to schedule multiple services

