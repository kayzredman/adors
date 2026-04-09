import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'

const app = express()
const PORT = process.env.PORT ?? 4000

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet())
app.use(cors({ origin: process.env.WEB_URL ?? 'http://localhost:3000' }))
app.use(express.json())
app.use(morgan('dev'))

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'adors-api', version: '0.1.0' })
})

// ─── Routes (Phase 1+) ───────────────────────────────────────────────────────
// import connectionsRouter from './routes/connections'
// import alertsRouter from './routes/alerts'
// import scriptsRouter from './routes/scripts'
// import sandboxRouter from './routes/sandbox'
// import agentsRouter from './routes/agents'
// import analyticsRouter from './routes/analytics'

// app.use('/api/connections', connectionsRouter)
// app.use('/api/alerts', alertsRouter)
// app.use('/api/scripts', scriptsRouter)
// app.use('/api/sandbox', sandboxRouter)
// app.use('/api/agents', agentsRouter)
// app.use('/api/analytics', analyticsRouter)

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[adors-api] Running on http://localhost:${PORT}`)
})

export default app
