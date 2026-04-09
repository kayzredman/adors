import IORedis from 'ioredis'

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'

export const redis = new IORedis(redisUrl, {
  maxRetriesPerRequest: null, // required for BullMQ
  enableReadyCheck: false,
})

redis.on('error', (err) => {
  console.error('[redis] Connection error:', err.message)
})

redis.on('connect', () => {
  console.log('[redis] Connected')
})
