import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { defaultLimiter } from './middleware/rateLimit.js'
import connectionsRouter from './routes/connections.js'
import alertsRouter from './routes/alerts.js'
import activityRouter from './routes/activity.js'
import scriptsRouter from './routes/scripts.js'
import sandboxRouter from './routes/sandbox.js'
import { startHealthScanScheduler, createHealthScanWorker } from './workers/healthScanWorker.js'

const app = express()
const PORT = process.env.PORT ?? 4000

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet())
app.use(cors({
  origin: process.env.WEB_URL ?? 'http://localhost:3000',
  credentials: true,
}))
app.use(express.json({ limit: '1mb' }))
app.use(morgan('dev'))
app.use(defaultLimiter)

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'adors-api', version: '0.1.0' })
})

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/connections', connectionsRouter)
app.use('/api/alerts',      alertsRouter)
app.use('/api/activity',    activityRouter)
app.use('/api/scripts',     scriptsRouter)
app.use('/api/sandbox',     sandboxRouter)

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

// ─── Start ────────────────────────────────────────────────────────────────────
async function bootstrap() {
  // Start BullMQ scheduler only when Redis is available
  if (process.env.NODE_ENV !== 'production' && process.env.REDIS_URL) {
    try {
      await startHealthScanScheduler()
      createHealthScanWorker()
    } catch (err: any) {
      console.warn('[workers] BullMQ init failed (Redis unavailable?) — health scan scheduler disabled:', err.message)
    }
  } else if (!process.env.REDIS_URL) {
    console.warn('[workers] REDIS_URL not set — health scan scheduler disabled')
  }

  app.listen(PORT, () => {
    console.log(`[adors-api] Running on http://localhost:${PORT}`)
  })
}

bootstrap().catch((err) => {
  console.error('[adors-api] Fatal startup error:', err)
  process.exit(1)
})

export default app
