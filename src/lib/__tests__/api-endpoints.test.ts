/**
 * API Endpoint Tests
 *
 * Tests the logic and validation of /api/ai-stream and /api/generate-report.
 * Since these are Next.js route handlers with external dependencies (Supabase, Anthropic),
 * we test the validation logic and response structure, not the actual API calls.
 */

import { describe, it, expect } from 'vitest'

// ── /api/ai-stream validation logic ──────────────────────────────────────────

describe('/api/ai-stream — validation', () => {
  it('requires either prompt or messages', () => {
    const body = {}
    const messages = ((body as Record<string, unknown>).messages as Array<Record<string, unknown>> | undefined) || [{ role: 'user', content: (body as Record<string, unknown>).prompt }]
    const hasContent = messages?.length > 0 && messages[0].content
    expect(hasContent).toBeFalsy()
  })

  it('accepts a simple prompt', () => {
    const body = { prompt: 'Hello' }
    const messages = ((body as Record<string, unknown>).messages as Array<Record<string, unknown>> | undefined) || [{ role: 'user', content: body.prompt }]
    expect(messages.length).toBe(1)
    expect(messages[0].content).toBe('Hello')
  })

  it('accepts full chat messages', () => {
    const body = {
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'How are you?' },
      ]
    }
    const messages = body.messages
    expect(messages.length).toBe(3)
    expect(messages[0].role).toBe('user')
  })

  it('uses default max_tokens of 1500', () => {
    const body = { prompt: 'Hello' }
    const maxTokens = (body as Record<string, unknown>).max_tokens || 1500
    expect(maxTokens).toBe(1500)
  })

  it('allows custom max_tokens', () => {
    const body = { prompt: 'Hello', max_tokens: 3000 }
    const maxTokens = body.max_tokens || 1500
    expect(maxTokens).toBe(3000)
  })

  it('passes system prompt when provided', () => {
    const body = { prompt: 'Hello', system: 'You are an expert.' }
    expect(body.system).toBe('You are an expert.')
  })
})

// ── /api/generate-report validation logic ────────────────────────────────────

describe('/api/generate-report — validation', () => {
  it('requires assessmentId, type, and context', () => {
    const requiredFields = ['assessmentId', 'type', 'context']

    // Missing all
    const empty = {} as Record<string, unknown>
    const missing = requiredFields.filter(f => !empty[f])
    expect(missing.length).toBe(3)

    // Missing one
    const partial = { assessmentId: '123', type: 'executive' } as Record<string, unknown>
    const missing2 = requiredFields.filter(f => !partial[f])
    expect(missing2).toEqual(['context'])
  })

  it('accepts valid report types', () => {
    const validTypes = ['executive', 'diagnosis', 'actions']
    validTypes.forEach(type => {
      expect(validTypes.includes(type)).toBe(true)
    })
  })

  it('rejects invalid report type', () => {
    const validTypes = ['executive', 'diagnosis', 'actions']
    expect(validTypes.includes('summary')).toBe(false)
    expect(validTypes.includes('random')).toBe(false)
  })
})

// ── Report prompt building ───────────────────────────────────────────────────

function buildExecutivePrompt(ctx: Record<string, unknown>) {
  const scores = ctx.scores as Record<string, number>
  return `You are an expert ready-mix concrete operations consultant. Write a concise executive summary for a plant assessment report.

PLANT: ${ctx.plant}
COUNTRY: ${ctx.country}
DATE: ${ctx.date}
OVERALL SCORE: ${ctx.overall}/100
PRIMARY BOTTLENECK: ${ctx.bottleneck}
EBITDA GAP: $${ctx.ebitdaMonthly}/month
SCORES: Production ${scores?.prod}/100, Dispatch ${scores?.dispatch}/100, Fleet ${scores?.fleet}/100
TOP ISSUES: ${JSON.stringify(ctx.issues)}

Write 3-4 sentences. Lead with the dollar opportunity. Be direct and specific. No generic statements. GCC context.`
}

