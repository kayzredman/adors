import { Queue, Worker } from 'bullmq'
import { redis } from '../config/redis.js'
import { scanAllConnections, scanConnection } from '../services/healthScanner.js'
import { getConnectionById } from '../services/connectionService.js'
import type { DbConnection } from '@adors/shared'

// ─── Queue Definitions ────────────────────────────────────────────────────────

export const healthScanQueue = new Queue('health-scan', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
})

// ─── Distributed Scheduler Lock ───────────────────────────────────────────────
// Prevents multiple API instances (hot-reload race, accidental double-start)
// from each adding their own repeatable cron job.
// Only one process wins the NX lock and owns the scheduler. All processes run
// the BullMQ worker to consume jobs — BullMQ guarantees each job executes
// exactly once regardless of worker count.

const SCHEDULER_LOCK_KEY  = 'adors:scheduler:leader'
// TTL = 90 seconds — 1.5× the fastest scan interval (1 min).
// If the leader dies without releasing, a new election happens within 90s,
// at most missing one scan cycle before the new leader takes over.
const SCHEDULER_LOCK_TTL_MS = 90 * 1000

let lockRenewalTimer: ReturnType<typeof setInterval> | null = null

export async function startHealthScanScheduler(): Promise<void> {
  // Try to win the leader election atomically (SET NX EX).
  const pid = String(process.pid)
  const acquired = await redis.set(
    SCHEDULER_LOCK_KEY, pid,
    'NX', 'PX', SCHEDULER_LOCK_TTL_MS,
  )

  if (!acquired) {
    // Another instance is already the scheduler leader — we are a pure worker.
    console.log('[worker] Scheduler leader already elected — this instance will process jobs only')
    return
  }

  console.log(`[worker] Elected scheduler leader (pid ${pid})`)

  // Renew every 40s — well within the 90s TTL.
  lockRenewalTimer = setInterval(async () => {
    // Only renew if we still own the lock (value matches our pid).
    const owner = await redis.get(SCHEDULER_LOCK_KEY)
    if (owner === pid) {
      await redis.pexpire(SCHEDULER_LOCK_KEY, SCHEDULER_LOCK_TTL_MS)
    } else {
      // We lost ownership (edge case: Redis restart). Stop renewing.
      clearInterval(lockRenewalTimer!)
      lockRenewalTimer = null
      console.warn('[worker] Lost scheduler lock — another instance took over')
    }
  }, 40 * 1000)

  // Clean up any stale repeatable jobs before registering ours (idempotent).
  const repeatableJobs = await healthScanQueue.getRepeatableJobs()
  await Promise.all(
    repeatableJobs.map((job) => healthScanQueue.removeRepeatableByKey(job.key)),
  )

  // Two-tier priority scanning:
  // • critical/warning connections — every 2 minutes (catch active incidents)
  // • healthy connections          — every 5 minutes (steady state, lower DB load)
  // Both jobs are handled in the BullMQ worker by scanAllConnections(), which
  // filters by status before scanning so each tier only touches the right rows.
  await healthScanQueue.add(
    'priority-scan',
    { statuses: ['critical', 'warning'] },
    { repeat: { pattern: '*/2 * * * *' } },
  )
  await healthScanQueue.add(
    'routine-scan',
    { statuses: ['healthy'] },
    { repeat: { pattern: '*/5 * * * *' } },
  )

  console.log('[worker] Health scan scheduler started — priority: 2min | routine: 5min')
}

export async function releaseSchedulerLock(): Promise<void> {
  if (lockRenewalTimer) {
    clearInterval(lockRenewalTimer)
    lockRenewalTimer = null
  }
  // Only delete if we still own it.
  const pid = String(process.pid)
  const owner = await redis.get(SCHEDULER_LOCK_KEY)
  if (owner === pid) {
    await redis.del(SCHEDULER_LOCK_KEY)
    console.log('[worker] Scheduler lock released')
  }
}

// ─── Worker ──────────────────────────────────────────────────────────────────
// Singleton guard: prevents tsx hot-reload from stacking multiple workers in
// the same process during the brief restart window.

let activeWorker: Worker | null = null

export function createHealthScanWorker(): Worker {
  if (activeWorker) {
    console.warn('[worker] Worker already created in this process — reusing existing instance')
    return activeWorker
  }

  const worker = new Worker(
    'health-scan',
    async (job) => {
      if (job.name === 'priority-scan' || job.name === 'routine-scan') {
        const statuses: string[] = job.data.statuses ?? ['critical', 'warning', 'healthy']
        console.log(`[worker] ${job.name} — statuses: ${statuses.join(', ')} — ${new Date().toISOString()}`)
        await scanAllConnections(statuses)
        return { scanned: true, statuses, at: new Date().toISOString() }
      }

      if (job.name === 'single-scan' && job.data.connectionId) {
        const conn = await getConnectionById(job.data.connectionId)
        if (!conn) throw new Error(`Connection ${job.data.connectionId} not found`)
        const snapshot = await scanConnection(conn as DbConnection)
        return { snapshot }
      }
    },
    {
      connection: redis,
      // concurrency: 1 — only one scan job runs at a time per process.
      // BullMQ distributes across multiple legitimate worker processes, but
      // a single scan already fans out to all connections concurrently inside
      // scanAllConnections(), so stacking scans achieves nothing and floods the DB.
      concurrency: 1,
    },
  )

  worker.on('completed', (job) => {
    console.log(`[worker] Job ${job.name} (${job.id}) completed`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[worker] Job ${job?.name} (${job?.id}) failed:`, err.message)
  })

  activeWorker = worker
  return worker
}

export async function closeWorker(): Promise<void> {
  if (activeWorker) {
    await activeWorker.close()
    activeWorker = null
  }
}
