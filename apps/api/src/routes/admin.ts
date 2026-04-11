import { Router } from 'express'
import { requireAuth, requireRole, invalidateRoleCache, requireAAL2 } from '../middleware/auth.js'
import https from 'https'

const router = Router()

// All admin routes require super_admin + aal2
router.use(requireAuth, requireRole('super_admin'), requireAAL2)

// ─── GET /api/admin/users ─────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const { supabase } = await import('../config/supabase.js')

    const { data: profiles, error } = await supabase
      .from('user_profiles')
      .select('id, full_name, role, onboarded, deactivated_at, created_at, updated_at')
      .order('created_at', { ascending: true })

    if (error) throw error

    // Fetch emails from Supabase auth admin API
    const { createClient } = await import('@supabase/supabase-js')
    const adminClient = createClient(
      process.env.SUPABASE_URL ?? 'http://localhost:8000',
      process.env.SUPABASE_SERVICE_KEY ?? '',
    )
    const { data: { users: authUsers }, error: authErr } = await adminClient.auth.admin.listUsers()

    const emailMap = new Map<string, string>()
    if (!authErr && authUsers) {
      authUsers.forEach(u => emailMap.set(u.id, u.email ?? ''))
    }

    const result = (profiles ?? []).map(p => ({
      ...p,
      email: emailMap.get(p.id) ?? '',
    }))

    res.json({ data: result })
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to list users' })
  }
})

