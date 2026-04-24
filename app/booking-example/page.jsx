'use client'

export default function BookingExamplePage() {
  return (
    <main>
      <h1>Review Booking</h1>
      <p style={{ color: 'var(--color-text-light)' }}>
        Review your appointment details and enter your information.
      </p>

      <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--color-accent)', borderRadius: '8px' }}>
        <h3>Appointment Summary</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span>Deep Tissue Massage (60 min)</span>
          <span>$120</span>
        </div>
        <p style={{ marginTop: '0.75rem' }}><strong>Date:</strong> July 15, 2025</p>
        <p><strong>Time:</strong> 2:00 PM</p>
        <p><strong>With:</strong> Kera</p>
      </div>

      <form style={{ marginTop: '2rem' }} onSubmit={(e) => e.preventDefault()}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Full Name *</label>
          <input type="text" placeholder="Jane Doe" readOnly
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Email *</label>
          <input type="email" placeholder="jane@example.com" readOnly
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Phone *</label>
          <input type="tel" placeholder="(240) 555-0100" readOnly
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" readOnly style={{ marginTop: '0.25rem' }} />
            <span style={{ fontSize: '0.9rem', color: 'var(--color-text-light)' }}>
              I agree to receive automated SMS appointment updates from The Spa Synergy (e.g. confirmations, reminders, cancellations). Msg frequency: ~1–5 msgs per booking. Msg &amp; data rates may apply. Reply STOP to cancel, HELP for help. Consent is not required to book. <a href="/privacy" style={{ color: 'var(--color-primary)' }}>Privacy Policy</a> &amp; <a href="/terms" style={{ color: 'var(--color-primary)' }}>Terms</a>.
            </span>
          </label>
        </div>

        <div style={{ marginTop: '2rem', marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Payment Method *</label>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{
              flex: 1, padding: '1rem', borderRadius: '8px', border: '2px solid var(--color-border)',
              background: 'white', textAlign: 'center'
            }}>
              Pay Now (Card)
            </div>
            <div style={{
              flex: 1, padding: '1rem', borderRadius: '8px', border: '2px solid var(--color-primary)',
              background: 'var(--color-accent)', textAlign: 'center'
            }}>
              ● Pay In-Person
            </div>
          </div>
        </div>

        <button type="button" className="cta" style={{ width: '100%', marginTop: '1rem' }}>
          Submit Booking
        </button>
      </form>
    </main>
  )
}