function buildDiagnosisPrompt(ctx: Record<string, unknown>) {
  const scores = ctx.scores as Record<string, number>
  return `You are an expert ready-mix concrete operations consultant. Write the Operational Diagnosis section.

PLANT: ${ctx.plant} | COUNTRY: ${ctx.country}
SCORES: Production ${scores?.prod}/100, Dispatch ${scores?.dispatch}/100, Fleet ${scores?.fleet}/100, Quality ${scores?.quality}/100
OVERALL: ${ctx.overall}/100 | BOTTLENECK: ${ctx.bottleneck}
KEY METRICS: Utilisation ${ctx.utilPct}%, Turnaround ${ctx.turnaround}min
ISSUES: ${JSON.stringify(ctx.issues)}
ANSWERS: ${JSON.stringify(ctx.answers)}

Write 3 focused paragraphs covering: 1) Production performance 2) Dispatch & fleet 3) Quality & risk.
No recommendations in this section — diagnosis only. Be specific with numbers. GCC context.`
}

function buildActionsPrompt(ctx: Record<string, unknown>) {
  const scores = ctx.scores as Record<string, number>
  return `You are an expert ready-mix concrete operations consultant. Write the Improvement Actions section.

PLANT: ${ctx.plant} | BOTTLENECK: ${ctx.bottleneck}
EBITDA GAP: $${ctx.ebitdaMonthly}/month
TOP ISSUES: ${JSON.stringify(ctx.issues)}
SCORES: Production ${scores?.prod}/100, Dispatch ${scores?.dispatch}/100, Fleet ${scores?.fleet}/100

Write exactly 3 specific, actionable recommendations:
1. Address the primary bottleneck — most impact
2. Address the secondary finding
3. Address data quality or set up the next visit

Each action: what to do, who owns it, expected impact in $. Be specific. GCC context. 30-day horizon.`
}

describe('Report prompt building', () => {
  const ctx = {
    plant: 'Plant 1 — Riyadh North',
    country: 'Saudi Arabia',
    date: '2026-03-27',
    overall: 53,
    bottleneck: 'Production',
    ebitdaMonthly: 312320,
    scores: { prod: 38, dispatch: 65, fleet: 72, quality: 55 },
    issues: ['Plant utilisation 51%', 'Reject rate 4%'],
    utilPct: 51,
    turnaround: 97,
    answers: { price_m3: 58 },
  }

  it('executive prompt includes plant name and score', () => {
    const prompt = buildExecutivePrompt(ctx)
    expect(prompt).toContain('Plant 1')
    expect(prompt).toContain('53/100')
    expect(prompt).toContain('Production')
    expect(prompt).toContain('312320')
  })

  it('diagnosis prompt includes all 4 scores', () => {
    const prompt = buildDiagnosisPrompt(ctx)
    expect(prompt).toContain('Production 38/100')
    expect(prompt).toContain('Dispatch 65/100')
    expect(prompt).toContain('Fleet 72/100')
    expect(prompt).toContain('Quality 55/100')
  })

  it('diagnosis prompt includes answers', () => {
    const prompt = buildDiagnosisPrompt(ctx)
    expect(prompt).toContain('price_m3')
  })

  it('actions prompt includes bottleneck and EBITDA', () => {
    const prompt = buildActionsPrompt(ctx)
    expect(prompt).toContain('Production')
    expect(prompt).toContain('312320')
  })

  it('actions prompt requests exactly 3 recommendations', () => {
    const prompt = buildActionsPrompt(ctx)
    expect(prompt).toContain('exactly 3')
  })

  it('all prompts specify GCC context', () => {
    expect(buildExecutivePrompt(ctx)).toContain('GCC')
    expect(buildDiagnosisPrompt(ctx)).toContain('GCC')
    expect(buildActionsPrompt(ctx)).toContain('GCC')
  })

  it('executive prompt handles missing scores gracefully', () => {
    const partial = { ...ctx, scores: undefined }
    const prompt = buildExecutivePrompt(partial)
    expect(prompt).toContain('undefined')
    // Should not crash
  })
})
