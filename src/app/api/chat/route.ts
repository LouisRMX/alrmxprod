import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, checkSpendCap, trackSpend } from '@/lib/rate-limit'
import { NextRequest, NextResponse } from 'next/server'
import type { ChatPageContext } from '@/context/ChatContext'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const RATE_LIMIT = { maxRequests: 30, windowSeconds: 60 }

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(ctx: ChatPageContext | null, userRole: string | null): string {
  const KNOWLEDGE = `
You are the Al-RMX Assistant, embedded in the Al-RMX operational intelligence platform for ready-mix concrete plants.

## Scoring system (0-100 per dimension)

**Production score**: How close the plant runs to its 85% utilisation target. Deductions for slow batch cycle (>7 min), unplanned stops, low data confidence.

**Dispatch score**: Speed from order to truck departure. Weighted: order-to-dispatch time (35%), route clustering (22%), plant idle time (18%), dispatch tooling (13%), order lead time (12%). Green zone: dispatch under 15 minutes.

**Fleet/Logistics score**: Full round-trip cycle efficiency. Target turnaround = 60 + (radius x 1.5) min, e.g. 10 km radius = 75 min target. Weighted: turnaround vs target (50%), fleet availability (25%), driver quality (15%), washout time (10%).

**Quality score**: Rejection rate and process controls. Weighted: rejection rate (50%), QC procedures (25%), batch plant calibration (15%), surplus concrete (10%). Green zone: below 1.7% rejection.

**Overall score**: Weighted average. 80-100 = green (good), 60-79 = amber (attention needed), 0-59 = red (priority).

## Financial calculations

**Monthly EBITDA gap**: Sum of all financial leaks identified across turnaround, dispatch, quality, and production.

**Turnaround leak**: Excess minutes x trips/month x contribution margin per trip. When demand is sufficient, this is a revenue loss. When demand is limited, it is fuel and variable cost.

**Reject leak**: Rejection rate x monthly volume x (material cost + opportunity cost where demand allows).

**Bottleneck**: The dimension with the largest financial loss. Fixing this unlocks the most recovery.

**Confidence range**: All figures shown as low-high range at +/-30%. Midpoint is the base estimate. Actual figures require measured inputs (turnaround logs, dispatch timestamps).

## Assessment phases

- **Workshop**: Customer completes pre-assessment questionnaire with operational data.
- **On-site**: Consultant validates on-site and completes the assessment.
- **Complete**: Report available to plant owner.

## Platform roles

- **system_admin**: Al-RMX analyst/consultant. Runs assessments, generates reports.
- **owner**: Plant owner. Read access to report, simulator, tracking.
- **manager**: Plant manager. Assessment input and tracking data entry.
- **operator**: Operator. Assessment questions and tracking only.

## Guardrail

If a question is clearly not about plant operations, concrete logistics, the platform, or operational performance, reply with exactly:
"I'm built for concrete, not croissants. Ask me anything about your plant operations."

Do not apply the guardrail to edge cases. If the question could plausibly relate to operations, answer it.
`.trim()

  const BEHAVIOUR = `
## Behaviour
- Be concise and precise. No filler sentences. Start directly with the answer.
- Respond in the same language the user writes in.
- When context data is available, always reference the plant's actual numbers.
- Never invent data. If a number is not in context, say so clearly.
- For financial estimates, frame them as "approximately $X/month" or "between $X and $Y/month".
- Do not repeat the question back.
`.trim()

  const contextBlock = buildContextBlock(ctx, userRole)

  return [KNOWLEDGE, BEHAVIOUR, contextBlock].filter(Boolean).join('\n\n')
}

