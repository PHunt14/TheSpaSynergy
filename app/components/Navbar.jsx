import Link from 'next/link'

export default function Navbar() {
  return (
    <nav className="navbar">
      <div className="nav-inner">
        <Link href="/" className="nav-logo">
          The Spa Synergy
        </Link>

        <div className="nav-links">
          <Link href="/vendors">Vendors</Link>
          <Link href="/bundles">Bundles</Link>
          <Link href="/booking">Book Now</Link>
          <Link href="/contact">Contact</Link>
        </div>
      </div>
    </nav>
  )
}