'use client'

const TIME_FRAMES = [
  { id: 'morning', label: 'Morning', description: 'Before 12:00 PM' },
  { id: 'afternoon', label: 'Afternoon', description: '12:00 PM – 5:00 PM' },
  { id: 'evening', label: 'Evening', description: 'After 5:00 PM' },
]

export default function TimeFrameSelector({ selectedFrame, onSelect, disabled }) {
  return (
    <div role="radiogroup" aria-label="Select a time frame">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '1rem',
        }}
      >
        {TIME_FRAMES.map((frame) => {
          const isSelected = selectedFrame === frame.id
          return (
            <div
              key={frame.id}
              role="radio"
              aria-checked={isSelected}
              aria-disabled={disabled}
              tabIndex={disabled ? -1 : 0}
              onClick={() => {
                if (!disabled) onSelect(frame.id)
              }}
              onKeyDown={(e) => {
                if (disabled) return
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(frame.id)
                }
              }}
              style={{
                padding: '1.25rem 1rem',
                borderRadius: '8px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                background: isSelected ? 'var(--color-primary)' : 'var(--color-accent)',
                color: isSelected ? 'white' : 'var(--color-text)',
                opacity: disabled ? 0.5 : 1,
                transition: '0.2s ease',
                textAlign: 'center',
                border: isSelected
                  ? '2px solid var(--color-primary)'
                  : '2px solid transparent',
              }}
            >
              <div style={{ fontWeight: '600', fontSize: '1.1rem', marginBottom: '0.25rem' }}>
                {frame.label}
              </div>
              <div
                style={{
                  fontSize: '0.85rem',
                  color: isSelected ? 'rgba(255,255,255,0.85)' : 'var(--color-text-light)',
                }}
              >
                {frame.description}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
