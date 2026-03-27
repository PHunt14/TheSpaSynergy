export const metadata = {
  title: 'Privacy Policy | The Spa Synergy',
}

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: '720px', margin: '0 auto', padding: '2rem 1rem' }}>
      <h1>Privacy Policy</h1>
      <p style={{ color: 'var(--color-text-light)' }}>Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

      <h2>Overview</h2>
      <p>The Spa Synergy (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) respects your privacy. This policy explains how we collect, use, and protect your personal information when you use our website and booking services.</p>

      <h2>Information We Collect</h2>
      <ul>
        <li>Name, email address, and phone number (provided when booking)</li>
        <li>Appointment and service preferences</li>
        <li>Payment information (processed securely through Square; we do not store card details)</li>
      </ul>

      <h2>How We Use Your Information</h2>
      <ul>
        <li>To schedule and manage your appointments</li>
        <li>To send booking confirmations, reminders, and updates via email and/or SMS</li>
        <li>To process payments</li>
        <li>To communicate with you about your appointments</li>
      </ul>

      <h2>SMS/Text Messaging</h2>
      <p>If you opt in to SMS notifications during booking, we will send you text messages related to your appointment (confirmations, reminders, cancellations, and rescheduling updates). You will receive approximately 1–5 messages per booking. Message and data rates may apply.</p>
      <p>You can opt out at any time by replying <strong>STOP</strong> to any message. Reply <strong>HELP</strong> for assistance. Opting out of SMS will not affect your appointment.</p>
      <p>We do not sell, rent, or share your phone number or SMS opt-in consent with third parties for marketing purposes. Your information is only shared with the service provider(s) fulfilling your appointment.</p>

      <h2>Data Sharing</h2>
      <p>We do not sell your personal information. We share data only with:</p>
      <ul>
        <li>Vendors and staff members providing your booked services</li>
        <li>Payment processors (Square) to complete transactions</li>
        <li>Cloud service providers (AWS) for hosting and notifications</li>
      </ul>

      <h2>Data Security</h2>
      <p>We use industry-standard security measures including encryption in transit and at rest to protect your information.</p>

      <h2>Contact Us</h2>
      <p>Questions about this policy? Contact us at <a href="/contact">our contact page</a>.</p>
    </main>
  )
}
