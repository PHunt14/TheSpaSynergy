import Link from 'next/link'

export default function Navbar() {
  return (
    <nav className="navbar">
      <div className="nav-inner">
        <Link href="/" className="nav-logo">
          Flat Top Studio
        </Link>

        <div className="nav-links">
          <Link href="/services">Services</Link>
          <Link href="/booking">Book Now</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/dashboard">Dashboard</Link>
        </div>
      </div>
    </nav>
  )
}