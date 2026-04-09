import { supabase } from '../config/supabase.js'
import { redis } from '../config/redis.js'
import { encrypt, decrypt } from '../lib/crypto.js'
import type { DbConnection, DbCredentials } from '@adors/shared'

// Columns never sent to the browser
const SAFE_SELECT = 'id,name,db_type,environment,host,port,database_name,agent_name,prod_pair_id,status,last_checked_at,created_at,credentials_enc'

/** Strip raw crypto columns and compute has_credentials flag */
function toPublic(row: any): DbConnection {
  const { credentials_enc, credentials_iv, credentials_tag, ...rest } = row
  return { ...rest, has_credentials: !!credentials_enc } as DbConnection
}

export async function getAllConnections(): Promise<DbConnection[]> {
  const { data, error } = await supabase
    .from('connections')
    .select(SAFE_SELECT)
    .order('environment', { ascending: true })
    .order('db_type', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map(toPublic)
}

export async function getConnectionById(id: string): Promise<DbConnection | null> {
  const { data, error } = await supabase
    .from('connections')
    .select(SAFE_SELECT)
    .eq('id', id)
    .single()

  if (error) return null
  return toPublic(data)
}

/**
 * Decrypt and return credentials for scanner use only.
 * Returns null when no credentials are stored (mock mode).
 */
export async function getConnectionCredentials(
  id: string,
): Promise<{ username: string; password: string } | null> {
  const { data, error } = await supabase
    .from('connections')
    .select('credentials_enc,credentials_iv,credentials_tag')
    .eq('id', id)
    .single()

  if (error || !data?.credentials_enc) return null

  try {
    const plain = decrypt({
      enc: data.credentials_enc,
      iv:  data.credentials_iv,
      tag: data.credentials_tag,
    })
    return JSON.parse(plain) as { username: string; password: string }
  } catch {
    return null
  }
}

export async function createConnection(payload: {
  name:          string
  db_type:       DbConnection['db_type']
  environment:   DbConnection['environment']
  host:          string
  port:          number
  database_name?: string
  agent_name:    string
  username?:     string
  password?:     string
}): Promise<DbConnection> {
  const { username, password, ...rest } = payload

  const insert: Record<string, unknown> = { ...rest }
  if (username && password) {
    const enc = encrypt(JSON.stringify({ username, password }))
    insert.credentials_enc = enc.enc
    insert.credentials_iv  = enc.iv
    insert.credentials_tag = enc.tag
  }

  const { data, error } = await supabase
    .from('connections')
    .insert(insert)
    .select(SAFE_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return toPublic(data)
}

export async function updateConnectionStatus(
  id: string,
  status: DbConnection['status'],
): Promise<void> {
  const { error } = await supabase
    .from('connections')
    .update({ status, last_checked_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

export async function updateConnection(
  id: string,
  payload: Partial<{
    name:          string
    environment:   DbConnection['environment']
    host:          string
    port:          number
    database_name: string
    agent_name:    string
    username:      string
    password:      string
  }>,
): Promise<DbConnection> {
  const { username, password, ...rest } = payload

  const update: Record<string, unknown> = { ...rest }
  if (username && password) {
    const enc = encrypt(JSON.stringify({ username, password }))
    update.credentials_enc = enc.enc
    update.credentials_iv  = enc.iv
    update.credentials_tag = enc.tag
  }

  const { data, error } = await supabase
    .from('connections')
    .update(update)
    .eq('id', id)
    .select(SAFE_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return toPublic(data)
}

export async function deleteConnection(id: string): Promise<void> {
  const { error } = await supabase.from('connections').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function getLatestHealthSnapshot(connectionId: string) {
  const cacheKey = `snap:latest:${connectionId}`

  // Serve from Redis cache if still warm (30s TTL)
  const cached = await redis.get(cacheKey).catch(() => null)
  if (cached) return JSON.parse(cached)

  const { data, error } = await supabase
    .from('health_snapshots')
    .select('*')
    .eq('connection_id', connectionId)
    .order('scored_at', { ascending: false })
    .limit(1)
    .single()

  if (error) return null

  // Cache for 30 seconds — background scan interval is typically 60-300 s
  redis.setex(cacheKey, 30, JSON.stringify(data)).catch(() => {})
  return data
}

export async function bustSnapshotCache(connectionId: string) {
  await redis.del(`snap:latest:${connectionId}`).catch(() => {})
}

export async function getConnectionsWithHealth() {
  const connections = await getAllConnections()

  const withHealth = await Promise.all(
    connections.map(async (conn) => {
      const snapshot = await getLatestHealthSnapshot(conn.id)
      return { ...conn, health: snapshot ?? null }
    }),
  )

  return withHealth
}
