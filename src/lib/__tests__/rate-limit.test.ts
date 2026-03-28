import { describe, it, expect } from 'vitest'
import { checkRateLimit } from '../rate-limit'

describe('Rate Limiter', () => {
  it('allows first request', () => {
    const r = checkRateLimit('test-user-1', { maxRequests: 5, windowSeconds: 60 })
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(4)
  })

  it('counts down remaining', () => {
    const config = { maxRequests: 3, windowSeconds: 60 }
    const r1 = checkRateLimit('test-user-2', config)
    expect(r1.remaining).toBe(2)
    const r2 = checkRateLimit('test-user-2', config)
    expect(r2.remaining).toBe(1)
    const r3 = checkRateLimit('test-user-2', config)
    expect(r3.remaining).toBe(0)
  })

  it('blocks after limit exceeded', () => {
    const config = { maxRequests: 2, windowSeconds: 60 }
    checkRateLimit('test-user-3', config)
    checkRateLimit('test-user-3', config)
    const r = checkRateLimit('test-user-3', config)
    expect(r.allowed).toBe(false)
    expect(r.remaining).toBe(0)
  })

  it('different users have separate limits', () => {
    const config = { maxRequests: 1, windowSeconds: 60 }
    const r1 = checkRateLimit('user-a', config)
    const r2 = checkRateLimit('user-b', config)
    expect(r1.allowed).toBe(true)
    expect(r2.allowed).toBe(true)
  })

  it('returns resetAt timestamp', () => {
    const r = checkRateLimit('test-user-4', { maxRequests: 5, windowSeconds: 60 })
    expect(r.resetAt).toBeGreaterThan(Date.now())
    expect(r.resetAt).toBeLessThanOrEqual(Date.now() + 60 * 1000 + 100)
  })
})
