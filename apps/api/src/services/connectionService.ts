import { supabase } from '../config/supabase.js'
import type { DbConnection } from '@adors/shared'

export async function getAllConnections(): Promise<DbConnection[]> {
  const { data, error } = await supabase
    .from('connections')
    .select('*')
    .order('environment', { ascending: true })
    .order('db_type', { ascending: true })

  if (error) throw new Error(error.message)
  return data as DbConnection[]
}

export async function getConnectionById(id: string): Promise<DbConnection | null> {
  const { data, error } = await supabase
    .from('connections')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data as DbConnection
}

export async function createConnection(payload: {
  name: string
  db_type: DbConnection['db_type']
  environment: DbConnection['environment']
  host: string
  port: number
  database_name?: string
  agent_name: string
  credentials_ref?: string
}): Promise<DbConnection> {
  const { data, error } = await supabase
    .from('connections')
    .insert(payload)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as DbConnection
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

export async function deleteConnection(id: string): Promise<void> {
  const { error } = await supabase.from('connections').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function getLatestHealthSnapshot(connectionId: string) {
  const { data, error } = await supabase
    .from('health_snapshots')
    .select('*')
    .eq('connection_id', connectionId)
    .order('scored_at', { ascending: false })
    .limit(1)
    .single()

  if (error) return null
  return data
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
