import { Client } from 'pg'
import { readFileSync } from 'fs'
import { join } from 'path'

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:supersecret@localhost:5432/postgres'

async function migrate(maxRetries = 20, retryDelay = 3000): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const client = new Client({ connectionString: DATABASE_URL })
    try {
      await client.connect()

      // GoTrue (supabase-auth) must have initialized the auth schema before
      // we can create user_profiles (which references auth.users).
      // Retry until it's ready.
      await client.query('SELECT 1 FROM auth.users LIMIT 1')

      const sql = readFileSync(
        join(__dirname, '../migrations/001_initial_schema.sql'),
        'utf-8',
      )
      await client.query(sql)
      await client.end()
      console.log('✓ Migration complete')
      return
    } catch (err: any) {
      await client.end().catch(() => {})
      const isRetryable =
        err.code === 'ECONNREFUSED' ||
        err.message?.includes('auth') ||
        err.message?.includes('does not exist')

      if (attempt < maxRetries && isRetryable) {
        console.log(
          `[${attempt}/${maxRetries}] Waiting for database to be ready... (${err.message})`,
        )
        await new Promise((r) => setTimeout(r, retryDelay))
      } else {
        console.error(`Migration failed after ${attempt} attempt(s):`, err.message)
        process.exit(1)
      }
    }
  }
}

migrate()
