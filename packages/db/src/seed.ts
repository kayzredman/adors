import { Client } from 'pg'
import { readFileSync } from 'fs'
import { join } from 'path'

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:supersecret@localhost:5432/postgres'

async function seed(): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL })
  try {
    await client.connect()
    const sql = readFileSync(
      join(__dirname, '../seeds/001_seed.sql'),
      'utf-8',
    )
    await client.query(sql)
    await client.end()
    console.log('✓ Seed complete')
  } catch (err: any) {
    await client.end().catch(() => {})
    console.error('Seed failed:', err.message)
    process.exit(1)
  }
}

seed()
