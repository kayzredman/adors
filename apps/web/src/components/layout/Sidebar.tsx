'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  MessageSquare,
  Bell,
  BookOpen,
  FlaskConical,
  Database,
  BarChart2,
  Moon,
  Sun,
  LogOut,
  Menu,
  X,
  Users,
  UserCircle2,
  Settings,
  HeartPulse,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { AdorsLogo } from '@/components/brand/AdorsLogo'
import { createClient } from '@/lib/supabase/browser'
import { useAuth } from '@/components/providers/AuthProvider'

const NAV_ITEMS = [
  { href: '/',            label: 'Dashboard',     icon: LayoutDashboard, minRole: 'viewer'  },
  { href: '/analytics',   label: 'Analytics',     icon: BarChart2,       minRole: 'viewer'  },
  { href: '/chat',        label: 'Bot Chat Hub',  icon: MessageSquare,   minRole: 'viewer'  },
  { href: '/alerts',      label: 'Alerts Center', icon: Bell,            minRole: 'viewer'  },
  { href: '/scripts',     label: 'Script Library', icon: BookOpen,       minRole: 'analyst' },
  { href: '/sandbox',     label: 'UAT Sandbox',   icon: FlaskConical,    minRole: 'dba'     },
  { href: '/connections', label: 'Connections',   icon: Database,        minRole: 'analyst' },
]

const ROLE_LEVEL: Record<string, number> = {
  viewer: 1, analyst: 2, dba: 3, super_admin: 4,
}

function canAccess(minRole: string, userRole: string | null): boolean {
  return (ROLE_LEVEL[userRole ?? 'viewer'] ?? 0) >= (ROLE_LEVEL[minRole] ?? 99)
}

export function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const { theme, setTheme } = useTheme()
  const { role, user } = useAuth()
  const supabase = createClient()
  const [open, setOpen] = useState(false)

  // Close drawer on route change
  useEffect(() => { setOpen(false) }, [pathname])

  // Don't render on auth pages
  if (pathname === '/login') return null

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const sidebarContent = (
    <aside className="dark flex flex-col w-64 h-full bg-card border-r border-border shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
        <AdorsLogoLocal />
        <div>
          <p className="font-bold text-lg tracking-tight text-foreground">ADORS</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Mission Control</p>
        </div>
        {/* Close button — mobile only */}
        <button
          className="ml-auto lg:hidden text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.filter(item => canAccess(item.minRole, role)).map(({ href, label, icon: Icon }) => {
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
              {label === 'Alerts Center' && <AlertBadge />}
            </Link>
          )
        })}

        {role === 'super_admin' && (
          <>
            <div className="pt-2 pb-1 px-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Admin</p>
            </div>
            <Link
              href="/admin/users"
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                pathname.startsWith('/admin/users')
                  ? 'bg-brand-500/10 text-brand-400'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Users className="w-4 h-4 shrink-0" />
              User Management
            </Link>
            <Link
              href="/admin/services"
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                pathname.startsWith('/admin/services')
                  ? 'bg-brand-500/10 text-brand-400'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <HeartPulse className="w-4 h-4 shrink-0" />
              Services Health
            </Link>
          </>
        )}
      </nav>

      {/* Bottom controls */}
      <div className="px-4 py-4 border-t border-border space-y-3">
        {/* Logged-in user */}
        {user && (
          <div className="flex items-center gap-2.5 px-1 py-1.5 rounded-lg">
            <div className="w-7 h-7 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
              <UserCircle2 className="w-4 h-4 text-brand-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate">
                {user.user_metadata?.full_name || user.email?.split('@')[0] || 'You'}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {{ viewer: 'Viewer', analyst: 'Analyst', dba: 'DBA', super_admin: 'Super Admin' }[role ?? 'viewer'] ?? role}
              </p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse-slow" />
          SYSTEM SCANNING
        </div>
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-2 text-xs transition-colors',
            pathname === '/settings'
              ? 'text-brand-400'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Settings className="w-3.5 h-3.5" />
          Settings
        </Link>
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          {theme === 'dark' ? 'Light content' : 'Dark content'}
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

  return (
    <>
      {/* ── Desktop: always-visible sidebar ── */}
      <div className="hidden lg:flex h-full">
        {sidebarContent}
      </div>

      {/* ── Mobile: hamburger button in a top bar ── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center gap-3 px-4 py-3 bg-card border-b border-border dark">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <AdorsLogoLocal />
        <span className="font-bold text-sm tracking-tight text-foreground">ADORS</span>
      </div>

      {/* ── Mobile: backdrop ── */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Mobile: slide-in drawer ── */}
      <div
        className={cn(
          'lg:hidden fixed top-0 left-0 z-50 h-full transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebarContent}
      </div>

    </>
  )
}

// Live alert badge
function AlertBadge() {
  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-critical text-[10px] font-bold text-white px-1">
      3
    </span>
  )
}

function AdorsLogoLocal() {
  return <AdorsLogo size={36} />
}

