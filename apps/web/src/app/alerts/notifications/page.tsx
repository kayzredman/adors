'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/providers/AuthProvider'
import { api } from '@/lib/api'
import {
  Bell,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Mail,
  Hash,
  ToggleLeft,
  ToggleRight,
  Send,
  Pencil,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const inputCls =
  'w-full px-3.5 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500'
const btnPrimary =
  'flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm transition-colors disabled:opacity-60'
const btnDanger =
  'flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-critical hover:bg-critical/90 text-white font-semibold text-sm transition-colors disabled:opacity-60'
const sectionCls = 'rounded-xl border border-border bg-card p-6'

type Toast = { type: 'success' | 'error'; message: string }

const TYPE_META: Record<string, { icon: typeof Bell; label: string; color: string }> = {
  teams:    { icon: Hash,          label: 'Microsoft Teams', color: 'text-[#6264A7]' },
  whatsapp: { icon: MessageSquare, label: 'WhatsApp',        color: 'text-[#25D366]' },
  email:    { icon: Mail,          label: 'Email (Resend)',  color: 'text-brand-400' },
}

interface Channel {
  id: string
  type: 'whatsapp' | 'teams' | 'email'
  name: string
  config: Record<string, any>
  enabled: boolean
  created_at: string
}

export default function NotificationsPage() {
  const { role } = useAuth()
  const isAdmin = role === 'super_admin'

  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<Toast | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  function showToast(t: Toast) {
    setToast(t)
    setTimeout(() => setToast(null), 4000)
  }

  async function loadChannels() {
    try {
      const res = await api.notifications.listChannels()
      setChannels(res.data)
    } catch {
      // Non-admin users will get 403 — that's expected
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin) loadChannels()
    else setLoading(false)
  }, [isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto py-10 px-4">
        <div className="text-center py-16">
          <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-foreground">Admin Access Required</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Notification channels can only be managed by super admins.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-8 px-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notification Channels</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure where alert notifications are sent.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className={btnPrimary}>
          <Plus className="w-4 h-4" />
          Add Channel
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg border px-4 py-3 text-sm',
            toast.type === 'success'
              ? 'border-success/30 bg-success/5 text-success'
              : 'border-critical/30 bg-critical/5 text-critical',
          )}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          {toast.message}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateChannelModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            showToast({ type: 'success', message: 'Channel created' })
            loadChannels()
          }}
          onError={(msg) => showToast({ type: 'error', message: msg })}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : channels.length === 0 ? (
        <div className={cn(sectionCls, 'text-center py-12')}>
          <Bell className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No notification channels configured yet.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Add a Teams webhook, WhatsApp number, or email to receive alerts.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {channels.map((ch) => (
            <ChannelCard
              key={ch.id}
              channel={ch}
              onUpdate={() => { loadChannels(); showToast({ type: 'success', message: 'Channel updated' }) }}
              onDelete={() => { loadChannels(); showToast({ type: 'success', message: 'Channel deleted' }) }}
              onToast={showToast}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Channel Card ────────────────────────────────────────────────────────────
function ChannelCard({
  channel,
  onUpdate,
  onDelete,
  onToast,
}: {
  channel: Channel
  onUpdate: () => void
  onDelete: () => void
  onToast: (t: Toast) => void
}) {
  const [toggling, setToggling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [testing, setTesting] = useState(false)

  const meta = TYPE_META[channel.type] ?? { icon: Bell, label: channel.type, color: 'text-muted-foreground' }
  const Icon = meta.icon

  async function handleToggle() {
    setToggling(true)
    try {
      await api.notifications.updateChannel(channel.id, { enabled: !channel.enabled })
      onUpdate()
    } catch (err: any) {
      onToast({ type: 'error', message: err.message ?? 'Failed to update' })
    } finally {
      setToggling(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${channel.name}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await api.notifications.deleteChannel(channel.id)
      onDelete()
    } catch (err: any) {
      onToast({ type: 'error', message: err.message ?? 'Failed to delete' })
    } finally {
      setDeleting(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    try {
      await api.notifications.testChannel(channel.id)
      onToast({ type: 'success', message: 'Test notification sent' })
    } catch (err: any) {
      onToast({ type: 'error', message: err.message ?? 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className={cn(sectionCls, 'flex items-center gap-4 py-4')}>
      <div
        className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
          channel.enabled ? 'bg-brand-500/10' : 'bg-muted',
        )}
      >
        <Icon className={cn('w-5 h-5', channel.enabled ? meta.color : 'text-muted-foreground')} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground truncate">{channel.name}</p>
          <span className="text-[10px] uppercase font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {meta.label}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {channel.type === 'teams' && (channel.config.webhook_url ? 'Webhook configured' : 'No webhook URL')}
          {channel.type === 'whatsapp' && (channel.config.phone_number || 'No phone number')}
          {channel.type === 'email' && (channel.config.to || 'No recipient')}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Test */}
        <button
          onClick={handleTest}
          disabled={testing || !channel.enabled}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
          title="Send test"
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>

        {/* Toggle */}
        <button
          onClick={handleToggle}
          disabled={toggling}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={channel.enabled ? 'Disable' : 'Enable'}
        >
          {channel.enabled ? (
            <ToggleRight className="w-5 h-5 text-success" />
          ) : (
            <ToggleLeft className="w-5 h-5" />
          )}
        </button>

        {/* Delete */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="p-2 rounded-lg text-muted-foreground hover:text-critical hover:bg-critical/5 transition-colors"
          title="Delete"
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

// ─── Create Channel Modal ────────────────────────────────────────────────────
function CreateChannelModal({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void
  onCreated: () => void
  onError: (msg: string) => void
}) {
  const [type, setType] = useState<'teams' | 'whatsapp' | 'email'>('teams')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  // Config fields
  const [webhookUrl, setWebhookUrl] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [emailTo, setEmailTo] = useState('')
  const [minSeverity, setMinSeverity] = useState<'info' | 'warning' | 'critical'>('warning')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    const config: Record<string, unknown> = { min_severity: minSeverity }
    if (type === 'teams') config.webhook_url = webhookUrl
    if (type === 'whatsapp') config.phone_number = phoneNumber
    if (type === 'email') config.to = emailTo

    setSaving(true)
    try {
      await api.notifications.createChannel({ type, name: name.trim(), config })
      onCreated()
    } catch (err: any) {
      onError(err.message ?? 'Failed to create channel')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-lg font-semibold text-foreground mb-5">Add Notification Channel</h2>

        <form onSubmit={handleCreate} className="space-y-4">
          {/* Type selector */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Channel Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['teams', 'whatsapp', 'email'] as const).map((t) => {
                const m = TYPE_META[t]
                const Icon = m.icon
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 p-3 rounded-lg border text-sm transition-colors',
                      type === t
                        ? 'border-brand-500 bg-brand-500/5 text-foreground'
                        : 'border-border text-muted-foreground hover:border-muted-foreground/30',
                    )}
                  >
                    <Icon className={cn('w-5 h-5', type === t ? m.color : '')} />
                    <span className="text-xs font-medium">{m.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Channel Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ops Team"
              className={inputCls}
            />
          </div>

          {/* Type-specific config */}
          {type === 'teams' && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Webhook URL
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://outlook.office.com/webhook/..."
                className={inputCls}
              />
            </div>
          )}

          {type === 'whatsapp' && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Phone Number
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1234567890"
                className={inputCls}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Requires Baileys auth session on the server.
              </p>
            </div>
          )}

          {type === 'email' && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Recipient Email
              </label>
              <input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="ops@company.com"
                className={inputCls}
              />
            </div>
          )}

          {/* Minimum severity */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Minimum Severity
            </label>
            <select
              value={minSeverity}
              onChange={(e) => setMinSeverity(e.target.value as any)}
              className={inputCls}
            >
              <option value="critical">Critical only</option>
              <option value="warning">Warning &amp; Critical</option>
              <option value="info">All (Info, Warning, Critical)</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <button type="submit" disabled={saving || !name.trim()} className={btnPrimary}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
