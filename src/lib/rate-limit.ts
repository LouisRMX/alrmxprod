/**
 * Rate limiter + daily spend cap for API endpoints.
 *
 * Two layers of protection:
 * 1. Rate limiting: max requests per user per time window
 * 2. Spend cap: max estimated USD per organization per day
 *
 * Note: In-memory — resets on server restart / cold start.
 * For production at scale, use Redis or a database counter.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

interface SpendEntry {
  estimatedUsd: number
  resetAt: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()
const spendStore = new Map<string, SpendEntry>()

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  rateLimitStore.forEach((entry, key) => {
    if (now > entry.resetAt) rateLimitStore.delete(key)
  })
  spendStore.forEach((entry, key) => {
    if (now > entry.resetAt) spendStore.delete(key)
  })
}, 5 * 60 * 1000)

// ── Rate Limiting ────────────────────────────────────────────────────────────

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
  const entry = rateLimitStore.get(key)

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + config.windowSeconds * 1000 })
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowSeconds * 1000 }
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt }
}

// ── Daily Spend Cap ──────────────────────────────────────────────────────────

/** Default daily spend cap per organization in USD */
export const DEFAULT_DAILY_CAP_USD = 3.0

/** Estimated cost per AI call in USD (Sonnet 4, ~1500 tokens output) */
export const ESTIMATED_COST_PER_CALL = 0.05

export interface SpendCapResult {
  allowed: boolean
  spentToday: number
  dailyCap: number
  remainingUsd: number
}

/**
 * Check if an organization has exceeded its daily spend cap.
 * Call this BEFORE making an AI API call.
 * Call trackSpend() AFTER a successful call.
 */
export function checkSpendCap(orgId: string, dailyCap: number = DEFAULT_DAILY_CAP_USD): SpendCapResult {
  const now = Date.now()
  const entry = spendStore.get(orgId)

  // Reset at midnight (24h rolling window)
  const windowMs = 24 * 60 * 60 * 1000

  if (!entry || now > entry.resetAt) {
    return { allowed: true, spentToday: 0, dailyCap, remainingUsd: dailyCap }
  }

  const remaining = Math.max(0, dailyCap - entry.estimatedUsd)
  return {
    allowed: entry.estimatedUsd < dailyCap,
    spentToday: Math.round(entry.estimatedUsd * 100) / 100,
    dailyCap,
    remainingUsd: Math.round(remaining * 100) / 100,
  }
}

/**
 * Track spend after a successful AI call.
 */
export function trackSpend(orgId: string, costUsd: number = ESTIMATED_COST_PER_CALL): void {
  const now = Date.now()
  const windowMs = 24 * 60 * 60 * 1000
  const entry = spendStore.get(orgId)

  if (!entry || now > entry.resetAt) {
    spendStore.set(orgId, { estimatedUsd: costUsd, resetAt: now + windowMs })
  } else {
    entry.estimatedUsd += costUsd
  }
}
