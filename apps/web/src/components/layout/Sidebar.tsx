'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  MessageSquare,
  Bell,
  BookOpen,
  FlaskConical,
  Database,
  Moon,
  Sun,
  LogOut,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { AdorsLogo } from '@/components/brand/AdorsLogo'
import { createClient } from '@/lib/supabase/browser'

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
  const router   = useRouter()
  const { theme, setTheme } = useTheme()
  const supabase = createClient()

  // Don't render on auth pages
  if (pathname === '/login') return null

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="flex flex-col w-64 h-full bg-card border-r border-border shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
        <AdorsLogoLocal />
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
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-critical transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
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

/** ADORS logo — imported from shared brand component */
function AdorsLogoLocal() {
  return <AdorsLogo size={36} />
}
