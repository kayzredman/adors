import { NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:8000'
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

/**
 * POST /api/auth/create-dev-user
 * Body: { email, password }
 *
 * Creates a user via Supabase Auth signup endpoint.
 * Only works when GOTRUE_MAILER_AUTOCONFIRM=true (our dev config).
 * Intentionally not protected — used only to bootstrap the first user.
 * Remove or gate this in production.
 */
export async function POST(req: Request) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 })
  }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  })

  const data = await res.json()

  if (!res.ok) {
    return NextResponse.json({ error: data.msg ?? data.error_description ?? 'Signup failed' }, { status: res.status })
  }

  return NextResponse.json({ message: 'User created', user: { id: data.id, email: data.email } })
}
