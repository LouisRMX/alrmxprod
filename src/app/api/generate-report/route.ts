import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, checkSpendCap, trackSpend } from '@/lib/rate-limit'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// 10 report generations per user per minute
const RATE_LIMIT = { maxRequests: 10, windowSeconds: 60 }

export async function POST(req: NextRequest) {
  // Verify user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = checkRateLimit(user.id, RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before making more requests.' },
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

  const { assessmentId, type, context } = await req.json()
  if (!assessmentId || !type || !context) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Verify assessment exists and user has access
  const { data: assessment } = await supabase
    .from('assessments')
    .select('id')
    .eq('id', assessmentId)
    .single()

  if (!assessment) return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })

  const prompts: Record<string, string> = {
    executive: buildExecutivePrompt(context),
    diagnosis: buildDiagnosisPrompt(context),
    actions: buildActionsPrompt(context),
  }

  const prompt = prompts[type]
  if (!prompt) return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })

  // Stream the response
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.stream({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }],
        })

        for await (const chunk of response) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }

        trackSpend(user.id)

        // Save to database when complete
        const fullText = await response.finalText()
        await supabase.from('reports').upsert({
          assessment_id: assessmentId,
          [type]: fullText,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'assessment_id' })

        controller.close()
      } catch (err) {
        controller.error(err)
      }
    }
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  })
}

function buildExecutivePrompt(ctx: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scores = ctx.scores as any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scores = ctx.scores as any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scores = ctx.scores as any
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