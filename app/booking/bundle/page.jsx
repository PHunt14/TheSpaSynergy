'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import PropTypes from 'prop-types'
import BookingDisabled, { isBookingEnabled } from '../../components/BookingDisabled'
import { calculateBundlePrice } from '../../utils/bundleDiscount'

const MAX_SERVICES = 10
const MIN_SERVICES = 2

const MODES = [
  { key: 'predefined', label: 'Pre-Defined Bundles', description: 'Curated spa packages' },
  { key: 'byov', label: 'Build Your Own', description: 'Browse services by category' },
  { key: 'adhoc', label: 'Ad-Hoc Mix', description: 'Quickly pick services from all categories' }
]

function handleKeyActivate(e, fn) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    fn()
  }
}

function BundleBookingContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const bundleId = searchParams.get('id')

  // If a bundleId query param is present, show the pre-defined bundle detail view
  if (bundleId) {
    return <PredefinedBundleDetail bundleId={bundleId} />
  }

  // Otherwise show the bundle builder flow (replaces multi-vendor page)
  return <BundleBuilderFlow />
}

// ─── Pre-Defined Bundle Detail View ──────────────────────────────────────────

function PredefinedBundleDetail({ bundleId }) {
  const [bundle, setBundle] = useState(null)
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [people, setPeople] = useState(null)
  const [selectedAddOns, setSelectedAddOns] = useState({})

  const hasGroupSize = bundle?.minPeople && bundle?.maxPeople
  const addOns = bundle?.addOns ? (typeof bundle.addOns === 'string' ? JSON.parse(bundle.addOns) : bundle.addOns) : []

  useEffect(() => {
    if (!bundleId) return

    Promise.all([
      fetch('/api/bundles').then(res => res.json()),
      fetch('/api/services').then(res => res.json())
    ])
      .then(([bundlesData, servicesData]) => {
        const foundBundle = bundlesData.bundles?.find(b => b.bundleId === bundleId)
        setBundle(foundBundle)
        if (foundBundle?.minPeople) setPeople(foundBundle.minPeople)
        
        if (foundBundle) {
          const bundleServices = servicesData.services?.filter(s => 
            foundBundle.serviceIds.includes(s.serviceId)
          ) || []
          setServices(bundleServices)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [bundleId])

  if (loading) return <main><h1>Loading...</h1></main>
  if (!bundle) return <main><h1>Package not found</h1></main>

  const perPersonPrice = bundle.price
  const isGroup = people && people >= 3
  const addOnTotal = addOns.reduce((sum, ao, i) => {
    if (!selectedAddOns[i]) return sum
    if (ao.groupOnly && !isGroup) return sum
    return sum + (ao.perPerson ? ao.price * (people || 1) : ao.price)
  }, 0)
  const totalPrice = (perPersonPrice * (people || 1)) + addOnTotal

  const continueParams = new URLSearchParams({
    bundleId: bundle.bundleId,
    services: bundle.serviceIds.join(',')
  })
  if (hasGroupSize) continueParams.set('people', people)
  // Pass selected add-on service IDs
  const addOnServiceIds = addOns
    .filter((ao, i) => selectedAddOns[i] && (!ao.groupOnly || isGroup) && ao.serviceId)
    .map(ao => ao.serviceId)
  if (addOnServiceIds.length > 0) continueParams.set('addOnServices', addOnServiceIds.join(','))
  if (addOnTotal > 0) continueParams.set('addOnTotal', addOnTotal)

  return (
    <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <Link href="/bundles" style={{ color: 'var(--color-primary)', marginBottom: '2rem', display: 'inline-block' }}>
        ← Back to Packages
      </Link>

      <h1>{bundle.name}</h1>
      <p style={{ color: 'var(--color-text-light)', fontSize: '1.1rem', marginBottom: '2rem' }}>
        {bundle.description}
      </p>

      <div style={{ background: 'var(--color-accent)', padding: '2rem', borderRadius: '12px', marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Included Services</h3>
        {services.map(service => (
          <div key={service.serviceId} style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span><strong>{service.name}</strong></span>
              <span>{service.duration} min</span>
            </div>
          </div>
        ))}

        {hasGroupSize && (
          <div style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Number of People</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <select
                value={people}
                onChange={(e) => setPeople(parseInt(e.target.value))}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  fontSize: '1.1rem',
                  cursor: 'pointer'
                }}
              >
                {Array.from({ length: bundle.maxPeople - bundle.minPeople + 1 }, (_, i) => bundle.minPeople + i).map(n => (
                  <option key={n} value={n}>{n} {n === 1 ? 'person' : 'people'}</option>
                ))}
              </select>
              <span style={{ color: 'var(--color-text-light)' }}>
                ${perPersonPrice.toFixed(2)} per person
              </span>
            </div>
          </div>
        )}

        {addOns.length > 0 && (
          <div style={{ marginTop: '1.5rem' }}>
            <h3 style={{ marginBottom: '0.75rem' }}>Add-Ons</h3>
            {addOns.map((ao, i) => {
              const disabled = ao.groupOnly && !isGroup
              return (
                <label
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.75rem', borderRadius: '8px', marginBottom: '0.5rem',
                    background: disabled ? '#f5f5f5' : 'white',
                    opacity: disabled ? 0.5 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!selectedAddOns[i] && !disabled}
                    disabled={disabled}
                    onChange={(e) => setSelectedAddOns({ ...selectedAddOns, [i]: e.target.checked })}
                  />
                  <span style={{ flex: 1 }}>
                    <strong>{ao.name}</strong>
                    {ao.perPerson && <span style={{ color: 'var(--color-text-light)' }}> (per person)</span>}
                    {disabled && <span style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}> — available for groups of 3+</span>}
                  </span>
                  <span style={{ fontWeight: '600' }}>+${ao.price}</span>
                </label>
              )
            })}
          </div>
        )}

        <div style={{ marginTop: '1.5rem', fontSize: '1.3rem', fontWeight: 'bold' }}>
          Total: ${totalPrice.toFixed(2)}
        </div>
      </div>

      <div style={{
        background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px',
        padding: '1rem', marginBottom: '1.5rem', fontSize: '0.9rem'
      }}>
        📅 Spa Packages are available <strong>Fridays through Mondays</strong> only.
      </div>

      {isBookingEnabled ? (
        <Link
          href={`/booking/bundle-time?${continueParams}`}
          className="cta"
        >
          Continue to Schedule
        </Link>
      ) : (
        <BookingDisabled />
      )}
    </main>
  )
}

PredefinedBundleDetail.propTypes = {
  bundleId: PropTypes.string.isRequired
}

// ─── Bundle Builder Flow (formerly multi-vendor) ─────────────────────────────

function BundleBuilderFlow() {
  const router = useRouter()
  const [mode, setMode] = useState('predefined')
  const [loading, setLoading] = useState(true)
  const [services, setServices] = useState([])
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
      fetch('/api/bundles').then(r => r.json()),
      fetch('/api/bundle-settings').then(r => r.json())
    ])
      .then(([svc, bdl, stg]) => {
        setServices((svc.services || []).filter(s => s.isActive))
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

  const selectedServices = useMemo(
    () => selectedServiceIds.map(id => servicesById[id]).filter(Boolean),
    [selectedServiceIds, servicesById]
  )

  // Show active bundles whose services are all currently active
  const displayableBundles = useMemo(() => {
    const activeServiceIds = new Set(services.map(s => s.serviceId))
    return bundles.filter(b => {
      if (!b.isActive) return false
      const ids = b.serviceIds || []
      if (ids.length < MIN_SERVICES) return false
      return ids.every(id => activeServiceIds.has(id))
    })
  }, [bundles, services])

  // Running total for custom/ad-hoc selections
  const running = useMemo(() => {
    const duration = selectedServices.reduce((sum, s) => sum + (s.duration || 0), 0)
    if (selectedServices.length === 0) {
      return { subtotal: 0, discountPercent: 0, discountAmount: 0, total: 0, duration: 0 }
    }
    const price = calculateBundlePrice({
      services: selectedServices,
      predefinedBundle: null,
      bundleSettings
    })
    return { ...price, duration }
  }, [selectedServices, bundleSettings])

  const validation = useMemo(() => {
    if (selectedServices.length === 0) {
      return {
        valid: false,
        error: `Select at least ${MIN_SERVICES} services to continue.`
      }
    }
    if (selectedServices.length < MIN_SERVICES) {
      return { valid: false, error: `Bundle requires at least ${MIN_SERVICES} services` }
    }
    if (selectedServices.length > MAX_SERVICES) {
      return { valid: false, error: `Maximum ${MAX_SERVICES} services per bundle` }
    }
    // Check all services are active
    const inactiveService = selectedServices.find(s => !s.isActive)
    if (inactiveService) {
      return { valid: false, error: `Service ${inactiveService.name || inactiveService.serviceId} is no longer available` }
    }
    return { valid: true, error: null }
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
    router.push(`/booking/bundle/time?${params}`)
  }

  const proceedPredefined = (bundle) => {
    const params = new URLSearchParams({
      bundleId: bundle.bundleId,
      services: (bundle.serviceIds || []).join(',')
    })
    router.push(`/booking/bundle/time?${params}`)
  }

  // Change mode: clear selection when switching modes
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
      <h1>Bundle Booking</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        Book multiple services together as one seamless experience.
      </p>

      <ModeTabs mode={mode} onChange={handleModeChange} />

      {mode === 'predefined' && (
        <PredefinedMode
          bundles={displayableBundles}
          servicesById={servicesById}
          onSelect={proceedPredefined}
        />
      )}

      {mode === 'byov' && (
        <BuildYourOwnMode
          services={services}
          bundleSettings={bundleSettings}
          selectedServiceIds={selectedServiceIds}
          onToggle={toggleService}
        />
      )}

      {mode === 'adhoc' && (
        <AdHocMode
          services={services}
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

function PredefinedBundleCard({ bundle, servicesById, onSelect }) {
  const bundleServices = (bundle.serviceIds || [])
    .map(id => servicesById[id])
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
  onSelect: PropTypes.func.isRequired
}

function PredefinedMode({ bundles, servicesById, onSelect }) {
  if (bundles.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-light)' }}>
        No pre-defined bundles are available right now. Try Build Your Own or Ad-Hoc Mix instead.
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
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

PredefinedMode.propTypes = {
  bundles: PropTypes.array.isRequired,
  servicesById: PropTypes.object.isRequired,
  onSelect: PropTypes.func.isRequired
}

// ───────────────────────────────────────────────────────────────────────────────

/**
 * Groups services by category for browsing.
 * Services without categories go in "Other".
 */
function groupByCategory(services) {
  const groups = {}
  for (const svc of services) {
    if (svc.parentServiceIds?.length > 0) continue // skip add-ons
    const cats = svc.categories && Array.isArray(svc.categories) && svc.categories.length > 0
      ? svc.categories
      : [svc.category || 'Other']
    for (const cat of cats) {
      const categoryName = cat || 'Other'
      if (!groups[categoryName]) groups[categoryName] = []
      groups[categoryName].push(svc)
    }
  }
  return groups
}

function CategorySection({ category, services, selectedServiceIds, onToggle }) {
  return (
    <section style={{ marginBottom: '2.5rem' }}>
      <h2 style={{
        color: 'var(--color-primary)',
        borderBottom: '2px solid var(--color-primary)',
        paddingBottom: '0.5rem',
        marginBottom: '1rem'
      }}>
        {category}
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

CategorySection.propTypes = {
  category: PropTypes.string.isRequired,
  services: PropTypes.array.isRequired,
  selectedServiceIds: PropTypes.arrayOf(PropTypes.string).isRequired,
  onToggle: PropTypes.func.isRequired
}

function BuildYourOwnMode({ services, bundleSettings, selectedServiceIds, onToggle }) {
  const grouped = useMemo(() => groupByCategory(services), [services])

  // Sort categories alphabetically with "Other" at end
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    if (a === 'Other') return 1
    if (b === 'Other') return -1
    return a.localeCompare(b)
  })

  return (
    <div>
      <DiscountTiersBanner bundleSettings={bundleSettings} />
      {sortedCategories.map(category => (
        <CategorySection
          key={category}
          category={category}
          services={grouped[category]}
          selectedServiceIds={selectedServiceIds}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}

BuildYourOwnMode.propTypes = {
  services: PropTypes.array.isRequired,
  bundleSettings: PropTypes.object.isRequired,
  selectedServiceIds: PropTypes.arrayOf(PropTypes.string).isRequired,
  onToggle: PropTypes.func.isRequired
}

// ───────────────────────────────────────────────────────────────────────────────

function AdHocMode({ services, selectedServiceIds, onToggle }) {
  const filteredServices = useMemo(
    () => services.filter(svc => !(svc.parentServiceIds?.length > 0)),
    [services]
  )

  return (
    <div>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        Pick any services to bundle together. Minimum {MIN_SERVICES} services, up to {MAX_SERVICES} services total.
      </p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '0.75rem'
      }}>
        {filteredServices.map(svc => (
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

AdHocMode.propTypes = {
  services: PropTypes.array.isRequired,
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
    duration: PropTypes.number
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

export default function BundleBooking() {
  return (
    <Suspense fallback={<main><h1>Loading...</h1></main>}>
      <BundleBookingContent />
    </Suspense>
  )
}