// ─── POST /api/admin/users/invite ─────────────────────────────────────────────
router.post('/users/invite', async (req, res) => {
  const { email, role = 'analyst', full_name } = req.body as {
    email: string
    role?: string
    full_name?: string
  }

  if (!email) {
    res.status(400).json({ error: 'email is required' })
    return
  }

  const validRoles = ['viewer', 'analyst', 'dba', 'super_admin']
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: `role must be one of ${validRoles.join(', ')}` })
    return
  }

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const adminClient = createClient(
      process.env.SUPABASE_URL ?? 'http://localhost:8000',
      process.env.SUPABASE_SERVICE_KEY ?? '',
    )

    // Generate invite link via GoTrue — creates the user WITHOUT sending SMTP
    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        data: { full_name: full_name ?? email.split('@')[0] },
        redirectTo: `${process.env.WEB_URL ?? 'http://localhost:3002'}/onboarding/profile`,
      },
    })

    if (linkErr) {
      res.status(400).json({ error: linkErr.message })
      return
    }

    const userId = linkData.user.id
    const inviteLink = linkData.properties.action_link

    // Send invite email via Resend — only when a custom verified from-domain is configured.
    // Without a verified domain, Resend sandbox only allows sending to the account owner's email,
    // so we skip the send and return the invite link for the admin to share manually.
    const resendKey = process.env.RESEND_API_KEY ?? ''
    const fromAddr  = process.env.RESEND_FROM ?? ''
    let emailSent = false
    if (resendKey && fromAddr) {
      const displayName = (full_name ?? email.split('@')[0])
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      const emailBody = JSON.stringify({
        from: fromAddr,
        to: [email],
        subject: "You've been invited to ADORS Mission Control",
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
            <h2 style="color:#0A2F6E">Welcome to ADORS Mission Control</h2>
            <p>Hi ${displayName},</p>
            <p>You've been invited to join ADORS. Click the button below to set up your account:</p>
            <p style="text-align:center;margin:32px 0">
              <a href="${inviteLink}" style="background:#1E88E5;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">
                Accept Invitation
              </a>
            </p>
            <p style="color:#666;font-size:13px">Or copy this link: ${inviteLink}</p>
            <p style="color:#999;font-size:12px">This link expires in 24 hours.</p>
          </div>
        `,
      })
      try {
        await new Promise<void>((resolve, reject) => {
          const req = https.request(
            {
              hostname: 'api.resend.com',
              path: '/emails',
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(emailBody),
              },
            },
            (res) => {
              let body = ''
              res.on('data', (chunk) => { body += chunk })
              res.on('end', () => {
                if (res.statusCode && res.statusCode >= 400) {
                  reject(new Error(`Resend API error ${res.statusCode}: ${body}`))
                } else {
                  resolve()
                }
              })
            },
          )
          req.on('error', reject)
          req.write(emailBody)
          req.end()
        })
        emailSent = true
      } catch (emailErr: any) {
        // Resend failed (e.g. unverified domain, sandbox restriction).
        // The invite link is still valid — the admin can copy and share it.
        console.warn('[invite] Email delivery failed, returning link for manual share:', emailErr.message)
      }
    }

    // Pre-create profile with the intended role so when middleware reads it on
    // first login, the correct role is already set
    const { supabase } = await import('../config/supabase.js')
    await supabase
      .from('user_profiles')
      .upsert(
        {
          id: userId,
          full_name: full_name ?? email.split('@')[0],
          role,
          onboarded: false,
        },
        { onConflict: 'id' },
      )

    res.status(201).json({
      data: { id: userId, email, role },
      message: emailSent ? 'Invite sent' : 'User created',
      inviteLink: emailSent ? undefined : inviteLink,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to invite user' })
  }
})

// ─── PATCH /api/admin/users/:id/role ─────────────────────────────────────────
router.patch('/users/:id/role', async (req, res) => {
  const { id } = req.params
  const { role } = req.body as { role: string }

  const validRoles = ['viewer', 'analyst', 'dba', 'super_admin']
  if (!role || !validRoles.includes(role)) {
    res.status(400).json({ error: `role must be one of ${validRoles.join(', ')}` })
    return
  }

  // Prevent self-demotion
  if (id === req.user!.id) {
    res.status(403).json({ error: 'You cannot change your own role' })
    return
  }

  try {
    const { supabase } = await import('../config/supabase.js')
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ role })
      .eq('id', id)
      .select('id, role')
      .single()

    if (error) throw error
    invalidateRoleCache(id)  // flush 5-min cache so change takes effect immediately
    res.json({ data, message: 'Role updated' })
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to update role' })
  }
})

// ─── PATCH /api/admin/users/:id/deactivate ────────────────────────────────────
router.patch('/users/:id/deactivate', async (req, res) => {
  const { id } = req.params

  if (id === req.user!.id) {
    res.status(400).json({ error: 'You cannot deactivate yourself' })
    return
  }

  try {
    const { supabase } = await import('../config/supabase.js')
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ deactivated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, deactivated_at')
      .single()

    if (error) throw error

    // Also revoke active sessions via admin API
    const { createClient } = await import('@supabase/supabase-js')
    const adminClient = createClient(
      process.env.SUPABASE_URL ?? 'http://localhost:8000',
      process.env.SUPABASE_SERVICE_KEY ?? '',
    )
    await adminClient.auth.admin.deleteUser(id)
    invalidateRoleCache(id)  // force re-check of deactivated_at on next request

    res.json({ data, message: 'User deactivated' })
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to deactivate user' })
  }
})

// ─── PATCH /api/admin/users/:id/reactivate ────────────────────────────────────
router.patch('/users/:id/reactivate', async (req, res) => {
  const { id } = req.params
  try {
    const { supabase } = await import('../config/supabase.js')
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ deactivated_at: null })
      .eq('id', id)
      .select('id, deactivated_at')
      .single()
    if (error) throw error
    invalidateRoleCache(id)
    res.json({ data, message: 'User reactivated' })
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to reactivate user' })
  }
})

// ─── PATCH /api/admin/users/:id/name ─────────────────────────────────────────
router.patch('/users/:id/name', async (req, res) => {
  const { id } = req.params
  const { full_name } = req.body as { full_name: string }
  if (!full_name?.trim()) {
    res.status(400).json({ error: 'full_name is required' })
    return
  }
  try {
    const { supabase } = await import('../config/supabase.js')
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ full_name: full_name.trim() })
      .eq('id', id)
      .select('id, full_name')
      .single()
    if (error) throw error
    res.json({ data, message: 'Name updated' })
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to update name' })
  }
})

// ─── POST /api/admin/users/:id/reinvite ──────────────────────────────────────
router.post('/users/:id/reinvite', async (req, res) => {
  const { id } = req.params
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const adminClient = createClient(
      process.env.SUPABASE_URL ?? 'http://localhost:8000',
      process.env.SUPABASE_SERVICE_KEY ?? '',
    )

    // Look up the user's email
    const { data: authUser, error: userErr } = await adminClient.auth.admin.getUserById(id)
    if (userErr || !authUser.user) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    const email = authUser.user.email ?? ''

    // Generate a new invite link
    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo: `${process.env.WEB_URL ?? 'http://localhost:3002'}/onboarding/profile`,
      },
    })
    if (linkErr) {
      res.status(400).json({ error: linkErr.message })
      return
    }

    const inviteLink = linkData.properties.action_link
    const resendKey  = process.env.RESEND_API_KEY ?? ''
    const fromAddr   = process.env.RESEND_FROM ?? ''
    let emailSent = false
    if (resendKey && fromAddr) {
      const emailBody = JSON.stringify({
        from: fromAddr,
        to: [email],
        subject: "Your ADORS Mission Control invite (resent)",
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
            <h2 style="color:#0A2F6E">Welcome to ADORS Mission Control</h2>
            <p>Your invite link has been resent. Click below to set up your account:</p>
            <p style="text-align:center;margin:32px 0">
              <a href="${inviteLink}" style="background:#1E88E5;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">
                Accept Invitation
              </a>
            </p>
            <p style="color:#666;font-size:13px">Or copy this link: ${inviteLink}</p>
            <p style="color:#999;font-size:12px">This link expires in 24 hours.</p>
          </div>
        `,
      })
      await new Promise<void>((resolve, reject) => {
        const reqHttp = https.request(
          {
            hostname: 'api.resend.com',
            path: '/emails',
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(emailBody),
            },
          },
          (resHttp) => {
            let body = ''
            resHttp.on('data', (chunk) => { body += chunk })
            resHttp.on('end', () => {
              if (resHttp.statusCode && resHttp.statusCode >= 400) {
                reject(new Error(`Resend API error ${resHttp.statusCode}: ${body}`))
              } else { resolve() }
            })
          },
        )
        reqHttp.on('error', reject)
        reqHttp.write(emailBody)
        reqHttp.end()
      })
      emailSent = true
    }

    res.json({ message: emailSent ? 'Invite resent' : 'Link regenerated', inviteLink: emailSent ? undefined : inviteLink })
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to resend invite' })
  }
})

export default router

// ─── Profile router (any authenticated user) ─────────────────────────────────
export const profileRouter = Router()

// PATCH /api/admin/me/profile — update own name, mark onboarded
profileRouter.patch('/me/profile', requireAuth, async (req, res) => {
  const { full_name } = req.body as { full_name?: string }
  const userId = req.user!.id

  try {
    const { supabase } = await import('../config/supabase.js')
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ full_name, onboarded: true })
      .eq('id', userId)
      .select('id, full_name, role, onboarded')
      .single()

    if (error) throw error
    res.json({ data, message: 'Profile updated' })
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to update profile' })
  }
})
