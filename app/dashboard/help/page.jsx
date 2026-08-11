'use client'

import { useState } from 'react'

const sections = [
  {
    title: 'Overview',
    description:
      'Your home screen. See appointment counts (total, confirmed, pending) and revenue summaries for the current week, month, and year. Click a revenue card to view the confirmed appointments for that period.',
  },
  {
    title: 'Calendar',
    description:
      'Visual calendar view of your appointments with day, week, and multi-staff views. Color-coded blocks show appointment status at a glance — orange for pending, blue for confirmed, green for paid, and red for cancelled. Click any block to see details or make changes. Use the multi-staff view to see all practitioners\' schedules side by side.',
  },
  {
    title: 'Transactions',
    description:
      'View all appointments with payment and status details in one place. Filter by date range to see completed payments, pending appointments, and cancellations. Each transaction shows the service, client, staff member, payment status, and amount collected via Square.',
  },
  {
    title: 'Services',
    description:
      'Add, edit, and deactivate the services you offer. Set pricing, duration, buffer time, and category. You can assign which staff members are qualified to perform each service, enable house fees, set consultation requirements, and configure multi-provider services for group bookings.',
  },
  {
    title: 'Packages (Bundles)',
    description:
      'Create and manage service packages — grouped bundles of services customers can book together at a discounted price. Configure multi-day packages, set allowed booking days, add optional add-ons, and define service order. Bundle discount tiers can be set globally in Bundle Settings.',
  },
  {
    title: 'Providers',
    description:
      'Admin view of all vendor practitioners on the platform. See who is active, manage vendor-level details, set working hours, and configure buffer times between appointments. Admins can add new vendors and toggle their active status.',
  },
  {
    title: 'Staff',
    description:
      'Add and manage your staff members. Set a weekly schedule for each staff member — the days and hours they work by default. Use Date Overrides to open or close your books for any specific date, regardless of the weekly schedule (e.g. working a Saturday you normally have off, or closing for a holiday). You can also set "every other week" recurrence for days you only work bi-weekly. Auto-assign rules let bookings on selected days go directly to a staff member. SMS and email alerts can be enabled per staff member, and staff can connect their own Square account for direct payments.',
  },
  {
    title: 'Clients',
    description:
      'View and manage your client database. Search clients by name, phone, or email. Click a client to see their appointment history and add internal notes. You can add new clients manually, edit their details, and keep a running log of notes visible to your team.',
  },
  {
    title: 'Settings',
    description:
      'Configure your vendor profile and platform integrations. Connect your Square account for online payments, enable or disable SMS alerts, set your alert phone number, and add social media links (Facebook, Instagram, TikTok, website). Staff members will also see a "Your Payment Account" section to connect their own Square account. Admins have access to additional platform-wide settings.',
  },
  {
    title: 'Booking & Kiosk',
    description:
      'Customers can book appointments through your public booking page, browse available services, and select preferred time slots. The kiosk mode provides an on-site check-in experience for walk-in clients. Split payment sessions allow groups to divide costs evenly or by custom amounts.',
  },
]

const platformUpdates = [
  {
    version: 'v1.5.0',
    date: 'July 2025',
    title: 'Staff Schedule Date Overrides',
    changes: [
      'Staff schedules now support date-specific overrides — open or close your books for any individual date',
      'Override open: work a day you normally have off (e.g. a specific Saturday), with custom hours',
      'Override closed: block off a specific date even if it falls on a normally-working day (e.g. a holiday)',
      'Overrides take priority over the weekly schedule and any recurrence rules',
      'Removed confusing “2nd of month” recurrence option — date overrides replace this use case cleanly',
      'Schedule list now shows override count alongside weekly hours summary',
    ],
  },
    date: 'July 2025',
    title: 'Split Payments & Group Booking Enhancements',
    changes: [
      'Added split payment sessions — groups can now divide payment equally or with custom amounts',
      'Multi-provider service bookings for group spa experiences',
      'Bundle schedule configuration for multi-day packages',
      'Refund tracking on bundle records',
    ],
  },
  {
    version: 'v1.3.0',
    date: 'June 2025',
    title: 'Client Management & Notes',
    changes: [
      'New Clients page with search, add, and edit functionality',
      'Client notes system — add, edit, and delete internal notes per client',
      'Client appointment history visible from client detail view',
      'Secondary indexes on client phone and email for faster lookups',
    ],
  },
  {
    version: 'v1.2.0',
    date: 'May 2025',
    title: 'Calendar Overhaul & Multi-Staff Views',
    changes: [
      'Multi-staff day view — see all practitioners\' schedules side by side',
      'Multi-staff week view for full-week overview across staff',
      'Overlap layout engine for concurrent appointments',
      'Blocked time support directly in calendar',
      'Color-coded appointment blocks by status and payment state',
    ],
  },
  {
    version: 'v1.1.0',
    date: 'April 2025',
    title: 'Square Integration & Staff Payments',
    changes: [
      'Full Square OAuth integration for vendors and individual staff members',
      'Per-staff Square account connection for direct payments',
      'Payment status tracking on all appointments',
      'Square catalog mappings for staff schedules',
      'Automatic token refresh handling',
    ],
  },
  {
    version: 'v1.0.0',
    date: 'March 2025',
    title: 'Platform Launch',
    changes: [
      'Multi-vendor spa marketplace with service booking',
      'Appointment management with pending/confirmed workflow',
      'Service categories, pricing, and staff assignment',
      'Bundle/package system with tiered discounts',
      'Staff scheduling with working hours and buffer times',
      'SMS and email notification system',
      'Vendor settings and social media links',
      'Public booking page and kiosk mode',
      'Admin dashboard with analytics overview',
    ],
  },
]

