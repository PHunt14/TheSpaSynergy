export default function Home() {
  return (
    <main className="home">
      <section className="hero">
        <h1>Welcome to The Spa Synergy</h1>
        <a href="/booking" className="cta">Book an Appointment</a>
      </section>

      <section style={{ padding: '4rem 2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '3rem' }}>Experience Luxury & Wellness</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
          <div style={{
            borderRadius: '12px',
            overflow: 'hidden',
            background: 'var(--color-accent)'
          }}>
            <div style={{
              height: '250px',
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '1.2rem',
              fontWeight: 'bold'
            }}>
              [Relaxation]
            </div>
            <div style={{ padding: '1.5rem' }}>
              <h3>Relaxation Services</h3>
              <p style={{ color: 'var(--color-text-light)' }}>Unwind with our premium massage and wellness treatments.</p>
            </div>
          </div>
          <div style={{
            borderRadius: '12px',
            overflow: 'hidden',
            background: 'var(--color-accent)'
          }}>
            <div style={{
              height: '250px',
              background: 'linear-gradient(135deg, #f093fb, #f5576c)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '1.2rem',
              fontWeight: 'bold'
            }}>
              [Beauty]
            </div>
            <div style={{ padding: '1.5rem' }}>
              <h3>Beauty & Hair</h3>
              <p style={{ color: 'var(--color-text-light)' }}>Expert styling, coloring, and beauty treatments.</p>
            </div>
          </div>
          <div style={{
            borderRadius: '12px',
            overflow: 'hidden',
            background: 'var(--color-accent)'
          }}>
            <div style={{
              height: '250px',
              background: 'linear-gradient(135deg, #4facfe, #00f2fe)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '1.2rem',
              fontWeight: 'bold'
            }}>
              [Hair]
            </div>
            <div style={{ padding: '1.5rem' }}>
              <h3>Private Suites</h3>
              <p style={{ color: 'var(--color-text-light)' }}>Book exclusive spaces for your personal wellness journey.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}