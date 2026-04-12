import { supabase } from '../config/supabase.js'

// ─── Types ───────────────────────────────────────────────────────────────────
interface NotificationChannel {
  id: string
  type: 'whatsapp' | 'teams' | 'email'
  name: string
  config: Record<string, unknown>
  enabled: boolean
}

interface AlertPayload {
  severity: 'critical' | 'warning' | 'info'
  type: string
  message: string
  connection_name: string
  details: Record<string, unknown>
}

// ─── Cooldown: prevent duplicate notifications for the same alert type/conn ──
const recentAlerts = new Map<string, number>()
const COOLDOWN_MS = Number(process.env.ALERT_COOLDOWN_MS ?? 300_000) // 5min default

function shouldNotify(connectionId: string, alertType: string): boolean {
  const key = `${connectionId}:${alertType}`
  const lastSent = recentAlerts.get(key)
  if (lastSent && Date.now() - lastSent < COOLDOWN_MS) return false
  recentAlerts.set(key, Date.now())
  return true
}

// Prune cooldown cache periodically (prevent memory leak)
setInterval(() => {
  const cutoff = Date.now() - COOLDOWN_MS
  for (const [key, ts] of recentAlerts) {
    if (ts < cutoff) recentAlerts.delete(key)
  }
}, 60_000)

// ─── Dispatch to all enabled channels ────────────────────────────────────────

export async function dispatchAlertNotifications(alerts: AlertPayload[], connectionId: string) {
  if (alerts.length === 0) return

  // Deduplicate: only send alerts that pass cooldown
  const toSend = alerts.filter((a) => shouldNotify(connectionId, a.type))
  if (toSend.length === 0) return

  // Fetch enabled channels
  const { data: channels, error } = await supabase
    .from('notification_channels')
    .select('*')
    .eq('enabled', true)

  if (error || !channels || channels.length === 0) return

  // Minimum severity filter: channels can set min_severity in config
  const SEVERITY_RANK: Record<string, number> = { info: 1, warning: 2, critical: 3 }

  for (const channel of channels as NotificationChannel[]) {
    const minSeverity = (channel.config.min_severity as string) ?? 'warning'
    const minRank = SEVERITY_RANK[minSeverity] ?? 2

    const eligible = toSend.filter((a) => (SEVERITY_RANK[a.severity] ?? 0) >= minRank)
    if (eligible.length === 0) continue

    try {
      switch (channel.type) {
        case 'teams':
          await sendTeamsNotification(channel, eligible)
          break
        case 'whatsapp':
          await sendWhatsAppNotification(channel, eligible)
          break
        case 'email':
          await sendEmailNotification(channel, eligible)
          break
      }
    } catch (err) {
      console.error(`[notify] Failed to send to ${channel.type} channel "${channel.name}":`, err)
    }
  }
}

// ─── Teams (Incoming Webhook) ────────────────────────────────────────────────

async function sendTeamsNotification(channel: NotificationChannel, alerts: AlertPayload[]) {
  const webhookUrl = (channel.config.webhook_url as string) || process.env.TEAMS_WEBHOOK_URL
  if (!webhookUrl) return

  const severityEmoji: Record<string, string> = {
    critical: '🔴',
    warning: '🟡',
    info: 'ℹ️',
  }

  const sections = alerts.map((a) => ({
    activityTitle: `${severityEmoji[a.severity] ?? ''} ${a.severity.toUpperCase()}: ${a.connection_name}`,
    activitySubtitle: a.type.replace(/_/g, ' '),
    text: a.message,
  }))

  const card = {
    '@type': 'MessageCard',
    '@context': 'https://schema.org/extensions',
    summary: `ADORS Alert: ${alerts.length} notification(s)`,
    themeColor: alerts.some((a) => a.severity === 'critical') ? 'FF0000' : 'FFA500',
    title: `⚠️ ADORS — ${alerts.length} Alert${alerts.length > 1 ? 's' : ''}`,
    sections,
  }

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(card),
  })
}

