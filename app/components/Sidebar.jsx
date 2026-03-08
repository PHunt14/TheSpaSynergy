import Link from 'next/link'

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <h2 className="sidebar-title">Dashboard</h2>

      <nav className="sidebar-nav">
        <Link href="/dashboard">Overview</Link>
        <Link href="/dashboard/appointments">Appointments</Link>
        <Link href="/dashboard/services">Services</Link>
        <Link href="/dashboard/bundles">Bundles</Link>
        <Link href="/dashboard/vendors">Vendors</Link>
        <Link href="/dashboard/staff">Staff</Link>
        <Link href="/dashboard/settings">Settings</Link>
      </nav>
    </aside>
  )
}