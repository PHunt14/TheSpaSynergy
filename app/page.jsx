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
        <p style={{ color: 'var(--color-text-light)', marginTop: '1rem' }}>
          Your sanctuary for relaxation, beauty, and wellness
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <a href="/services" className="cta">Book an Appointment</a>
          <a href="/vendors" className="cta" style={{ background: 'var(--color-warm)' }}>Get to Know Us</a>
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
              backgroundImage: 'url(https://the-spa-synergy-public.s3.us-east-1.amazonaws.com/vendorPictures/spa_lounge-00.JPEG)',
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}>
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
              backgroundImage: 'url(https://the-spa-synergy-public.s3.us-east-1.amazonaws.com/vendorPictures/hair-00.JPEG)',
              backgroundSize: 'cover',
              backgroundPosition: 'center 30%'
            }}>
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
              backgroundImage: 'url(https://the-spa-synergy-public.s3.us-east-1.amazonaws.com/vendorPictures/grooms_party-00.JPG)',
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <h3>Events & Parties</h3>
              <p style={{ color: 'var(--color-text-light)' }}>Prepare and relax for your special occasions with our group services and event packages.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}