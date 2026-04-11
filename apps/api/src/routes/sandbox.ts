import { Router } from 'express'
import { z } from 'zod'
import { supabase } from '../config/supabase.js'
import { requireAuth, requireDBA } from '../middleware/auth.js'
import { logActivity } from '../services/activityService.js'
import { getAdapter } from '../adapters/index.js'
import { getConnectionCredentials } from '../services/connectionService.js'
import type { DbCredentials } from '../adapters/types.js'

const router = Router()

// GET /api/sandbox/envs — list UAT connection environments with health status
router.get('/envs', requireAuth, async (req, res) => {
  try {
    const { data: conns, error } = await supabase
      .from('connections')
      .select(`
        id, name, db_type, host,
        health_snapshots (score, status, scored_at)
      `)
      .eq('environment', 'uat')
      .order('name')

    if (error) throw error

    const data = (conns ?? []).map((c: any) => {
      const snap = c.health_snapshots?.[0]
      return {
        id: c.id,
        name: c.name,
        db_type: c.db_type,
        host: c.host,
        health_status: snap?.status ?? null,
        last_checked_at: snap?.scored_at ?? null,
      }
    })

    res.json({ data })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/sandbox/runs — recent sandbox runs
router.get('/runs', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sandbox_runs')
      .select(`
        id, status, output, cpu_impact_pct, exec_time_ms,
        triggered_by, run_at,
        scripts (id, name),
        connections!uat_connection_id (id, name, db_type)
      `)
      .order('run_at', { ascending: false })
      .limit(50)

    if (error) throw error

    const runs = (data ?? []).map((r: any) => ({
      id: r.id,
      script_id:       r.scripts?.id,
      script_name:     r.scripts?.name,
      connection_id:   r.connections?.id,
      connection_name: r.connections?.name,
      db_type:         r.connections?.db_type,
      status:          r.status,
      output:          r.output,
      cpu_impact_pct:  r.cpu_impact_pct,
      exec_time_ms:    r.exec_time_ms,
      run_at:          r.run_at,
    }))

    res.json({ data: runs })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/sandbox/run — execute a script against a UAT connection
const runSchema = z.object({
  script_id:     z.string().uuid(),
  connection_id: z.string().uuid(),
})

router.post('/run', requireAuth, requireDBA, async (req, res) => {
  const parsed = runSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { script_id, connection_id } = parsed.data
  const user = (req as any).user

  try {
    // 1. Check connection is UAT
    const { data: conn, error: connErr } = await supabase
      .from('connections')
      .select('id, name, environment, db_type')
      .eq('id', connection_id)
      .single()

    if (connErr || !conn) return res.status(404).json({ error: 'Connection not found' })
    if (conn.environment !== 'uat') {
      return res.status(403).json({ error: 'Sandbox runs are only permitted against UAT environments' })
    }

    // 2. Fetch script
    const { data: script, error: scriptErr } = await supabase
      .from('scripts')
      .select('id, name, sql_content, risk_level')
      .eq('id', script_id)
      .single()

    if (scriptErr || !script) return res.status(404).json({ error: 'Script not found' })

    // 3. Create run record (pending)
    const { data: run, error: runErr } = await supabase
      .from('sandbox_runs')
      .insert({
        script_id,
        uat_connection_id: connection_id,
        status:            'running',
        triggered_by:      user.id,
      })
      .select()
      .single()

    if (runErr || !run) throw runErr ?? new Error('Failed to create run')

    // 4. Return immediately — execution is async (Phase 3: queue a BullMQ job)
    res.status(202).json({
      data: { ...run, script_name: script.name, connection_name: conn.name },
      message: 'Sandbox run queued — polling /api/sandbox/runs/:id for status',
    })

    // 5. Async execution (simple setTimeout for now; Phase 3 replaces with BullMQ)
    executeScriptAsync(run.id, script, conn, user.id).catch(console.error)

  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/sandbox/runs/:id — poll a specific run
router.get('/runs/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sandbox_runs')
      .select('*')
      .eq('id', req.params.id)
      .single()

    if (error || !data) return res.status(404).json({ error: 'Run not found' })
    res.json({ data })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Async execution helper ──────────────────────────────────────────────────
async function executeScriptAsync(
  runId: string,
  script: { id: string; name: string; sql_content: string; risk_level: string },
  conn: { id: string; name: string; db_type: string },
  userId: string,
) {
  const start = Date.now()
  await supabase.from('sandbox_runs').update({ status: 'running' }).eq('id', runId)

  try {
    // Resolve stored credentials for this connection
    const stored = await getConnectionCredentials(conn.id)
    if (!stored) throw new Error(`No credentials stored for "${conn.name}"`)

    // Fetch full connection for host/port/database
    const { data: rawConn } = await supabase
      .from('connections')
      .select('host, port, database_name, oracle_privilege')
      .eq('id', conn.id)
      .single()

    if (!rawConn) throw new Error('Connection record not found')

    const defaultPorts: Record<string, number> = { oracle: 1521, mssql: 1433, mariadb: 3306 }
    const creds: DbCredentials = {
      host:     rawConn.host,
      port:     rawConn.port ?? defaultPorts[conn.db_type] ?? 3306,
      database: rawConn.database_name ?? '',
      username: stored.username,
      password: stored.password,
      options:  rawConn.oracle_privilege ? { privilege: rawConn.oracle_privilege } : undefined,
    }

    const adapter = await getAdapter(conn.db_type as 'oracle' | 'mssql' | 'mariadb')
    const result  = await adapter.executeQuery(creds, script.sql_content, 30_000)

    const duration   = Date.now() - start
    const outputLog  = [
      `-- ${script.name} on ${conn.name}`,
      `-- Executed at ${new Date().toISOString()}`,
      `-- Duration: ${duration}ms`,
      ...(result.rowCount > 0 ? [`-- ${result.rowCount} rows affected/returned`] : []),
      '',
      script.sql_content,
    ].join('\n')

    await supabase.from('sandbox_runs').update({
      status:        'success',
      output:        outputLog,
      exec_time_ms:  duration,
      cpu_impact_pct: null,
    }).eq('id', runId)

    await logActivity({
      actorId:    userId,
      actorName:  '',
      action:     'sandbox_run',
      targetType: 'connection',
      targetId:   conn.id,
      payload:    { scriptName: script.name, connectionName: conn.name, rowCount: result.rowCount, durationMs: duration },
    })
  } catch (err: any) {
    await supabase.from('sandbox_runs').update({
      status: 'failed',
      output: `ERROR: ${err.message}`,
    }).eq('id', runId)

    await logActivity({
      actorId:    userId,
      actorName:  '',
      action:     'sandbox_run_failed',
      targetType: 'connection',
      targetId:   conn.id,
      payload:    { scriptName: script.name, connectionName: conn.name, error: err.message },
    }).catch(() => {})
  }
}

export default router