const TABS = {
  DOCS: 'docs',
  UPDATES: 'updates',
}

export default function HelpPage() {
  const [activeTab, setActiveTab] = useState(TABS.DOCS)

  return (
    <div>
      <h1>Help & Updates</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '1.5rem' }}>
        Documentation and platform release notes for your vendor dashboard.
      </p>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
        <button
          onClick={() => setActiveTab(TABS.DOCS)}
          style={{
            padding: '0.6rem 1.2rem',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === TABS.DOCS ? '600' : '400',
            background: activeTab === TABS.DOCS ? 'var(--color-primary)' : 'var(--color-accent)',
            color: activeTab === TABS.DOCS ? '#fff' : 'var(--color-text)',
            transition: 'all 0.2s',
          }}
        >
          📖 Help Docs
        </button>
        <button
          onClick={() => setActiveTab(TABS.UPDATES)}
          style={{
            padding: '0.6rem 1.2rem',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === TABS.UPDATES ? '600' : '400',
            background: activeTab === TABS.UPDATES ? 'var(--color-primary)' : 'var(--color-accent)',
            color: activeTab === TABS.UPDATES ? '#fff' : 'var(--color-text)',
            transition: 'all 0.2s',
          }}
        >
          🚀 Platform Updates
        </button>
      </div>

      {/* Help Docs Tab */}
      {activeTab === TABS.DOCS && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {sections.map((s) => (
              <div
                key={s.title}
                style={{
                  background: 'var(--color-accent)',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  borderLeft: '4px solid var(--color-primary)',
                }}
              >
                <h3 style={{ marginBottom: '0.5rem' }}>{s.title}</h3>
                <p style={{ color: 'var(--color-text-light)', margin: 0, lineHeight: 1.6 }}>
                  {s.description}
                </p>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: '2rem',
              background: 'var(--color-accent)',
              borderRadius: '12px',
              padding: '1.5rem',
            }}
          >
            <h3 style={{ marginBottom: '0.5rem' }}>Need more help?</h3>
            <p style={{ color: 'var(--color-text-light)', margin: 0, lineHeight: 1.6 }}>
              Contact the site administrator or reach out via the{' '}
              <a href="/contact" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>
                Contact page
              </a>.
            </p>
          </div>
        </>
      )}

      {/* Platform Updates Tab */}
      {activeTab === TABS.UPDATES && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <p style={{ color: 'var(--color-text-light)', margin: 0 }}>
            Stay up to date with the latest platform improvements, new features, and bug fixes.
          </p>

          {platformUpdates.map((release) => (
            <div
              key={release.version}
              style={{
                background: 'var(--color-accent)',
                borderRadius: '12px',
                padding: '1.5rem',
                borderLeft: '4px solid var(--color-primary)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0 }}>{release.title}</h3>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span
                    style={{
                      padding: '0.2rem 0.6rem',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      background: 'var(--color-primary)',
                      color: '#fff',
                    }}
                  >
                    {release.version}
                  </span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
                    {release.date}
                  </span>
                </div>
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--color-text-light)', lineHeight: 1.8 }}>
                {release.changes.map((change, i) => (
                  <li key={i}>{change}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
