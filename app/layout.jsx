import './styles/globals.css'
import './styles/variables.css'
import './amplify-config'
import Script from 'next/script'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import CherryBlossom from './components/CherryBlossom'
import AnalyticsProvider from './components/AnalyticsProvider'
import { Allura, Quicksand } from 'next/font/google'
import { Suspense } from 'react'

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

const allura = Allura({ subsets: ['latin'], weight: '400', variable: '--font-allura' })
const quicksand = Quicksand({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-quicksand' })

export const metadata = {
  title: 'Spa Synergy',
  description: 'Luxury spa and wellness booking — Fort Ritchie, MD',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${allura.variable} ${quicksand.variable}`}>
      {GA_ID && (
        <head>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}');`}
          </Script>
        </head>
      )}
      <body className="layout-body">
        <Navbar />
        <div style={{ background: 'var(--color-accent)', borderBottom: '2px solid var(--color-primary)', padding: '0.5rem 1rem', textAlign: 'center', fontSize: '0.95rem', fontFamily: 'var(--font-quicksand), sans-serif', color: 'var(--color-primary-dark)' }}>
          🚧 We&rsquo;re still under construction &mdash; online booking coming soon! <a href="/contact" style={{ fontWeight: 'bold', color: 'var(--color-primary-dark)' }}>Contact us</a> to schedule.
        </div>
        <Suspense fallback={null}>
          <AnalyticsProvider>
            <div className="layout-content">
              {children}
            </div>
          </AnalyticsProvider>
        </Suspense>
        <div style={{ background: 'var(--color-accent)', borderTop: '2px solid var(--color-primary)', padding: '0.5rem 1rem', textAlign: 'center', fontSize: '0.95rem', fontFamily: 'var(--font-quicksand), sans-serif', color: 'var(--color-primary-dark)' }}>
          🚧 We&rsquo;re still under construction &mdash; online booking coming soon! <a href="/contact" style={{ fontWeight: 'bold', color: 'var(--color-primary-dark)' }}>Contact us</a> to schedule.
        </div>
        <Footer />
      </body>
    </html>
  )
}
