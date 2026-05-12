'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import PropTypes from 'prop-types'
import BookingDisabled, { isBookingEnabled } from '../../components/BookingDisabled'
import { calculateBundlePrice, validateBundleServices } from '../../utils/bundleDiscount'
import { extractVendorIds } from '../../utils/extractVendorIds'

const MAX_SERVICES = 10
const MIN_SERVICES = 2
const MIN_VENDORS = 2

const MODES = [
  { key: 'predefined', label: 'Pre-Defined Bundles', description: 'Curated multi-vendor packages' },
  { key: 'byov', label: 'Build Your Own', description: 'Browse services by vendor and category' },
  { key: 'adhoc', label: 'Ad-Hoc Mix', description: 'Quickly pick services from multiple vendors' }
]

function handleKeyActivate(e, fn) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    fn()
  }
}

function MultiVendorBookingContent() {
  const router = useRouter()
  const [mode, setMode] = useState('predefined')
  const [loading, setLoading] = useState(true)
  const [services, setServices] = useState([])
  const [vendors, setVendors] = useState([])
  const [bundles, setBundles] = useState([])
  const [bundleSettings, setBundleSettings] = useState({
    discount2Services: 0,
    discount3Services: 0,
    discount4PlusServices: 0
  })
  const [selectedServiceIds, setSelectedServiceIds] = useState([])

  useEffect(() => {
    Promise.all([
      fetch('/api/services').then(r => r.json()),
      fetch('/api/vendors').then(r => r.json()),
      fetch('/api/bundles').then(r => r.json()),
      fetch('/api/bundle-settings').then(r => r.json())
    ])
      .then(([svc, vnd, bdl, stg]) => {
        setServices((svc.services || []).filter(s => s.isActive))
        setVendors(vnd.vendors || [])
        setBundles(bdl.bundles || [])
        setBundleSettings(stg.settings || {})
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading data:', err)
        setLoading(false)
      })
  }, [])

  const servicesById = useMemo(
    () => Object.fromEntries(services.map(s => [s.serviceId, s])),
    [services]
  )

  const vendorsById = useMemo(
    () => Object.fromEntries(vendors.map(v => [v.vendorId, v])),
    [vendors]
  )

  const selectedServices = useMemo(
    () => selectedServiceIds.map(id => servicesById[id]).filter(Boolean),
    [selectedServiceIds, servicesById]
  )

  // Only show active multi-vendor bundles whose services are all currently active (Requirement 2.4, 2.5)
  const displayableBundles = useMemo(() => {
    const activeServiceIds = new Set(services.map(s => s.serviceId))
    return bundles.filter(b => {
      if (!b.isActive) return false
      if ((b.vendorIds?.length || 0) < MIN_VENDORS) return false
      const ids = b.serviceIds || []
      if (ids.length < MIN_SERVICES) return false
      return ids.every(id => activeServiceIds.has(id))
    })
  }, [bundles, services])

  // Running total for custom/ad-hoc selections
  const running = useMemo(() => {
    const duration = selectedServices.reduce((sum, s) => sum + (s.duration || 0), 0)
    const vendorCount = extractVendorIds(selectedServices).length
    if (selectedServices.length === 0) {
      return { subtotal: 0, discountPercent: 0, discountAmount: 0, total: 0, duration: 0, vendorCount: 0 }
    }
    const price = calculateBundlePrice({
      services: selectedServices,
      predefinedBundle: null,
      bundleSettings
    })
    return { ...price, duration, vendorCount }
  }, [selectedServices, bundleSettings])

  const validation = useMemo(() => {
    if (selectedServices.length === 0) {
      return {
        valid: false,
        error: `Select at least ${MIN_SERVICES} services from ${MIN_VENDORS} different vendors to continue.`
      }
    }
    return validateBundleServices(selectedServices)
  }, [selectedServices])

  const toggleService = (serviceId) => {
    setSelectedServiceIds(prev => {
      if (prev.includes(serviceId)) {
        return prev.filter(id => id !== serviceId)
      }
      if (prev.length >= MAX_SERVICES) return prev
      return [...prev, serviceId]
    })
  }

  const clearSelection = () => setSelectedServiceIds([])

  const proceedCustom = () => {
    if (!validation.valid) return
    const params = new URLSearchParams({ services: selectedServiceIds.join(',') })
    router.push(`/booking/multi-vendor/time?${params}`)
  }

  const proceedPredefined = (bundle) => {
    const params = new URLSearchParams({
      bundleId: bundle.bundleId,
      services: (bundle.serviceIds || []).join(',')
    })
    router.push(`/booking/multi-vendor/time?${params}`)
  }

  // Change mode: clear selection when switching modes so state doesn't leak between flows
  const handleModeChange = (nextMode) => {
    const isCustomMode = (m) => m === 'byov' || m === 'adhoc'
    if (isCustomMode(mode) !== isCustomMode(nextMode)) {
      setSelectedServiceIds([])
    }
    setMode(nextMode)
  }

  if (!isBookingEnabled) return <BookingDisabled />
  if (loading) {
    return (
      <main style={{ padding: '2rem' }}>
        <h1>Loading...</h1>
      </main>
    )
  }

  const showRunningBar = mode !== 'predefined'

  return (
    <main style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto', paddingBottom: showRunningBar ? '8rem' : '2rem' }}>
      <h1>Multi-Vendor Bundle Booking</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        Book services from multiple vendors together as one seamless experience.
      </p>

      <ModeTabs mode={mode} onChange={handleModeChange} />

      {mode === 'predefined' && (
        <PredefinedMode
          bundles={displayableBundles}
          servicesById={servicesById}
          vendorsById={vendorsById}
          onSelect={proceedPredefined}
        />
      )}

      {mode === 'byov' && (
        <BuildYourOwnMode
          services={services}
          vendorsById={vendorsById}
          bundleSettings={bundleSettings}
          selectedServiceIds={selectedServiceIds}
          onToggle={toggleService}
        />
      )}

      {mode === 'adhoc' && (
        <AdHocMode
          services={services}
          vendorsById={vendorsById}
          selectedServiceIds={selectedServiceIds}
          onToggle={toggleService}
        />
      )}

      {showRunningBar && (
        <RunningTotalBar
          running={running}
          selectedCount={selectedServices.length}
          validation={validation}
          onClear={clearSelection}
          onContinue={proceedCustom}
        />
      )}
    </main>
  )
}

