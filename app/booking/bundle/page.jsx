'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import BookingDisabled, { isBookingEnabled } from '../../components/BookingDisabled'

function BundleBookingContent() {
  const searchParams = useSearchParams()
  const bundleId = searchParams.get('id')
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

export default function BundleBooking() {
  return (
    <Suspense fallback={<main><h1>Loading...</h1></main>}>
      <BundleBookingContent />
    </Suspense>
  )
}
