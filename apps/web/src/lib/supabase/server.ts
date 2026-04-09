import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// For use in Server Components and Route Handlers
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()       { return cookieStore.getAll() },
        setAll(pairs)  {
          try {
            pairs.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // setAll may throw in Server Components — safe to ignore,
            // middleware handles cookie refresh
          }
        },
      },
    },
  )
}
