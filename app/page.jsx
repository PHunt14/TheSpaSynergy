import CherryBlossom from './components/CherryBlossom';
import CherryBlossomHero from './components/CherryBlossomHero';
import CherryBlossomHeading from './components/CherryBlossomHeading';

export const metadata = {
  title: 'The Spa Synergy | Day Spa in Cascade & Fort Ritchie, MD',
  description: 'Book head spa treatments, scalp facials, massage, hair styling, infrared sauna, and private spa room services at The Spa Synergy in Cascade (Fort Ritchie), MD. Serving Hagerstown, Thurmont, Emmitsburg, Frederick, Waynesboro, Chambersburg & surrounding areas.',
  keywords: 'head spa, head spa Maryland, scalp facial, spa room, infrared sauna, massage, hair styling, day spa Cascade MD, Fort Ritchie spa, wellness, relaxation, Hagerstown spa',
  openGraph: {
    title: 'The Spa Synergy | Head Spa, Sauna & Wellness in Cascade, MD',
    description: 'Head spa treatments, scalp facials, infrared sauna, private spa room, massage, and beauty services in Cascade (Fort Ritchie), MD. Serving Washington County and the tri-state area.',
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
          <a href="/bundles" className="cta" style={{ background: 'var(--color-primary)' }}>View Packages</a>
        </div>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
          <a href="/sauna" className="cta" style={{ background: 'var(--color-warm)' }}>Book the Sauna</a>
          <a href="/spa-room" className="cta" style={{ background: '#7B6D8F' }}>Book the Spa Room</a>
        </div>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
          <a href="/vendors" className="cta" style={{ background: 'transparent', border: '2px solid var(--color-primary)', color: 'var(--color-primary)' }}>Get to Know Us</a>
        </div>
      </section>

      <section style={{ padding: '4rem 2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <CherryBlossomHeading text="Experience Luxury & Wellness" />
          <p style={{ color: 'var(--color-text-light)', maxWidth: '700px', margin: '1rem auto 0' }}>
            Located at Fort Ritchie in Cascade, Maryland — serving Hagerstown, Thurmont, Emmitsburg, Frederick, Waynesboro, Blue Ridge Summit, Chambersburg, and the surrounding tri-state area.
          </p>
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

      {/* Packages Section */}
      <section style={{ padding: '4rem 2rem', maxWidth: '1200px', margin: '0 auto', textAlign: 'center' }}>
        <CherryBlossomHeading text="Spa Packages" />
        <p style={{ color: 'var(--color-text-light)', maxWidth: '700px', margin: '1rem auto 2rem' }}>
          Save with our curated wellness experiences — bundled services at a special price. Perfect for groups, couples, or a personal retreat.
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/bundles" className="cta" style={{ background: 'var(--color-primary)' }}>
            View Packages & Pricing
          </a>
          <a href="tel:240-329-6537" className="cta" style={{ background: 'transparent', border: '2px solid var(--color-primary)', color: 'var(--color-primary)' }}>
            📞 Call to Book a Package
          </a>
        </div>
      </section>

      {/* Spa Room Feature Section */}
      <section style={{ padding: '4rem 2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '2.5rem',
          alignItems: 'center',
        }}>
          <div style={{
            borderRadius: '16px',
            overflow: 'hidden',
            height: '350px',
            backgroundImage: 'url(https://the-spa-synergy-public.s3.us-east-1.amazonaws.com/vendorPictures/SpaRoom04.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }} />
          <div>
            <h2 style={{ marginBottom: '1rem' }}>The Spa Room Experience</h2>
            <p style={{ color: 'var(--color-text-light)', fontSize: '1.05rem', lineHeight: '1.7', marginBottom: '1rem' }}>
              Step into our private spa room for an experience unlike anything else in the tri-state area. From our signature head spa and scalp facial treatments to rejuvenating full facials, our spa room services are designed for deep relaxation and total renewal.
            </p>
            <p style={{ color: 'var(--color-text-light)', fontSize: '1.05rem', lineHeight: '1.7', marginBottom: '1.5rem' }}>
              Our head spa combines scalp massage, cleansing, and nourishing treatments to promote healthy hair growth and deep stress relief. Whether you need a solo escape or want to treat yourself to something special, the spa room offers an intimate, tranquil space dedicated entirely to your comfort.
            </p>
            <a href="/spa-room" className="cta" style={{ background: 'var(--color-warm)' }}>
              Explore Spa Room Services →
            </a>
          </div>
        </div>
      </section>

      <section style={{ padding: '3rem 2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>Serving the Tri-State Area</h2>
        <p style={{ textAlign: 'center', color: 'var(--color-text-light)', maxWidth: '700px', margin: '0 auto 1.5rem' }}>
          The Spa Synergy is conveniently located at 14310 Castle Dr, Cascade (Fort Ritchie), MD 21719.
          We proudly serve clients from across Maryland, Pennsylvania, and West Virginia.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.5rem', maxWidth: '800px', margin: '0 auto' }}>
          {[
            { town: 'Cascade', state: 'MD' }, { town: 'Hagerstown', state: 'MD' },
            { town: 'Thurmont', state: 'MD' }, { town: 'Emmitsburg', state: 'MD' },
            { town: 'Smithsburg', state: 'MD' }, { town: 'Boonsboro', state: 'MD' },
            { town: 'Williamsport', state: 'MD' }, { town: 'Frederick', state: 'MD' },
            { town: 'Waynesboro', state: 'PA' }, { town: 'Chambersburg', state: 'PA' },
            { town: 'Gettysburg', state: 'PA' }, { town: 'Hanover', state: 'PA' },
            { town: 'Greencastle', state: 'PA' }, { town: 'Blue Ridge Summit', state: 'PA' },
            { town: 'Martinsburg', state: 'WV' }, { town: 'Charles Town', state: 'WV' },
            { town: 'Shepherdstown', state: 'WV' },
          ].map(({ town, state }) => (
            <span key={`${town}-${state}`} style={{
              padding: '0.4rem 0.9rem', borderRadius: '999px',
              background: 'var(--color-accent)', border: '1px solid var(--color-border)',
              fontSize: '0.9rem', color: 'var(--color-text-light)',
            }}>{town}, {state}</span>
          ))}
        </div>
      </section>
    </main>
  )
}