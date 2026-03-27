export const metadata = {
  title: 'Terms of Service | The Spa Synergy',
}

export default function TermsPage() {
  return (
    <main style={{ maxWidth: '720px', margin: '0 auto', padding: '2rem 1rem' }}>
      <h1>Terms of Service</h1>
      <p style={{ color: 'var(--color-text-light)' }}>Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

      <h2>Booking &amp; Appointments</h2>
      <p>By booking through The Spa Synergy, you agree to provide accurate contact information. Appointments may require vendor confirmation before being finalized.</p>

      <h2>SMS Terms of Service</h2>
      <p>By opting in to SMS notifications at checkout, you consent to receive automated text messages from The Spa Synergy related to your appointment. These messages may include booking confirmations, appointment reminders, cancellation notices, and rescheduling updates.</p>
      <ul>
        <li><strong>Message frequency:</strong> Approximately 1–5 messages per booking</li>
        <li><strong>Message and data rates may apply</strong> depending on your mobile carrier and plan</li>
        <li><strong>Opt out:</strong> Reply <strong>STOP</strong> to any message to unsubscribe</li>
        <li><strong>Help:</strong> Reply <strong>HELP</strong> for assistance</li>
        <li>SMS consent is not required to book an appointment</li>
        <li>We do not sell or share your opt-in information with third parties for marketing</li>
      </ul>
      <p>Supported carriers include major US carriers. Service may not be available on all carriers.</p>

      <h2>Payments</h2>
      <p>Online payments are processed securely through Square. In-person payment is available for all services. Refund policies are determined by individual vendors.</p>

      <h2>Contact</h2>
      <p>Questions? Visit our <a href="/contact">contact page</a>.</p>
    </main>
  )
}
