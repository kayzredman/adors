interface AdorsLogoProps {
  size?: number
}

export function AdorsLogo({ size = 36 }: AdorsLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Bottom-left — blue */}
      <rect x="2"  y="14" width="18" height="18" rx="3.5" fill="#3B82F6" />
      {/* Bottom-right — green */}
      <rect x="16" y="14" width="18" height="18" rx="3.5" fill="#10B981" />
      {/* Top-left — coral red */}
      <rect x="2"  y="2"  width="18" height="18" rx="3.5" fill="#EF4444" />
      {/* Top-right — amber orange */}
      <rect x="16" y="2"  width="18" height="18" rx="3.5" fill="#F59E0B" />
      {/* Center overlap highlight — subtle white glint */}
      <rect x="14" y="14" width="8" height="8" rx="1.5" fill="white" fillOpacity="0.12" />
    </svg>
  )
}
