/**
 * Simple in-memory rate limiter for API endpoints.
 * Limits requests per user per time window.
 *
 * Note: In-memory means limits reset on server restart and are per-instance.
 * For multi-instance deployments, use Redis instead. For Vercel serverless,
 * this provides basic protection — each cold start resets the counter.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  store.forEach((entry, key) => {
    if (now > entry.resetAt) store.delete(key)
  })
}, 5 * 60 * 1000)

export interface RateLimitConfig {
  /** Max requests allowed in the window */
  maxRequests: number
  /** Window size in seconds */
  windowSeconds: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

export function checkRateLimit(userId: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  const key = userId
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    // New window
    store.set(key, { count: 1, resetAt: now + config.windowSeconds * 1000 })
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowSeconds * 1000 }
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt }
}
