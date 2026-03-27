'use client'

const sections = [
  {
    title: 'Overview',
    description:
      'Your home screen. See appointment counts (total, confirmed, pending) and revenue summaries for the current week, month, and year. Click a revenue card to view the confirmed appointments for that period.',
  },
  {
    title: 'Calendar',
    description:
      'Visual calendar view of your upcoming appointments. Use this to quickly see your schedule for any day or week.',
  },
  {
    title: 'Appointments',
    description:
      'View, confirm, cancel, or reschedule appointments. Services marked "requires confirmation" will appear as pending until you approve them. Both you and the customer are notified on any status change.',
  },
  {
    title: 'Services',
    description:
      'Add, edit, and deactivate the services you offer. Set pricing, duration, and category. You can also assign which staff members are qualified to perform each service.',
  },
  {
    title: 'Bundles',
    description:
      'Create and manage service bundles — grouped packages of services customers can book together at a bundled price.',
  },
  {
    title: 'Practitioners',
    description:
      'Admin and owner view of all vendor practitioners. See who is active and manage vendor-level details.',
  },
  {
    title: 'Staff',
    description:
      'Add and manage your staff members. Staff can be assigned to specific services so customers know who will be performing their appointment.',
  },
  {
    title: 'Settings',
    description:
      'Configure your vendor profile, connect your Square account for online payments, enable or disable SMS alerts, set your alert phone number, and add social media links (Facebook, Instagram, TikTok, website).',
  },
]

export default function HelpPage() {
  return (
    <div>
      <h1>Dashboard Help</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        A quick guide to each section of your vendor dashboard.
      </p>

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
    </div>
  )
}
