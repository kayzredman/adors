import { Router } from 'express'
import { z } from 'zod'
import { supabase } from '../config/supabase.js'
import { requireAuth, requireDBA, requireAAL2 } from '../middleware/auth.js'
import { sandboxQueue } from '../workers/sandboxWorker.js'
import type { SandboxJobData } from '../workers/sandboxWorker.js'

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

router.post('/run', requireAuth, requireDBA, requireAAL2, async (req, res) => {
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

    // 4. Queue BullMQ job for isolated execution
    const jobData: SandboxJobData = {
      runId:        run.id,
      scriptId:     script.id,
      scriptName:   script.name,
      sqlContent:   script.sql_content,
      riskLevel:    script.risk_level,
      connectionId: conn.id,
      connName:     conn.name,
      dbType:       conn.db_type,
      userId:       user.id,
    }

    await sandboxQueue.add('execute', jobData, {
      jobId: run.id,             // deduplicate by run ID
    })

    res.status(202).json({
      data: { ...run, script_name: script.name, connection_name: conn.name },
      message: 'Sandbox run queued — poll /api/sandbox/runs/:id for status',
    })

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

export default router
