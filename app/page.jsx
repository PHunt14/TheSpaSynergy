import CherryBlossom from './components/CherryBlossom';
import CherryBlossomHero from './components/CherryBlossomHero';
import CherryBlossomHeading from './components/CherryBlossomHeading';

export const metadata = {
  title: 'The Spa Synergy | Luxury Spa & Wellness Services in Fort Ritchie, MD',
  description: 'Book premium spa, beauty, and wellness services at The Spa Synergy in Fort Ritchie, MD. Expert massage, hair styling, and private suite rentals.',
  keywords: 'spa Fort Ritchie, massage Fort Ritchie MD, hair salon Fort Ritchie, beauty services Maryland, wellness center, spa near Hagerstown MD, massage Thurmont MD, salon Smithsburg MD, spa Sabillasville MD, wellness Leitersburg MD, spa Frederick MD, massage Waynesboro PA, salon Blue Ridge Summit PA, spa Gettysburg PA, wellness Chambersburg PA',
  openGraph: {
    title: 'The Spa Synergy | Luxury Spa & Wellness',
    description: 'Premium spa and wellness services in Fort Ritchie, MD',
    type: 'website',
    locale: 'en_US',
  },
}

export default function Home() {
  return (
    <main className="home">
      <section className="hero">
        <h1>Welcome to The Spa Synergy</h1>
        <p style={{ fontSize: '1.2rem', color: 'var(--color-text-light)', marginTop: '1rem' }}>
          Your sanctuary for relaxation, beauty, and wellness
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <a href="/booking" className="cta">Book an Appointment</a>
          <a href="/vendors" className="cta" style={{ background: 'var(--color-warm)' }}>Meet Our Vendors</a>
        </div>
      </section>

      <section style={{ padding: '4rem 2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <CherryBlossomHeading text="Experience Luxury & Wellness" />
        </div>
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
              <h3>Wellness</h3>
              <p style={{ color: 'var(--color-text-light)' }}>Holistic treatments for mind, body, and spirit balance.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}