function buildContextBlock(ctx: ChatPageContext | null, userRole: string | null): string {
  const lines: string[] = ['## Current page context']

  if (!ctx) {
    lines.push('No specific plant or assessment is currently loaded.')
    if (userRole) lines.push(`User role: ${userRole}`)
    return lines.join('\n')
  }

  lines.push(`Page type: ${ctx.pageType}`)
  if (userRole) lines.push(`User role: ${userRole}`)

  if (ctx.pageType === 'assessment') {
    if (ctx.plantName)      lines.push(`Plant: ${ctx.plantName}${ctx.plantCountry ? `, ${ctx.plantCountry}` : ''}`)
    if (ctx.assessmentId)   lines.push(`Assessment ID: ${ctx.assessmentId}`)
    if (ctx.assessmentPhase) lines.push(`Phase: ${ctx.assessmentPhase}`)
    if (ctx.overall != null) lines.push(`Overall score: ${ctx.overall}/100`)

    if (ctx.scores) {
      const parts = [
        ctx.scores.prod      != null ? `Production ${ctx.scores.prod}` : null,
        ctx.scores.dispatch  != null ? `Dispatch ${ctx.scores.dispatch}` : null,
        ctx.scores.fleet     != null ? `Fleet ${ctx.scores.fleet}` : null,
        ctx.scores.quality   != null ? `Quality ${ctx.scores.quality}` : null,
      ].filter(Boolean)
      if (parts.length) lines.push(`Scores: ${parts.join(' | ')}`)
    }

    if (ctx.bottleneck)           lines.push(`Primary bottleneck: ${ctx.bottleneck}`)
    if (ctx.ebitdaMonthly)        lines.push(`Monthly loss (EBITDA gap): $${ctx.ebitdaMonthly.toLocaleString()}/month`)
    if (ctx.hiddenRevMonthly)     lines.push(`Hidden revenue potential: $${ctx.hiddenRevMonthly.toLocaleString()}/month`)
    if (ctx.turnaroundMin != null && ctx.targetTA != null)
      lines.push(`Turnaround: ${ctx.turnaroundMin} min (target: ${ctx.targetTA} min)`)
    if (ctx.dispatchMin != null)  lines.push(`Dispatch time: ${ctx.dispatchMin} min (target: 15 min)`)
    if (ctx.rejectPct != null)    lines.push(`Rejection rate: ${ctx.rejectPct}%`)
    if (ctx.trucks != null)       lines.push(`Fleet: ${ctx.trucks} trucks`)
  }

  if (ctx.pageType === 'plants' && ctx.portfolioSummary) {
    const p = ctx.portfolioSummary
    lines.push(`Portfolio: ${p.totalPlants} plant${p.totalPlants !== 1 ? 's' : ''}`)
    if (p.avgScore != null) lines.push(`Portfolio average score: ${p.avgScore}/100`)
    if (p.totalGap)        lines.push(`Total monthly gap across portfolio: $${p.totalGap.toLocaleString()}/month`)
    if (p.totalRecovered)  lines.push(`Total recovered so far: $${p.totalRecovered.toLocaleString()}/month`)
  }

  return lines.join('\n')
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = checkRateLimit(user.id, RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before sending more messages.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    )
  }

  const spend = checkSpendCap(user.id)
  if (!spend.allowed) {
    return NextResponse.json(
      { error: `Daily AI budget reached ($${spend.dailyCap}/day). Resets in 24 hours.` },
      { status: 429 }
    )
  }

  const { question, history, pageContext, userRole } = await req.json() as {
    question: string
    history: { role: 'user' | 'assistant'; content: string }[]
    pageContext: ChatPageContext | null
    userRole: string | null
  }

  if (!question?.trim()) return NextResponse.json({ error: 'Missing question' }, { status: 400 })

  const systemPrompt = buildSystemPrompt(pageContext, userRole)
  const messages: Anthropic.MessageParam[] = [
    ...(history ?? []).map(m => ({ role: m.role, content: m.content } as Anthropic.MessageParam)),
    { role: 'user', content: question },
  ]

  let fullAnswer = ''
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.stream({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          system: systemPrompt,
          messages,
        })

        for await (const chunk of response) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            fullAnswer += chunk.delta.text
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`))
          }
        }

        trackSpend(user.id)

        // Log question to Supabase (non-fatal — never breaks the chat response)
        try {
          await supabase.from('chat_questions').insert({
            user_id: user.id,
            question: question.trim(),
            answer: fullAnswer,
            page_context: pageContext ?? null,
          })
        } catch (logErr) {
          console.warn('[chat] Failed to log question:', logErr)
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI generation failed'
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`))
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}
