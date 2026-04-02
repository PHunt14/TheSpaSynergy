'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import CherryBlossomBorder from './CherryBlossomBorder'

export default function Navbar() {
  const [vendors, setVendors] = useState([])
  const [showVendorDropdown, setShowVendorDropdown] = useState(false)

  useEffect(() => {
    fetch('/api/vendors')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch')
        return res.json()
      })
      .then(data => setVendors(data.vendors || []))
      .catch(err => {
        console.error('Error loading vendors for navbar:', err)
        setVendors([])
      })
  }, [])

  return (
    <nav className="navbar">
      <div className="nav-inner">
        <Link href="/" className="nav-logo">
          The Spa Synergy
        </Link>

        <div className="nav-links">
          <div 
            className="nav-dropdown"
            onMouseEnter={() => setShowVendorDropdown(true)}
            onMouseLeave={() => setShowVendorDropdown(false)}
          >
            <Link href="/vendors">Practitioners</Link>
            {showVendorDropdown && (
              <div className="dropdown-menu">
                {vendors.length > 0 ? (
                  vendors.map(vendor => (
                    <Link key={vendor.vendorId} href={`/vendors/${vendor.vendorId}`}>
                      {vendor.name}
                    </Link>
                  ))
                ) : (
                  <div style={{ padding: '0.75rem 1rem', color: 'var(--color-text-light)' }}>
                    Loading practitioners...
                  </div>
                )}
              </div>
            )}
          </div>
          <Link href="/bundles">Packages</Link>
          <Link href="/booking">Book Now</Link>
          <Link href="/contact">Contact</Link>
        </div>
      </div>
      <CherryBlossomBorder style={{ position: 'absolute', bottom: 0, left: 0, opacity: 0.6, zIndex: 0 }} />
    </nav>
  )
}