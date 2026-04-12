import { startHealthScanScheduler, createHealthScanWorker } from './healthScanWorker.js'
import { createSandboxWorker, closeSandboxWorker } from './sandboxWorker.js'

async function main() {
  console.log('[worker] ADORS Worker starting...')

  // Start the recurring scheduler
  await startHealthScanScheduler()

  // Create worker processes
  const healthWorker  = createHealthScanWorker()
  const sandboxWorker = createSandboxWorker()

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[worker] Shutting down gracefully...')
    await Promise.allSettled([healthWorker.close(), closeSandboxWorker()])
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  console.log('[worker] Ready — processing health scan + sandbox jobs')
}

main().catch((err) => {
  console.error('[worker] Fatal startup error:', err)
  process.exit(1)
})
