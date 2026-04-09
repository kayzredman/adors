'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  MessageSquare,
  Bell,
  BookOpen,
  FlaskConical,
  Database,
  Moon,
  Sun,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/',            label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/chat',        label: 'Bot Chat Hub', icon: MessageSquare   },
  { href: '/alerts',      label: 'Alerts Center', icon: Bell           },
  { href: '/scripts',     label: 'Script Library', icon: BookOpen      },
  { href: '/sandbox',     label: 'UAT Sandbox',   icon: FlaskConical   },
  { href: '/connections', label: 'Connections',   icon: Database       },
]

export function Sidebar() {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()

  return (
    <aside className="flex flex-col w-64 h-full bg-card border-r border-border shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
        <AdorsLogo />
        <div>
          <p className="font-bold text-lg tracking-tight text-foreground">ADORS</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Mission Control</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-brand-500/10 text-brand-400 dark:text-brand-400'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
              {label === 'Alerts Center' && (
                <AlertBadge />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom controls */}
      <div className="px-5 py-4 border-t border-border space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse-slow" />
          SYSTEM SCANNING
        </div>
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
      </div>
    </aside>
  )
}

// Live alert badge — will use real data in Phase 5
function AlertBadge() {
  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-critical text-[10px] font-bold text-white px-1">
      3
    </span>
  )
}

/** ADORS logo — four overlapping rounded squares, stacked like the brand image */
function AdorsLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
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
