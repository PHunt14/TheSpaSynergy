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
        {/* Right shorter branch */}
        <path d="M640 70 Q 655 60, 670 58" fill="none" stroke="#4A3428" strokeWidth="3" strokeLinecap="round"/>
        {/* Right longer branch */}
        <path d="M620 75 Q 640 55, 665 40 Q 680 30, 690 22" fill="none" stroke="#4A3428" strokeWidth="4" strokeLinecap="round"/>
        
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

        {/* Shorter branch blossom */}
        <g transform="translate(670,58)">
          <circle r="8" fill="#FFB3C6"/>
          <circle cx="0" cy="-5" r="4" fill="#FFC9D9"/>
          <circle cx="4" cy="2" r="4" fill="#FFC9D9"/>
          <circle cx="-4" cy="2" r="4" fill="#FFC9D9"/>
          <circle r="1.5" fill="#FF6B9D"/>
        </g>

        {/* Longer branch larger blossom 1 */}
        <g transform="translate(665,40)">
          <circle r="14" fill="#FFB3C6"/>
          <circle cx="0" cy="-11" r="9" fill="#FFC9D9"/>
          <circle cx="9" cy="4" r="9" fill="#FFC9D9"/>
          <circle cx="-9" cy="4" r="9" fill="#FFC9D9"/>
          <circle cx="0" cy="11" r="9" fill="#FFC9D9"/>
          <circle cx="6" cy="-6" r="9" fill="#FFC9D9"/>
          <circle r="3" fill="#FF6B9D"/>
        </g>

        {/* Longer branch larger blossom 2 */}
        <g transform="translate(685,28)">
          <circle r="13" fill="#FFB3C6"/>
          <circle cx="0" cy="-10" r="8" fill="#FFC9D9"/>
          <circle cx="8" cy="3" r="8" fill="#FFC9D9"/>
          <circle cx="-8" cy="3" r="8" fill="#FFC9D9"/>
          <circle cx="0" cy="10" r="8" fill="#FFC9D9"/>
          <circle cx="5" cy="-5" r="8" fill="#FFC9D9"/>
          <circle r="2.5" fill="#FF6B9D"/>
        </g>

        {/* Longer branch medium blossom */}
        <g transform="translate(645,52)">
          <circle r="10" fill="#FFB3C6"/>
          <circle cx="0" cy="-7" r="6" fill="#FFC9D9"/>
          <circle cx="6" cy="2" r="6" fill="#FFC9D9"/>
          <circle cx="-6" cy="2" r="6" fill="#FFC9D9"/>
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
