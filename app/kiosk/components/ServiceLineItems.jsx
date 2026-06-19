'use client'

/**
 * Renders a list of appointment service line items for kiosk checkout summaries.
 * Used by both bundle and multi-appointment payment pages.
 */
export default function ServiceLineItems({ appointments }) {
  return (
    <>
      {appointments.map(apt => (
        <div key={apt.appointmentId} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.5rem 0', borderBottom: '1px solid rgba(0,0,0,0.05)'
        }}>
          <div>
            <div style={{ fontWeight: '500' }}>{apt.service?.name}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
              {apt.vendorName}{apt.staffName && ` · ${apt.staffName}`} · {apt.service?.duration} min
            </div>
          </div>
          <div style={{ fontWeight: '500', color: 'var(--color-text-light)', fontSize: '0.9rem' }}>
            ${apt.service?.price?.toFixed(2)}
          </div>
        </div>
      ))}
    </>
  )
}
