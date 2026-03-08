export default function CherryBlossomHero({ className = '', style = {} }) {
  return (
    <svg
      width="400"
      height="300"
      viewBox="0 0 400 300"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="hero-blossom-title"
      className={className}
      style={style}
    >
      <title id="hero-blossom-title">Cherry blossom arrangement</title>

      {/* Main branches */}
      <path d="M50 280 C 100 240, 160 200, 220 160 C 260 130, 300 100, 350 60" fill="none" stroke="#4A3428" strokeWidth="6" strokeLinecap="round"/>
      <path d="M160 200 C 180 170, 210 150, 240 140" fill="none" stroke="#4A3428" strokeWidth="5" strokeLinecap="round"/>
      <path d="M220 160 C 240 140, 270 120, 300 110" fill="none" stroke="#4A3428" strokeWidth="5" strokeLinecap="round"/>
      <path d="M100 240 C 90 220, 85 200, 80 180" fill="none" stroke="#4A3428" strokeWidth="4" strokeLinecap="round"/>

      {/* Large blossom 1 */}
      <g transform="translate(155,195)">
        <circle r="16" fill="#FFB3C6"/>
        <circle cx="0" cy="-13" r="11" fill="#FFC9D9"/>
        <circle cx="11" cy="5" r="11" fill="#FFC9D9"/>
        <circle cx="-11" cy="5" r="11" fill="#FFC9D9"/>
        <circle cx="0" cy="13" r="11" fill="#FFC9D9"/>
        <circle cx="8" cy="-8" r="11" fill="#FFC9D9"/>
        <circle r="4" fill="#FF6B9D"/>
      </g>

      {/* Large blossom 2 */}
      <g transform="translate(240,145)">
        <circle r="15" fill="#FFB3C6"/>
        <circle cx="0" cy="-12" r="10" fill="#FFC9D9"/>
        <circle cx="10" cy="4" r="10" fill="#FFC9D9"/>
        <circle cx="-10" cy="4" r="10" fill="#FFC9D9"/>
        <circle cx="0" cy="12" r="10" fill="#FFC9D9"/>
        <circle cx="7" cy="-7" r="10" fill="#FFC9D9"/>
        <circle r="3.5" fill="#FF6B9D"/>
      </g>

      {/* Large blossom 3 */}
      <g transform="translate(300,115)">
        <circle r="14" fill="#FFB3C6"/>
        <circle cx="0" cy="-11" r="9" fill="#FFC9D9"/>
        <circle cx="9" cy="4" r="9" fill="#FFC9D9"/>
        <circle cx="-9" cy="4" r="9" fill="#FFC9D9"/>
        <circle cx="0" cy="11" r="9" fill="#FFC9D9"/>
        <circle cx="6" cy="-6" r="9" fill="#FFC9D9"/>
        <circle r="3" fill="#FF6B9D"/>
      </g>

      {/* Medium blossom 4 */}
      <g transform="translate(85,215)">
        <circle r="12" fill="#FFB3C6"/>
        <circle cx="0" cy="-9" r="8" fill="#FFC9D9"/>
        <circle cx="8" cy="3" r="8" fill="#FFC9D9"/>
        <circle cx="-8" cy="3" r="8" fill="#FFC9D9"/>
        <circle cx="0" cy="9" r="8" fill="#FFC9D9"/>
        <circle r="3" fill="#FF6B9D"/>
      </g>

      {/* Medium blossom 5 */}
      <g transform="translate(215,165)">
        <circle r="11" fill="#FFB3C6"/>
        <circle cx="0" cy="-8" r="7" fill="#FFC9D9"/>
        <circle cx="7" cy="3" r="7" fill="#FFC9D9"/>
        <circle cx="-7" cy="3" r="7" fill="#FFC9D9"/>
        <circle cx="0" cy="8" r="7" fill="#FFC9D9"/>
        <circle r="2.5" fill="#FF6B9D"/>
      </g>

      {/* Small accent blossoms */}
      <g transform="translate(180,180)">
        <circle r="8" fill="#FFB3C6"/>
        <circle cx="0" cy="-6" r="5" fill="#FFC9D9"/>
        <circle cx="5" cy="2" r="5" fill="#FFC9D9"/>
        <circle cx="-5" cy="2" r="5" fill="#FFC9D9"/>
        <circle cx="0" cy="6" r="5" fill="#FFC9D9"/>
        <circle r="2" fill="#FF6B9D"/>
      </g>

      <g transform="translate(270,130)">
        <circle r="8" fill="#FFB3C6"/>
        <circle cx="0" cy="-6" r="5" fill="#FFC9D9"/>
        <circle cx="5" cy="2" r="5" fill="#FFC9D9"/>
        <circle cx="-5" cy="2" r="5" fill="#FFC9D9"/>
        <circle cx="0" cy="6" r="5" fill="#FFC9D9"/>
        <circle r="2" fill="#FF6B9D"/>
      </g>

      <g transform="translate(330,80)">
        <circle r="7" fill="#FFB3C6"/>
        <circle cx="0" cy="-5" r="4" fill="#FFC9D9"/>
        <circle cx="4" cy="2" r="4" fill="#FFC9D9"/>
        <circle cx="-4" cy="2" r="4" fill="#FFC9D9"/>
        <circle cx="0" cy="5" r="4" fill="#FFC9D9"/>
        <circle r="1.5" fill="#FF6B9D"/>
      </g>
    </svg>
  );
}
