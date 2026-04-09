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

  // Refresh expired sessions — MUST be called before any redirect checks
  const { data: { user } } = await supabase.auth.getUser()

  const isLoginPage  = request.nextUrl.pathname.startsWith('/login')
  const isApiRoute   = request.nextUrl.pathname.startsWith('/api/')

  // Next.js API routes handle their own auth — don't redirect them
  if (isApiRoute) return response

  if (!user && !isLoginPage) {
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
