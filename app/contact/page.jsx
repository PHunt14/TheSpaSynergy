export default function ContactPage() {
  return (
    <main className="booking-container">
      <h1>Contact Us</h1>

      <p style={{ color: 'var(--color-text-light)', marginBottom: '1.5rem' }}>
        We’d love to hear from you. Reach out anytime.
      </p>

      <div style={{ marginBottom: '2rem' }}>
        <h3>Our Location</h3>
        <p>123 Serenity Lane<br/>Frederick, MD 21701</p>

        <p style={{ marginTop: '1rem' }}>
          <strong>Phone:</strong> (555) 123‑4567<br/>
          <strong>Email:</strong> info@serenitystudio.com
        </p>
      </div>

      <div className="map-placeholder">
        <p>Map Placeholder</p>
      </div>
    </main>
  )
}