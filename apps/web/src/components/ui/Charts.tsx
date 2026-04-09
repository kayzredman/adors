'use client'

import {
  AreaChart, Area, LineChart, Line,
  BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

interface DataPoint { t: string; v: number }

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '6px',
  fontSize: '11px',
  color: 'hsl(var(--foreground))',
}

// ─── Sparkline (area, no axes) ───────────────────────────────────────────────
interface SparklineProps {
  data: DataPoint[]
  color?: string
  height?: number
  fillOpacity?: number
}

export function Sparkline({ data, color = '#0072CE', height = 50, fillOpacity = 0.15 }: SparklineProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={fillOpacity * 2} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#grad-${color.replace('#', '')})`}
          dot={false}
          activeDot={{ r: 3, fill: color }}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.t
            ? new Date(payload[0].payload.t).toLocaleTimeString()
            : ''}
          formatter={(v: number) => [v.toLocaleString(), '']}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Chart with axes ─────────────────────────────────────────────────────────
interface MetricChartProps {
  data: DataPoint[]
  color?: string
  height?: number
  label?: string
  format?: (v: number) => string
}

export function MetricChart({ data, color = '#0072CE', height = 120, label, format }: MetricChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`mgrd-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="t"
          tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
          width={40}
          tickFormatter={format ?? ((v) => v.toLocaleString())}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(t) => new Date(t).toLocaleTimeString()}
          formatter={(v: number) => [format ? format(v) : v.toLocaleString(), label ?? '']}
        />
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={2}
          fill={`url(#mgrd-${color.replace('#', '')})`}
          dot={false}
          activeDot={{ r: 4, fill: color }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Horizontal bar (wait breakdown) ─────────────────────────────────────────
interface WaitBreakdownProps {
  data: { name: string; value: number }[]
  height?: number
}

export function WaitBreakdownChart({ data, height = 160 }: WaitBreakdownProps) {
  const sorted = [...data].sort((a, b) => b.value - a.value)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 80 }}>
        <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={80} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v.toFixed(3) + 's', 'Wait']} />
        <Bar dataKey="value" fill="#0072CE" radius={[0, 3, 3, 0]} maxBarSize={10} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Storage Cylinder ────────────────────────────────────────────────────────
interface StorageCylinderProps {
  label: string
  usedPct: number
  sizeLabel: string
}

export function StorageCylinder({ label, usedPct, sizeLabel }: StorageCylinderProps) {
  const color =
    usedPct >= 90 ? '#EF4444' :
    usedPct >= 75 ? '#F59E0B' :
    '#0072CE'

  return (
    <div className="flex items-center gap-3">
      {/* Cylinder SVG */}
      <svg width={36} height={52} viewBox="0 0 36 52">
        {/* Body */}
        <rect x={4} y={10} width={28} height={34} rx={2} fill="hsl(var(--muted))" />
        {/* Fill */}
        <rect
          x={4}
          y={10 + 34 * (1 - usedPct / 100)}
          width={28}
          height={34 * (usedPct / 100)}
          rx={2}
          fill={color}
          opacity={0.8}
        />
        {/* Top ellipse */}
        <ellipse cx={18} cy={10} rx={14} ry={5} fill="hsl(var(--border))" />
        <ellipse cx={18} cy={10} rx={12} ry={4} fill="hsl(var(--muted))" />
        {/* Bottom ellipse */}
        <ellipse cx={18} cy={44} rx={14} ry={5} fill="hsl(var(--border))" />
      </svg>
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-lg font-bold tabular-nums" style={{ color }}>{usedPct}%</p>
        <p className="text-xs text-muted-foreground">{sizeLabel}</p>
      </div>
    </div>
  )
}
