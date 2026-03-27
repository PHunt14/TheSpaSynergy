'use client'

export default function Tooltip({ text }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', marginLeft: '0.4rem', cursor: 'help' }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          background: 'var(--color-primary)',
          color: 'white',
          fontSize: '0.7rem',
          fontWeight: 'bold',
          verticalAlign: 'middle',
        }}
      >
        ?
      </span>
      <span
        className="tooltip-text"
        style={{
          visibility: 'hidden',
          opacity: 0,
          position: 'absolute',
          bottom: '130%',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--color-primary-dark, #333)',
          color: 'white',
          padding: '0.5rem 0.75rem',
          borderRadius: '8px',
          fontSize: '0.8rem',
          lineHeight: 1.4,
          width: '220px',
          textAlign: 'center',
          zIndex: 10,
          transition: 'opacity 0.2s',
          pointerEvents: 'none',
        }}
      >
        {text}
      </span>
      <style>{`
        span:hover > .tooltip-text {
          visibility: visible !important;
          opacity: 1 !important;
        }
      `}</style>
    </span>
  )
}
