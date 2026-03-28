import { describe, it, expect } from 'vitest'
import { checkRateLimit, checkSpendCap, trackSpend, DEFAULT_DAILY_CAP_USD, ESTIMATED_COST_PER_CALL } from '../rate-limit'

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

describe('Spend Cap', () => {
  it('default cap is $3/day', () => {
    expect(DEFAULT_DAILY_CAP_USD).toBe(3.0)
  })

  it('estimated cost per call is $0.05', () => {
    expect(ESTIMATED_COST_PER_CALL).toBe(0.05)
  })

  it('allows first call (no spend yet)', () => {
    const r = checkSpendCap('org-fresh')
    expect(r.allowed).toBe(true)
    expect(r.spentToday).toBe(0)
    expect(r.remainingUsd).toBe(3.0)
  })

  it('tracks spend after calls', () => {
    trackSpend('org-track', 0.05)
    trackSpend('org-track', 0.05)
    const r = checkSpendCap('org-track')
    expect(r.allowed).toBe(true)
    expect(r.spentToday).toBe(0.10)
    expect(r.remainingUsd).toBe(2.90)
  })

  it('blocks when cap exceeded', () => {
    // Spend $3.10 in one go
    trackSpend('org-full', 3.10)
    const r = checkSpendCap('org-full')
    expect(r.allowed).toBe(false)
    expect(r.spentToday).toBe(3.10)
    expect(r.remainingUsd).toBe(0)
  })

  it('allows custom cap', () => {
    trackSpend('org-custom', 4.00)
    const r = checkSpendCap('org-custom', 10.0)
    expect(r.allowed).toBe(true)
    expect(r.remainingUsd).toBe(6.0)
  })

  it('different orgs have separate caps', () => {
    trackSpend('org-x', 3.10)
    const rx = checkSpendCap('org-x')
    const ry = checkSpendCap('org-y')
    expect(rx.allowed).toBe(false)
    expect(ry.allowed).toBe(true)
  })
})