// ───────────────────────────────────────────────────────────────────────────────

function ModeTabs({ mode, onChange }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${MODES.length}, 1fr)`,
      gap: '0.5rem',
      marginBottom: '2rem',
      background: 'var(--color-accent)',
      padding: '0.5rem',
      borderRadius: '12px'
    }}>
      {MODES.map(m => {
        const active = mode === m.key
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onChange(m.key)}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              background: active ? 'var(--color-primary)' : 'transparent',
              color: active ? 'white' : 'var(--color-text)',
              fontWeight: active ? 600 : 400,
              textAlign: 'center',
              transition: '0.2s ease'
            }}
          >
            <div style={{ fontSize: '0.95rem' }}>{m.label}</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.2rem' }}>
              {m.description}
            </div>
          </button>
        )
      })}
    </div>
  )
}

ModeTabs.propTypes = {
  mode: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired
}

// ───────────────────────────────────────────────────────────────────────────────

function PredefinedBundleCard({ bundle, servicesById, vendorsById, onSelect }) {
  const bundleServices = (bundle.serviceIds || [])
    .map(id => servicesById[id])
    .filter(Boolean)
  const bundleVendors = (bundle.vendorIds || [])
    .map(id => vendorsById[id]?.name)
    .filter(Boolean)
  const totalDuration = bundleServices.reduce((sum, s) => sum + (s.duration || 0), 0)
  const originalPrice = bundleServices.reduce((sum, s) => sum + (s.price || 0), 0)
  const showSavings = originalPrice > bundle.price
  const activate = () => onSelect(bundle)

  return (
    <button
      type="button"
      onClick={activate}
      onKeyDown={(e) => handleKeyActivate(e, activate)}
      style={{
        background: 'var(--color-accent)',
        borderRadius: '12px',
        padding: '1.5rem',
        border: '2px solid var(--color-primary)',
        cursor: 'pointer',
        transition: 'transform 0.2s',
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
        width: '100%'
      }}
    >
      <h3 style={{ color: 'var(--color-primary)', marginBottom: '0.5rem' }}>{bundle.name}</h3>
      {bundle.description && (
        <p style={{ color: 'var(--color-text-light)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          {bundle.description}
        </p>
      )}
      {bundleVendors.length > 0 && (
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginBottom: '0.75rem' }}>
          {bundleVendors.join(' • ')}
        </p>
      )}
      <ul style={{ paddingLeft: '1.1rem', margin: '0 0 1rem 0', fontSize: '0.9rem' }}>
        {bundleServices.map(s => (
          <li key={s.serviceId} style={{ marginBottom: '0.25rem' }}>
            {s.name} <span style={{ color: 'var(--color-text-light)' }}>({s.duration} min)</span>
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>${bundle.price.toFixed(2)}</span>
        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
          {totalDuration} min total
        </span>
      </div>
      {showSavings && (
        <div style={{ fontSize: '0.85rem', color: 'var(--color-primary-dark)', marginTop: '0.25rem' }}>
          Save ${(originalPrice - bundle.price).toFixed(2)} vs à la carte
        </div>
      )}
    </button>
  )
}

PredefinedBundleCard.propTypes = {
  bundle: PropTypes.object.isRequired,
  servicesById: PropTypes.object.isRequired,
  vendorsById: PropTypes.object.isRequired,
  onSelect: PropTypes.func.isRequired
}

function PredefinedMode({ bundles, servicesById, vendorsById, onSelect }) {
  if (bundles.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-light)' }}>
        No pre-defined multi-vendor bundles are available right now. Try Build Your Own or Ad-Hoc Mix instead.
      </div>
    )
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      gap: '1.5rem'
    }}>
      {bundles.map(bundle => (
        <PredefinedBundleCard
          key={bundle.bundleId}
          bundle={bundle}
          servicesById={servicesById}
          vendorsById={vendorsById}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

PredefinedMode.propTypes = {
  bundles: PropTypes.array.isRequired,
  servicesById: PropTypes.object.isRequired,
  vendorsById: PropTypes.object.isRequired,
  onSelect: PropTypes.func.isRequired
}

// ───────────────────────────────────────────────────────────────────────────────

function VendorCategorySection({ vendor, byCategory, selectedServiceIds, onToggle }) {
  return (
    <section style={{ marginBottom: '2.5rem' }}>
      <h2 style={{
        color: 'var(--color-primary)',
        borderBottom: '2px solid var(--color-primary)',
        paddingBottom: '0.5rem',
        marginBottom: '1rem'
      }}>
        {vendor.name}
      </h2>
      {Object.entries(byCategory).map(([category, catServices]) => (
        <CategoryRow
          key={category}
          category={category}
          services={catServices}
          selectedServiceIds={selectedServiceIds}
          onToggle={onToggle}
        />
      ))}
    </section>
  )
}

VendorCategorySection.propTypes = {
  vendor: PropTypes.object.isRequired,
  byCategory: PropTypes.object.isRequired,
  selectedServiceIds: PropTypes.arrayOf(PropTypes.string).isRequired,
  onToggle: PropTypes.func.isRequired
}

function CategoryRow({ category, services, selectedServiceIds, onToggle }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ fontSize: '1rem', color: 'var(--color-text-light)', marginBottom: '0.75rem' }}>
        {category}
      </h3>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '0.75rem'
      }}>
        {services.map(svc => (
          <SelectableServiceCard
            key={svc.serviceId}
            service={svc}
            selected={selectedServiceIds.includes(svc.serviceId)}
            onToggle={() => onToggle(svc.serviceId)}
          />
        ))}
      </div>
    </div>
  )
}

CategoryRow.propTypes = {
  category: PropTypes.string.isRequired,
  services: PropTypes.array.isRequired,
  selectedServiceIds: PropTypes.arrayOf(PropTypes.string).isRequired,
  onToggle: PropTypes.func.isRequired
}

function BuildYourOwnMode({ services, vendorsById, bundleSettings, selectedServiceIds, onToggle }) {
  // Group: vendor → category → services
  const groupedByVendor = useMemo(() => {
    const byVendor = {}
    for (const svc of services) {
      if (svc.parentServiceIds?.length > 0) continue // skip add-ons
      const vid = svc.vendorId
      if (!byVendor[vid]) byVendor[vid] = {}
      const cat = svc.category || 'Other'
      if (!byVendor[vid][cat]) byVendor[vid][cat] = []
      byVendor[vid][cat].push(svc)
    }
    return byVendor
  }, [services])

  return (
    <div>
      <DiscountTiersBanner bundleSettings={bundleSettings} />
      {Object.entries(groupedByVendor).map(([vendorId, byCategory]) => {
        const vendor = vendorsById[vendorId]
        if (!vendor) return null
        return (
          <VendorCategorySection
            key={vendorId}
            vendor={vendor}
            byCategory={byCategory}
            selectedServiceIds={selectedServiceIds}
            onToggle={onToggle}
          />
        )
      })}
    </div>
  )
}

BuildYourOwnMode.propTypes = {
  services: PropTypes.array.isRequired,
  vendorsById: PropTypes.object.isRequired,
  bundleSettings: PropTypes.object.isRequired,
  selectedServiceIds: PropTypes.arrayOf(PropTypes.string).isRequired,
  onToggle: PropTypes.func.isRequired
}

// ───────────────────────────────────────────────────────────────────────────────

function VendorFlatSection({ vendor, services, selectedServiceIds, onToggle }) {
  return (
    <section style={{ marginBottom: '2rem' }}>
      <h2 style={{
        color: 'var(--color-primary)',
        borderBottom: '2px solid var(--color-primary)',
        paddingBottom: '0.5rem',
        marginBottom: '1rem'
      }}>
        {vendor.name}
      </h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '0.75rem'
      }}>
        {services.map(svc => (
          <SelectableServiceCard
            key={svc.serviceId}
            service={svc}
            selected={selectedServiceIds.includes(svc.serviceId)}
            onToggle={() => onToggle(svc.serviceId)}
          />
        ))}
      </div>
    </section>
  )
}

VendorFlatSection.propTypes = {
  vendor: PropTypes.object.isRequired,
  services: PropTypes.array.isRequired,
  selectedServiceIds: PropTypes.arrayOf(PropTypes.string).isRequired,
  onToggle: PropTypes.func.isRequired
}

function AdHocMode({ services, vendorsById, selectedServiceIds, onToggle }) {
  const byVendor = useMemo(() => {
    const g = {}
    for (const svc of services) {
      if (svc.parentServiceIds?.length > 0) continue
      const vid = svc.vendorId
      if (!g[vid]) g[vid] = []
      g[vid].push(svc)
    }
    return g
  }, [services])

  return (
    <div>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        Pick any services from different vendors. Minimum {MIN_SERVICES} services across {MIN_VENDORS}+ vendors, up to {MAX_SERVICES} services total.
      </p>
      {Object.entries(byVendor).map(([vendorId, vendorServices]) => {
        const vendor = vendorsById[vendorId]
        if (!vendor) return null
        return (
          <VendorFlatSection
            key={vendorId}
            vendor={vendor}
            services={vendorServices}
            selectedServiceIds={selectedServiceIds}
            onToggle={onToggle}
          />
        )
      })}
    </div>
  )
}

AdHocMode.propTypes = {
  services: PropTypes.array.isRequired,
  vendorsById: PropTypes.object.isRequired,
  selectedServiceIds: PropTypes.arrayOf(PropTypes.string).isRequired,
  onToggle: PropTypes.func.isRequired
}

// ───────────────────────────────────────────────────────────────────────────────

function SelectableServiceCard({ service, selected, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      onKeyDown={(e) => handleKeyActivate(e, onToggle)}
      style={{
        padding: '1rem',
        borderRadius: '8px',
        cursor: 'pointer',
        background: selected ? 'var(--color-primary)' : 'var(--color-accent)',
        color: selected ? 'white' : 'var(--color-text)',
        border: selected ? '2px solid var(--color-primary-dark)' : '2px solid transparent',
        transition: '0.2s ease',
        textAlign: 'left',
        font: 'inherit',
        width: '100%'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '0.5rem' }}>
        <strong>{service.name}</strong>
        <span style={{ fontSize: '1rem' }}>{selected ? '✓' : '+'}</span>
      </div>
      {service.description && (
        <div style={{ fontSize: '0.85rem', opacity: 0.9, margin: '0.5rem 0' }}>
          {service.description}
        </div>
      )}
      <div style={{ fontSize: '0.85rem', opacity: 0.85, marginTop: '0.5rem' }}>
        {service.duration} min • ${service.price}
      </div>
    </button>
  )
}

SelectableServiceCard.propTypes = {
  service: PropTypes.object.isRequired,
  selected: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired
}

// ───────────────────────────────────────────────────────────────────────────────

function DiscountTiersBanner({ bundleSettings }) {
  const tiers = [
    { count: '2 services', pct: bundleSettings.discount2Services || 0 },
    { count: '3 services', pct: bundleSettings.discount3Services || 0 },
    { count: '4+ services', pct: bundleSettings.discount4PlusServices || 0 }
  ].filter(t => t.pct > 0)

  if (tiers.length === 0) return null

  return (
    <div style={{
      background: '#fff3cd',
      border: '1px solid #ffc107',
      borderRadius: '8px',
      padding: '0.75rem 1rem',
      marginBottom: '1.5rem',
      fontSize: '0.9rem'
    }}>
      🎁 Bundle savings:{' '}
      {tiers.map((t, i) => (
        <span key={t.count}>
          {i > 0 ? ' • ' : ''}
          <strong>{t.count}</strong> save {t.pct}%
        </span>
      ))}
    </div>
  )
}

DiscountTiersBanner.propTypes = {
  bundleSettings: PropTypes.object.isRequired
}

// ───────────────────────────────────────────────────────────────────────────────

function RunningTotalBar({ running, selectedCount, validation, onClear, onContinue }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'white',
      borderTop: '2px solid var(--color-primary)',
      padding: '1rem 2rem',
      boxShadow: '0 -4px 12px rgba(0,0,0,0.08)',
      zIndex: 50
    }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <Stat label="Services" value={`${selectedCount} / ${MAX_SERVICES}`} />
          <Stat label="Vendors" value={String(running.vendorCount)} />
          <Stat label="Duration" value={formatDuration(running.duration)} />
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>Price</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
              {running.discountAmount > 0 && (
                <span style={{ textDecoration: 'line-through', color: 'var(--color-text-light)', fontWeight: 400, marginRight: '0.4rem' }}>
                  ${running.subtotal.toFixed(2)}
                </span>
              )}
              ${running.total.toFixed(2)}
              {running.discountPercent > 0 && (
                <span style={{ fontSize: '0.8rem', color: 'var(--color-primary-dark)', marginLeft: '0.4rem' }}>
                  −{running.discountPercent}%
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              style={{
                padding: '0.5rem 1rem',
                background: 'transparent',
                border: '1px solid var(--color-border, #ccc)',
                borderRadius: '8px',
                cursor: 'pointer',
                color: 'var(--color-text-light)',
                fontSize: '0.9rem'
              }}
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onContinue}
            disabled={!validation.valid}
            className={validation.valid ? 'cta' : ''}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              cursor: validation.valid ? 'pointer' : 'not-allowed',
              background: validation.valid ? 'var(--color-primary)' : '#ccc',
              color: 'white',
              fontWeight: 600,
              margin: 0
            }}
          >
            Continue to Time
          </button>
        </div>
      </div>

      {!validation.valid && selectedCount > 0 && (
        <div style={{
          maxWidth: '1100px',
          margin: '0.5rem auto 0',
          color: '#c0392b',
          fontSize: '0.85rem'
        }}>
          {validation.error}
        </div>
      )}
    </div>
  )
}

RunningTotalBar.propTypes = {
  running: PropTypes.shape({
    subtotal: PropTypes.number,
    discountPercent: PropTypes.number,
    discountAmount: PropTypes.number,
    total: PropTypes.number,
    duration: PropTypes.number,
    vendorCount: PropTypes.number
  }).isRequired,
  selectedCount: PropTypes.number.isRequired,
  validation: PropTypes.shape({
    valid: PropTypes.bool,
    error: PropTypes.string
  }).isRequired,
  onClear: PropTypes.func.isRequired,
  onContinue: PropTypes.func.isRequired
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>{label}</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{value}</div>
    </div>
  )
}

Stat.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired
}

function formatDuration(minutes) {
  if (!minutes) return '0 min'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// ───────────────────────────────────────────────────────────────────────────────

export default function MultiVendorBookingPage() {
  return (
    <Suspense fallback={<main style={{ padding: '2rem' }}><h1>Loading...</h1></main>}>
      <MultiVendorBookingContent />
    </Suspense>
  )
}
