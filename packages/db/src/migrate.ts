import { Client } from 'pg'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:supersecret@localhost:5432/postgres'

async function migrate(maxRetries = 20, retryDelay = 3000): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const client = new Client({ connectionString: DATABASE_URL })
    try {
      await client.connect()

      // GoTrue must have initialized auth schema before migration 001 can run
      await client.query('SELECT 1 FROM auth.users LIMIT 1')

      // Ensure tracking table exists
      await client.query(`
        create table if not exists public._migrations (
          filename   text primary key,
          applied_at timestamptz not null default now()
        )
      `)

      const migrationsDir = join(__dirname, '../migrations')
      const files = readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort()

      for (const file of files) {
        const { rows } = await client.query(
          'SELECT 1 FROM public._migrations WHERE filename = $1', [file]
        )
        if (rows.length > 0) {
          console.log(`⏭  ${file} (already applied)`)
          continue
        }
        const sql = readFileSync(join(migrationsDir, file), 'utf-8')
        await client.query(sql)
        await client.query(
          'INSERT INTO public._migrations (filename) VALUES ($1)', [file]
        )
        console.log(`✓ ${file}`)
      }

      await client.end()
      console.log('✓ All migrations complete')
      return
    } catch (err: any) {
      await client.end().catch(() => {})
      const isRetryable =
        err.code === 'ECONNREFUSED' ||
        err.message?.includes('auth') ||
        err.message?.includes('does not exist')

      if (attempt < maxRetries && isRetryable) {
        console.log(
          `[${attempt}/${maxRetries}] Waiting for database... (${err.message})`,
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
