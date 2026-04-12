// Load .env from the api package root — works regardless of how the process
// was launched (pnpm dev, VS Code task, or node directly).
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') })

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { defaultLimiter, agentLimiter } from './middleware/rateLimit.js'
import connectionsRouter from './routes/connections.js'
import alertsRouter from './routes/alerts.js'
import activityRouter from './routes/activity.js'
import scriptsRouter from './routes/scripts.js'
import sandboxRouter from './routes/sandbox.js'
import meRouter from './routes/me.js'
import analyticsRouter from './routes/analytics.js'
import agentsRouter from './routes/agents.js'
import adminRouter, { profileRouter } from './routes/admin.js'
import settingsRouter from './routes/settings.js'
import notificationsRouter from './routes/notifications.js'
import servicesRouter from './routes/services.js'
import { startHealthScanScheduler, createHealthScanWorker, closeWorker, releaseSchedulerLock } from './workers/healthScanWorker.js'

const app = express()
const PORT = process.env.PORT ?? 4000

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet())
const allowedOrigins = (process.env.WEB_URL ?? 'http://localhost:3002')
  .split(',')
  .map(o => o.trim())

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return cb(null, true)
    // In dev, allow any localhost port
    if (process.env.NODE_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(origin)) {
      return cb(null, true)
    }
    if (allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error(`CORS: origin ${origin} not allowed`))
  },
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
app.use('/api/me',          meRouter)
app.use('/api/analytics',   analyticsRouter)
app.use('/api/agents',      agentLimiter, agentsRouter)
app.use('/api/admin',       adminRouter)
app.use('/api/admin',       profileRouter)
app.use('/api/settings',       settingsRouter)
app.use('/api/notifications',  notificationsRouter)
app.use('/api/admin/services', servicesRouter)

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

// ─── Start ────────────────────────────────────────────────────────────────────
async function bootstrap() {
  let workerCreated = false

  // Start BullMQ scheduler only when Redis is available
  if (process.env.REDIS_URL) {
    try {
      await startHealthScanScheduler()
      createHealthScanWorker()
      workerCreated = true
    } catch (err: any) {
      console.warn('[workers] BullMQ init failed (Redis unavailable?) — health scan scheduler disabled:', err.message)
    }
  } else {
    console.warn('[workers] REDIS_URL not set — health scan scheduler disabled')
  }

  // ─── Graceful shutdown ─────────────────────────────────────────────────────
  // Called on SIGTERM (tsx hot-reload, docker stop) and SIGINT (Ctrl+C).
  // Releasing the scheduler lock lets a restarted instance win election
  // immediately instead of waiting for the 6-minute TTL to expire.
  const shutdown = async (signal: string) => {
    console.log(`[adors-api] ${signal} received — shutting down gracefully`)
    if (workerCreated) {
      await Promise.allSettled([releaseSchedulerLock(), closeWorker()])
    }
    process.exit(0)
  }
  process.once('SIGTERM', () => shutdown('SIGTERM'))
  process.once('SIGINT',  () => shutdown('SIGINT'))

  // ─── Listen ───────────────────────────────────────────────────────────────
  const server = app.listen(PORT)

  server.on('listening', () => {
    console.log(`[adors-api] Running on http://localhost:${PORT}`)
  })

  // Fail fast if the port is already occupied — prevents a silent second
  // instance from running workers without an HTTP server.
  server.on('error', async (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[adors-api] Port ${PORT} is already in use. Stop the existing instance first.`)
      if (workerCreated) {
        await Promise.allSettled([releaseSchedulerLock(), closeWorker()])
      }
      process.exit(1)
    }
    throw err
  })
}

bootstrap().catch((err) => {
  console.error('[adors-api] Fatal startup error:', err)
  process.exit(1)
})

export default app
