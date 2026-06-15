'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: '📊' },
  { href: '/dashboard/calendar', label: 'Calendar', icon: '📅' },
  { href: '/dashboard/services', label: 'Services', icon: '💆' },
  { href: '/dashboard/bundles', label: 'Packages', icon: '📦' },
  { href: '/dashboard/vendors', label: 'Practitioners', icon: '👤' },
  { href: '/dashboard/staff', label: 'Staff', icon: '👥' },
  { href: '/dashboard/clients', label: 'Clients', icon: '🧑‍🤝‍🧑' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
  { href: '/dashboard/help', label: 'Help', icon: '❓' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [isMobile, setIsMobile] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const isActive = (href) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  // Mobile: overlay drawer
  if (isMobile) {
    return (
      <>
        {/* Hamburger button */}
        <button
          className="sidebar-mobile-toggle"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          ☰
        </button>

        {/* Overlay */}
        {mobileOpen && (
          <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} onKeyDown={(e) => { if (e.key === 'Escape') setMobileOpen(false) }} role="presentation">
            <aside className="sidebar sidebar-mobile" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Navigation menu">
              <div className="sidebar-header">
                <h2 className="sidebar-title">Dashboard</h2>
                <button className="sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">✕</button>
              </div>
              <nav className="sidebar-nav">
                {navItems.map(item => (
                  <Link key={item.href} href={item.href} className={isActive(item.href) ? 'active' : ''}>
                    <span className="sidebar-icon">{item.icon}</span>
                    <span className="sidebar-label">{item.label}</span>
                  </Link>
                ))}
              </nav>
            </aside>
          </div>
        )}
      </>
    )
  }

  // Desktop: collapsed with hover-to-expand
  return (
    <aside
      className={`sidebar ${hovered ? 'sidebar-expanded' : 'sidebar-collapsed'}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <h2 className="sidebar-title">{hovered ? 'Dashboard' : '✦'}</h2>
      <nav className="sidebar-nav">
        {navItems.map(item => (
          <Link key={item.href} href={item.href} className={isActive(item.href) ? 'active' : ''}>
            <span className="sidebar-icon">{item.icon}</span>
            {hovered && <span className="sidebar-label">{item.label}</span>}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
