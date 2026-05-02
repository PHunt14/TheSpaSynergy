import './styles/globals.css'
import './styles/variables.css'
import './amplify-config'
import Script from 'next/script'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import CherryBlossom from './components/CherryBlossom'
import { Allura, Quicksand } from 'next/font/google'

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

const allura = Allura({ subsets: ['latin'], weight: '400', variable: '--font-allura' })
const quicksand = Quicksand({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-quicksand' })

export const metadata = {
  title: {
    default: 'The Spa Synergy | Day Spa in Cascade & Fort Ritchie, MD',
    template: '%s | The Spa Synergy',
  },
  description: 'Luxury day spa in Cascade (Fort Ritchie), MD. Massage, hair styling, infrared sauna, and wellness services. Serving Hagerstown, Thurmont, Emmitsburg, Frederick, Waynesboro, Chambersburg & surrounding areas.',
  metadataBase: new URL('https://thespasynergy.com'),
  alternates: { canonical: '/' },
  openGraph: {
    title: 'The Spa Synergy | Day Spa in Cascade & Fort Ritchie, MD',
    description: 'Premium spa, massage, hair, and wellness services in Cascade (Fort Ritchie), MD. Serving Washington County and the tri-state area.',
    type: 'website',
    locale: 'en_US',
    url: 'https://thespasynergy.com',
    siteName: 'The Spa Synergy',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'DaySpa',
  name: 'The Spa Synergy',
  url: 'https://thespasynergy.com',
  telephone: '+1-240-329-6537',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '14310 Castle Dr',
    addressLocality: 'Cascade',
    addressRegion: 'MD',
    postalCode: '21719',
    addressCountry: 'US',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 39.7242,
    longitude: -77.4828,
  },
  areaServed: [
    // Maryland
    { '@type': 'City', name: 'Cascade, MD' },
    { '@type': 'City', name: 'Fort Ritchie, MD' },
    { '@type': 'City', name: 'Hagerstown, MD' },
    { '@type': 'City', name: 'Thurmont, MD' },
    { '@type': 'City', name: 'Emmitsburg, MD' },
    { '@type': 'City', name: 'Smithsburg, MD' },
    { '@type': 'City', name: 'Sabillasville, MD' },
    { '@type': 'City', name: 'Leitersburg, MD' },
    { '@type': 'City', name: 'Boonsboro, MD' },
    { '@type': 'City', name: 'Sharpsburg, MD' },
    { '@type': 'City', name: 'Williamsport, MD' },
    { '@type': 'City', name: 'Funkstown, MD' },
    { '@type': 'City', name: 'Keedysville, MD' },
    { '@type': 'City', name: 'Myersville, MD' },
    { '@type': 'City', name: 'Middletown, MD' },
    { '@type': 'City', name: 'Walkersville, MD' },
    { '@type': 'City', name: 'Taneytown, MD' },
    { '@type': 'City', name: 'Frederick, MD' },
    // Pennsylvania
    { '@type': 'City', name: 'Waynesboro, PA' },
    { '@type': 'City', name: 'Blue Ridge Summit, PA' },
    { '@type': 'City', name: 'Rouzerville, PA' },
    { '@type': 'City', name: 'Pen Mar, PA' },
    { '@type': 'City', name: 'Mont Alto, PA' },
    { '@type': 'City', name: 'Fayetteville, PA' },
    { '@type': 'City', name: 'Greencastle, PA' },
    { '@type': 'City', name: 'Chambersburg, PA' },
    { '@type': 'City', name: 'Fairfield, PA' },
    { '@type': 'City', name: 'Gettysburg, PA' },
    { '@type': 'City', name: 'New Oxford, PA' },
    { '@type': 'City', name: 'Hanover, PA' },
    // West Virginia
    { '@type': 'City', name: 'Martinsburg, WV' },
    { '@type': 'City', name: 'Charles Town, WV' },
    { '@type': 'City', name: 'Shepherdstown, WV' },
    { '@type': 'City', name: 'Harpers Ferry, WV' },
  ],
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Spa Services',
    itemListElement: [
      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Massage Therapy' } },
      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Hair Styling & Coloring' } },
      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Infrared Sauna' } },
      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Wellness Treatments' } },
    ],
  },
  sameAs: [],
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${allura.variable} ${quicksand.variable}`}>
      <head>
        {GA_ID && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}');`}
            </Script>
          </>
        )}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="layout-body">
        <Navbar />
        {process.env.NEXT_PUBLIC_BOOKING_ENABLED !== 'true' && (
          <div style={{ background: 'var(--color-accent)', borderBottom: '2px solid var(--color-primary)', padding: '0.5rem 1rem', textAlign: 'center', fontSize: '0.95rem', fontFamily: 'var(--font-quicksand), sans-serif', color: 'var(--color-primary-dark)' }}>
            🚧 We&rsquo;re still under construction &mdash; online booking coming soon! <a href="/contact" style={{ fontWeight: 'bold', color: 'var(--color-primary-dark)' }}>Contact us</a> to schedule.
          </div>
        )}
        <div className="layout-content">
          {children}
        </div>
        {process.env.NEXT_PUBLIC_BOOKING_ENABLED !== 'true' && (
          <div style={{ background: 'var(--color-accent)', borderTop: '2px solid var(--color-primary)', padding: '0.5rem 1rem', textAlign: 'center', fontSize: '0.95rem', fontFamily: 'var(--font-quicksand), sans-serif', color: 'var(--color-primary-dark)' }}>
            🚧 We&rsquo;re still under construction &mdash; online booking coming soon! <a href="/contact" style={{ fontWeight: 'bold', color: 'var(--color-primary-dark)' }}>Contact us</a> to schedule.
          </div>
        )}
        <Footer />
      </body>
    </html>
  )
}
