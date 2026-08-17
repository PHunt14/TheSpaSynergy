'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { fetchAuthSession } from 'aws-amplify/auth'
import ServicesSection from './components/ServicesSection'
import AddOnsSection from './components/AddOnsSection'
import ExtrasSection from './components/ExtrasSection'

export default function ServicesPage() {
  const searchParams = useSearchParams()
  const [services, setServices] = useState([])
  const [staffSchedules, setStaffSchedules] = useState([])
  const [existingCategories, setExistingCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentUserRole, setCurrentUserRole] = useState(null)
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'services')

  useEffect(() => {
    initPage()
  }, [])

  const initPage = async () => {
    try {
      const [session, scheduleRes] = await Promise.all([
        fetchAuthSession(),
        fetch('/api/staff-schedules?all=true').then(r => r.json()),
      ])
      const role = session.tokens?.idToken?.payload['custom:role'] || 'staff'
      const normalizedRole = role === 'admin' ? 'admin' : 'staff'
      setCurrentUserRole(normalizedRole)
      setStaffSchedules(scheduleRes.schedules || [])

      await loadServices()
      await loadCategories()
    } catch (error) {
      console.error('Error initializing page:', error)
    }
  }

  const loadServices = async () => {
    setLoading(true)
    try {
      const data = await fetch('/api/services?includeInactive=true').then(r => r.json())
      setServices(data.services || [])
    } catch (err) {
      console.error('Error loading services:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadCategories = async () => {
    try {
      const res = await fetch('/api/categories')
      const data = await res.json()
      const cats = (data.categories || []).map(c => c.name)
      setExistingCategories(cats.sort((a, b) => a.localeCompare(b)))
    } catch (err) {
      console.error('Error loading categories:', err)
    }
  }

  const tabs = [
    { key: 'services', label: '💆 Services', count: services.filter(s => !s.parentServiceIds?.length).length },
    { key: 'addons', label: '🧩 Add-Ons', count: services.filter(s => s.parentServiceIds?.length > 0).length },
    { key: 'extras', label: '🧺 Extras' },
  ]

  if (loading && services.length === 0) {
    return <div style={{ padding: '2rem' }}>Loading...</div>
  }

  return (
    <div>
      <h1>Services & Extras</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '1.5rem' }}>
        Manage services, add-ons, and hospitality extras in one place.
      </p>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: '0',
        borderBottom: '2px solid var(--color-border)',
        marginBottom: '2rem',
        overflowX: 'auto',
      }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderBottom: activeTab === tab.key ? '3px solid var(--color-primary)' : '3px solid transparent',
              background: activeTab === tab.key ? 'var(--color-accent)' : 'transparent',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: activeTab === tab.key ? '600' : '400',
              color: activeTab === tab.key ? 'var(--color-primary)' : 'var(--color-text-light)',
              whiteSpace: 'nowrap',
              borderRadius: '8px 8px 0 0',
              transition: 'all 0.2s ease',
            }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span style={{
                marginLeft: '0.5rem',
                fontSize: '0.8rem',
                background: activeTab === tab.key ? 'var(--color-primary)' : '#e0e0e0',
                color: activeTab === tab.key ? 'white' : '#666',
                padding: '0.15rem 0.5rem',
                borderRadius: '10px',
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'services' && (
        <ServicesSection
          services={services}
          staffSchedules={staffSchedules}
          existingCategories={existingCategories}
          currentUserRole={currentUserRole}
          onReload={loadServices}
          onLoadCategories={loadCategories}
        />
      )}

      {activeTab === 'addons' && (
        <AddOnsSection
          services={services}
          staffSchedules={staffSchedules}
          onReload={loadServices}
        />
      )}

      {activeTab === 'extras' && (
        <ExtrasSection />
      )}
    </div>
  )
}
