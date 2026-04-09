import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('[supabase] SUPABASE_URL or SUPABASE_SERVICE_KEY not set — DB operations will fail. Set these in apps/api/.env')
}

// Service role client — bypasses RLS, for server-side use only
export const supabase = createClient(
  supabaseUrl  ?? 'http://localhost:54321',
  supabaseServiceKey ?? 'placeholder',
  { auth: { persistSession: false } },
)
