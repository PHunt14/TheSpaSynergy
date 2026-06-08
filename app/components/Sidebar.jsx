'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { fetchAuthSession } from 'aws-amplify/auth'

export default function Sidebar() {
  const [userRole, setUserRole] = useState(null)

  useEffect(() => {
    const loadRole = async () => {
      try {
        const session = await fetchAuthSession()
        const role = session.tokens?.idToken?.payload['custom:role'] || 'staff'
        // Map legacy roles to the two-role model
        const normalizedRole = role === 'admin' ? 'admin' : 'staff'
        setUserRole(normalizedRole)
      } catch {
        setUserRole('staff')
      }
    }
    loadRole()
  }, [])

  const isAdmin = userRole === 'admin'

  return (
    <aside className="sidebar">
      <h2 className="sidebar-title">Dashboard</h2>

      <nav className="sidebar-nav">
        <Link href="/dashboard">Overview</Link>
        <Link href="/dashboard/calendar">Calendar</Link>
        <Link href="/dashboard/services">Services</Link>
        <Link href="/dashboard/bundles">Packages</Link>
        {isAdmin && <Link href="/dashboard/providers">Providers</Link>}
        <Link href="/dashboard/staff">Staff</Link>
        <Link href="/dashboard/clients">Clients</Link>
        {isAdmin && <Link href="/dashboard/settings">Settings</Link>}
        <Link href="/dashboard/help">Help</Link>
      </nav>
    </aside>
  )
}