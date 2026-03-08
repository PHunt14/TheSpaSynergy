export default function CherryBlossomHeading({ text = "Experience Luxury & Wellness" }) {
  return (
    <div style={{ position: 'relative', display: 'inline-block', margin: '0 auto' }}>
      <svg
        width="700"
        height="180"
        viewBox="0 0 700 180"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block' }}
      >
        {/* Left branch with blossoms */}
        <path d="M10 90 Q 60 70, 110 80" fill="none" stroke="#4A3428" strokeWidth="4" strokeLinecap="round"/>
        
        <g transform="translate(40,75)">
          <circle r="12" fill="#FFB3C6"/>
          <circle cx="0" cy="-9" r="8" fill="#FFC9D9"/>
          <circle cx="8" cy="3" r="8" fill="#FFC9D9"/>
          <circle cx="-8" cy="3" r="8" fill="#FFC9D9"/>
          <circle cx="0" cy="9" r="8" fill="#FFC9D9"/>
          <circle r="3" fill="#FF6B9D"/>
        </g>
        
        <g transform="translate(70,82)">
          <circle r="10" fill="#FFB3C6"/>
          <circle cx="0" cy="-7" r="6" fill="#FFC9D9"/>
          <circle cx="6" cy="2" r="6" fill="#FFC9D9"/>
          <circle cx="-6" cy="2" r="6" fill="#FFC9D9"/>
          <circle r="2.5" fill="#FF6B9D"/>
        </g>

        <g transform="translate(95,78)">
          <circle r="9" fill="#FFB3C6"/>
          <circle cx="0" cy="-6" r="5" fill="#FFC9D9"/>
          <circle cx="5" cy="2" r="5" fill="#FFC9D9"/>
          <circle cx="-5" cy="2" r="5" fill="#FFC9D9"/>
          <circle r="2" fill="#FF6B9D"/>
        </g>

        {/* Right branch with blossoms */}
        <path d="M690 90 Q 640 70, 590 80" fill="none" stroke="#4A3428" strokeWidth="4" strokeLinecap="round"/>
        
        <g transform="translate(660,75)">
          <circle r="12" fill="#FFB3C6"/>
          <circle cx="0" cy="-9" r="8" fill="#FFC9D9"/>
          <circle cx="8" cy="3" r="8" fill="#FFC9D9"/>
          <circle cx="-8" cy="3" r="8" fill="#FFC9D9"/>
          <circle cx="0" cy="9" r="8" fill="#FFC9D9"/>
          <circle r="3" fill="#FF6B9D"/>
        </g>
        
        <g transform="translate(630,82)">
          <circle r="10" fill="#FFB3C6"/>
          <circle cx="0" cy="-7" r="6" fill="#FFC9D9"/>
          <circle cx="6" cy="2" r="6" fill="#FFC9D9"/>
          <circle cx="-6" cy="2" r="6" fill="#FFC9D9"/>
          <circle r="2.5" fill="#FF6B9D"/>
        </g>

        <g transform="translate(605,78)">
          <circle r="9" fill="#FFB3C6"/>
          <circle cx="0" cy="-6" r="5" fill="#FFC9D9"/>
          <circle cx="5" cy="2" r="5" fill="#FFC9D9"/>
          <circle cx="-5" cy="2" r="5" fill="#FFC9D9"/>
          <circle r="2" fill="#FF6B9D"/>
        </g>

        {/* Text */}
        <text
          x="350"
          y="100"
          textAnchor="middle"
          fill="var(--color-primary-dark)"
          fontSize="42"
          fontWeight="600"
          fontFamily="system-ui, sans-serif"
        >
          {text}
        </text>
      </svg>
    </div>
  );
}
