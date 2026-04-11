interface AdorsLogoProps {
  size?: number
  className?: string
  /** Set true when rendering on a dark/coloured background */
  darkBg?: boolean
}

export function AdorsLogo({ size = 36, className, darkBg = false }: AdorsLogoProps) {
  const svg = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Hex stroke: light-blue top-left → deep-navy bottom */}
        <linearGradient id="hs" x1="15" y1="26" x2="185" y2="174" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#64B5F6" />
          <stop offset="55%"  stopColor="#1E88E5" />
          <stop offset="100%" stopColor="#0A2F6E" />
        </linearGradient>
        {/* Hex interior bottom reflection */}
        <linearGradient id="hr" x1="100" y1="174" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="white" stopOpacity="0.2" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        {/* DB cylinder body */}
        <linearGradient id="db" x1="52" y1="52" x2="108" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#90CAF9" />
          <stop offset="35%"  stopColor="#1976D2" />
          <stop offset="100%" stopColor="#0A2F6E" />
        </linearGradient>
        {/* DB top cap */}
        <linearGradient id="dt" x1="52" y1="46" x2="108" y2="66" gradientUnits="userSpaceOnUse">
          <stop offset="0%"  stopColor="#BBDEFB" />
          <stop offset="100%" stopColor="#1565C0" />
        </linearGradient>
        {/* DB right-side shadow overlay */}
        <linearGradient id="ds" x1="52" y1="70" x2="108" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="60%"  stopColor="#0A2F6E" stopOpacity="0" />
          <stop offset="100%" stopColor="#0A2F6E" stopOpacity="0.45" />
        </linearGradient>
        {/* Lens radial fill */}
        <radialGradient id="lg" cx="38%" cy="32%" r="65%">
          <stop offset="0%"   stopColor="#FAFEFF" />
          <stop offset="100%" stopColor="#D6EEFF" />
        </radialGradient>
        {/* Shadow filter */}
        <filter id="sh" x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="1" dy="3" stdDeviation="5" floodColor="#001133" floodOpacity="0.35" />
        </filter>
        {/* DB platter shadow */}
        <filter id="ps" x="-5%" y="-30%" width="110%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#001133" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* ─── HEX RING ──────────────────────────────────────────────── */}
      {/* Bottom interior reflection (diamond light) */}
      <path
        d="M185,100 L142.5,26 L57.5,26 L15,100 L57.5,174 L142.5,174 Z"
        fill="url(#hr)"
      />
      {/* Outer stroke — thick gradient ring */}
      <path
        d="M185,100 L142.5,26 L57.5,26 L15,100 L57.5,174 L142.5,174 Z"
        fill="none"
        stroke="url(#hs)"
        strokeWidth="16"
        strokeLinejoin="round"
        filter="url(#sh)"
      />
      {/* Inner edge highlight (thin white bevel) */}
      <path
        d="M175,100 L137.5,33 L62.5,33 L25,100 L62.5,167 L137.5,167 Z"
        fill="none"
        stroke="white"
        strokeWidth="1.5"
        strokeOpacity="0.25"
        strokeLinejoin="round"
      />

      {/* ─── ORBIT ARC ─────────────────────────────────────────────── */}
      <path
        d="M50,120 Q80,136 115,120"
        stroke="white"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.75"
      />
      {/* Arrowhead */}
      <path
        d="M110,114 L115,120 L108,124"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.75"
      />

      {/* ─── DATABASE CYLINDER ─────────────────────────────────────── */}
      {/* Bottom cap */}
      <ellipse cx="78" cy="116" rx="26" ry="8.5" fill="#0A2F6E" />
      {/* Body */}
      <rect x="52" y="58" width="52" height="58" fill="url(#db)" />
      {/* Right-side shadow on body */}
      <rect x="52" y="58" width="52" height="58" fill="url(#ds)" />
      {/* Mid platter 2 */}
      <ellipse cx="78" cy="92" rx="26" ry="8.5" fill="#1255A8" filter="url(#ps)" />
      {/* Mid platter 1 */}
      <ellipse cx="78" cy="75" rx="26" ry="8.5" fill="#1565C0" filter="url(#ps)" />
      {/* Top cap */}
      <ellipse cx="78" cy="58" rx="26" ry="8.5" fill="url(#dt)" />
      {/* Top cap specular highlight */}
      <ellipse cx="70" cy="55.5" rx="13" ry="4" fill="white" opacity="0.38" />
      {/* Left light edge */}
      <rect x="52" y="58" width="6" height="58" fill="white" fillOpacity="0.07" />

      {/* ─── MAGNIFYING GLASS ──────────────────────────────────────── */}
      {/* Dark navy ring (thick) */}
      <circle
        cx="136" cy="134" r="27"
        fill="url(#lg)"
        stroke="#0A2F6E"
        strokeWidth="13"
        filter="url(#sh)"
      />
      {/* Subtle inner ring bevel */}
      <circle
        cx="136" cy="134" r="27"
        fill="none"
        stroke="#2196F3"
        strokeWidth="2.5"
        strokeOpacity="0.5"
      />
      {/* ── Chart inside lens ── */}
      {/* Green area fill */}
      <path
        d="M116,146 L121,134 L127,139 L133,126 L139,130 L145,133 L149,146 Z"
        fill="#66BB6A"
        fillOpacity="0.4"
      />
      {/* Green line */}
      <polyline
        points="116,146 121,134 127,139 133,126 139,130 145,133"
        fill="none"
        stroke="#2E7D32"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Amber data points */}
      <circle cx="121" cy="134" r="3.2" fill="#F9A825" />
      <circle cx="133" cy="126" r="3.8" fill="#F9A825" />
      <circle cx="139" cy="130" r="3.2" fill="#F9A825" />

      {/* ─── HANDLE ────────────────────────────────────────────────── */}
      <line x1="155" y1="153" x2="174" y2="172" stroke="#0A2F6E" strokeWidth="13" strokeLinecap="round" />
      <line x1="155" y1="153" x2="174" y2="172" stroke="#1E88E5" strokeWidth="5"  strokeLinecap="round" />
    </svg>
  )

  if (darkBg) {
    const pad = Math.round(size * 0.18)
    return (
      <div
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width:  size + pad * 2,
          height: size + pad * 2,
          background: 'white',
          borderRadius: Math.round(size * 0.24),
          padding: pad,
          boxShadow: '0 4px 28px rgba(0,0,0,0.35)',
        }}
      >
        {svg}
      </div>
    )
  }

  return <span className={className}>{svg}</span>
}
