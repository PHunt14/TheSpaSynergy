export const metadata = {
  title: 'Booking & SMS Example | The Spa Synergy',
}

export default function BookingExamplePage() {
  return (
    <main style={{ maxWidth: '720px', margin: '0 auto', padding: '2rem 1rem' }}>
      <h1>SMS Opt-In &amp; Messaging Example</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        This page demonstrates how customers opt in to SMS notifications and the messages they receive.
      </p>

      {/* Opt-in example */}
      <div style={{ background: 'var(--color-accent)', borderRadius: '12px', padding: '2rem', marginBottom: '2rem' }}>
        <h2 style={{ marginTop: 0 }}>Opt-In at Checkout</h2>
        <p>During the booking checkout, customers see the following checkbox (unchecked by default):</p>
        <div style={{ background: 'white', borderRadius: '8px', padding: '1.5rem', border: '1px solid var(--color-border)', marginTop: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" readOnly style={{ marginTop: '0.25rem' }} />
            <span style={{ fontSize: '0.9rem', color: 'var(--color-text-light)' }}>
              I agree to receive automated SMS appointment updates from The Spa Synergy (e.g. confirmations, reminders, cancellations). Msg frequency: ~1–5 msgs per booking. Msg &amp; data rates may apply. Reply STOP to cancel, HELP for help. Consent is not required to book. <a href="/privacy" style={{ color: 'var(--color-primary)' }}>Privacy Policy</a> &amp; <a href="/terms" style={{ color: 'var(--color-primary)' }}>Terms</a>.
            </span>
          </label>
        </div>
      </div>

      {/* Example messages */}
      <div style={{ background: 'var(--color-accent)', borderRadius: '12px', padding: '2rem', marginBottom: '2rem' }}>
        <h2 style={{ marginTop: 0 }}>Example SMS Messages</h2>

        <h3>Booking Confirmation (to customer)</h3>
        <div style={{ background: '#dcf8c6', borderRadius: '12px', padding: '1rem', maxWidth: '340px', fontFamily: 'sans-serif', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
          Your appointment with Winsome Woods has been booked!<br /><br />
          Service: Massage - 60 min<br />
          With: Sarah<br />
          Date/Time: Jul 15, 2025, 2:00 PM<br /><br />
          The Spa Synergy<br />
          Reply STOP to opt out
        </div>

        <h3>New Booking Alert (to vendor/staff)</h3>
        <div style={{ background: '#dcf8c6', borderRadius: '12px', padding: '1rem', maxWidth: '340px', fontFamily: 'sans-serif', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
          New Booking Alert!<br /><br />
          Service: Massage - 60 min<br />
          Customer: Jane Doe<br />
          Phone: 240-555-0100<br />
          Date/Time: Jul 15, 2025, 2:00 PM<br /><br />
          The Spa Synergy<br />
          Reply STOP to opt out
        </div>
      </div>

      {/* Policies */}
      <div style={{ background: 'var(--color-accent)', borderRadius: '12px', padding: '2rem' }}>
        <h2 style={{ marginTop: 0 }}>SMS Program Details</h2>
        <ul style={{ lineHeight: '1.8' }}>
          <li><strong>Program:</strong> The Spa Synergy appointment notifications</li>
          <li><strong>Message types:</strong> Booking confirmations, reminders, cancellations, rescheduling updates</li>
          <li><strong>Frequency:</strong> ~1–5 messages per booking</li>
          <li><strong>Opt out:</strong> Reply STOP to any message</li>
          <li><strong>Help:</strong> Reply HELP for assistance</li>
          <li><strong>Message and data rates may apply</strong></li>
          <li><strong>Consent is not required to book an appointment</strong></li>
          <li>See our <a href="/privacy" style={{ color: 'var(--color-primary)' }}>Privacy Policy</a> and <a href="/terms" style={{ color: 'var(--color-primary)' }}>Terms of Service</a></li>
        </ul>
      </div>
    </main>
  )
}
