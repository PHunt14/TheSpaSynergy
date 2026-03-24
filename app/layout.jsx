import './styles/globals.css'
import './styles/variables.css'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import CherryBlossom from './components/CherryBlossom'
import { Allura, Quicksand } from 'next/font/google'

const allura = Allura({ subsets: ['latin'], weight: '400', variable: '--font-allura' })
const quicksand = Quicksand({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-quicksand' })

export const metadata = {
  title: 'Spa Synergy',
  description: 'Demo for booking + dashboard',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${allura.variable} ${quicksand.variable}`}>
      <body className="layout-body">
        <Navbar />
        <div className="layout-content">
          {children}
        </div>
        <Footer />
      </body>
    </html>
  )
}
