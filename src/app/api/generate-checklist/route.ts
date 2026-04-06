import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, checkSpendCap, trackSpend } from '@/lib/rate-limit'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const RATE_LIMIT = { maxRequests: 30, windowSeconds: 60 }

// Build a rich, plant-specific context string from calcResult + answers.
// Only include lines with real values — no undefined/NaN/null.
function buildPlantContext(calcResult: Record<string, unknown>, answers: Record<string, string>, financialBottleneck?: string | null): string {
  const lines: string[] = []

  const scores = calcResult.scores as Record<string, number> | undefined

  // Bottleneck & scores — prefer financialBottleneck (highest dollar loss) over score-based bottleneck
  const primaryBottleneck = financialBottleneck || calcResult.bottleneck
  if (primaryBottleneck) lines.push(`Primary bottleneck: ${primaryBottleneck}`)
  if (financialBottleneck && calcResult.bottleneck && financialBottleneck !== calcResult.bottleneck) {
    lines.push(`Note: ${calcResult.bottleneck} has the lowest score but ${financialBottleneck} drives the highest financial loss — prioritise ${financialBottleneck}`)
  }
  if (calcResult.overall != null) lines.push(`Overall score: ${Math.round(calcResult.overall as number)}/100`)
  if (scores?.dispatch != null) lines.push(`Dispatch score: ${Math.round(scores.dispatch)}/100`)
  if (scores?.logistics != null) lines.push(`Fleet/Logistics score: ${Math.round(scores.logistics)}/100`)
  if (scores?.quality != null) lines.push(`Quality score: ${Math.round(scores.quality)}/100`)
  if (scores?.prod != null) lines.push(`Production score: ${Math.round(scores.prod)}/100`)

  // Fleet
  if (calcResult.trucks) lines.push(`Trucks: ${calcResult.trucks}`)
  if (calcResult.delDay) lines.push(`Deliveries per day: ${Math.round(calcResult.delDay as number)}`)
  if (calcResult.util != null) lines.push(`Fleet utilisation: ${Math.round((calcResult.util as number) * 100)}%`)
  if (calcResult.radius) lines.push(`Delivery radius: ${calcResult.radius} km`)

  // Dispatch
  if (calcResult.dispatchMin != null) lines.push(`Measured order-to-dispatch: ${calcResult.dispatchMin} min (target: 15 min)`)
  if (answers.order_to_dispatch) lines.push(`Order-to-dispatch (reported): ${answers.order_to_dispatch}`)
  if (answers.dispatch_tool) lines.push(`Dispatch tool: ${answers.dispatch_tool}`)
  if (answers.route_clustering) lines.push(`Route clustering: ${answers.route_clustering}`)
  if (answers.plant_idle) lines.push(`Plant idle time: ${answers.plant_idle}`)

  // Turnaround
  if (calcResult.ta) {
    const ta = Math.round(calcResult.ta as number)
    const targetTA = calcResult.TARGET_TA as number
    const excess = calcResult.excessMin as number
    lines.push(`Turnaround: ${ta} min (target: ${targetTA} min${excess > 0 ? `, ${excess} min excess` : ''})`)
  }
  if (calcResult.siteWait && (calcResult.siteWait as number) > 0) {
    const sw = Math.round(calcResult.siteWait as number)
    lines.push(`Site wait: ~${sw} min (benchmark: 35 min${sw > 35 ? `, ${sw - 35} min excess` : ''})`)
  }
  if (calcResult.washoutMin && (calcResult.washoutMin as number) > 0) {
    const wm = Math.round(calcResult.washoutMin as number)
    lines.push(`Washout time: ~${wm} min (benchmark: 12 min${wm > 12 ? `, ${wm - 12} min excess` : ''})`)
  }
  if (answers.site_wait_reason) lines.push(`Site wait reason: ${answers.site_wait_reason}`)
  if (answers.turnaround) lines.push(`Turnaround (reported): ${answers.turnaround}`)

  // Quality
  if (calcResult.rejectPct != null) {
    lines.push(`Reject rate: ${(calcResult.rejectPct as number).toFixed(1)}% (target: <3%)`)
  }
  if (calcResult.rejectPlantFraction != null && (calcResult.rejectPct as number) > 0) {
    const pf = Math.round((calcResult.rejectPlantFraction as number) * 100)
    lines.push(`Plant-side rejections: ~${pf}% ($${Math.round((calcResult.rejectPlantSideLoss as number) / 1000)}k/month) — batch/dosing/mix quality`)
    lines.push(`Customer-side rejections: ~${100 - pf}% ($${Math.round((calcResult.rejectCustomerSideLoss as number) / 1000)}k/month) — site unreadiness/pump delays`)
  }
  if (answers.reject_reason) lines.push(`Reject reason: ${answers.reject_reason}`)
  if (answers.slump_test) lines.push(`Slump test practice: ${answers.slump_test}`)
  if (answers.calibration) lines.push(`Calibration: ${answers.calibration}`)

  // Production
  if (calcResult.demandSufficient != null) {
    lines.push(`Demand context: ${calcResult.demandSufficient === true ? 'Operations-limited — demand is sufficient, throughput is the constraint' : calcResult.demandSufficient === false ? 'Demand-limited — not enough orders to fill capacity' : 'Unknown'}`)
  }

  // Financial
  if (calcResult.hiddenRevMonthly) {
    lines.push(`Monthly revenue recoverable: $${Math.round((calcResult.hiddenRevMonthly as number) / 1000)}k`)
  }

  return lines
    .filter(l => !l.includes('undefined') && !l.includes('NaN') && !l.match(/:\s*null/))
    .join('\n')
}