// ─── WhatsApp (Baileys — optional) ──────────────────────────────────────────

async function sendWhatsAppNotification(channel: NotificationChannel, alerts: AlertPayload[]) {
  const phoneNumber =
    (channel.config.phone_number as string) || process.env.WHATSAPP_ALERT_NUMBER
  if (!phoneNumber) return

  // Baileys is an optional peer dependency — skip if not installed
  let makeWASocket: any
  try {
    const baileys = await import('@whiskeysockets/baileys')
    makeWASocket = (baileys as any).default ?? baileys
  } catch {
    console.warn('[notify] Baileys not installed — skipping WhatsApp notification')
    return
  }

  const severityEmoji: Record<string, string> = {
    critical: '🔴',
    warning: '🟡',
    info: 'ℹ️',
  }

  const lines = alerts.map(
    (a) => `${severityEmoji[a.severity] ?? ''} *${a.severity.toUpperCase()}*: ${a.connection_name}\n${a.message}`,
  )

  const text = `⚠️ *ADORS Alert*\n\n${lines.join('\n\n')}`

  // Use stored auth if available, otherwise log that pairing is needed
  const authDir = (channel.config.auth_dir as string) || 'baileys_auth_info'

  try {
    const { useMultiFileAuthState } = await import('@whiskeysockets/baileys')
    const { state, saveCreds } = await useMultiFileAuthState(authDir)

    const sock = makeWASocket.default?.({
      auth: state,
      printQRInTerminal: false,
    }) ?? makeWASocket({
      auth: state,
      printQRInTerminal: false,
    })

    sock.ev.on('creds.update', saveCreds)

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WhatsApp connection timeout')), 15_000)
      sock.ev.on('connection.update', (update: any) => {
        if (update.connection === 'open') {
          clearTimeout(timeout)
          resolve()
        }
        if (update.connection === 'close') {
          clearTimeout(timeout)
          reject(new Error('WhatsApp connection closed'))
        }
      })
    })

    const jid = phoneNumber.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
    await sock.sendMessage(jid, { text })
    await sock.end()
  } catch (err) {
    console.error('[notify] WhatsApp send error:', err)
  }
}

// ─── Email (Resend HTTP API) ────────────────────────────────────────────────

async function sendEmailNotification(channel: NotificationChannel, alerts: AlertPayload[]) {
  const apiKey = (channel.config.api_key as string) || process.env.RESEND_API_KEY
  const from = (channel.config.from as string) || process.env.RESEND_FROM
  const to = channel.config.to as string
  if (!apiKey || !to) return

  const severityColor: Record<string, string> = {
    critical: '#dc2626',
    warning: '#f59e0b',
    info: '#3b82f6',
  }

  const alertRows = alerts
    .map(
      (a) =>
        `<tr><td style="padding:8px;color:${severityColor[a.severity] ?? '#666'};font-weight:bold">${a.severity.toUpperCase()}</td><td style="padding:8px">${a.connection_name}</td><td style="padding:8px">${a.message}</td></tr>`,
    )
    .join('')

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1565C0">⚠️ ADORS Alert Notification</h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
        <thead><tr style="background:#f9fafb"><th style="padding:8px;text-align:left">Severity</th><th style="padding:8px;text-align:left">Connection</th><th style="padding:8px;text-align:left">Message</th></tr></thead>
        <tbody>${alertRows}</tbody>
      </table>
      <p style="color:#9ca3af;font-size:12px;margin-top:12px">Sent by ADORS Mission Control</p>
    </div>
  `

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: from ?? 'ADORS <alerts@resend.dev>',
      to: Array.isArray(to) ? to : [to],
      subject: `ADORS Alert: ${alerts.length} notification${alerts.length > 1 ? 's' : ''}`,
      html,
    }),
  })
}
