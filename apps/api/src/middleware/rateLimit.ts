import rateLimit from 'express-rate-limit'

export const defaultLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' },
})

export const agentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20, // bot endpoints are more expensive
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Agent request limit reached. Please wait.' },
})

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts. Please try again later.' },
})