function buildPrompt(action: string, plantContext: string): string {
  return `You are a senior operations advisor for ready-mix concrete plants. You work with plant managers who have no patience for generic advice.

Generate exactly 5 action steps for a plant manager to implement this specific task:

TASK: "${action}"

PLANT DATA — use these exact numbers, do not invent data:
${plantContext}

RULES — strictly enforced:
1. Every step must reference at least one specific number from the plant data above (minutes, trucks, %, deliveries/day, or $).
2. Steps are chronological — step 1 is done before step 2.
3. Steps are executable in the next 2 weeks — no long-term projects.
4. Banned phrases: "implement best practices", "train staff", "set up a process", "monitor performance", "consider", "review", "improve", "optimize".
5. Each step: maximum 18 words.
6. If a step could apply to any plant in the world, it is too generic — rewrite it.
7. Final step must be a measurable verification with a specific target number from the plant data.
8. Write for a plant manager who knows the operation — skip the obvious.

Return ONLY valid JSON. No markdown fences, no explanation, no other text.
Format: [{"text": "Step text here", "done": false}, ...]`
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = checkRateLimit(user.id, RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before making more requests.' },
      { status: 429 }
    )
  }

  const spend = checkSpendCap(user.id)
  if (!spend.allowed) {
    return NextResponse.json(
      { error: `Daily AI budget reached ($${spend.dailyCap}/day). Resets in 24 hours.` },
      { status: 429 }
    )
  }

  const { action, calcResult, answers, financialBottleneck } = await req.json()
  if (!action || !calcResult) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const plantContext = buildPlantContext(calcResult, answers ?? {}, financialBottleneck)
  const prompt = buildPrompt(action, plantContext)

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    })

    trackSpend(user.id)

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]'

    // Strip markdown fences if model added them despite instructions
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

    let checklist: { text: string; done: boolean }[]
    try {
      checklist = JSON.parse(cleaned)
      // Ensure each item has an id
      checklist = checklist.map((item, i) => ({
        id: `ci-${Date.now()}-${i}`,
        text: item.text,
        done: item.done ?? false,
      }))
    } catch {
      return NextResponse.json({ error: 'Failed to parse checklist JSON' }, { status: 500 })
    }

    return NextResponse.json(checklist)
  } catch (err) {
    console.error('generate-checklist error:', err)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
