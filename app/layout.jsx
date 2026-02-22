import './styles/globals.css'
import './styles/variables.css'
import './styles/globals.css'
import './styles/variables.css'
import Navbar from './components/Navbar'
import Footer from './components/Footer'


export const metadata = {
  title: 'Spa Synergy',
  description: 'Demo for booking + dashboard',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
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
