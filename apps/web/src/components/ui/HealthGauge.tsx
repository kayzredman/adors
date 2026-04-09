'use client'

import { cn } from '@/lib/utils'

interface HealthGaugeProps {
  score: number
  size?: number
  className?: string
}

export function HealthGauge({ score, size = 80, className }: HealthGaugeProps) {
  const radius = (size - 12) / 2
  const circumference = Math.PI * radius // half-circle arc
  const offset = circumference - (score / 100) * circumference

  const color =
    score >= 80 ? '#10B981' :
    score >= 60 ? '#F59E0B' :
    '#EF4444'

  const trackColor = 'rgba(255,255,255,0.08)'

  return (
    <div className={cn('relative flex flex-col items-center', className)}>
      <svg
        width={size}
        height={size / 2 + 6}
        viewBox={`0 0 ${size} ${size / 2 + 6}`}
        style={{ overflow: 'visible' }}
      >
        {/* Track */}
        <path
          d={describeArc(size / 2, size / 2, radius, -180, 0)}
          fill="none"
          stroke={trackColor}
          strokeWidth={10}
          strokeLinecap="round"
        />
        {/* Value arc */}
        <path
          d={describeArc(size / 2, size / 2, radius, -180, 0)}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="gauge-ring"
          style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
        />
      </svg>
      {/* Score text */}
      <div
        className="absolute bottom-0 text-center"
        style={{ bottom: -4 }}
      >
        <span className="text-2xl font-bold tabular-nums" style={{ color }}>
          {score}
        </span>
      </div>
    </div>
  )
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  }
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end   = polarToCartesian(cx, cy, r, startAngle)
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1'
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
}
