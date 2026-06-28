'use client'

/**
 * StaffLegend — Displays a color legend mapping each active staff member
 * to their assigned color in the multi-staff week view.
 *
 * Positioned above the week grid in a collapsible panel to conserve vertical space.
 * Shows all active staff regardless of whether they have appointments in the current week.
 *
 * @param {Object} props
 * @param {Array} props.staff - Ordered staff list (StaffSchedule[])
 * @param {Map<string, string>} props.colorMap - staffId (visibleId) → CSS color
 * @param {boolean} props.collapsed - Whether legend is in collapsed state
 * @param {Function} props.onToggle - Toggle collapsed state
 */
export default function StaffLegend({ staff, colorMap, collapsed, onToggle }) {
  return (
    <div
      className="staff-legend"
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        marginBottom: '8px',
        background: 'var(--color-accent)',
      }}
    >
      {/* Toggle header */}
      <button
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls="staff-legend-content"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          width: '100%',
          padding: '8px 12px',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          fontSize: '0.85rem',
          fontWeight: 600,
          color: 'var(--color-text)',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            transition: 'transform 0.2s',
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          }}
          aria-hidden="true"
        >
          ▾
        </span>
        Staff Legend
      </button>

      {/* Collapsible content */}
      {!collapsed && (
        <div
          id="staff-legend-content"
          role="region"
          aria-label="Staff color legend"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px 16px',
            padding: '4px 12px 10px',
          }}
        >
          {(staff || []).map((member) => {
            const color = colorMap?.get(member.visibleId) || '#999'
            return (
              <div
                key={member.visibleId}
                className="staff-legend-item"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span
                  className="staff-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: '12px',
                    height: '12px',
                    borderRadius: '3px',
                    backgroundColor: color,
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                />
                <span
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--color-text)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {member.staffName}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
