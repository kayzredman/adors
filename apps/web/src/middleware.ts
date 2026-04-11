import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  // Create a Supabase client that can read + refresh cookies via middleware
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()      { return request.cookies.getAll() },
        setAll(pairs) {
          // Write cookies onto both the outgoing request and response
          pairs.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    },
  )

  // Verify session with the server. If Kong/GoTrue is unreachable (e.g. stack
  // cold-starting), fall back to the cookie session so the app stays usable
  // instead of redirecting every authenticated user to /login.
  let user = null
  try {
    const result = await supabase.auth.getUser()
    user = result.data.user
  } catch {
    // Network error — trust the local cookie session as best-effort
    const { data: { session } } = await supabase.auth.getSession()
    user = session?.user ?? null
  }

  const isLoginPage      = request.nextUrl.pathname.startsWith('/login')
  const isApiRoute       = request.nextUrl.pathname.startsWith('/api/')
  const isSetupPage      = request.nextUrl.pathname.startsWith('/setup')
  const isOnboardingPage = request.nextUrl.pathname.startsWith('/onboarding')

  // Next.js API routes, setup wizard, and onboarding handle their own auth
  if (isApiRoute) return response
  if (isOnboardingPage) return response

  if (!user && !isLoginPage && !isSetupPage) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  if (user && isLoginPage) {
    const homeUrl = request.nextUrl.clone()
    homeUrl.pathname = '/'
    return NextResponse.redirect(homeUrl)
  }

  return response
}

export const config = {
  matcher: [
    // Run on all routes EXCEPT: static files, _next internals, favicon
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
