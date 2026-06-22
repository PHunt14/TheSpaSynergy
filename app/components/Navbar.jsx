'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import CherryBlossomBorder from './CherryBlossomBorder'

export default function Navbar() {
  const [providers, setProviders] = useState([])
  const [showProviderDropdown, setShowProviderDropdown] = useState(false)

  useEffect(() => {
    fetch('/api/providers')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch')
        return res.json()
      })
      .then(data => setProviders(data.vendors || []))
      .catch(err => {
        console.error('Error loading providers for navbar:', err)
        setProviders([])
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
            onMouseEnter={() => setShowProviderDropdown(true)}
            onMouseLeave={() => setShowProviderDropdown(false)}
          >
            <Link href="/providers">Providers</Link>
            {showProviderDropdown && (
              <div className="dropdown-menu">
                {providers.length > 0 ? (
                  providers.map(provider => (
                    <Link key={provider.vendorId} href={`/providers/${provider.vendorId}`}>
                      {provider.name}
                    </Link>
                  ))
                ) : (
                  <div style={{ padding: '0.75rem 1rem', color: 'var(--color-text-light)' }}>
                    Loading providers...
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