'use client'

export default function Home() {
  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      backgroundColor: '#f5f5f5'
    }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
      
      <div style={{
        maxWidth: '800px',
        backgroundColor: 'white',
        padding: '3rem',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{ 
          textAlign: 'center', 
          marginBottom: '2rem', 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          fontSize: '3rem',
          fontWeight: 'bold',
          animation: 'pulse 2s ease-in-out infinite'
        }}>
          🚧 Under Construction 🚧
        </h1>
        
        <div style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ color: '#555', marginBottom: '1rem' }}>The Kera Studio</h2>
          <p style={{ marginBottom: '0.5rem', lineHeight: '1.6' }}>
            If you'd like to book now please go to{' '}
            <a href="https://www.vagaro.com/thekerastudio" target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc' }}>
              Vagaro.com/Thekerastudio
            </a>
          </p>
          <p style={{ lineHeight: '1.6' }}>
            Or call <a href="tel:2403296537" style={{ color: '#0066cc' }}>240-329-6537</a> for more information
          </p>
        </div>

        <div style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ color: '#555', marginBottom: '1rem' }}>Winsome Woods</h2>
          <p style={{ marginBottom: '0.5rem', lineHeight: '1.6' }}>
            If you'd like more information please visit{' '}
            <a href="https://www.facebook.com/WinsomeWoodsLLC" target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc' }}>
              facebook.com/WinsomeWoodsLLC
            </a>
          </p>
          <p style={{ lineHeight: '1.6' }}>
            Or call <a href="tel:3019923224" style={{ color: '#0066cc' }}>301-992-3224</a> for more information
          </p>
        </div>

        <div style={{ textAlign: 'center', padding: '1.5rem', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
          <p style={{ margin: 0, lineHeight: '1.6', color: '#666' }}>
            <strong>Address:</strong><br />
            14310 Castle Dr<br />
            Fort Ritchie, MD 21719
          </p>
        </div>
      </div>
    </main>
  )
}