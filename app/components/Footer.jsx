import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-left">
          <h3>Serenity Studio</h3>
          <p>123 Serenity Lane<br/>Frederick, MD 21701</p>
        </div>

        <div className="footer-links">
          <Link href="/services">Services</Link>
          <Link href="/booking">Book Now</Link>
          <Link href="/contact">Contact</Link>
        </div>
      </div>

      <div className="footer-bottom">
        © {new Date().getFullYear()} Serenity Studio. All rights reserved.
      </div>
    </footer>
  )
}