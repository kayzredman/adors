import { Queue, Worker, QueueEvents } from 'bullmq'
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

// ─── Recurring Scan Job ───────────────────────────────────────────────────────

export async function startHealthScanScheduler() {
  // Remove existing repeatable jobs to avoid duplicates on restart
  const repeatableJobs = await healthScanQueue.getRepeatableJobs()
  await Promise.all(
    repeatableJobs.map((job) =>
      healthScanQueue.removeRepeatableByKey(job.key),
    ),
  )

  // Schedule: full fleet scan every 5 minutes
  await healthScanQueue.add(
    'full-fleet-scan',
    {},
    {
      repeat: { pattern: '*/5 * * * *' },
    },
  )

  console.log('[worker] Health scan scheduler started — every 5 minutes')
}

// ─── Worker ──────────────────────────────────────────────────────────────────

export function createHealthScanWorker() {
  const worker = new Worker(
    'health-scan',
    async (job) => {
      if (job.name === 'full-fleet-scan') {
        console.log(`[worker] Running full fleet health scan — ${new Date().toISOString()}`)
        await scanAllConnections()
        return { scanned: true, at: new Date().toISOString() }
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
      concurrency: 5,
    },
  )

  worker.on('completed', (job) => {
    console.log(`[worker] Job ${job.name} (${job.id}) completed`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[worker] Job ${job?.name} (${job?.id}) failed:`, err.message)
  })

  return worker
}
