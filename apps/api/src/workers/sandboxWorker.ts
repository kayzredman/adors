import { Queue, Worker } from 'bullmq'
import { redis } from '../config/redis.js'
import { supabase } from '../config/supabase.js'
import { getAdapter } from '../adapters/index.js'
import { getConnectionCredentials } from '../services/connectionService.js'
import { logActivity } from '../services/activityService.js'
import type { DbCredentials } from '../adapters/types.js'

// ─── Queue ────────────────────────────────────────────────────────────────────

export const sandboxQueue = new Queue('sandbox', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 200,
    removeOnFail: 100,
    attempts: 1,           // sandbox runs should not auto-retry
  },
})

// ─── Job payload type ────────────────────────────────────────────────────────

export interface SandboxJobData {
  runId:        string
  scriptId:     string
  scriptName:   string
  sqlContent:   string
  riskLevel:    string
  connectionId: string
  connName:     string
  dbType:       string
  userId:       string
}

// ─── Worker ──────────────────────────────────────────────────────────────────

let activeWorker: Worker | null = null

export function createSandboxWorker(): Worker {
  if (activeWorker) {
    console.warn('[sandbox-worker] Worker already created — reusing existing instance')
    return activeWorker
  }

  const worker = new Worker<SandboxJobData>(
    'sandbox',
    async (job) => {
      const { runId, scriptName, sqlContent, connectionId, connName, dbType, userId } = job.data
      const start = Date.now()

      await supabase.from('sandbox_runs').update({ status: 'running' }).eq('id', runId)

      try {
        const stored = await getConnectionCredentials(connectionId)
        if (!stored) throw new Error(`No credentials stored for "${connName}"`)

        const { data: rawConn } = await supabase
          .from('connections')
          .select('host, port, database_name, oracle_privilege')
          .eq('id', connectionId)
          .single()

        if (!rawConn) throw new Error('Connection record not found')

        const defaultPorts: Record<string, number> = { oracle: 1521, mssql: 1433, mariadb: 3306 }
        const creds: DbCredentials = {
          host:     rawConn.host,
          port:     rawConn.port ?? defaultPorts[dbType] ?? 3306,
          database: rawConn.database_name ?? '',
          username: stored.username,
          password: stored.password,
          options:  rawConn.oracle_privilege ? { privilege: rawConn.oracle_privilege } : undefined,
        }

        const adapter = await getAdapter(dbType as 'oracle' | 'mssql' | 'mariadb')
        const result  = await adapter.executeQuery(creds, sqlContent, 30_000)

        const duration = Date.now() - start
        const outputLog = [
          `-- ${scriptName} on ${connName}`,
          `-- Executed at ${new Date().toISOString()}`,
          `-- Duration: ${duration}ms`,
          ...(result.rowCount > 0 ? [`-- ${result.rowCount} rows affected/returned`] : []),
          '',
          sqlContent,
        ].join('\n')

        await supabase.from('sandbox_runs').update({
          status:        'success',
          output:        outputLog,
          exec_time_ms:  duration,
          cpu_impact_pct: null,
        }).eq('id', runId)

        logActivity({
          actorId:    userId,
          actorName:  '',
          action:     'sandbox_run',
          targetType: 'connection',
          targetId:   connectionId,
          payload:    { scriptName, connectionName: connName, rowCount: result.rowCount, durationMs: duration },
        }).catch(() => {})

        return { runId, status: 'success', duration }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)

        await supabase.from('sandbox_runs').update({
          status: 'failed',
          output: `ERROR: ${message}`,
          exec_time_ms: Date.now() - start,
        }).eq('id', runId)

        logActivity({
          actorId:    userId,
          actorName:  '',
          action:     'sandbox_run_failed',
          targetType: 'connection',
          targetId:   connectionId,
          payload:    { scriptName, connectionName: connName, error: message },
        }).catch(() => {})

        throw err   // marks the BullMQ job as failed
      }
    },
    {
      connection: redis,
      concurrency: 2,   // allow 2 sandbox runs in parallel
    },
  )

  worker.on('completed', (job) => {
    console.log(`[sandbox-worker] Job ${job.id} completed — run ${job.data.runId}`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[sandbox-worker] Job ${job?.id} failed — run ${job?.data.runId}:`, err.message)
  })

  activeWorker = worker
  return worker
}

export async function closeSandboxWorker(): Promise<void> {
  if (activeWorker) {
    await activeWorker.close()
    activeWorker = null
  }
}
