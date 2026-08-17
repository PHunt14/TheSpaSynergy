'use client'

import { useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { filterAvailableExtras } from '@/app/utils/extrasCalculator'

/**
 * ExtrasSelector renders a selectable list of available extras for bundle bookings.
 * Filters out inactive extras and group-only extras when group size < 3.
 * Auto-deselects group-only extras if group size drops below 3.
 */
export default function ExtrasSelector({ extras, selectedExtras, onToggle, groupSize }) {
  const prevGroupSizeRef = useRef(groupSize)

  // Auto-deselect group-only extras when group size drops below 3
  useEffect(() => {
    if (prevGroupSizeRef.current >= 3 && groupSize < 3) {
      const groupOnlySelected = (extras || []).filter(
        extra => extra.groupOnly && selectedExtras.includes(extra.extraId)
      )
      groupOnlySelected.forEach(extra => onToggle(extra.extraId))
    }
    prevGroupSizeRef.current = groupSize
  }, [groupSize, extras, selectedExtras, onToggle])

  const availableExtras = filterAvailableExtras(extras, groupSize)

  if (!availableExtras.length) {
    return null
  }

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h3 style={{
        color: 'var(--color-primary-dark)',
        marginBottom: '1rem',
        fontSize: '1.1rem',
        fontWeight: 600,
      }}>
        Extras
      </h3>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '0.75rem',
      }}>
        {availableExtras.map(extra => {
          const isSelected = selectedExtras.includes(extra.extraId)

          return (
            <label
              key={extra.extraId}
              style={{
                padding: '0.875rem 1rem',
                borderRadius: '8px',
                cursor: 'pointer',
                background: isSelected ? 'var(--color-primary)' : 'white',
                color: isSelected ? 'white' : 'var(--color-text)',
                border: isSelected
                  ? '2px solid var(--color-primary-dark)'
                  : '2px solid var(--color-border)',
                transition: '0.2s ease',
                display: 'block',
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(extra.extraId)}
                aria-label={`${extra.name} - $${extra.price}${extra.perPerson ? ' per person' : ''}`}
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
              />
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <strong style={{ fontSize: '1rem' }}>{extra.name}</strong>
                <span style={{ fontSize: '1.2rem', opacity: 0.7 }}>
                  {isSelected ? '✓' : '+'}
                </span>
              </div>

              {extra.description && (
                <div style={{
                  fontSize: '0.9rem',
                  opacity: 0.85,
                  margin: '0.25rem 0',
                }}>
                  {extra.description}
                </div>
              )}

              <div style={{
                fontSize: '0.95rem',
                opacity: 0.8,
                marginTop: '0.25rem',
              }}>
                ${extra.price.toFixed(2)}
                {extra.perPerson && (
                  <span style={{
                    marginLeft: '0.5rem',
                    fontSize: '0.85rem',
                    fontStyle: 'italic',
                    opacity: 0.9,
                  }}>
                    per person
                  </span>
                )}
              </div>
            </label>
          )
        })}
      </div>
    </div>
  )
}

ExtrasSelector.propTypes = {
  extras: PropTypes.arrayOf(PropTypes.shape({
    extraId: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    description: PropTypes.string,
    price: PropTypes.number.isRequired,
    perPerson: PropTypes.bool,
    groupOnly: PropTypes.bool,
    isActive: PropTypes.bool,
  })).isRequired,
  selectedExtras: PropTypes.arrayOf(PropTypes.string).isRequired,
  onToggle: PropTypes.func.isRequired,
  groupSize: PropTypes.number.isRequired,
}
