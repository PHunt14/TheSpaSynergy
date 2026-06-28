'use client'

import { useState } from 'react'
import VendorSettings from './VendorSettings'
import BuildingSettings from './BuildingSettings'
import CategorySettings from './CategorySettings'

const SECTIONS = {
  VENDOR: 'vendor',
  BUILDING: 'building',
  CATEGORIES: 'categories',
}

export default function AdminSettings({ currentUser, vendors, selectedVendorId, setSelectedVendorId, showMessage }) {
  const [activeSection, setActiveSection] = useState(SECTIONS.CATEGORIES)

  const sectionBtn = (section, label) => ({
    padding: '0.5rem 1rem',
    borderRadius: '999px',
    border: '2px solid var(--color-primary)',
    background: activeSection === section ? 'var(--color-primary)' : 'transparent',
    color: activeSection === section ? 'white' : 'var(--color-primary)',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 500,
    transition: '0.2s ease',
  })

  return (
    <div>
      <div style={{
        background: '#fff3e0',
        border: '1px solid #ffb74d',
        borderRadius: '8px',
        padding: '0.75rem 1rem',
        marginBottom: '1.5rem',
        maxWidth: '600px',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}>
        <span style={{ fontSize: '1.1rem' }}>🔒</span>
        <span style={{ fontSize: '0.9rem', color: '#e65100', fontWeight: 500 }}>
          Admin only — these settings affect the entire platform.
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '2rem' }}>
        <button
          style={sectionBtn(SECTIONS.CATEGORIES)}
          onClick={() => setActiveSection(SECTIONS.CATEGORIES)}
        >
          Service Categories
        </button>
        <button
          style={sectionBtn(SECTIONS.VENDOR)}
          onClick={() => setActiveSection(SECTIONS.VENDOR)}
        >
          Provider Settings
        </button>
        <button
          style={sectionBtn(SECTIONS.BUILDING)}
          onClick={() => setActiveSection(SECTIONS.BUILDING)}
        >
          Building & Hours
        </button>
      </div>

      {activeSection === SECTIONS.CATEGORIES && (
        <CategorySettings showMessage={showMessage} />
      )}
      {activeSection === SECTIONS.VENDOR && (
        <VendorSettings
          currentUser={currentUser}
          vendors={vendors}
          selectedVendorId={selectedVendorId}
          setSelectedVendorId={setSelectedVendorId}
          showMessage={showMessage}
        />
      )}
      {activeSection === SECTIONS.BUILDING && (
        <BuildingSettings
          currentUser={currentUser}
          showMessage={showMessage}
        />
      )}
    </div>
  )
}
