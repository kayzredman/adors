import { startHealthScanScheduler, createHealthScanWorker } from './healthScanWorker.js'

async function main() {
  console.log('[worker] ADORS Worker starting...')

  // Start the recurring scheduler
  await startHealthScanScheduler()

  // Create the worker process
  const worker = createHealthScanWorker()

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[worker] Shutting down gracefully...')
    await worker.close()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  console.log('[worker] Ready — processing health scan jobs')
}

main().catch((err) => {
  console.error('[worker] Fatal startup error:', err)
  process.exit(1)
})
