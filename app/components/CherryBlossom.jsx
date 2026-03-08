export default function CherryBlossom({ className = '', style = {} }) {
  return (
    <svg
      width="320"
      height="220"
      viewBox="0 0 320 220"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="title desc"
      className={className}
      style={style}
    >
      <title id="title">Cherry blossom branch accent</title>
      <desc id="desc">A minimal cherry blossom branch with a few blossoms for spa branding.</desc>

      <path
        d="M20 200 C 80 170, 140 150, 210 110 C 240 90, 270 70, 300 40"
        fill="none"
        stroke="var(--color-primary-dark)"
        strokeWidth="4"
        strokeLinecap="round"
      />

      <path
        d="M140 150 C 150 135, 165 125, 180 120"
        fill="none"
        stroke="var(--color-primary-dark)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M220 105 C 230 95, 245 85, 260 80"
        fill="none"
        stroke="var(--color-primary-dark)"
        strokeWidth="3"
        strokeLinecap="round"
      />

      <g transform="translate(135,145)">
        <circle r="10" fill="#FFCCD9"/>
        <circle cx="0" cy="-8" r="7" fill="#FFE0EA"/>
        <circle cx="7" cy="3" r="7" fill="#FFE0EA"/>
        <circle cx="-7" cy="3" r="7" fill="#FFE0EA"/>
        <circle cx="0" cy="8" r="7" fill="#FFE0EA"/>
        <circle r="2.5" fill="#FF8FB3"/>
      </g>

      <g transform="translate(215,105)">
        <circle r="9" fill="#FFCCD9"/>
        <circle cx="0" cy="-7" r="6" fill="#FFE0EA"/>
        <circle cx="6" cy="2" r="6" fill="#FFE0EA"/>
        <circle cx="-6" cy="2" r="6" fill="#FFE0EA"/>
        <circle cx="0" cy="7" r="6" fill="#FFE0EA"/>
        <circle r="2.3" fill="#FF8FB3"/>
      </g>

      <g transform="translate(275,70)">
        <circle r="8" fill="#FFCCD9"/>
        <circle cx="0" cy="-6" r="5" fill="#FFE0EA"/>
        <circle cx="5" cy="2" r="5" fill="#FFE0EA"/>
        <circle cx="-5" cy="2" r="5" fill="#FFE0EA"/>
        <circle cx="0" cy="6" r="5" fill="#FFE0EA"/>
        <circle r="2" fill="#FF8FB3"/>
      </g>
    </svg>
  );
}
